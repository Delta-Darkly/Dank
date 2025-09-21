/**
 * Dank Agent Tool System
 * 
 * Enables agents to use external tools and function calling capabilities.
 * This is the foundation for autonomous agent behavior.
 */

const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');

class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.categories = new Map();
  }

  /**
   * Register a new tool
   */
  register(name, definition) {
    const validated = this.validateTool(name, definition);
    this.tools.set(name, {
      ...validated,
      id: uuidv4(),
      registeredAt: new Date().toISOString()
    });
    
    // Add to category
    const category = validated.category || 'general';
    if (!this.categories.has(category)) {
      this.categories.set(category, []);
    }
    this.categories.get(category).push(name);
    
    return this;
  }

  /**
   * Get a tool by name
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * Get all tools
   */
  getAll() {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category) {
    const toolNames = this.categories.get(category) || [];
    return toolNames.map(name => this.tools.get(name));
  }

  /**
   * Validate tool definition
   */
  validateTool(name, definition) {
    const schema = Joi.object({
      description: Joi.string().required().min(10).max(500),
      parameters: Joi.object().pattern(
        Joi.string(),
        Joi.object({
          type: Joi.string().valid('string', 'number', 'boolean', 'array', 'object').required(),
          description: Joi.string().optional(),
          required: Joi.boolean().default(false),
          default: Joi.any().optional(),
          enum: Joi.array().optional(),
          min: Joi.number().optional(),
          max: Joi.number().optional(),
          pattern: Joi.string().optional()
        })
      ).default({}),
      handler: Joi.function().required(),
      category: Joi.string().default('general'),
      version: Joi.string().default('1.0.0'),
      timeout: Joi.number().min(1000).max(300000).default(30000), // 30 seconds default
      retries: Joi.number().min(0).max(5).default(1),
      async: Joi.boolean().default(true),
      cacheable: Joi.boolean().default(false),
      cacheTime: Joi.number().min(0).default(0),
      metadata: Joi.object().default({})
    });

    const { error, value } = schema.validate(definition);
    if (error) {
      throw new Error(`Invalid tool definition for '${name}': ${error.message}`);
    }

    return value;
  }

  /**
   * Generate OpenAI function calling schema for all tools
   */
  toOpenAISchema() {
    return this.getAll().map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(tool.parameters).map(([key, param]) => [
              key,
              {
                type: param.type,
                description: param.description,
                ...(param.enum && { enum: param.enum }),
                ...(param.min !== undefined && { minimum: param.min }),
                ...(param.max !== undefined && { maximum: param.max }),
                ...(param.pattern && { pattern: param.pattern })
              }
            ])
          ),
          required: Object.entries(tool.parameters)
            .filter(([, param]) => param.required)
            .map(([key]) => key)
        }
      }
    }));
  }
}

class ToolExecutor {
  constructor(registry) {
    this.registry = registry;
    this.executionHistory = [];
    this.cache = new Map();
  }

  /**
   * Execute a tool with given parameters
   */
  async execute(toolName, parameters = {}, context = {}) {
    const tool = this.registry.get(toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    const executionId = uuidv4();
    const startTime = Date.now();

    try {
      // Check cache if tool is cacheable
      if (tool.cacheable && tool.cacheTime > 0) {
        const cacheKey = this.getCacheKey(toolName, parameters);
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < tool.cacheTime) {
          return cached.result;
        }
      }

      // Validate parameters
      this.validateParameters(tool, parameters);

      // Execute with timeout and retries
      const result = await this.executeWithRetries(tool, parameters, context);

      // Cache result if cacheable
      if (tool.cacheable && tool.cacheTime > 0) {
        const cacheKey = this.getCacheKey(toolName, parameters);
        this.cache.set(cacheKey, {
          result,
          timestamp: Date.now()
        });
      }

      // Record execution
      this.recordExecution(executionId, toolName, parameters, result, Date.now() - startTime, 'success');

      return result;

    } catch (error) {
      this.recordExecution(executionId, toolName, parameters, null, Date.now() - startTime, 'error', error);
      throw error;
    }
  }

  /**
   * Execute tool with retries and timeout
   */
  async executeWithRetries(tool, parameters, context) {
    let lastError;
    
    for (let attempt = 0; attempt <= tool.retries; attempt++) {
      try {
        return await this.executeWithTimeout(tool, parameters, context);
      } catch (error) {
        lastError = error;
        if (attempt < tool.retries) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Execute tool with timeout
   */
  async executeWithTimeout(tool, parameters, context) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Tool '${tool.name}' execution timed out after ${tool.timeout}ms`));
      }, tool.timeout);

      try {
        const result = tool.handler(parameters, context);
        
        if (result && typeof result.then === 'function') {
          // Handle async function
          result
            .then(res => {
              clearTimeout(timeoutId);
              resolve(res);
            })
            .catch(err => {
              clearTimeout(timeoutId);
              reject(err);
            });
        } else {
          // Handle sync function
          clearTimeout(timeoutId);
          resolve(result);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Validate tool parameters
   */
  validateParameters(tool, parameters) {
    const schema = Joi.object(
      Object.fromEntries(
        Object.entries(tool.parameters).map(([key, param]) => {
          let validator = Joi[param.type]();
          
          if (param.required) validator = validator.required();
          if (param.default !== undefined) validator = validator.default(param.default);
          if (param.enum) validator = validator.valid(...param.enum);
          if (param.min !== undefined) validator = validator.min(param.min);
          if (param.max !== undefined) validator = validator.max(param.max);
          if (param.pattern) validator = validator.pattern(new RegExp(param.pattern));
          
          return [key, validator];
        })
      )
    );

    const { error } = schema.validate(parameters);
    if (error) {
      throw new Error(`Invalid parameters for tool '${tool.name}': ${error.message}`);
    }
  }

  /**
   * Generate cache key
   */
  getCacheKey(toolName, parameters) {
    return `${toolName}:${JSON.stringify(parameters)}`;
  }

  /**
   * Record tool execution
   */
  recordExecution(id, toolName, parameters, result, duration, status, error = null) {
    this.executionHistory.push({
      id,
      toolName,
      parameters,
      result: status === 'success' ? result : null,
      duration,
      status,
      error: error ? error.message : null,
      timestamp: new Date().toISOString()
    });

    // Keep only last 1000 executions
    if (this.executionHistory.length > 1000) {
      this.executionHistory.shift();
    }
  }

  /**
   * Get execution statistics
   */
  getStats() {
    const total = this.executionHistory.length;
    const successful = this.executionHistory.filter(e => e.status === 'success').length;
    const failed = total - successful;
    const avgDuration = this.executionHistory.reduce((sum, e) => sum + e.duration, 0) / total || 0;

    const toolStats = {};
    this.executionHistory.forEach(execution => {
      if (!toolStats[execution.toolName]) {
        toolStats[execution.toolName] = { total: 0, successful: 0, avgDuration: 0 };
      }
      toolStats[execution.toolName].total++;
      if (execution.status === 'success') {
        toolStats[execution.toolName].successful++;
      }
      toolStats[execution.toolName].avgDuration = 
        (toolStats[execution.toolName].avgDuration + execution.duration) / 2;
    });

    return {
      overall: {
        total,
        successful,
        failed,
        successRate: total > 0 ? (successful / total) * 100 : 0,
        avgDuration: Math.round(avgDuration)
      },
      byTool: toolStats
    };
  }
}

module.exports = {
  ToolRegistry,
  ToolExecutor
};
