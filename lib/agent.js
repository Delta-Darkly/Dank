/**
 * DankAgent - Agent Definition Class
 * 
 * This class represents a single AI agent with its configuration,
 * handlers, and runtime requirements.
 */

const Joi = require('joi');
const { validate: validateUUID, v4: uuidv4 } = require('uuid');
const { DEFAULT_CONFIG, SUPPORTED_LLMS, DOCKER_CONFIG, INSTANCE_TYPES } = require('./constants');
const { ToolRegistry, ToolExecutor } = require('./tools');
const builtinTools = require('./tools/builtin');

class DankAgent {
  constructor(name, config = {}) {
    this.name = name;
    this.config = this._validateConfig(config);
    this.handlers = new Map();
    // id is optional during construction - must be set via setId() before use
    this.id = this.config.id || null;
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
    
    // Ensure instanceType has a default value if not set
    if (!this.config.instanceType) {
      this.config.instanceType = 'small';
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
   * Set the unique ID for this agent (required, must be UUIDv4)
   * @param {string} id - UUIDv4 string that must be unique and never used before
   */
  setId(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Agent ID must be a non-empty string');
    }
    
    const trimmedId = id.trim();
    
    // Validate UUIDv4 format
    if (!validateUUID(trimmedId)) {
      throw new Error(`Agent ID must be a valid UUIDv4. Received: ${trimmedId}`);
    }
    
    // Check if it's actually v4 (UUIDv4 has '4' in the version position)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(trimmedId)) {
      throw new Error(`Agent ID must be a valid UUIDv4. Received: ${trimmedId}`);
    }
    
    this.config.id = trimmedId;
    this.id = trimmedId;
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
   * Set instance type (any string value - validated by backend)
   * @param {string} instanceType - Instance type string
   */
  setInstanceType(instanceType) {
    if (!instanceType || typeof instanceType !== 'string') {
      throw new Error('Instance type must be a non-empty string');
    }

    // Store the instance type as-is (no validation - backend handles valid types)
    this.config.instanceType = instanceType.trim();
    return this;
  }

  /**
   * @deprecated DISABLED - Use setInstanceType() instead.
   * This method has been disabled. Please use setInstanceType('small'|'medium'|'large'|'xlarge') instead.
   */
  setResources(resources) {
    throw new Error('setResources() has been disabled. Please use setInstanceType() instead. Example: .setInstanceType("small")');
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
      port: Joi.number().min(1000).max(65535).default(3000),
      authentication: Joi.boolean().default(false),
      maxConnections: Joi.number().min(1).max(1000).default(50),
      timeout: Joi.number().min(1000).default(30000),
      protocol: Joi.string().valid('http').optional() // Allow but ignore for backward compatibility
    });

    const { error, value } = schema.validate(options, { 
      stripUnknown: true // Strip unknown fields after validation
    });
    if (error) {
      throw new Error(`Invalid prompting server configuration: ${error.message}`);
    }
    
    // Remove protocol from value if present (we always use HTTP now)
    const { protocol, ...cleanValue } = value;

    // Set the port in docker config
    this.config.docker = { ...this.config.docker, port: cleanValue.port };

