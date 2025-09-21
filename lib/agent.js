/**
 * DankAgent - Agent Definition Class
 * 
 * This class represents a single AI agent with its configuration,
 * handlers, and runtime requirements.
 */

const Joi = require('joi');
const { DEFAULT_CONFIG, SUPPORTED_LLMS, DOCKER_CONFIG } = require('./constants');
const { ToolRegistry, ToolExecutor } = require('./tools');
const builtinTools = require('./tools/builtin');

class DankAgent {
  constructor(name, config = {}) {
    this.name = name;
    this.config = this._validateConfig(config);
    this.handlers = new Map();
    this.id = this._generateId();
    this.status = 'defined'; // defined, building, running, stopped, error
    this.containerId = null;
    this.createdAt = new Date().toISOString();
    
    // Initialize tool system
    this.toolRegistry = new ToolRegistry();
    this.toolExecutor = new ToolExecutor(this.toolRegistry);
    
    // Register built-in tools if enabled
    if (config.enableBuiltinTools !== false) {
      this.registerBuiltinTools();
    }
  }

  /**
   * Set the LLM configuration for this agent
   */
  setLLM(provider, config) {
    if (!SUPPORTED_LLMS.includes(provider)) {
      throw new Error(`Unsupported LLM provider: ${provider}. Supported: ${SUPPORTED_LLMS.join(', ')}`);
    }
    
    this.config.llm = {
      provider,
      ...config
    };
    
    return this;
  }

  /**
   * Set the system prompt for the agent
   */
  setPrompt(prompt) {
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new Error('Prompt must be a non-empty string');
    }
    
