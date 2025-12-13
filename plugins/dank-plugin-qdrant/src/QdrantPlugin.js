/**
 * Qdrant Plugin for Dank
 * 
 * Provides three-layer architecture for Qdrant vector database integration:
 * - Basic: Core vector operations
 * - Comprehensive: Full Qdrant API
 * - Focused: High-level use cases (chat history, user data, semantic search)
 */

const { PluginBase } = require('dank-ai');
const { PluginConfig } = require('dank-ai');
const { QdrantClient } = require('@qdrant/js-client-rest');
const { BasicLayer } = require('./layers/basic');
const { ComprehensiveLayer } = require('./layers/comprehensive');
const { FocusedLayer } = require('./layers/focused');

class QdrantPlugin extends PluginBase {
  constructor(config = {}) {
    super('qdrant', config);
    
    this.client = null;
    this.defaultCollection = config.defaultCollection || 'default';
    this.basicLayer = null;
    this.comprehensiveLayer = null;
    this.focusedLayer = null;
  }

  /**
   * Initialize plugin - register tools early
   */
  async init() {
    // Validate configuration
    const config = PluginConfig.injectEnvVars(this.config);
    this.validateConfig(config);
    
    // Register all tools early (before client is initialized)
    // Tool handlers will check if client is ready when called
    this.registerAllTools();
    
    return this;
  }

  /**
   * Validate plugin configuration
   */
  validateConfig(config) {
    const schema = require('joi').object({
      url: require('joi').string().uri().required(),
      apiKey: require('joi').string().optional(),
      defaultCollection: require('joi').string().optional(),
      timeout: require('joi').number().min(1000).optional()
    });

    const { error, value } = schema.validate(config);
    if (error) {
      throw new Error(`Invalid Qdrant plugin configuration: ${error.message}`);
    }

    return value;
  }

  /**
   * Initialize Qdrant client connection
   */
  async onStart() {
    const config = PluginConfig.injectEnvVars(this.config);
    
    // Initialize Qdrant client
    const clientConfig = {
      url: config.url
    };
    
    if (config.apiKey) {
      clientConfig.apiKey = config.apiKey;
    }
    
    if (config.timeout) {
      clientConfig.timeout = config.timeout;
    }
    
    this.client = new QdrantClient(clientConfig);
    
    // Test connection
    try {
      await this.client.getCollections();
      // Connection successful
    } catch (error) {
      throw new Error(`Failed to connect to Qdrant: ${error.message}`);
    }
    
    // Initialize layers (now that client is ready)
    this.basicLayer = new BasicLayer(this.client, this.defaultCollection);
    this.comprehensiveLayer = new ComprehensiveLayer(this.client, this.defaultCollection);
    this.focusedLayer = new FocusedLayer(
      this.client,
      this.defaultCollection,
      this.basicLayer,
      this.comprehensiveLayer
    );
    
    this.emit('connected', { url: config.url });
  }

  /**
   * Close connections gracefully
   */
  async onStop() {
    // Qdrant client doesn't require explicit cleanup
    this.client = null;
    this.basicLayer = null;
    this.comprehensiveLayer = null;
    this.focusedLayer = null;
    
    this.emit('disconnected');
  }

  /**
   * Cleanup resources
   */
  async onDestroy() {
    await this.onStop();
  }

  /**
   * Check if plugin is initialized (client and layers ready)
   */
  _ensureInitialized() {
    if (!this.client || !this.basicLayer || !this.comprehensiveLayer || !this.focusedLayer) {
      throw new Error('Qdrant plugin not initialized. Ensure plugin has started.');
    }
  }

  /**
   * Convert OpenAPI-style parameters to Dank's flat format
   * @param {object} openApiParams - OpenAPI format: { type: 'object', properties: {...}, required: [...] }
   * @returns {object} Dank format: { paramName: { type, description, required } }
   */
  _convertParameters(openApiParams) {
    if (!openApiParams || !openApiParams.properties) {
      return {};
    }
    
    const required = openApiParams.required || [];
    const converted = {};
    
    for (const [key, param] of Object.entries(openApiParams.properties)) {
      converted[key] = {
        type: Array.isArray(param.type) ? param.type[0] : param.type,
        description: param.description || '',
        required: required.includes(key)
      };
      
      // Copy other properties if present
      if (param.default !== undefined) converted[key].default = param.default;
      if (param.enum) converted[key].enum = param.enum;
      if (param.min !== undefined) converted[key].min = param.min;
      if (param.max !== undefined) converted[key].max = param.max;
    }
    
    return converted;
  }

