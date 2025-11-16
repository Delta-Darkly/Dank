/**
 * AgentConfig - Configuration management utilities
 */

const Joi = require('joi');
const { SUPPORTED_LLMS, INSTANCE_TYPES } = require('./constants');

class AgentConfig {
  /**
   * Validate LLM configuration
   */
  static validateLLMConfig(config) {
    const schemas = {
      openai: Joi.object({
        provider: Joi.string().valid('openai').required(),
        apiKey: Joi.string().allow('').default(''),
        model: Joi.string().default('gpt-3.5-turbo'),
        baseURL: Joi.string().uri().optional(),
        temperature: Joi.number().min(0).max(2).default(0.7),
        maxTokens: Joi.number().min(1).default(1000),
        topP: Joi.number().min(0).max(1).optional(),
        frequencyPenalty: Joi.number().min(-2).max(2).optional(),
        presencePenalty: Joi.number().min(-2).max(2).optional()
      }),

      anthropic: Joi.object({
        provider: Joi.string().valid('anthropic').required(),
        apiKey: Joi.string().required(),
        model: Joi.string().default('claude-3-sonnet-20240229'),
        maxTokens: Joi.number().min(1).default(1000),
        temperature: Joi.number().min(0).max(1).default(0.7),
        topP: Joi.number().min(0).max(1).optional(),
        topK: Joi.number().min(0).optional()
      }),

      cohere: Joi.object({
        provider: Joi.string().valid('cohere').required(),
        apiKey: Joi.string().required(),
        model: Joi.string().default('command'),
        temperature: Joi.number().min(0).max(5).default(0.7),
        maxTokens: Joi.number().min(1).default(1000),
        k: Joi.number().min(0).optional(),
        p: Joi.number().min(0).max(1).optional()
      }),

      ollama: Joi.object({
        provider: Joi.string().valid('ollama').required(),
        baseURL: Joi.string().uri().default('http://localhost:11434'),
        model: Joi.string().required(),
        temperature: Joi.number().min(0).max(2).default(0.7),
        numCtx: Joi.number().min(1).optional(),
        numPredict: Joi.number().min(1).default(1000)
      }),

      custom: Joi.object({
        provider: Joi.string().valid('custom').required(),
        baseURL: Joi.string().uri().required(),
        apiKey: Joi.string().optional(),
        model: Joi.string().required(),
        headers: Joi.object().optional(),
        requestFormat: Joi.string().valid('openai', 'anthropic', 'custom').default('openai')
      })
    };

    const schema = schemas[config.provider];
    if (!schema) {
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }

    const { error, value } = schema.validate(config);
    if (error) {
      throw new Error(`Invalid LLM configuration: ${error.message}`);
    }

    return value;
  }

  /**
   * Get resources (memory, cpu) from instance type
   * @param {string} instanceType - Instance type (any string, defaults to 'small' if not found)
   * @returns {Object} Resources object with memory and cpu
   */
  static getResourcesFromInstanceType(instanceType) {
    const normalizedType = (instanceType || 'small').toLowerCase().trim();
    const instanceConfig = INSTANCE_TYPES[normalizedType];
    
    // If instance type not found in mapping, default to 'small'
    // Backend will handle the actual resource allocation
    if (!instanceConfig) {
      return INSTANCE_TYPES.small; // Default to small resources
    }
    
    return {
      memory: instanceConfig.memory,
      cpu: instanceConfig.cpu
    };
  }

  /**
   * Parse memory string to bytes
   */
  static parseMemory(memoryStr) {
    const match = memoryStr.match(/^(\d+)([mMgG])$/);
    if (!match) {
      throw new Error('Invalid memory format');
    }

    const [, amount, unit] = match;
    const multipliers = {
      m: 1024 * 1024,
      M: 1024 * 1024,
      g: 1024 * 1024 * 1024,
      G: 1024 * 1024 * 1024
    };

    return parseInt(amount) * multipliers[unit];
  }

  /**
   * Generate environment variables for agent container
   */
  static generateContainerEnv(agent) {
    // Validate that agent ID is set (required)
    if (!agent.id || !agent.config?.id) {
      throw new Error(
        `Agent ID is required for agent "${agent.name}". ` +
        `Use .setId(uuidv4) to set a unique UUIDv4 identifier. ` +
        `Example: createAgent('${agent.name}').setId(require('uuid').v4())`
      );
    }
    
    const env = {
      AGENT_NAME: agent.name,
      AGENT_ID: agent.id,
      LLM_PROVIDER: agent.config.llm?.provider || 'openai',
      LLM_MODEL: agent.config.llm?.model || 'gpt-3.5-turbo',
      AGENT_PROMPT: agent.config.prompt,
      NODE_ENV: process.env.NODE_ENV || 'production',
      ...agent.config.environment
    };

    // Add LLM-specific environment variables
    if (agent.config.llm?.apiKey) {
      env.LLM_API_KEY = agent.config.llm.apiKey;
    }
    if (agent.config.llm?.baseURL) {
      env.LLM_BASE_URL = agent.config.llm.baseURL;
    }

    // Add HTTP server environment variables
    // HTTP is enabled if explicitly enabled OR if routes exist (auto-enabled)
    const hasRoutes = agent.config.http?.routes && agent.config.http.routes.size > 0;
    if (agent.config.http && (agent.config.http.enabled || hasRoutes)) {
      env.HTTP_ENABLED = 'true';
      env.HTTP_PORT = (agent.config.http.port || 3000).toString();
      env.HTTP_HOST = agent.config.http.host || '0.0.0.0';
      env.HTTP_CORS = (agent.config.http.cors !== false).toString();
      
      if (agent.config.http.rateLimit) {
        env.HTTP_RATE_LIMIT = 'true';
        env.HTTP_RATE_LIMIT_WINDOW = agent.config.http.rateLimit.windowMs?.toString() || '900000';
        env.HTTP_RATE_LIMIT_MAX = agent.config.http.rateLimit.max?.toString() || '100';
        env.HTTP_RATE_LIMIT_MESSAGE = agent.config.http.rateLimit.message || 'Too many requests';
      }
    }

    // Add direct prompting environment variables
    // If setPromptingServer was called, it sets directPrompting.enabled = true
    // The main HTTP server always runs, and /prompt endpoint is available if setPromptingServer was called
    if (agent.config.communication?.directPrompting?.enabled) {
      env.DIRECT_PROMPTING_ENABLED = 'true';
      env.DIRECT_PROMPTING_PROTOCOL = 'http'; // Always HTTP
      env.DIRECT_PROMPTING_MAX_CONNECTIONS = agent.config.communication.directPrompting?.maxConnections?.toString() || '100';
      env.DIRECT_PROMPTING_AUTHENTICATION = agent.config.communication.directPrompting?.authentication?.toString() || 'false';
      env.DIRECT_PROMPTING_TIMEOUT = agent.config.communication.directPrompting?.timeout?.toString() || '30000';
    } else {
      env.DIRECT_PROMPTING_ENABLED = 'false';
    }

    // Add main Docker port (always set, defaults to 3000 if not specified)
    const dockerPort = agent.config.docker?.port || 3000;
    env.DOCKER_PORT = dockerPort.toString();
    // Health check uses the same port as the main agent port
    env.HEALTH_PORT = dockerPort.toString();

    return env;
  }
}

module.exports = { AgentConfig };