    this.config.prompt = prompt.trim();
    return this;
  }

  /**
   * Set resource limits for the container
   */
  setResources(resources) {
    const schema = Joi.object({
      memory: Joi.string().pattern(/^\d+[mMgG]$/).default('512m'),
      cpu: Joi.number().min(0.1).max(8).default(1),
      timeout: Joi.number().min(1000).default(30000)
    });

    const { error, value } = schema.validate(resources);
    if (error) {
      throw new Error(`Invalid resource configuration: ${error.message}`);
    }

    this.config.resources = { ...this.config.resources, ...value };
    return this;
  }

  /**
   * Set Docker configuration including base image
   */
  setDocker(dockerConfig) {
    const schema = Joi.object({
      baseImage: Joi.string().required()
    });

    const { error, value } = schema.validate(dockerConfig);
    if (error) {
      throw new Error(`Invalid Docker configuration: ${error.message}`);
    }

    this.config.docker = { ...this.config.docker, ...value };
    return this;
  }

  /**
   * Set the base Docker image tag for this agent
   * The tag will be appended to the base image prefix (e.g., "nodejs-20" becomes "dank-agent-base:nodejs-20")
   */
  setBaseImage(tag) {
    if (typeof tag !== 'string' || tag.trim().length === 0) {
      throw new Error('Base image tag must be a non-empty string');
    }
    
    const cleanTag = tag.trim();
    const fullImageName = `${DOCKER_CONFIG.baseImagePrefix}:${cleanTag}`;
    
    this.config.docker = { ...this.config.docker, baseImage: fullImageName };
    return this;
  }


  /**
   * Configure prompting server settings
   */
  setPromptingServer(options = {}) {
    const schema = Joi.object({
      protocol: Joi.string().valid('websocket', 'tcp', 'http').default('http'),
      port: Joi.number().min(1000).max(65535).default(3000),
      authentication: Joi.boolean().default(false),
      maxConnections: Joi.number().min(1).max(1000).default(50),
      timeout: Joi.number().min(1000).default(30000)
    });

    const { error, value } = schema.validate(options);
    if (error) {
      throw new Error(`Invalid prompting server configuration: ${error.message}`);
    }

    // Set the port in docker config
    this.config.docker = { ...this.config.docker, port: value.port };

    // Set the communication config (excluding port)
    const { port, ...communicationConfig } = value;
    this.config.communication = {
      ...this.config.communication,
      directPrompting: {
        enabled: true,
        ...communicationConfig
      }
    };

    return this;
  }

  /**
   * Disable direct prompting communication
   */
  disableDirectPrompting() {
    this.config.communication = {
      ...this.config.communication,
      directPrompting: {
        ...this.config.communication.directPrompting,
        enabled: false
      }
    };

    return this;
  }


  /**
   * Enable HTTP server with Express.js
   */
  enableHttp(options = {}) {
    const schema = Joi.object({
      port: Joi.number().min(1000).max(65535).default(3000),
      host: Joi.string().default('0.0.0.0'),
      cors: Joi.boolean().default(true),
      rateLimit: Joi.object({
        windowMs: Joi.number().default(15 * 60 * 1000), // 15 minutes
        max: Joi.number().default(100), // limit each IP to 100 requests per windowMs
        message: Joi.string().default('Too many requests')
      }).default({}),
      middleware: Joi.array().items(Joi.string()).default([]),
      static: Joi.object({
        enabled: Joi.boolean().default(false),
        path: Joi.string().default('/public'),
        directory: Joi.string().default('./public')
      }).default({})
    });

    const { error, value } = schema.validate(options);
    if (error) {
      throw new Error(`Invalid HTTP configuration: ${error.message}`);
    }

    this.config.http = {
      enabled: true,
      ...value,
      routes: new Map(),
      middleware: []
    };

    return this;
  }

  /**
   * Add HTTP route handler
   */
  addRoute(method, path, handler, options = {}) {
    if (!this.config.http || !this.config.http.enabled) {
      throw new Error('HTTP server must be enabled before adding routes. Call enableHttp() first.');
    }

    if (typeof handler !== 'function') {
      throw new Error('Route handler must be a function');
    }

    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    const upperMethod = method.toUpperCase();
    
    if (!validMethods.includes(upperMethod)) {
      throw new Error(`Invalid HTTP method: ${method}. Valid methods: ${validMethods.join(', ')}`);
    }

    const routeKey = `${upperMethod}:${path}`;
    
    if (!this.config.http.routes.has(routeKey)) {
      this.config.http.routes.set(routeKey, []);
    }

    this.config.http.routes.get(routeKey).push({
      method: upperMethod,
      path,
      handler,
      options: {
        auth: options.auth || false,
        rateLimit: options.rateLimit || null,
        validation: options.validation || null,
        description: options.description || `${upperMethod} ${path}`
      },
      createdAt: new Date().toISOString()
    });

    return this;
  }

  /**
   * Add HTTP middleware
   */
  addMiddleware(middleware, options = {}) {
    if (!this.config.http || !this.config.http.enabled) {
      throw new Error('HTTP server must be enabled before adding middleware. Call enableHttp() first.');
    }

    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function');
    }

    this.config.http.middleware.push({
      middleware,
      options: {
        path: options.path || '*',
        priority: options.priority || 0,
        description: options.description || 'Custom middleware'
      },
      createdAt: new Date().toISOString()
    });

    // Sort middleware by priority (higher priority first)
    this.config.http.middleware.sort((a, b) => b.options.priority - a.options.priority);

    return this;
  }

  /**
   * Add common HTTP routes (convenience methods)
   */
  get(path, handler, options) { return this.addRoute('GET', path, handler, options); }
  post(path, handler, options) { return this.addRoute('POST', path, handler, options); }
  put(path, handler, options) { return this.addRoute('PUT', path, handler, options); }
  delete(path, handler, options) { return this.addRoute('DELETE', path, handler, options); }
  patch(path, handler, options) { return this.addRoute('PATCH', path, handler, options); }

  /**
   * Add a tool that the agent can use
   */
  addTool(name, definition) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Tool name must be a non-empty string');
    }

    this.toolRegistry.register(name, definition);
    return this;
  }

  /**
   * Add multiple tools at once
   */
  addTools(tools) {
    Object.entries(tools).forEach(([name, definition]) => {
      this.addTool(name, definition);
    });
    return this;
  }

  /**
   * Execute a tool with given parameters
   */
  async useTool(toolName, parameters = {}, context = {}) {
    const agentContext = {
      ...context,
      agentId: this.id,
      agentName: this.name,
      timestamp: new Date().toISOString()
    };

    return await this.toolExecutor.execute(toolName, parameters, agentContext);
  }

  /**
   * Get available tools
   */
  getTools() {
    return this.toolRegistry.getAll();
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category) {
    return this.toolRegistry.getByCategory(category);
  }

  /**
   * Get tool execution statistics
   */
  getToolStats() {
    return this.toolExecutor.getStats();
  }

  /**
   * Generate OpenAI function calling schema
   */
  getOpenAIToolSchema() {
    return this.toolRegistry.toOpenAISchema();
  }

  /**
   * Register built-in tools
   */
  registerBuiltinTools() {
    Object.entries(builtinTools).forEach(([name, definition]) => {
      this.toolRegistry.register(name, definition);
    });
    return this;
  }

  /**
   * Enable/disable specific built-in tools
   */
  configureBuiltinTools(config) {
    // Clear existing built-in tools
    const allTools = this.toolRegistry.getAll();
    const builtinToolNames = Object.keys(builtinTools);
    
    builtinToolNames.forEach(name => {
      if (this.toolRegistry.tools.has(name)) {
        this.toolRegistry.tools.delete(name);
      }
    });

    // Register only enabled tools
    Object.entries(config).forEach(([toolName, enabled]) => {
      if (enabled && builtinTools[toolName]) {
        this.toolRegistry.register(toolName, builtinTools[toolName]);
      }
    });

    return this;
  }

  /**
   * Add a handler function for specific events/outputs
   */
  addHandler(eventType, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }

    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }

    this.handlers.get(eventType).push({
      id: this._generateId(),
      handler,
      createdAt: new Date().toISOString()
    });

    return this;
  }

  /**
   * Add multiple handlers at once
   */
  addHandlers(handlers) {
    Object.entries(handlers).forEach(([eventType, handler]) => {
      this.addHandler(eventType, handler);
    });
    return this;
  }

  /**
   * Auto-detect which communication features should be enabled based on actual usage
   */
  _autoDetectFeatures() {
    // Auto-detect event handlers
    const hasHandlers = this.handlers.size > 0;
    this.config.communication = {
      ...this.config.communication,
      eventHandlers: {
        enabled: hasHandlers
      }
    };

    // Auto-detect direct prompting (requires both prompt and LLM)
    const hasPrompt = this.config.prompt && this.config.prompt.trim().length > 0;
    const hasLLM = this.config.llm && this.config.llm.provider;
    const shouldEnableDirectPrompting = hasPrompt && hasLLM;
    
    // Check if direct prompting was explicitly enabled
    const currentDirectPrompting = this.config.communication?.directPrompting;
    const explicitlyEnabled = currentDirectPrompting?.enabled === true;
    
    if (explicitlyEnabled || shouldEnableDirectPrompting) {
      // If explicitly enabled, keep it enabled regardless of prompt/LLM status
      // If auto-detected, only enable if both prompt and LLM are present
      const finalEnabled = explicitlyEnabled || shouldEnableDirectPrompting;
      
      this.config.communication = {
        ...this.config.communication,
        directPrompting: {
          enabled: finalEnabled,
          protocol: currentDirectPrompting?.protocol || 'websocket',
          authentication: currentDirectPrompting?.authentication || false,
          maxConnections: currentDirectPrompting?.maxConnections || 100,
          timeout: currentDirectPrompting?.timeout || 30000
        }
      };
    } else {
      this.config.communication = {
        ...this.config.communication,
        directPrompting: {
          enabled: false
        }
      };
    }

    // Auto-detect HTTP API (check if routes were added)
    const hasHttpRoutes = this.config.http && this.config.http.routes && this.config.http.routes.size > 0;
    if (hasHttpRoutes) {
      // HTTP was used, make sure it's enabled
      this.config.http.enabled = true;
      this.config.communication = {
        ...this.config.communication,
        httpApi: {
          enabled: true
        }
      };
    } else {
      // No HTTP routes, disable HTTP
      if (this.config.http) {
        this.config.http.enabled = false;
      }
      this.config.communication = {
        ...this.config.communication,
        httpApi: {
          enabled: false
        }
      };
    }
  }

  /**
   * Set environment variables for the agent
   */
  setEnvironment(env) {
    this.config.environment = { ...this.config.environment, ...env };
    return this;
  }

  /**
   * Finalize agent configuration by auto-detecting features
   * This should be called before the agent is deployed
   */
  finalize() {
    this._autoDetectFeatures();
    return this;
  }

  /**
   * Set custom configuration
   */
  setConfig(key, value) {
    this.config.custom = this.config.custom || {};
    this.config.custom[key] = value;
    return this;
  }

  /**
   * Get the complete agent configuration for serialization
   */
  toConfig() {
    return {
      name: this.name,
      id: this.id,
      config: this.config,
      handlers: this._serializeHandlers(),
      status: this.status,
      createdAt: this.createdAt
    };
  }

  /**
   * Create an agent from serialized configuration
   */
  static fromConfig(config) {
    const agent = new DankAgent(config.name, config.config);
    agent.id = config.id;
    agent.status = config.status;
    agent.createdAt = config.createdAt;
    
    // Restore handlers (note: actual functions will need to be re-registered)
    if (config.handlers) {
      Object.entries(config.handlers).forEach(([eventType, handlerList]) => {
        agent.handlers.set(eventType, handlerList);
      });
    }
    
    return agent;
  }

  /**
   * Validate agent configuration
   */
  _validateConfig(config) {
    const schema = Joi.object({
      llm: Joi.object({
        provider: Joi.string().valid(...SUPPORTED_LLMS).required(),
        apiKey: Joi.string().allow('').default(''),
        model: Joi.string().default('gpt-3.5-turbo'),
        baseURL: Joi.string().uri().optional(),
        temperature: Joi.number().min(0).max(2).default(0.7),
        maxTokens: Joi.number().min(1).default(1000)
      }).optional(),
      
      prompt: Joi.string().optional(),
      
      resources: Joi.object({
        memory: Joi.string().pattern(/^\d+[mMgG]$/).default('512m'),
        cpu: Joi.number().min(0.1).max(8).default(1),
        timeout: Joi.number().min(1000).default(30000)
      }).default({}),
      
      docker: Joi.object({
        baseImage: Joi.string().default(`${DOCKER_CONFIG.baseImagePrefix}:${DOCKER_CONFIG.defaultTag}`),
        port: Joi.number().min(1000).max(65535).default(DOCKER_CONFIG.defaultPort)
      }).default({}),
      
      communication: Joi.object({
        directPrompting: Joi.object({
          enabled: Joi.boolean().default(false),
          protocol: Joi.string().valid('websocket', 'tcp', 'http').default('http'),
          authentication: Joi.boolean().default(false),
          maxConnections: Joi.number().min(1).max(1000).default(50),
          timeout: Joi.number().min(1000).default(30000)
        }).default({ enabled: false }),
        httpApi: Joi.object({
          enabled: Joi.boolean().default(false)
        }).default({ enabled: false }),
        eventHandlers: Joi.object({
          enabled: Joi.boolean().default(false)
        }).default({ enabled: false })
      }).default({}),
      
      http: Joi.object({
        enabled: Joi.boolean().default(false),
        port: Joi.number().min(1000).max(65535).default(3000),
        host: Joi.string().default('0.0.0.0'),
        cors: Joi.boolean().default(true),
        rateLimit: Joi.object().default({}),
        middleware: Joi.array().default([]),
        static: Joi.object().default({}),
        routes: Joi.any().default(new Map())
      }).default({ enabled: false }),
      
      environment: Joi.object().pattern(Joi.string(), Joi.string()).default({}),
      
      custom: Joi.object().default({}),
      
      tools: Joi.object({
        enableBuiltinTools: Joi.boolean().default(true),
        builtinToolConfig: Joi.object().default({}),
        customTools: Joi.array().default([])
      }).default({})
    });

    const { error, value } = schema.validate({
      ...DEFAULT_CONFIG,
      ...config
    });

    if (error) {
      throw new Error(`Invalid agent configuration: ${error.message}`);
    }

    return value;
  }

  /**
   * Generate a unique ID
   */
  _generateId() {
    return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Serialize handlers for storage (functions can't be serialized)
   */
  _serializeHandlers() {
    const serialized = {};
    
    this.handlers.forEach((handlerList, eventType) => {
      serialized[eventType] = handlerList.map(h => ({
        id: h.id,
        createdAt: h.createdAt,
        // Note: actual function is not serialized
        hasFunction: typeof h.handler === 'function'
      }));
    });

    return serialized;
  }
}

module.exports = { DankAgent };