  /**
   * Register all tools from all layers
   */
  registerAllTools() {
    // ===== Basic Layer Tools =====
    
    this.registerTool('store', {
      description: 'Store a single vector with metadata in Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name' },
          id: { type: ['string', 'number'], description: 'Point ID' },
          vector: { 
            type: ['array', 'object'], 
            description: 'Vector array or named vectors object' 
          },
          payload: { type: 'object', description: 'Metadata payload' }
        },
        required: ['collection', 'id', 'vector']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.basicLayer.storeVector(
          params.collection,
          params.id,
          params.vector,
          params.payload
        );
      },
      category: 'vector-database',
      timeout: 30000
    });

    this.registerTool('query', {
      description: 'Query similar vectors in Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name' },
          vector: { 
            type: ['array', 'object'], 
            description: 'Query vector' 
          },
          limit: { type: 'number', description: 'Number of results', default: 10 },
          filter: { type: 'object', description: 'Optional filter' }
        },
        required: ['collection', 'vector']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.basicLayer.queryVector(
          params.collection,
          params.vector,
          params.limit || 10,
          params.filter
        );
      },
      category: 'vector-database',
      timeout: 30000
    });

    this.registerTool('get', {
      description: 'Retrieve a vector by ID from Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name' },
          id: { type: ['string', 'number'], description: 'Point ID' }
        },
        required: ['collection', 'id']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.basicLayer.getVector(params.collection, params.id);
      },
      category: 'vector-database',
      timeout: 30000
    });

    this.registerTool('delete', {
      description: 'Delete a vector by ID from Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name' },
          id: { type: ['string', 'number'], description: 'Point ID' }
        },
        required: ['collection', 'id']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.basicLayer.deleteVector(params.collection, params.id);
      },
      category: 'vector-database',
      timeout: 30000
    });

    this.registerTool('batchStore', {
      description: 'Batch store multiple vectors in Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name' },
          points: { 
            type: 'array', 
            description: 'Array of point objects with id, vector, and payload' 
          }
        },
        required: ['collection', 'points']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.basicLayer.batchStore(params.collection, params.points);
      },
      category: 'vector-database',
      timeout: 60000
    });

    // ===== Comprehensive Layer Tools =====

    this.registerTool('collection:create', {
      description: 'Create a new Qdrant collection',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Collection name' },
          config: { 
            type: 'object', 
            description: 'Collection configuration (size, distance, etc.)' 
          }
        },
        required: ['name']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.comprehensiveLayer.createCollection(params.name, params.config);
      },
      category: 'vector-database',
      timeout: 30000
    });

    this.registerTool('collection:delete', {
      description: 'Delete a Qdrant collection',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Collection name' }
        },
        required: ['name']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.comprehensiveLayer.deleteCollection(params.name);
      },
      category: 'vector-database',
      timeout: 30000
    });

    this.registerTool('collection:list', {
      description: 'List all Qdrant collections',
      parameters: this._convertParameters({
        type: 'object',
        properties: {}
      }),
      handler: async () => {
        this._ensureInitialized();
        return await this.comprehensiveLayer.listCollections();
      },
      category: 'vector-database',
      timeout: 30000
    });

    this.registerTool('collection:info', {
      description: 'Get information about a Qdrant collection',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Collection name' }
        },
        required: ['name']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.comprehensiveLayer.getCollectionInfo(params.name);
      },
      category: 'vector-database',
      timeout: 30000
    });

    this.registerTool('points:upsert', {
      description: 'Upsert points with full options in Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name' },
          points: { type: 'array', description: 'Array of points' },
          options: { type: 'object', description: 'Upsert options' }
        },
        required: ['collection', 'points']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.comprehensiveLayer.upsertPoints(
          params.collection,
          params.points,
          params.options
        );
      },
      category: 'vector-database',
      timeout: 60000
    });

    this.registerTool('points:search', {
      description: 'Advanced search with filters and options in Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name' },
          vector: { 
            type: ['array', 'object'], 
            description: 'Query vector' 
          },
          options: { 
            type: 'object', 
            description: 'Search options (limit, filter, score_threshold, etc.)' 
          }
        },
        required: ['collection', 'vector']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.comprehensiveLayer.searchPoints(
          params.collection,
          params.vector,
          params.options || {}
        );
      },
      category: 'vector-database',
      timeout: 30000
    });

    this.registerTool('points:scroll', {
      description: 'Scroll through points with filter in Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name' },
          filter: { type: 'object', description: 'Filter conditions' },
          limit: { type: 'number', description: 'Number of results', default: 10 },
          offset: { type: 'object', description: 'Offset for pagination' }
        },
        required: ['collection']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.comprehensiveLayer.scrollPoints(
          params.collection,
          params.filter,
          params.limit || 10,
          params.offset
        );
      },
      category: 'vector-database',
      timeout: 30000
    });

    this.registerTool('points:delete', {
      description: 'Delete points by filter in Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name' },
          filter: { type: 'object', description: 'Filter conditions' }
        },
        required: ['collection', 'filter']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.comprehensiveLayer.deletePoints(params.collection, params.filter);
      },
      category: 'vector-database',
      timeout: 30000
    });

    this.registerTool('search:filter', {
      description: 'Search with filter in Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name' },
          vector: { 
            type: ['array', 'object'], 
            description: 'Query vector' 
          },
          filter: { type: 'object', description: 'Filter conditions' },
          limit: { type: 'number', description: 'Number of results', default: 10 }
        },
        required: ['collection', 'vector', 'filter']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.comprehensiveLayer.searchWithFilter(
          params.collection,
          params.vector,
          params.filter,
          params.limit || 10
        );
      },
      category: 'vector-database',
      timeout: 30000
    });

    // ===== Focused Layer Tools =====

    this.registerTool('chat:store', {
      description: 'Store a chat message in Qdrant for history tracking',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: 'Conversation identifier' },
          messageId: { type: 'string', description: 'Message identifier (optional)' },
          content: { type: 'string', description: 'Message content' },
          metadata: { 
            type: 'object', 
            description: 'Additional metadata (role, timestamp, etc.)' 
          },
          embedding: { 
            type: 'array', 
            description: 'Pre-computed embedding (optional)' 
          }
        },
        required: ['conversationId', 'content']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.focusedLayer.storeChatMessage(
          params.conversationId,
          params.messageId,
          params.content,
          params.metadata || {},
          params.embedding
        );
      },
      category: 'chat-history',
      timeout: 30000
    });

    this.registerTool('chat:history', {
      description: 'Retrieve conversation history from Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: 'Conversation identifier' },
          limit: { type: 'number', description: 'Maximum number of messages', default: 50 },
          filter: { type: 'object', description: 'Additional filter conditions' }
        },
        required: ['conversationId']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.focusedLayer.getChatHistory(
          params.conversationId,
          params.limit || 50,
          params.filter
        );
      },
      category: 'chat-history',
      timeout: 30000
    });

    this.registerTool('chat:search', {
      description: 'Semantic search in chat history',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query text' },
          conversationId: { 
            type: 'string', 
            description: 'Optional conversation ID to limit search' 
          },
          limit: { type: 'number', description: 'Number of results', default: 10 }
        },
        required: ['query']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.focusedLayer.searchChatHistory(
          params.query,
          params.conversationId,
          params.limit || 10
        );
      },
      category: 'chat-history',
      timeout: 30000
    });

    this.registerTool('chat:delete', {
      description: 'Delete entire conversation from Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: 'Conversation identifier' }
        },
        required: ['conversationId']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.focusedLayer.deleteConversation(params.conversationId);
      },
      category: 'chat-history',
      timeout: 30000
    });

    this.registerTool('user:store', {
      description: 'Store user data in Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'User identifier' },
          data: { type: 'object', description: 'User data object' },
          embedding: { 
            type: 'array', 
            description: 'Pre-computed embedding (optional)' 
          }
        },
        required: ['userId', 'data']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.focusedLayer.storeUserData(
          params.userId,
          params.data,
          params.embedding
        );
      },
      category: 'user-data',
      timeout: 30000
    });

    this.registerTool('user:get', {
      description: 'Retrieve user data from Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'User identifier' }
        },
        required: ['userId']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.focusedLayer.getUserData(params.userId);
      },
      category: 'user-data',
      timeout: 30000
    });

    this.registerTool('user:update', {
      description: 'Update user data in Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'User identifier' },
          data: { type: 'object', description: 'Updated user data' }
        },
        required: ['userId', 'data']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.focusedLayer.updateUserData(params.userId, params.data);
      },
      category: 'user-data',
      timeout: 30000
    });

    this.registerTool('user:similar', {
      description: 'Find similar users by profile in Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'User identifier' },
          limit: { type: 'number', description: 'Number of similar users', default: 10 }
        },
        required: ['userId']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.focusedLayer.findSimilarUsers(params.userId, params.limit || 10);
      },
      category: 'user-data',
      timeout: 30000
    });

    this.registerTool('search:semantic', {
      description: 'Text-based semantic search in Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name' },
          queryText: { type: 'string', description: 'Search query text' },
          limit: { type: 'number', description: 'Number of results', default: 10 },
          filter: { type: 'object', description: 'Optional filter' }
        },
        required: ['collection', 'queryText']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.focusedLayer.semanticSearch(
          params.collection,
          params.queryText,
          params.limit || 10,
          params.filter
        );
      },
      category: 'semantic-search',
      timeout: 30000
    });

    this.registerTool('search:similar', {
      description: 'Find similar vectors in Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name' },
          vector: { 
            type: 'array', 
            description: 'Query vector' 
          },
          limit: { type: 'number', description: 'Number of results', default: 10 },
          filter: { type: 'object', description: 'Optional filter' }
        },
        required: ['collection', 'vector']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.focusedLayer.findSimilar(
          params.collection,
          params.vector,
          params.limit || 10,
          params.filter
        );
      },
      category: 'semantic-search',
      timeout: 30000
    });

    this.registerTool('search:hybrid', {
      description: 'Hybrid text+vector search in Qdrant',
      parameters: this._convertParameters({
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name' },
          queryText: { type: 'string', description: 'Text query' },
          vector: { 
            type: 'array', 
            description: 'Vector query (optional)' 
          },
          limit: { type: 'number', description: 'Number of results', default: 10 }
        },
        required: ['collection', 'queryText']
      }),
      handler: async (params) => {
        this._ensureInitialized();
        return await this.focusedLayer.hybridSearch(
          params.collection,
          params.queryText,
          params.vector,
          params.limit || 10
        );
      },
      category: 'semantic-search',
      timeout: 30000
    });
  }
}

module.exports = { QdrantPlugin };

