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

    // HTTP server configuration
    this.httpEnabled = process.env.HTTP_ENABLED === "true";
    this.httpPort = parseInt(process.env.HTTP_PORT) || 3000;
    this.httpHost = process.env.HTTP_HOST || "0.0.0.0";

    // Setup express servers
    this.healthApp = express(); // Health check server (always running)
    this.httpApp = null; // Main HTTP server (optional)

    this.setupHealthEndpoints();
  }

  /**
   * Initialize the agent runtime
   */
  async initialize() {
    try {
      logger.info(`Initializing agent: ${this.agentName} (${this.agentId})`);

      // Load agent code
      await this.loadAgentCode();

      // Initialize LLM client
      await this.initializeLLM();

      // Setup agent handlers
      await this.setupHandlers();

      // Start health check server
      this.startHealthServer();

      // Start HTTP server if enabled
      if (this.httpEnabled) {
        await this.setupHttpServer();
        this.startHttpServer();
      }

      // Setup direct prompting server
      await this.setupDirectPromptingServer();

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
        logger.debug(
          `Agent ${this.agentName} heartbeat - uptime: ${Math.floor(
            process.uptime()
          )}s`
        );

        // Trigger heartbeat handlers
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

    this.handlers.set("heartbeat", [
      () => logger.debug(`Agent ${this.agentName} heartbeat`),
    ]);

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
   * Emit an event to all matching handlers
   * Supports pattern matching for tool events
   */
  emitEvent(eventName, data = null) {
    // Find all matching handlers (exact match and pattern match)
    const matchingHandlers = [];

    for (const [handlerPattern, handlers] of this.handlers) {
      if (this.matchesEventPattern(eventName, handlerPattern)) {
        matchingHandlers.push(...handlers);
      }
    }

    // Execute all matching handlers
    matchingHandlers.forEach((handler) => {
      try {
        if (typeof handler === "function") {
          handler(data);
        } else if (handler.handler && typeof handler.handler === "function") {
          handler.handler(data);
        }
      } catch (error) {
        logger.error(`Error in event handler for '${eventName}':`, error);
      }
    });

    if (matchingHandlers.length > 0) {
      logger.debug(
        `Emitted event '${eventName}' to ${matchingHandlers.length} handlers`
      );
    }
  }

  /**
   * Emit an event and collect responses from handlers that return modified data
   */
  emitEventWithResponse(eventName, data) {
    // Find all matching handlers (exact match and pattern match)
    const matchingHandlers = [];

    for (const [handlerPattern, handlers] of this.handlers) {
      if (this.matchesEventPattern(eventName, handlerPattern)) {
        matchingHandlers.push(...handlers);
      }
    }

    let modifiedData = { ...data };

    // Execute all matching handlers and collect responses
    matchingHandlers.forEach((handler) => {
      try {
        let result;
        if (typeof handler === "function") {
          result = handler(modifiedData);
        } else if (handler.handler && typeof handler.handler === "function") {
          result = handler.handler(modifiedData);
        }

        // If handler returns an object, merge it with the current data
        if (result && typeof result === "object" && !Array.isArray(result)) {
          modifiedData = { ...modifiedData, ...result };
        }
      } catch (error) {
        logger.error(`Handler error for event '${eventName}':`, error);
      }
    });

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
   * Setup health check endpoints
   */
  setupHealthEndpoints() {
    this.healthApp.get("/health", (req, res) => {
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

    this.healthApp.get("/status", (req, res) => {
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
          routes: this.httpEnabled && this.httpApp ? this.getRoutesList() : [],
        },
        handlers: Array.from(this.handlers.keys()),
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          memory: process.memoryUsage(),
        },
      });
    });
  }

  /**
   * Setup HTTP server with Express.js
   */
  async setupHttpServer() {
    if (!this.httpEnabled) return;

    logger.info(`Setting up HTTP server on port ${this.httpPort}`);

    this.httpApp = express();

    // Basic middleware
    this.httpApp.use(express.json({ limit: "10mb" }));
    this.httpApp.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // CORS if enabled
    if (process.env.HTTP_CORS !== "false") {
      this.httpApp.use((req, res, next) => {
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
      this.httpApp.use(limiter);
    }

    // Setup routes from agent configuration
    await this.setupAgentRoutes();

    // Default routes
    this.httpApp.get("/", (req, res) => {
      res.json({
        message: `🤖 ${this.agentName} HTTP Server`,
        agent: this.agentName,
        version: "1.0.0",
        endpoints: this.getRoutesList(),
        timestamp: new Date().toISOString(),
      });
    });

    // 404 handler
    this.httpApp.use((req, res) => {
      res.status(404).json({
        error: "Not Found",
        message: `Cannot ${req.method} ${req.path}`,
        availableRoutes: this.getRoutesList(),
      });
    });

    // Error handler
    this.httpApp.use((err, req, res, next) => {
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
   * Setup routes defined in agent configuration
   */
  async setupAgentRoutes() {
    if (!this.agentCode || !this.agentCode.routes) return;

    // Setup routes from agent code
    Object.entries(this.agentCode.routes).forEach(([path, handlers]) => {
      if (typeof handlers === "object") {
        Object.entries(handlers).forEach(([method, handler]) => {
          if (typeof handler === "function") {
            const lowerMethod = method.toLowerCase();
            if (this.httpApp[lowerMethod]) {
              // Wrap handler to emit tool events
              const wrappedHandler = this.wrapHttpHandlerWithEvents(
                method,
                path,
                handler
              );
              this.httpApp[lowerMethod](path, wrappedHandler);
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
          this.httpApp.use(middleware);
          logger.info("Registered custom middleware");
        }
      });
    }
  }

  /**
   * Get list of registered routes
   */
  getRoutesList() {
    if (!this.httpApp) return [];

    const routes = [];
    this.httpApp._router.stack.forEach((middleware) => {
      if (middleware.route) {
        const methods = Object.keys(middleware.route.methods);
        routes.push({
          path: middleware.route.path,
          methods: methods.map((m) => m.toUpperCase()),
        });
      }
    });

    return routes;
  }

  /**
   * Start health check server
   */
  startHealthServer() {
    const port = process.env.HEALTH_PORT || 3001;

    this.healthApp.listen(port, "0.0.0.0", () => {
      logger.info(`Health server listening on port ${port}`);
    });
  }

  /**
   * Start HTTP server
   */
  startHttpServer() {
    if (!this.httpEnabled || !this.httpApp) return;

    this.httpApp.listen(this.httpPort, this.httpHost, () => {
      logger.info(
        `🌐 HTTP server listening on ${this.httpHost}:${this.httpPort}`
      );
      logger.info(
        `🔗 Agent HTTP endpoint: http://${this.httpHost}:${this.httpPort}`
      );
    });
  }

  /**
   * Setup direct prompting server (WebSocket/HTTP)
   */
  async setupDirectPromptingServer() {
    const directPromptingEnabled =
      process.env.DIRECT_PROMPTING_ENABLED !== "false";
    logger.info(`🔍 Direct prompting enabled: ${directPromptingEnabled}`);
    if (!directPromptingEnabled) return;

    const protocol = process.env.DIRECT_PROMPTING_PROTOCOL || "websocket";
    const port = parseInt(process.env.DOCKER_PORT) || 3000;

    logger.info(
      `Setting up direct prompting server (${protocol}) on port ${port}`
    );

    if (protocol === "websocket") {
      logger.info("📡 Setting up WebSocket server...");
      await this.setupWebSocketServer(port);
    } else if (protocol === "http") {
      logger.info("🌐 Setting up HTTP prompting endpoints...");
      await this.setupHttpPromptingEndpoints();
    } else {
      logger.warn(`⚠️  Unknown protocol: ${protocol}`);
    }

    logger.info("✅ Direct prompting server setup completed");
  }

  /**
   * Setup WebSocket server for direct prompting
   */
  async setupWebSocketServer(port) {
    const WebSocket = require("ws");
    const maxConnections =
      parseInt(process.env.DIRECT_PROMPTING_MAX_CONNECTIONS) || 100;
    const authentication =
      process.env.DIRECT_PROMPTING_AUTHENTICATION === "true";

    this.wsServer = new WebSocket.Server({
      port: port,
      host: "0.0.0.0",
      maxClients: maxConnections,
    });

    this.activeConnections = 0;

    logger.info(
      `WebSocket server configured with max ${maxConnections} connections, auth: ${authentication}`
    );

    this.wsServer.on("connection", (ws, req) => {
      const clientId = require("uuid").v4();
      this.activeConnections++;
      logger.info(
        `WebSocket client connected: ${clientId} (${this.activeConnections}/${maxConnections})`
      );

      ws.on("message", async (message) => {
        try {
          const data = JSON.parse(message.toString());
          const { prompt, conversationId, metadata } = data;

          if (!prompt) {
            ws.send(
              JSON.stringify({
                error: "Prompt is required",
                timestamp: new Date().toISOString(),
              })
            );
            return;
          }

          // Process the prompt with LLM
          const response = await this.processDirectPrompt(prompt, {
            conversationId,
            metadata,
            clientId,
            protocol: "websocket",
          });

          // Send response back
          ws.send(
            JSON.stringify({
              response: response.content,
              conversationId: conversationId || response.conversationId,
              metadata: response.metadata,
              timestamp: new Date().toISOString(),
            })
          );
        } catch (error) {
          logger.error("WebSocket message processing error:", error);
          ws.send(
            JSON.stringify({
              error: "Failed to process prompt",
              message: error.message,
              timestamp: new Date().toISOString(),
            })
          );
        }
      });

      ws.on("close", () => {
        this.activeConnections--;
        logger.info(
          `WebSocket client disconnected: ${clientId} (${this.activeConnections}/${maxConnections})`
        );
      });

      ws.on("error", (error) => {
        logger.error(`WebSocket error for client ${clientId}:`, error);
      });
    });

    logger.info(`🔌 WebSocket server listening on port ${port}`);
    logger.info(`🔗 Direct prompting endpoint: ws://localhost:${port}`);
  }

  /**
   * Setup HTTP endpoints for direct prompting
   */
  async setupHttpPromptingEndpoints() {
    logger.info("🔧 Setting up HTTP prompting endpoints...");
    const port = parseInt(process.env.DOCKER_PORT) || 3000;
    logger.info(`Port: ${port}, httpApp exists: ${!!this.httpApp}`);

    if (!this.httpApp) {
      // Create a minimal HTTP app for prompting if main HTTP is disabled
      logger.info("Creating new Express app for HTTP prompting");
      this.httpApp = express();
      this.httpApp.use(express.json({ limit: "10mb" }));
    }

    // Direct prompting endpoint
    this.httpApp.post("/prompt", async (req, res) => {
      try {
        const { prompt, conversationId, metadata } = req.body;

        if (!prompt) {
          return res.status(400).json({
            error: "Prompt is required",
            timestamp: new Date().toISOString(),
          });
        }

        const response = await this.processDirectPrompt(prompt, {
          conversationId,
          metadata,
          protocol: "http",
          clientIp: req.ip,
        });

        res.json({
          response: response.content,
          conversationId: conversationId || response.conversationId,
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

    // Start the HTTP server if it's not already running
    logger.info(
      `HTTP server status: httpEnabled=${this.httpEnabled}, port=${port}`
    );

    if (!this.httpEnabled) {
      // Only start if main HTTP server is not enabled
      logger.info(`Starting HTTP direct prompting server on port ${port}...`);

      try {
        const server = this.httpApp.listen(port, "0.0.0.0", () => {
          logger.info(
            `🌐 HTTP direct prompting server listening on port ${port}`
          );
          logger.info(
            `📡 Direct prompting endpoint: POST http://localhost:${port}/prompt`
          );
        });

        server.on("error", (error) => {
          logger.error(`HTTP server error:`, error);
        });
      } catch (error) {
        logger.error(`Failed to start HTTP server:`, error);
      }
    } else {
      logger.info(`📡 HTTP prompting endpoint added: POST /prompt`);
    }
  }

  /**
   * Process a direct prompt and emit events
   */
  async processDirectPrompt(prompt, context = {}) {
    const startTime = Date.now();
    const conversationId = context.conversationId || require("uuid").v4();

    try {
      // Emit request start event and allow handlers to modify the prompt
      const startEventData = {
        prompt,
        conversationId,
        context,
        timestamp: new Date().toISOString(),
      };
      
      const modifiedData = this.emitEventWithResponse("request_output:start", startEventData);
      
      // Use modified prompt if handlers returned one, otherwise use original
      const finalPrompt = modifiedData?.prompt || prompt;

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
      this.emitEvent("request_output", {
        prompt,
        finalPrompt, // Include the final prompt that was sent to LLM
        response: response.content,
        conversationId,
        context,
        usage: response.usage,
        model: response.model,
        processingTime,
        promptModified: finalPrompt !== prompt, // Indicate if prompt was modified
        timestamp: new Date().toISOString(),
      });

      // Emit end event and allow handlers to modify the response before returning
      const endEventData = {
        conversationId,
        prompt,
        finalPrompt,
        response: response.content,
        context,
        usage: response.usage,
        model: response.model,
        processingTime,
        promptModified: finalPrompt !== prompt,
        success: true,
        timestamp: new Date().toISOString(),
      };

      const modifiedEndData = this.emitEventWithResponse("request_output:end", endEventData);
      
      // Use the final response (potentially modified by handlers)
      const finalResponse = modifiedEndData.response || response.content;

      return {
        content: finalResponse,
        conversationId,
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
      this.emitEvent("request_output:error", {
        prompt,
        finalPrompt,
        conversationId,
        context,
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
   * Wrap HTTP handler to emit tool events
   */
  wrapHttpHandlerWithEvents(method, path, originalHandler) {
    return async (req, res) => {
      const startTime = Date.now();
      const requestId = require("uuid").v4();

      try {
        // Emit call event
        this.emitEvent("tool:http-server:call", {
          requestId,
          method: method.toUpperCase(),
          path,
          headers: req.headers,
          body: req.body,
          query: req.query,
          params: req.params,
          timestamp: new Date().toISOString(),
        });

        // Emit specific method call event
        this.emitEvent(`tool:http-server:call:${method.toLowerCase()}`, {
          requestId,
          path,
          headers: req.headers,
          body: req.body,
          query: req.query,
          params: req.params,
          timestamp: new Date().toISOString(),
        });

        // Capture response data
        const originalSend = res.send;
        const originalJson = res.json;
        let responseData = null;
        let statusCode = 200;

        res.send = function (data) {
          responseData = data;
          statusCode = res.statusCode;
          return originalSend.call(this, data);
        };

        res.json = function (data) {
          responseData = data;
          statusCode = res.statusCode;
          return originalJson.call(this, data);
        };

        // Execute original handler
        const result = await originalHandler(req, res);

        const processingTime = Date.now() - startTime;

        // Emit response event
        this.emitEvent("tool:http-server:response", {
          requestId,
          method: method.toUpperCase(),
          path,
          statusCode,
          responseData,
          processingTime,
          timestamp: new Date().toISOString(),
        });

        // Emit specific method response event
        this.emitEvent(`tool:http-server:response:${method.toLowerCase()}`, {
          requestId,
          path,
          statusCode,
          responseData,
          processingTime,
          timestamp: new Date().toISOString(),
        });

        // Emit wildcard events
        this.emitEvent("tool:http-server:*", {
          type: "response",
          requestId,
          method: method.toUpperCase(),
          path,
          statusCode,
          responseData,
          processingTime,
          timestamp: new Date().toISOString(),
        });

        return result;
      } catch (error) {
        const processingTime = Date.now() - startTime;

        // Emit error event
        this.emitEvent("tool:http-server:error", {
          requestId,
          method: method.toUpperCase(),
          path,
          error: error.message,
          stack: error.stack,
          processingTime,
          timestamp: new Date().toISOString(),
        });

        throw error;
      }
    };
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
      logger.debug("Heartbeat interval cleared");
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
