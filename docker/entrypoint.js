#!/usr/bin/env node

/**
 * Dank Agent Container Entrypoint
 * 
 * This script runs inside each agent container and handles:
 * - Loading agent code from the drop-off directory
 * - Setting up the LLM client
 * - Managing agent lifecycle
 * - Health checks and monitoring
 */

const fs = require("fs");
const path = require("path");
const express = require("express");
const winston = require("winston");
const { v4: uuidv4 } = require("uuid");
const os = require("os");
const { EventEmitter } = require("events");
const http = require("http");
const { WebSocketServer } = require("ws");

// Load environment variables
require("dotenv").config();

// Setup logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

/**
 * Log Buffer Service - Captures and stores stdout/stderr logs in memory
 */
class LogBufferService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxSize = options.maxSize || 10000; // Max 10k log entries
    this.maxAge = options.maxAge || 24 * 60 * 60 * 1000; // 24 hours
    this.logs = []; // Circular buffer
    this.isCapturing = false;
    this.originalStdoutWrite = null;
    this.originalStderrWrite = null;
  }

  /**
   * Start capturing stdout/stderr from main process
   */
  start() {
    if (this.isCapturing) return;

    // Capture stdout
    this.originalStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, encoding, callback) => {
      this.addLog('stdout', chunk.toString());
      return this.originalStdoutWrite(chunk, encoding, callback);
    };

    // Capture stderr
    this.originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, encoding, callback) => {
      this.addLog('stderr', chunk.toString());
      return this.originalStderrWrite(chunk, encoding, callback);
    };

    this.isCapturing = true;
    logger.info('✅ Log buffer service started');
  }

  /**
   * Add log entry to buffer
   */
  addLog(stream, message) {
    const now = Date.now();
    const entry = {
      timestamp: now,
      stream, // 'stdout' or 'stderr'
      message: message.trim(),
    };

    // Add to buffer
    this.logs.push(entry);

    // Trim to max size (circular buffer)
    if (this.logs.length > this.maxSize) {
      this.logs.shift(); // Remove oldest
    }

    // Emit for real-time streaming (if needed in future)
    this.emit('log', entry);

    // Cleanup old logs periodically
    if (this.logs.length % 100 === 0) {
      this.cleanup();
    }
  }

  /**
   * Remove logs older than maxAge
   */
  cleanup() {
    const now = Date.now();
    const cutoff = now - this.maxAge;
    
    // Remove old logs
    while (this.logs.length > 0 && this.logs[0].timestamp < cutoff) {
      this.logs.shift();
    }
  }

  /**
   * Get logs with filters
   */
  getLogs(options = {}) {
    const {
      startTime = null,
      endTime = null,
      limit = 100,
      offset = 0,
      stream = null, // 'stdout', 'stderr', or null for both
    } = options;

    let filtered = [...this.logs];

    // Filter by time range
    if (startTime) {
      filtered = filtered.filter(log => log.timestamp >= startTime);
    }
    if (endTime) {
      filtered = filtered.filter(log => log.timestamp <= endTime);
    }

    // Filter by stream
    if (stream) {
      filtered = filtered.filter(log => log.stream === stream);
    }

    // Sort by timestamp (oldest first)
    filtered.sort((a, b) => a.timestamp - b.timestamp);

    // Pagination
    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      logs: paginated,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Get logs from time range (e.g., "last 10 minutes")
   */
  getLogsByTimeRange(startTime, endTime) {
    return this.getLogs({
      startTime,
      endTime,
      limit: 10000, // Get all in range
    });
  }

  /**
   * Clear all logs
   */
  clear() {
    this.logs = [];
    this.emit('clear');
  }
}