    // Set the communication config (always HTTP, excluding port)
    const { port, ...communicationConfig } = cleanValue;
    this.config.communication = {
      ...this.config.communication,
      directPrompting: {
        enabled: true,
        protocol: 'http', // Always HTTP
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
   * Optional: Use this to configure HTTP options (port, CORS, rate limiting, etc.)
   * HTTP auto-enables when routes are added, so this is only needed for custom configuration
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

    // Preserve existing routes and middleware if HTTP was already auto-enabled
    const existingRoutes = this.config.http?.routes || new Map();
    const existingMiddleware = this.config.http?.middleware || [];

    this.config.http = {
      enabled: true,
      ...value,
      routes: existingRoutes,
      middleware: existingMiddleware
    };

    return this;
  }

  /**
   * Add HTTP route handler
   * Auto-enables HTTP server if not already enabled
   */
  addRoute(method, path, handler, options = {}) {
    // Auto-enable HTTP if not already enabled
    if (!this.config.http || !this.config.http.enabled) {
      this.config.http = {
        enabled: true,
        port: 3000,
        host: '0.0.0.0',
        cors: true,
        rateLimit: {
          windowMs: 15 * 60 * 1000,
          max: 100,
          message: 'Too many requests'
        },
        routes: new Map(),
        middleware: []
      };
    }

    if (typeof handler !== 'function') {
      throw new Error('Route handler must be a function');
    }

    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    const upperMethod = method.toUpperCase();
    
    if (!validMethods.includes(upperMethod)) {
      throw new Error(`Invalid HTTP method: ${method}. Valid methods: ${validMethods.join(', ')}`);
    }

    // Ensure routes Map exists
    if (!this.config.http.routes) {
      this.config.http.routes = new Map();
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
   * Auto-enables HTTP server if not already enabled
   */
  addMiddleware(middleware, options = {}) {
    // Auto-enable HTTP if not already enabled
    if (!this.config.http || !this.config.http.enabled) {
      this.config.http = {
        enabled: true,
        port: 3000,
        host: '0.0.0.0',
        cors: true,
        rateLimit: {
          windowMs: 15 * 60 * 1000,
          max: 100,
          message: 'Too many requests'
        },
        routes: new Map(),
        middleware: []
      };
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
      handler
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
          protocol: 'http', // Always HTTP
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
   * Validate that agent ID is set (required for all operations)
   * @private
   */
  _validateId() {
    if (!this.id || !this.config.id) {
      throw new Error(
        `Agent ID is required for agent "${this.name}". ` +
        `Use .setId(uuidv4) to set a unique UUIDv4 identifier. ` +
        `Example: createAgent('${this.name}').setId(require('uuid').v4())`
      );
    }
    
    // Validate UUIDv4 format
    const trimmedId = this.id.trim();
    if (!validateUUID(trimmedId)) {
      throw new Error(`Agent ID must be a valid UUIDv4 for agent "${this.name}". Received: ${trimmedId}`);
    }
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(trimmedId)) {
      throw new Error(`Agent ID must be a valid UUIDv4 for agent "${this.name}". Received: ${trimmedId}`);
    }
  }

  /**
   * Finalize agent configuration by auto-detecting features
   * This should be called before the agent is deployed
   */
  finalize() {
    // Validate that ID is set before finalization (REQUIRED)
    this._validateId();
    
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
   * Set agent image configuration for Docker builds
   */
  setAgentImageConfig(options = {}) {
    const schema = Joi.object({
      registry: Joi.string().optional(),
      namespace: Joi.string().optional(),
      tag: Joi.string().default('latest')
    });

    const { error, value } = schema.validate(options);
    if (error) {
      throw new Error(`Invalid agent image configuration: ${error.message}`);
    }

    this.config.agentImage = value;
    return this;
  }



  /**
   * Get the complete agent configuration for serialization
   */
  toConfig() {
    // Validate ID before serialization
    this._validateId();
    
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
    // ID is optional during construction - will be validated when setId() is called
    // or when the agent is finalized/used
    if (config.id) {
      if (typeof config.id !== 'string') {
        throw new Error('Agent ID must be a string');
      }
      
      const trimmedId = config.id.trim();
      if (!validateUUID(trimmedId)) {
        throw new Error(`Agent ID must be a valid UUIDv4. Received: ${trimmedId}`);
      }
      
      // Check if it's actually v4 (UUIDv4 has '4' in the version position)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(trimmedId)) {
        throw new Error(`Agent ID must be a valid UUIDv4. Received: ${trimmedId}`);
      }
    }
    
    const schema = Joi.object({
      id: Joi.string().optional(), // Optional during construction, required via setId()
      
      llm: Joi.object({
        provider: Joi.string().valid(...SUPPORTED_LLMS).required(),
        apiKey: Joi.string().allow('').default(''),
        model: Joi.string().default('gpt-3.5-turbo'),
        baseURL: Joi.string().uri().optional(),
        temperature: Joi.number().min(0).max(2).default(0.7),
        maxTokens: Joi.number().min(1).default(1000)
      }).optional(),
      
      prompt: Joi.string().optional(),
      
      instanceType: Joi.string().default('small'), // Any string allowed - backend validates
      
      docker: Joi.object({
        baseImage: Joi.string().default(`${DOCKER_CONFIG.baseImagePrefix}:${DOCKER_CONFIG.defaultTag}`),
        port: Joi.number().min(1000).max(65535).default(DOCKER_CONFIG.defaultPort)
      }).default({}),
      
      communication: Joi.object({
        directPrompting: Joi.object({
          enabled: Joi.boolean().default(false),
          protocol: Joi.string().valid('http').default('http'), // Always HTTP, kept for backward compatibility
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
      
      agentImage: Joi.object({
        registry: Joi.string().optional(),
        namespace: Joi.string().optional(),
        tag: Joi.string().default('latest')
      }).optional(),
      
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
   * Serialize handlers for storage (functions can't be serialized)
   */
  _serializeHandlers() {
    const serialized = {};
    
    this.handlers.forEach((handlerList, eventType) => {
      serialized[eventType] = handlerList.map(h => ({
        // Note: actual function is not serialized
        hasFunction: typeof h.handler === 'function'
      }));
    });

    return serialized;
  }
}

module.exports = { DankAgent };
