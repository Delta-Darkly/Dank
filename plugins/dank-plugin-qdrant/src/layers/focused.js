/**
 * Focused Layer - High-level use cases
 * 
 * Provides ready-to-use patterns for common agent scenarios:
 * - Chat history management
 * - User data management
 * - Semantic search utilities
 */

const { v4: uuidv4 } = require('uuid');
const { simpleTextEmbedding } = require('../utils/vector');
const { validateCollectionName } = require('../utils/validation');

class FocusedLayer {
  constructor(client, defaultCollection, basicLayer, comprehensiveLayer) {
    this.client = client;
    this.defaultCollection = defaultCollection;
    this.basic = basicLayer;
    this.comprehensive = comprehensiveLayer;
    
    // Default collection names for focused features
    this.chatCollection = 'dank_chat_history';
    this.userCollection = 'dank_user_data';
  }

  // ===== Chat History Management =====

  /**
   * Ensure collection exists, create if it doesn't
   * @private
   */
  async _ensureCollection(name, vectorSize = 384) {
    try {
      await this.comprehensive.getCollectionInfo(name);
    } catch (error) {
      // Collection doesn't exist, create it
      await this.comprehensive.createCollection(name, {
        size: vectorSize,
        distance: 'Cosine'
      });
    }
  }

  /**
   * Store a chat message
   * @param {string} conversationId - Conversation identifier
   * @param {string} messageId - Message identifier (optional, auto-generated if not provided)
   * @param {string} content - Message content
   * @param {object} metadata - Additional metadata (role, timestamp, etc.)
   * @param {number[]} embedding - Optional pre-computed embedding
   */
  async storeChatMessage(conversationId, messageId, content, metadata = {}, embedding = null) {
    if (!conversationId || typeof conversationId !== 'string') {
      throw new Error('conversationId must be a non-empty string');
    }
    if (!content || typeof content !== 'string') {
      throw new Error('content must be a non-empty string');
    }
    
    // Ensure collection exists
    await this._ensureCollection(this.chatCollection, 384);
    
    const id = messageId || uuidv4();
    
    // Generate embedding if not provided
    if (!embedding) {
      embedding = simpleTextEmbedding(content, 384); // Common embedding dimension
    }
    
    const payload = {
      conversation_id: conversationId,
      content,
      timestamp: metadata.timestamp || new Date().toISOString(),
      role: metadata.role || 'user',
      ...metadata
    };
    
    return await this.basic.storeVector(
      this.chatCollection,
      id,
      embedding,
      payload
    );
  }

  /**
   * Retrieve conversation history
   * @param {string} conversationId - Conversation identifier
   * @param {number} limit - Maximum number of messages
   * @param {object} filter - Additional filter conditions
   */
  async getChatHistory(conversationId, limit = 50, filter = null) {
    if (!conversationId || typeof conversationId !== 'string') {
      throw new Error('conversationId must be a non-empty string');
    }
    
    const filterConditions = {
      must: [
        {
          key: 'conversation_id',
          match: { value: conversationId }
        },
        ...(filter ? [filter] : [])
      ]
    };
    
    const result = await this.comprehensive.scrollPoints(
      this.chatCollection,
      filterConditions,
      limit
    );
    
    // Sort by timestamp
    const messages = result.points
      .map(p => ({
        id: p.id,
        content: p.payload.content,
        role: p.payload.role,
        timestamp: p.payload.timestamp,
        ...p.payload
      }))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    return {
      conversation_id: conversationId,
      messages,
      count: messages.length
    };
  }

  /**
   * Semantic search in chat history
   * @param {string} query - Search query text
   * @param {string} conversationId - Optional conversation ID to limit search
   * @param {number} limit - Number of results
   */
  async searchChatHistory(query, conversationId = null, limit = 10) {
    if (!query || typeof query !== 'string') {
      throw new Error('query must be a non-empty string');
    }
    
    const queryEmbedding = simpleTextEmbedding(query, 384);
    
    const filter = conversationId ? {
      must: [
        {
          key: 'conversation_id',
          match: { value: conversationId }
        }
      ]
    } : null;
    
    const result = await this.comprehensive.searchPoints(
      this.chatCollection,
      queryEmbedding,
      {
        limit,
        filter,
        with_payload: true
      }
    );
    
    return {
      query,
      results: result.results.map(r => ({
        id: r.id,
        score: r.score,
        content: r.payload.content,
        role: r.payload.role,
        conversation_id: r.payload.conversation_id,
        timestamp: r.payload.timestamp,
        ...r.payload
      })),
      count: result.count
    };
  }

  /**
   * Delete entire conversation
   * @param {string} conversationId - Conversation identifier
   */
  async deleteConversation(conversationId) {
    if (!conversationId || typeof conversationId !== 'string') {
      throw new Error('conversationId must be a non-empty string');
    }
    
    const filter = {
      must: [
        {
          key: 'conversation_id',
          match: { value: conversationId }
        }
      ]
    };
    
    return await this.comprehensive.deletePoints(this.chatCollection, filter);
  }

  // ===== User Data Management =====

