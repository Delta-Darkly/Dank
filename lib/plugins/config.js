/**
 * Plugin Configuration - Schema validation and management
 * 
 * Provides Joi-based schema validation for plugin configurations,
 * environment variable injection, and secret management.
 */

const Joi = require('joi');

class PluginConfig {
  /**
   * Validate plugin configuration against schema
   */
  static validate(name, config, schema) {
    if (!schema) {
      // No schema provided, just return config as-is
      return config;
    }

    const { error, value } = schema.validate(config, {
      stripUnknown: true,
      abortEarly: false
    });

    if (error) {
      const details = error.details.map(d => d.message).join(', ');
      throw new Error(`Invalid configuration for plugin '${name}': ${details}`);
    }

    return value;
  }

  /**
   * Inject environment variables into config
   * Replaces ${ENV_VAR} or ${ENV_VAR:default} patterns
   */
  static injectEnvVars(config) {
    if (typeof config === 'string') {
      return this._replaceEnvVars(config);
    }

    if (Array.isArray(config)) {
      return config.map(item => this.injectEnvVars(item));
    }

    if (config && typeof config === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(config)) {
        result[key] = this.injectEnvVars(value);
      }
      return result;
    }

    return config;
  }

  /**
   * Replace environment variable patterns in string
   */
  static _replaceEnvVars(str) {
    if (typeof str !== 'string') {
      return str;
    }

    // Match ${ENV_VAR} or ${ENV_VAR:default}
    return str.replace(/\$\{([^}:]+)(?::([^}]+))?\}/g, (match, envVar, defaultValue) => {
      const value = process.env[envVar];
      if (value !== undefined) {
        return value;
      }
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      return match; // Keep original if no replacement found
    });
  }

  /**
   * Common configuration schemas for plugin types
   */
  static schemas = {
    /**
     * Database connection schema
     */
    database: Joi.object({
      connectionString: Joi.string().optional(),
      host: Joi.string().optional(),
      port: Joi.number().optional(),
      database: Joi.string().optional(),
      username: Joi.string().optional(),
      password: Joi.string().optional(),
      poolSize: Joi.number().min(1).max(100).default(10),
      timeout: Joi.number().min(1000).default(30000),
      ssl: Joi.boolean().default(false)
    }).or('connectionString', 'host'),

    /**
     * API key schema
     */
    apiKey: Joi.object({
      apiKey: Joi.string().required(),
      baseURL: Joi.string().uri().optional(),
      timeout: Joi.number().min(1000).default(30000),
      retries: Joi.number().min(0).max(5).default(2)
    }),

    /**
     * Vector database schema
     */
    vectorDB: Joi.object({
      apiKey: Joi.string().required(),
      environment: Joi.string().optional(),
      index: Joi.string().optional(),
      dimension: Joi.number().optional(),
      timeout: Joi.number().min(1000).default(30000)
    }),

    /**
     * File storage schema
     */
    fileStorage: Joi.object({
      path: Joi.string().required(),
      maxSize: Joi.number().min(0).optional(),
      allowedExtensions: Joi.array().items(Joi.string()).optional()
    }),

    /**
     * Redis schema
     */
    redis: Joi.object({
      host: Joi.string().default('localhost'),
      port: Joi.number().min(1).max(65535).default(6379),
      password: Joi.string().optional(),
      db: Joi.number().min(0).default(0),
      keyPrefix: Joi.string().optional()
    })
  };

  /**
   * Get a schema by name
   */
  static getSchema(name) {
    return this.schemas[name];
  }

  /**
   * Merge multiple schemas
   */
  static mergeSchemas(...schemas) {
    return schemas.reduce((merged, schema) => {
      return merged ? merged.concat(schema) : schema;
    }, null);
  }

  /**
   * Create a schema with environment variable support
   */
  static createEnvSchema(baseSchema) {
    return baseSchema.custom((value, helpers) => {
      const injected = this.injectEnvVars(value);
      const { error } = baseSchema.validate(injected);
      if (error) {
        return helpers.error('any.custom', { message: error.message });
      }
      return injected;
    });
  }
}

module.exports = { PluginConfig };