class AgentRuntime {
  constructor() {
    this.agentName = process.env.AGENT_NAME || "unknown";
    this.agentId = process.env.AGENT_ID || uuidv4();
    this.llmProvider = process.env.LLM_PROVIDER || "openai";
    this.llmModel = process.env.LLM_MODEL || "gpt-3.5-turbo";
    this.agentPrompt =
      process.env.AGENT_PROMPT || "You are a helpful AI assistant.";
    
    this.llmClient = null;
    this.agentCode = null;
    this.handlers = new Map();
    this.isRunning = false;
    this.startTime = new Date();
    
    // CPU usage tracking for metrics endpoint
    // Track cumulative CPU usage since startup
    this.cpuUsageStart = process.cpuUsage();
    this.cpuUsageStartTime = process.hrtime.bigint();

    // Initialize log buffer service
    this.logBuffer = new LogBufferService({
      maxSize: 10000, // 10k log entries
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
    
    // HTTP server configuration
    this.httpEnabled = process.env.HTTP_ENABLED === "true";
    this.httpPort = parseInt(process.env.HTTP_PORT) || 3000;
    this.httpHost = process.env.HTTP_HOST || "0.0.0.0";
    
    // Main agent port (used for health, prompting, and optionally HTTP API)
    this.mainPort = parseInt(process.env.DOCKER_PORT) || 3000;
    logger.info(`🔌 Main agent port configured: ${this.mainPort} (from DOCKER_PORT: ${process.env.DOCKER_PORT || 'default'})`);

    // Single Express app for health, prompting, and HTTP API
    this.mainApp = express();
    this.mainApp.use(express.json({ limit: "10mb" }));
    this.mainApp.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // HTTP server and WebSocket server (for log streaming)
    this.httpServer = null;
    this.wss = null;

    // Setup health endpoints on main app
    this.setupHealthEndpoints();
    
    // Setup log endpoints on main app
    this.setupLogEndpoints();
  }

  /**
   * Initialize the agent runtime
   */
  async initialize() {
    try {
      logger.info(`Initializing agent: ${this.agentName} (${this.agentId})`);

      // Start log buffer service to capture logs
      this.logBuffer.start();
      
      // Load agent code
      await this.loadAgentCode();
      
      // Initialize LLM client
      await this.initializeLLM();
      
      // Setup agent handlers
      await this.setupHandlers();
      
      // Setup HTTP middleware (CORS, rate limiting) if HTTP is enabled
      // This must be done BEFORE routes are added
      if (this.httpEnabled) {
        await this.setupHttpMiddleware();
      }

      // Setup user routes on main app (if any routes exist in agent code)
      // Routes are always added to the main app (same server as health and prompting)
      await this.setupAgentRoutes();

      // Setup direct prompting server (adds /prompt endpoint to main app)
      await this.setupDirectPromptingServer();

      // Set up 404 and error handlers AFTER all routes (including /prompt) are registered
      this.setupDefaultRoutes();

      // Start the main server (handles health, prompting, and user routes)
      this.startMainServer();
      
      // Mark as running
      this.isRunning = true;
      
      logger.info(`Agent ${this.agentName} initialized successfully`);
      
      // Execute agent main function if it exists
      if (this.agentCode && typeof this.agentCode.main === "function") {
        // Create agent context with tools and capabilities
        const agentContext = {
          llmClient: this.llmClient,
          handlers: this.handlers,
          tools: this.createToolsProxy(),
          config: {
            name: this.agentName,
            id: this.agentId,
            prompt: this.agentPrompt,
          },
        };
        
        // Execute main function without awaiting to prevent blocking
        // This allows the agent to run asynchronously while keeping the container alive
        this.executeAgentMain(agentContext);
      }
      
      // Keep the container alive - this is essential for agent runtime
      this.keepAlive();
    } catch (error) {
      logger.error("Failed to initialize agent:", error);
      process.exit(1);
    }
  }

  /**
   * Execute agent main function with proper error handling
   */
  async executeAgentMain(agentContext) {
    try {
      logger.info("Executing agent main function...");
      
      // Call the main function and handle different return patterns
      const result = this.agentCode.main(agentContext);
      
      // If it returns a promise, handle it properly
      if (result && typeof result.then === "function") {
        result.catch((error) => {
          logger.error("Agent main function error:", error);
          // Don't exit the container, just log the error
          this.handlers.get("error")?.forEach((handler) => {
            try {
              handler(error);
            } catch (handlerError) {
              logger.error("Error handler failed:", handlerError);
            }
          });
        });
      }
      
      logger.info("Agent main function started successfully");
    } catch (error) {
      logger.error("Failed to execute agent main function:", error);
      // Don't exit the container, just log the error and continue
      this.handlers.get("error")?.forEach((handler) => {
        try {
          handler(error);
        } catch (handlerError) {
          logger.error("Error handler failed:", handlerError);
        }
      });
    }
  }

  /**
   * Keep the container alive with a heartbeat mechanism
   */
  keepAlive() {
    logger.info("Starting keep-alive mechanism...");
    
    // Set up a heartbeat interval to keep the container running
    this.heartbeatInterval = setInterval(() => {
      if (this.isRunning) {
        // Trigger heartbeat handlers (user-defined handlers only, no default logging)
        const heartbeatHandlers = this.handlers.get("heartbeat") || [];
        heartbeatHandlers.forEach((handler) => {
          try {
            handler();
          } catch (error) {
            logger.error("Heartbeat handler error:", error);
          }
        });
      }
    }, 30000); // Heartbeat every 30 seconds
    
    // Also set up a simple keep-alive mechanism
    // This ensures the event loop stays active
    this.keepAliveTimeout = setTimeout(() => {
      // This timeout will never fire, but keeps the event loop active
      logger.debug("Keep-alive timeout triggered (this should not happen)");
    }, 2147483647); // Maximum timeout value
    
    logger.info("Keep-alive mechanism started - container will stay running");
  }

  /**
   * Load agent code from drop-off directory
   */
  async loadAgentCode() {
    const codeDir = "/app/agent-code";
    const mainFile = path.join(codeDir, "index.js");
    
    if (fs.existsSync(mainFile)) {
      logger.info("Loading agent code from index.js");
      this.agentCode = require(mainFile);
    } else {
      logger.warn("No agent code found, running in basic mode");
      this.agentCode = {
        main: async (agentContext) => {
          logger.info("Agent running in basic mode - no custom code loaded");
          logger.info(
            "Basic mode agent is ready and will respond to HTTP requests if enabled"
          );
          
          // In basic mode, the agent just stays alive and responds to HTTP requests
          // The keep-alive mechanism will handle keeping the container running
          return Promise.resolve();
        },
      };
    }
  }

  /**
   * Initialize LLM client based on provider
   */
  async initializeLLM() {
    const apiKey = process.env.LLM_API_KEY;
    const baseURL = process.env.LLM_BASE_URL;

    switch (this.llmProvider) {
      case "openai":
        const { OpenAI } = require("openai");
        this.llmClient = new OpenAI({
          apiKey,
          baseURL,
        });
        break;

      case "anthropic":
        const { Anthropic } = require("@anthropic-ai/sdk");
        this.llmClient = new Anthropic({
          apiKey,
        });
        break;

      case "cohere":
        const { CohereClient } = require("cohere-ai");
        this.llmClient = new CohereClient({
          token: apiKey,
        });
        break;

      case "ollama":
        // Custom implementation for Ollama
        const axios = require("axios");
        this.llmClient = {
          baseURL: baseURL || "http://localhost:11434",
          async chat(messages) {
            const response = await axios.post(`${this.baseURL}/api/chat`, {
              model: process.env.LLM_MODEL,
              messages,
              stream: false,
            });
            return response.data;
          },
        };
        break;

      default:
        throw new Error(`Unsupported LLM provider: ${this.llmProvider}`);
    }

    logger.info(
      `LLM client initialized: ${this.llmProvider} (${this.llmModel})`
    );
  }

  /**
   * Setup event handlers
   */
  async setupHandlers() {
    // Default handlers
    this.handlers.set("output", [(data) => logger.info("Agent output:", data)]);

    this.handlers.set("error", [
      (error) => logger.error("Agent error:", error),
    ]);

    // No default heartbeat handler - users can add their own if needed
    this.handlers.set("heartbeat", []);

    // Load custom handlers from agent code
    if (this.agentCode && this.agentCode.handlers) {
      Object.entries(this.agentCode.handlers).forEach(
        ([event, handlerList]) => {
        if (!this.handlers.has(event)) {
          this.handlers.set(event, []);
        }
        
          const handlers = Array.isArray(handlerList)
            ? handlerList
            : [handlerList];
        this.handlers.get(event).push(...handlers);
        }
      );
    }

    logger.info(
      `Handlers setup complete. Events: ${Array.from(this.handlers.keys()).join(
        ", "
      )}`
    );
  }

  /**
   * Emit an event to all matching handlers (fire-and-forget)
   * Supports both sync and async handlers
   * Supports pattern matching for tool events
   */
  async emitEvent(eventName, data = null) {
    // Find all matching handlers (exact match and pattern match)
    const matchingHandlers = [];

    for (const [handlerPattern, handlers] of this.handlers) {
      if (this.matchesEventPattern(eventName, handlerPattern)) {
        matchingHandlers.push(...handlers);
      }
    }

    // Execute all matching handlers (in parallel for fire-and-forget)
    const promises = matchingHandlers.map(async (handler) => {
      try {
        let result;
        if (typeof handler === "function") {
          result = handler(data);
        } else if (handler.handler && typeof handler.handler === "function") {
          result = handler.handler(data);
        }
        // Await if handler returns a promise
        if (result && typeof result.then === "function") {
          await result;
        }
      } catch (error) {
        logger.error(`Error in event handler for '${eventName}':`, error);
      }
    });

    // Wait for all handlers to complete
    await Promise.all(promises);

    if (matchingHandlers.length > 0) {
      logger.debug(
        `Emitted event '${eventName}' to ${matchingHandlers.length} handlers`
      );
    }
  }

  /**
   * Emit an event and collect responses from handlers that return modified data
   * Supports both sync and async handlers
   * Handlers are executed sequentially to allow proper chaining of modifications
   */
  async emitEventWithResponse(eventName, data) {
    // Find all matching handlers (exact match and pattern match)
    const matchingHandlers = [];

    for (const [handlerPattern, handlers] of this.handlers) {
      if (this.matchesEventPattern(eventName, handlerPattern)) {
        matchingHandlers.push(...handlers);
      }
    }

    let modifiedData = { ...data };

    // Execute handlers sequentially to allow chaining of modifications
    for (const handler of matchingHandlers) {
      try {
        let result;
        if (typeof handler === "function") {
          result = handler(modifiedData);
        } else if (handler.handler && typeof handler.handler === "function") {
          result = handler.handler(modifiedData);
        }

        // Await if handler returns a promise
        if (result && typeof result.then === "function") {
          result = await result;
        }

        // If handler returns an object, merge it with the current data
        if (result && typeof result === "object" && !Array.isArray(result)) {
          modifiedData = { ...modifiedData, ...result };
        }
      } catch (error) {
        logger.error(`Handler error for event '${eventName}':`, error);
      }
    }

    if (matchingHandlers.length > 0) {
      logger.debug(
        `Emitted event '${eventName}' to ${matchingHandlers.length} handlers with response capability`
      );
    }

    return modifiedData;
  }

  /**
   * Check if an event name matches a handler pattern
   * Supports wildcards and specific patterns
   */
  matchesEventPattern(eventName, pattern) {
    // Exact match
    if (eventName === pattern) {
      return true;
    }

    // Wildcard patterns
    if (pattern.includes("*")) {
      const regexPattern = pattern.replace(/\*/g, ".*").replace(/:/g, ":");
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(eventName);
    }

    return false;
  }

  /**
   * Setup health check endpoints on main app
   */
  setupHealthEndpoints() {
    this.mainApp.get("/health", (req, res) => {
      res.json({
        status: this.isRunning ? "healthy" : "starting",
        agent: {
          name: this.agentName,
          id: this.agentId,
          provider: this.llmProvider,
          model: this.llmModel,
        },
        http: {
          enabled: this.httpEnabled,
          port: this.httpEnabled ? this.httpPort : null,
        },
        uptime: Date.now() - this.startTime.getTime(),
        timestamp: new Date().toISOString(),
      });
    });

    this.mainApp.get("/status", (req, res) => {
      res.json({
        agent: {
          name: this.agentName,
          id: this.agentId,
          status: this.isRunning ? "running" : "starting",
          startTime: this.startTime.toISOString(),
          uptime: Date.now() - this.startTime.getTime(),
        },
        llm: {
          provider: this.llmProvider,
          model: this.llmModel,
          hasClient: !!this.llmClient,
        },
        http: {
          enabled: this.httpEnabled,
          port: this.httpEnabled ? this.httpPort : null,
          endpoints: this.mainApp ? this.getRoutesList() : { builtin: [], userDefined: [], all: [] },
        },
        handlers: Array.from(this.handlers.keys()),
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          memory: process.memoryUsage(),
        },
      });
    });

    this.mainApp.get("/metrics", async (req, res) => {
      const memUsage = process.memoryUsage();
      
      // Take a delta measurement for accurate CPU percentage
      // Measure CPU usage over a period (500ms for better accuracy)
      const measurementStart = process.cpuUsage();
      const measurementStartTime = process.hrtime.bigint(); // High-resolution time in nanoseconds
      
      // Wait a period to measure CPU delta (longer period = more accurate)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const measurementEnd = process.cpuUsage(measurementStart);
      const measurementEndTime = process.hrtime.bigint();
      
      // Calculate elapsed time in milliseconds (hrtime is in nanoseconds)
      const measurementDeltaNs = Number(measurementEndTime - measurementStartTime);
      const measurementDeltaMs = measurementDeltaNs / 1000000; // Convert nanoseconds to milliseconds
      
      // Calculate CPU percentage from delta
      // cpuUsage.user and cpuUsage.system are in microseconds
      const totalCpuTimeMicroseconds = measurementEnd.user + measurementEnd.system;
      const totalCpuTimeMilliseconds = totalCpuTimeMicroseconds / 1000;
      
      // CPU percentage = (CPU time used / elapsed time) * 100
      // This gives us the percentage of one CPU core used
      // For multi-core systems, values can exceed 100% if using multiple cores
      const cpuPercent = measurementDeltaMs > 0 
        ? (totalCpuTimeMilliseconds / measurementDeltaMs) * 100
        : 0;
      
      // Calculate cumulative CPU usage since startup
      const cumulativeCpuUsage = process.cpuUsage(this.cpuUsageStart);
      const cumulativeCpuTimeMicroseconds = cumulativeCpuUsage.user + cumulativeCpuUsage.system;
      const cumulativeCpuTimeMilliseconds = cumulativeCpuTimeMicroseconds / 1000;
      const cumulativeTimeMs = Number(process.hrtime.bigint() - this.cpuUsageStartTime) / 1000000;
      const cumulativeCpuPercent = cumulativeTimeMs > 0
        ? (cumulativeCpuTimeMilliseconds / cumulativeTimeMs) * 100
        : 0;
      
      // Get system memory info
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      
      res.json({
        timestamp: new Date().toISOString(),
        agent: {
          name: this.agentName,
          id: this.agentId,
          uptime: Date.now() - this.startTime.getTime(),
        },
        cpu: {
          current: {
            user: measurementEnd.user, // microseconds (delta over measurement period)
            system: measurementEnd.system, // microseconds (delta over measurement period)
            total: totalCpuTimeMilliseconds, // milliseconds (delta over measurement period)
            percent: parseFloat(cpuPercent.toFixed(2)), // percentage over measurement period
            measurementPeriod: measurementDeltaMs, // milliseconds
          },
          cumulative: {
            user: cumulativeCpuUsage.user, // microseconds (since startup)
            system: cumulativeCpuUsage.system, // microseconds (since startup)
            total: cumulativeCpuTimeMilliseconds, // milliseconds (since startup)
            percent: parseFloat(cumulativeCpuPercent.toFixed(2)), // average percentage since startup
            uptime: cumulativeTimeMs, // milliseconds since startup
          },
          cores: os.cpus().length,
          model: os.cpus()[0]?.model || "unknown",
        },
        memory: {
          process: {
            rss: memUsage.rss, // Resident Set Size - total memory allocated
            heapTotal: memUsage.heapTotal, // Total heap memory allocated
            heapUsed: memUsage.heapUsed, // Heap memory used
            external: memUsage.external, // Memory used by C++ objects bound to JS objects
            arrayBuffers: memUsage.arrayBuffers, // Memory allocated for ArrayBuffers
          },
          system: {
            total: totalMemory, // Total system memory
            free: freeMemory, // Free system memory
            used: usedMemory, // Used system memory
            percent: ((usedMemory / totalMemory) * 100).toFixed(2), // Percentage used
          },
          // Human-readable formats
          processFormatted: {
            rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
            heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
            heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
            external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`,
          },
          systemFormatted: {
            total: `${(totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
            free: `${(freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
            used: `${(usedMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
          },
        },
        loadAverage: os.loadavg(), // 1, 5, and 15 minute load averages
      });
    });
  }

  /**
   * Setup log endpoints on main app
   */
  setupLogEndpoints() {
    /**
     * GET /logs
     * Get historical logs with pagination and time filtering
     * 
     * Query params:
     * - startTime: Unix timestamp (ms) - start of time range
     * - endTime: Unix timestamp (ms) - end of time range
     * - limit: Number of logs per page (default: 100)
     * - offset: Pagination offset (default: 0)
     * - stream: 'stdout' | 'stderr' | null (default: both)
     */
    this.mainApp.get("/logs", (req, res) => {
      try {
        const {
          startTime,
          endTime,
          limit = 100,
          offset = 0,
          stream,
        } = req.query;

        const options = {
          startTime: startTime ? parseInt(startTime) : null,
          endTime: endTime ? parseInt(endTime) : null,
          limit: parseInt(limit),
          offset: parseInt(offset),
          stream: stream || null,
        };

        const result = this.logBuffer.getLogs(options);

        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        logger.error('Error getting logs:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get logs',
          message: error.message,
        });
      }
    });

    /**
     * GET /logs/range
     * Get logs from specific time range (convenience endpoint)
     * 
     * Query params:
     * - minutesAgo: Number of minutes to look back (default: 10)
     * - stream: 'stdout' | 'stderr' | null
     */
    this.mainApp.get("/logs/range", (req, res) => {
      try {
        const { minutesAgo = 10, stream } = req.query;
        const endTime = Date.now();
        const startTime = endTime - (parseInt(minutesAgo) * 60 * 1000);

        const result = this.logBuffer.getLogsByTimeRange(startTime, endTime);

        // Filter by stream if specified
        let logs = result.logs;
        if (stream) {
          logs = logs.filter(log => log.stream === stream);
        }

        res.json({
          success: true,
          data: {
            logs,
            count: logs.length,
            startTime,
            endTime,
          },
        });
      } catch (error) {
        logger.error('Error getting logs by range:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get logs',
          message: error.message,
        });
      }
    });

    /**
     * GET /logs/stats
     * Get log statistics
     */
    this.mainApp.get("/logs/stats", (req, res) => {
      try {
        const allLogs = this.logBuffer.getLogs({ limit: 10000 });
        
        const stats = {
          total: allLogs.total,
          oldest: allLogs.logs[0]?.timestamp || null,
          newest: allLogs.logs[allLogs.logs.length - 1]?.timestamp || null,
          stdout: allLogs.logs.filter(l => l.stream === 'stdout').length,
          stderr: allLogs.logs.filter(l => l.stream === 'stderr').length,
          bufferSize: this.logBuffer.logs.length,
          maxSize: this.logBuffer.maxSize,
          maxAge: this.logBuffer.maxAge,
        };

        res.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        logger.error('Error getting log stats:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get log stats',
          message: error.message,
        });
      }
    });
  }

  /**
   * Setup HTTP middleware (CORS, rate limiting) on main app
   * This is only called if HTTP is explicitly enabled via configuration
   */
  async setupHttpMiddleware() {
    logger.info(`Setting up HTTP middleware on main server`);

    // CORS if enabled
    if (process.env.HTTP_CORS !== "false") {
      this.mainApp.use((req, res, next) => {
        res.header("Access-Control-Allow-Origin", "*");
        res.header(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, DELETE, PATCH, OPTIONS"
        );
        res.header(
          "Access-Control-Allow-Headers",
          "Origin, X-Requested-With, Content-Type, Accept, Authorization"
        );

        if (req.method === "OPTIONS") {
          res.sendStatus(200);
        } else {
          next();
        }
      });
    }

    // Rate limiting if configured
    if (process.env.HTTP_RATE_LIMIT === "true") {
      const rateLimit = require("express-rate-limit");
      const limiter = rateLimit({
        windowMs:
          parseInt(process.env.HTTP_RATE_LIMIT_WINDOW) || 15 * 60 * 1000,
        max: parseInt(process.env.HTTP_RATE_LIMIT_MAX) || 100,
        message: process.env.HTTP_RATE_LIMIT_MESSAGE || "Too many requests",
      });
      this.mainApp.use(limiter);
    }
  }

  /**
   * Setup routes defined in agent configuration
   * Routes are always added to the main app (same server as health and prompting)
   * NOTE: Does NOT set up 404 handler - that must be done AFTER all routes including /prompt
   */
  async setupAgentRoutes() {
    if (!this.agentCode || !this.agentCode.routes) {
      // Set up default root route only (404 handler will be set up later)
      this.mainApp.get("/", (req, res) => {
      res.json({
        message: `🤖 ${this.agentName} HTTP Server`,
        agent: this.agentName,
          version: "1.0.0",
        endpoints: this.getRoutesList(),
          timestamp: new Date().toISOString(),
      });
    });
      return;
    }

    logger.info(`Setting up user routes on main server`);

    // Setup routes from agent code
    Object.entries(this.agentCode.routes).forEach(([path, handlers]) => {
      if (typeof handlers === "object") {
        Object.entries(handlers).forEach(([method, handler]) => {
          if (typeof handler === "function") {
            const lowerMethod = method.toLowerCase();
            if (this.mainApp[lowerMethod]) {
              // Register route handler directly on main app
              this.mainApp[lowerMethod](path, handler);
              logger.info(`Registered route: ${method.toUpperCase()} ${path}`);
            }
          }
        });
      }
    });

    // Setup middleware from agent code
    if (this.agentCode.middleware && Array.isArray(this.agentCode.middleware)) {
      this.agentCode.middleware.forEach((middleware) => {
        if (typeof middleware === "function") {
          this.mainApp.use(middleware);
          logger.info("Registered custom middleware");
        }
      });
    }

    // Set up default root route (404 handler will be set up later, after /prompt)
    this.mainApp.get("/", (req, res) => {
      res.json({
        message: `🤖 ${this.agentName} HTTP Server`,
        agent: this.agentName,
        version: "1.0.0",
        endpoints: this.getRoutesList(),
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Setup 404 and error handlers on main app
   * MUST be called AFTER all routes (including /prompt) are registered
   */
  setupDefaultRoutes() {
    // 404 handler (must be after ALL routes, including /prompt)
    this.mainApp.use((req, res) => {
      res.status(404).json({
        error: "Not Found",
        message: `Cannot ${req.method} ${req.path}`,
        availableEndpoints: this.getRoutesList(),
      });
    });

    // Error handler (must be last)
    this.mainApp.use((err, req, res, next) => {
      logger.error("HTTP server error:", err);
      res.status(500).json({
        error: "Internal Server Error",
        message:
          process.env.NODE_ENV === "development"
            ? err.message
            : "Something went wrong",
      });
    });
  }

  /**
   * Get list of registered routes, categorized as built-in or user-defined
   */
  getRoutesList() {
    if (!this.mainApp) return { builtin: [], userDefined: [], all: [] };
    
    // List of built-in endpoints
    const builtInPaths = [
      '/health',
      '/status',
      '/metrics',
      '/logs',
      '/logs/range',
      '/logs/stats',
      '/prompt',
      '/'
    ];
    
    const builtin = [];
    const userDefined = [];
    
    // Add WebSocket endpoint manually (it won't appear in router stack)
    if (this.wss) {
      builtin.push({
        path: '/logs/stream',
        methods: ['WS'],
        type: 'websocket'
      });
    }
    
    this.mainApp._router.stack.forEach((middleware) => {
      if (middleware.route) {
        const path = middleware.route.path;
        const methods = Object.keys(middleware.route.methods).map((m) => m.toUpperCase());
        const routeInfo = {
          path: path,
          methods: methods,
          type: 'http'
        };
        
        // Check if it's a built-in endpoint
        if (builtInPaths.includes(path)) {
          builtin.push(routeInfo);
        } else {
          userDefined.push(routeInfo);
        }
      }
    });
    
    return {
      builtin: builtin,
      userDefined: userDefined,
      all: [...builtin, ...userDefined]
    };
  }

  /**
   * Setup WebSocket server for log streaming on /logs/stream
   */
  setupLogStreaming() {
    if (!this.httpServer) {
      logger.warn('HTTP server not initialized, cannot setup WebSocket');
      return;
    }

    this.wss = new WebSocketServer({
      server: this.httpServer,
      path: '/logs/stream',
    });

    this.wss.on('connection', (ws, req) => {
      logger.info('📡 Log stream WebSocket connected');

      // Send recent logs immediately (last 100)
      const recentLogs = this.logBuffer.getLogs({ limit: 100 });
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'initial',
          data: recentLogs.logs,
        }));
      }

      // Listen for new logs
      const onLog = (logEntry) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'log',
            data: logEntry,
          }));
        }
      };

      this.logBuffer.on('log', onLog);

      // Cleanup on disconnect
      ws.on('close', () => {
        this.logBuffer.off('log', onLog);
        logger.info('📡 Log stream WebSocket disconnected');
      });

      // Handle ping/pong for keepalive
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Mark as alive initially
      ws.isAlive = true;
    });

    // Keepalive ping every 30 seconds
    const keepaliveInterval = setInterval(() => {
      if (!this.wss) {
        clearInterval(keepaliveInterval);
        return;
      }
      
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    logger.info('✅ Log streaming WebSocket server started on /logs/stream');
  }

  /**
   * Start main server (handles health, prompting, and optionally HTTP API)
   * The main server ALWAYS runs on the port specified by setPromptingServer (or default 3000)
   */
  startMainServer() {
    const port = this.mainPort;
    const host = "0.0.0.0";

    // Create HTTP server from Express app (needed for WebSocket support)
    this.httpServer = http.createServer(this.mainApp);

    // Setup WebSocket for log streaming
    this.setupLogStreaming();

    // Start the HTTP server
    this.httpServer.listen(port, host, () => {
      logger.info(`🌐 Main HTTP server listening on ${host}:${port}`);
      logger.info(`🔗 Health check: GET http://localhost:${port}/health`);
      logger.info(`🔗 Status: GET http://localhost:${port}/status`);
      logger.info(`🔗 Metrics: GET http://localhost:${port}/metrics`);
      logger.info(`📋 Logs: GET http://localhost:${port}/logs`);
      logger.info(`📡 Log stream: WSS ws://localhost:${port}/logs/stream`);
      
      const directPromptingEnabled =
        process.env.DIRECT_PROMPTING_ENABLED !== "false";
      if (directPromptingEnabled) {
        logger.info(`📡 Direct prompting: POST http://localhost:${port}/prompt`);
      }
      
      if (this.httpEnabled) {
        logger.info(`🔗 HTTP API routes: http://localhost:${port}`);
      }
      
      logger.info(`✅ Main server ready on port ${port}`);
    });
  }

  /**
   * Setup direct prompting server (HTTP only)
   * Always sets up /prompt endpoint - the main HTTP server always runs
   */
  async setupDirectPromptingServer() {
    const port = parseInt(process.env.DOCKER_PORT) || 3000;
    const directPromptingEnabled = process.env.DIRECT_PROMPTING_ENABLED !== "false";
    
    logger.info(`🔍 Checking direct prompting setup:`);
    logger.info(`   - DOCKER_PORT: ${process.env.DOCKER_PORT || 'not set (defaulting to 3000)'}`);
    logger.info(`   - DIRECT_PROMPTING_ENABLED: ${process.env.DIRECT_PROMPTING_ENABLED || 'not set'}`);
    logger.info(`   - Direct prompting enabled: ${directPromptingEnabled}`);
    
    // Always set up the /prompt endpoint if DIRECT_PROMPTING_ENABLED is not explicitly "false"
    // The main HTTP server always runs, so the endpoint should be available
    if (directPromptingEnabled) {
      logger.info(`🌐 Setting up HTTP prompting endpoints on port ${port}...`);
      await this.setupHttpPromptingEndpoints();
      logger.info("✅ Direct prompting endpoint (/prompt) configured");
    } else {
      logger.warn(`⚠️  Direct prompting is DISABLED - /prompt endpoint will not be available`);
      logger.warn(`   Set DIRECT_PROMPTING_ENABLED=true or call setPromptingServer() to enable`);
    }
  }

  /**
   * Setup HTTP endpoints for direct prompting (adds /prompt endpoint to main app)
   */
  async setupHttpPromptingEndpoints() {
    logger.info("🔧 Setting up HTTP prompting endpoints on main server...");

    // Direct prompting endpoint on main app
    this.mainApp.post("/prompt", async (req, res) => {
      logger.info(`📥 Received POST /prompt request from ${req.ip || 'unknown'}`);
      try {
        const { prompt, ...requestBodyFields } = req.body;

        if (!prompt) {
          return res.status(400).json({
            error: "Prompt is required",
            timestamp: new Date().toISOString(),
          });
        }

        // Build metadata object with all user-provided fields from request body (except prompt)
        const metadata = {
          ...requestBodyFields,
        };

        const response = await this.processDirectPrompt(prompt, metadata, {
          protocol: "http",
          clientIp: req.ip,
        });

        res.json({
          response: response.content,
          metadata: response.metadata,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error("HTTP prompt processing error:", error);
        res.status(500).json({
          error: "Failed to process prompt",
          message: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    });

    logger.info(`📡 HTTP prompting endpoint added: POST /prompt`);
    logger.info(`   Full URL: http://localhost:${this.mainPort}/prompt`);
    logger.info(`   Full URL: http://127.0.0.1:${this.mainPort}/prompt`);
  }

  /**
   * Process a direct prompt and emit events
   */
  async processDirectPrompt(prompt, metadata = {}, systemFields = {}) {
    const startTime = Date.now();
    let finalPrompt = prompt; // Declare outside try block so it's available in catch

    try {
      // Emit request start event and allow handlers to modify the prompt
      const startEventData = {
        prompt,
        metadata,
        ...systemFields, // protocol, clientIp, etc.
        timestamp: new Date().toISOString(),
      };
      
      const modifiedData = await this.emitEventWithResponse("request_output:start", startEventData);
      
      // Use modified prompt if handlers returned one, otherwise use original
      finalPrompt = modifiedData?.prompt || prompt;
      // Process with LLM
      let response;
      if (this.llmProvider === "openai") {
        const completion = await this.llmClient.chat.completions.create({
          model: this.llmModel,
          messages: [
            { role: "system", content: this.agentPrompt },
            { role: "user", content: finalPrompt },
          ],
          temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.7,
          max_tokens: parseInt(process.env.LLM_MAX_TOKENS) || 1000,
        });

        response = {
          content: completion.choices[0].message.content,
          usage: completion.usage,
          model: completion.model,
        };
      } else {
        // Fallback for other providers
        response = {
          content: `Echo: ${prompt} (LLM provider ${this.llmProvider} not fully implemented)`,
          usage: { total_tokens: 0 },
          model: this.llmModel,
        };
      }

      const processingTime = Date.now() - startTime;

      // Emit request output event
      await this.emitEvent("request_output", {
        prompt,
        finalPrompt, // Include the final prompt that was sent to LLM
        response: response.content,
        metadata,
        ...systemFields, // protocol, clientIp, etc.
        usage: response.usage,
        model: response.model,
        processingTime,
        promptModified: finalPrompt !== prompt, // Indicate if prompt was modified
        timestamp: new Date().toISOString(),
      });

      // Emit end event and allow handlers to modify the response before returning
      const endEventData = {
        prompt,
        finalPrompt,
        response: response.content,
        metadata,
        ...systemFields, // protocol, clientIp, etc.
        usage: response.usage,
        model: response.model,
        processingTime,
        promptModified: finalPrompt !== prompt,
        success: true,
        timestamp: new Date().toISOString(),
      };

      const modifiedEndData = await this.emitEventWithResponse("request_output:end", endEventData);
      
      // Use the final response (potentially modified by handlers)
      const finalResponse = modifiedEndData.response || response.content;

      return {
        content: finalResponse,
        metadata: {
          usage: response.usage,
          model: response.model,
          processingTime,
          responseModified: finalResponse !== response.content, // Indicate if response was modified
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;

      // Emit error event
      await this.emitEvent("request_output:error", {
        prompt,
        finalPrompt,
        metadata,
        ...systemFields, // protocol, clientIp, etc.
        error: error.message,
        processingTime,
        promptModified: finalPrompt !== prompt,
        success: false,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }


  /**
   * Create tools proxy for agent runtime
   */
  createToolsProxy() {
    // Basic built-in tools that work in container environment
    return {
      httpRequest: async (params) => {
        const axios = require("axios");
        try {
          const response = await axios({
            url: params.url,
            method: params.method || "GET",
            headers: params.headers || {},
            data: params.data,
            timeout: params.timeout || 10000,
          });
          
          return {
            status: response.status,
            headers: response.headers,
            data: response.data,
            success: response.status >= 200 && response.status < 300,
          };
        } catch (error) {
          throw new Error(`HTTP request failed: ${error.message}`);
        }
      },
      
      getCurrentTime: (params = {}) => {
        const now = new Date();
        const format = params.format || "iso";
        
        switch (format) {
          case "iso":
            return {
              formatted: now.toISOString(),
              timestamp: now.toISOString(),
            };
          case "unix":
            return {
              formatted: Math.floor(now.getTime() / 1000),
              timestamp: now.toISOString(),
            };
          case "readable":
            return {
              formatted: now.toLocaleString(),
              timestamp: now.toISOString(),
            };
          default:
            return {
              formatted: now.toISOString(),
              timestamp: now.toISOString(),
            };
        }
      },
      
      analyzeText: (params) => {
        const text = params.text;
        const words = text.split(/\s+/).filter((word) => word.length > 0);
        const sentences = text
          .split(/[.!?]+/)
          .filter((s) => s.trim().length > 0);
        
        const result = {
          length: text.length,
          stats: {
            characters: text.length,
            words: words.length,
            sentences: sentences.length,
            averageWordsPerSentence:
              sentences.length > 0
                ? Math.round((words.length / sentences.length) * 10) / 10
                : 0,
          },
        };
        
        if (params.includeSentiment) {
          const positiveWords = [
            "good",
            "great",
            "excellent",
            "amazing",
            "wonderful",
          ];
          const negativeWords = [
            "bad",
            "terrible",
            "awful",
            "horrible",
            "disappointing",
          ];
          
          const lowerText = text.toLowerCase();
          const positiveCount = positiveWords.filter((word) =>
            lowerText.includes(word)
          ).length;
          const negativeCount = negativeWords.filter((word) =>
            lowerText.includes(word)
          ).length;
          
          result.sentiment = {
            score: positiveCount - negativeCount,
            label:
              positiveCount > negativeCount
                ? "positive"
                : negativeCount > positiveCount
                ? "negative"
                : "neutral",
          };
        }
        
        return result;
      },
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info("Shutting down agent...");
    
    this.isRunning = false;
    
    // Clean up keep-alive mechanisms
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    if (this.keepAliveTimeout) {
      clearTimeout(this.keepAliveTimeout);
      logger.debug("Keep-alive timeout cleared");
    }
    
    // Call shutdown handlers if they exist
    const shutdownHandlers = this.handlers.get("shutdown") || [];
    for (const handler of shutdownHandlers) {
      try {
        await handler();
      } catch (error) {
        logger.error("Error in shutdown handler:", error);
      }
    }
    
    logger.info("Agent shutdown complete");
    process.exit(0);
  }
}

// Handle shutdown signals
process.on("SIGTERM", async () => {
  if (runtime) {
    await runtime.shutdown();
  }
});

process.on("SIGINT", async () => {
  if (runtime) {
    await runtime.shutdown();
  }
});

// Start the agent runtime
const runtime = new AgentRuntime();
runtime.initialize().catch((error) => {
  logger.error("Failed to start agent:", error);
  process.exit(1);
});
