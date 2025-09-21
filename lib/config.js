/**
 * AgentConfig - Configuration management utilities
 */

const Joi = require('joi');
const { SUPPORTED_LLMS } = require('./constants');

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
   * Validate resource configuration
   */
  static validateResources(resources) {
    const schema = Joi.object({
      memory: Joi.string()
        .pattern(/^\d+[mMgG]$/)
        .default('512m')
        .messages({
          'string.pattern.base': 'Memory must be in format like "512m" or "1g"'
        }),
      cpu: Joi.number().min(0.1).max(32).default(1),
      timeout: Joi.number().min(1000).default(30000),
      maxRestarts: Joi.number().min(0).default(3),
      healthCheckInterval: Joi.number().min(1000).default(10000)
    });

    const { error, value } = schema.validate(resources);
    if (error) {
      throw new Error(`Invalid resource configuration: ${error.message}`);
    }

    return value;
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
    if (agent.config.http && agent.config.http.enabled) {
      env.HTTP_ENABLED = 'true';
      env.HTTP_PORT = agent.config.http.port.toString();
      env.HTTP_HOST = agent.config.http.host;
      env.HTTP_CORS = agent.config.http.cors.toString();
      
      if (agent.config.http.rateLimit) {
        env.HTTP_RATE_LIMIT = 'true';
        env.HTTP_RATE_LIMIT_WINDOW = agent.config.http.rateLimit.windowMs?.toString() || '900000';
        env.HTTP_RATE_LIMIT_MAX = agent.config.http.rateLimit.max?.toString() || '100';
        env.HTTP_RATE_LIMIT_MESSAGE = agent.config.http.rateLimit.message || 'Too many requests';
      }
    }

    // Add direct prompting environment variables
    if (agent.config.communication?.directPrompting?.enabled) {
      env.DIRECT_PROMPTING_ENABLED = 'true';
      env.DIRECT_PROMPTING_PROTOCOL = agent.config.communication.directPrompting.protocol || 'websocket';
      env.DIRECT_PROMPTING_MAX_CONNECTIONS = agent.config.communication.directPrompting.maxConnections?.toString() || '100';
      env.DIRECT_PROMPTING_AUTHENTICATION = agent.config.communication.directPrompting.authentication?.toString() || 'false';
      env.DIRECT_PROMPTING_TIMEOUT = agent.config.communication.directPrompting.timeout?.toString() || '30000';
    } else {
      env.DIRECT_PROMPTING_ENABLED = 'false';
    }

    // Add main Docker port
    if (agent.config.docker?.port) {
      env.DOCKER_PORT = agent.config.docker.port.toString();
    }

    return env;
  }
}

module.exports = { AgentConfig };