  /**
   * Store user data
   * @param {string} userId - User identifier
   * @param {object} data - User data object
   * @param {number[]} embedding - Optional pre-computed embedding
   */
  async storeUserData(userId, data, embedding = null) {
    if (!userId || typeof userId !== 'string') {
      throw new Error('userId must be a non-empty string');
    }
    if (!data || typeof data !== 'object') {
      throw new Error('data must be an object');
    }
    
    // Ensure collection exists
    await this._ensureCollection(this.userCollection, 384);
    
    // Generate embedding from user data if not provided
    if (!embedding) {
      const dataString = JSON.stringify(data);
      embedding = simpleTextEmbedding(dataString, 384);
    }
    
    const payload = {
      user_id: userId,
      ...data,
      updated_at: new Date().toISOString()
    };
    
    return await this.basic.storeVector(
      this.userCollection,
      userId,
      embedding,
      payload
    );
  }

  /**
   * Retrieve user data
   * @param {string} userId - User identifier
   */
  async getUserData(userId) {
    if (!userId || typeof userId !== 'string') {
      throw new Error('userId must be a non-empty string');
    }
    
    const result = await this.basic.getVector(this.userCollection, userId);
    
    if (!result) {
      return null;
    }
    
    return {
      user_id: userId,
      ...result.payload,
      vector: result.vector
    };
  }

  /**
   * Update user data
   * @param {string} userId - User identifier
   * @param {object} data - Updated user data
   */
  async updateUserData(userId, data) {
    if (!userId || typeof userId !== 'string') {
      throw new Error('userId must be a non-empty string');
    }
    if (!data || typeof data !== 'object') {
      throw new Error('data must be an object');
    }
    
    // Get existing user data
    const existing = await this.getUserData(userId);
    
    if (!existing) {
      throw new Error(`User ${userId} not found`);
    }
    
    // Merge with existing data
    const updatedData = {
      ...existing,
      ...data,
      updated_at: new Date().toISOString()
    };
    
    // Regenerate embedding
    const dataString = JSON.stringify(updatedData);
    const embedding = simpleTextEmbedding(dataString, 384);
    
    return await this.basic.storeVector(
      this.userCollection,
      userId,
      embedding,
      updatedData
    );
  }

  /**
   * Find similar users
   * @param {string} userId - User identifier to find similar users to
   * @param {number} limit - Number of similar users
   */
  async findSimilarUsers(userId, limit = 10) {
    if (!userId || typeof userId !== 'string') {
      throw new Error('userId must be a non-empty string');
    }
    
    const userData = await this.getUserData(userId);
    
    if (!userData || !userData.vector) {
      throw new Error(`User ${userId} not found or has no vector`);
    }
    
    const result = await this.comprehensive.searchPoints(
      this.userCollection,
      userData.vector,
      {
        limit: limit + 1, // +1 to exclude the user themselves
        filter: {
          must_not: [
            {
              key: 'user_id',
              match: { value: userId }
            }
          ]
        },
        with_payload: true
      }
    );
    
    return {
      user_id: userId,
      similar_users: result.results.map(r => ({
        user_id: r.payload.user_id,
        score: r.score,
        ...r.payload
      })),
      count: result.count
    };
  }

  // ===== Semantic Search Utilities =====

  /**
   * Text-based semantic search
   * @param {string} collection - Collection name
   * @param {string} queryText - Search query text
   * @param {number} limit - Number of results
   * @param {object} filter - Optional filter
   */
  async semanticSearch(collection, queryText, limit = 10, filter = null) {
    validateCollectionName(collection);
    if (!queryText || typeof queryText !== 'string') {
      throw new Error('queryText must be a non-empty string');
    }
    
    const queryEmbedding = simpleTextEmbedding(queryText, 384);
    
    return await this.comprehensive.searchPoints(
      collection,
      queryEmbedding,
      {
        limit,
        filter,
        with_payload: true
      }
    );
  }

  /**
   * Find similar vectors
   * @param {string} collection - Collection name
   * @param {number[]} vector - Query vector
   * @param {number} limit - Number of results
   * @param {object} filter - Optional filter
   */
  async findSimilar(collection, vector, limit = 10, filter = null) {
    validateCollectionName(collection);
    
    return await this.comprehensive.searchPoints(
      collection,
      vector,
      {
        limit,
        filter,
        with_payload: true
      }
    );
  }

  /**
   * Hybrid search (text + vector)
   * @param {string} collection - Collection name
   * @param {string} queryText - Text query
   * @param {number[]} vector - Vector query
   * @param {number} limit - Number of results
   */
  async hybridSearch(collection, queryText, vector, limit = 10) {
    validateCollectionName(collection);
    
    // For hybrid search, we can use the vector directly or combine with text embedding
    // This is a simplified version - in production, you might want to combine embeddings
    const textEmbedding = simpleTextEmbedding(queryText, 384);
    
    // Use the provided vector if available, otherwise use text embedding
    const searchVector = vector || textEmbedding;
    
    return await this.comprehensive.searchPoints(
      collection,
      searchVector,
      {
        limit,
        with_payload: true
      }
    );
  }
}

module.exports = { FocusedLayer };

