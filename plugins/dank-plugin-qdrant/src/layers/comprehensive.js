/**
 * Comprehensive Layer - Full Qdrant API coverage
 * 
 * Provides complete access to Qdrant's API including collection management,
 * advanced point operations, and filtering capabilities.
 */

const { validateCollectionName } = require('../utils/validation');

class ComprehensiveLayer {
  constructor(client, defaultCollection) {
    this.client = client;
    this.defaultCollection = defaultCollection;
  }

  // ===== Collection Management =====

  /**
   * Create a new collection
   * @param {string} name - Collection name
   * @param {object} config - Collection configuration
   */
  async createCollection(name, config = {}) {
    validateCollectionName(name);
    
    const collectionConfig = {
      vectors: config.vectors || {
        size: config.size || 128,
        distance: config.distance || 'Cosine'
      },
      ...(config.on_disk !== undefined && { on_disk: config.on_disk })
    };
    
    await this.client.createCollection(name, collectionConfig);
    
    return { success: true, name, config: collectionConfig };
  }

  /**
   * Delete a collection
   * @param {string} name - Collection name
   */
  async deleteCollection(name) {
    validateCollectionName(name);
    
    await this.client.deleteCollection(name);
    
    return { success: true, name };
  }

  /**
   * List all collections
   */
  async listCollections() {
    const result = await this.client.getCollections();
    
    return {
      collections: result.collections.map(c => ({
        name: c.name,
        ...c
      })),
      count: result.collections.length
    };
  }

  /**
   * Get collection information
   * @param {string} name - Collection name
   */
  async getCollectionInfo(name) {
    validateCollectionName(name);
    
    const info = await this.client.getCollection(name);
    
    return {
      name: info.config.params.vectors?.size ? undefined : Object.keys(info.config.params.vectors || {}),
      vectors_count: info.points_count,
      indexed_vectors_count: info.indexed_vectors_count,
      points_count: info.points_count,
      segments_count: info.segments_count,
      config: info.config
    };
  }

  // ===== Point Operations =====

  /**
   * Upsert points with full options
   * @param {string} collection - Collection name
   * @param {array} points - Array of points
   * @param {object} options - Upsert options
   */
  async upsertPoints(collection, points, options = {}) {
    validateCollectionName(collection);
    
    if (!Array.isArray(points) || points.length === 0) {
      throw new Error('Points must be a non-empty array');
    }
    
    await this.client.upsert(collection, {
      wait: options.wait !== false,
      points,
      ...(options.ordering && { ordering: options.ordering })
    });
    
    return {
      success: true,
      count: points.length,
      collection
    };
  }

  /**
   * Advanced search with filters and options
   * @param {string} collection - Collection name
   * @param {number[]|object} vector - Query vector
   * @param {object} options - Search options
   */
  async searchPoints(collection, vector, options = {}) {
    validateCollectionName(collection);
    
    const searchParams = {
      vector,
      limit: options.limit || 10,
      with_payload: options.with_payload !== false,
      with_vector: options.with_vector || false,
      score_threshold: options.score_threshold,
      ...(options.filter && { filter: options.filter }),
      ...(options.params && { params: options.params })
    };
    
    const result = await this.client.search(collection, searchParams);
    
    return {
      results: result.map(r => ({
        id: r.id,
        score: r.score,
        payload: r.payload,
        ...(r.vector && { vector: r.vector })
      })),
      count: result.length
    };
  }

  /**
   * Scroll through points with filter
   * @param {string} collection - Collection name
   * @param {object} filter - Filter conditions
   * @param {number} limit - Number of results
   * @param {object} offset - Offset for pagination
   */
  async scrollPoints(collection, filter = null, limit = 10, offset = null) {
    validateCollectionName(collection);
    
    const scrollParams = {
      limit,
      with_payload: true,
      with_vector: false,
      ...(filter && { filter }),
      ...(offset && { offset })
    };
    
    const result = await this.client.scroll(collection, scrollParams);
    
    return {
      points: result.points.map(p => ({
        id: p.id,
        payload: p.payload,
        ...(p.vector && { vector: p.vector })
      })),
      next_page_offset: result.next_page_offset,
      count: result.points.length
    };
  }

  /**
   * Delete points by filter
   * @param {string} collection - Collection name
   * @param {object} filter - Filter conditions
   */
  async deletePoints(collection, filter) {
    validateCollectionName(collection);
    
    if (!filter) {
      throw new Error('Filter is required for deletePoints');
    }
    
    await this.client.delete(collection, {
      wait: true,
      filter
    });
    
    return { success: true, collection, filter };
  }

  /**
   * Update existing points
   * @param {string} collection - Collection name
   * @param {array} points - Points to update
   */
  async updatePoints(collection, points) {
    validateCollectionName(collection);
    
    if (!Array.isArray(points) || points.length === 0) {
      throw new Error('Points must be a non-empty array');
    }
    
    await this.client.setPayload(collection, {
      payload: {},
      points: points.map(p => p.id)
    });
    
    // Update payloads
    for (const point of points) {
      if (point.payload) {
        await this.client.setPayload(collection, {
          payload: point.payload,
          points: [point.id]
        });
      }
    }
    
    return {
      success: true,
      count: points.length,
      collection
    };
  }

  // ===== Filter Operations =====

  /**
   * Build complex filter conditions
   * @param {object} conditions - Filter conditions
   */
  buildFilter(conditions) {
    if (!conditions || typeof conditions !== 'object') {
      throw new Error('Conditions must be an object');
    }
    
    // Qdrant filter structure
    const filter = {
      must: [],
      must_not: [],
      should: []
    };
    
    if (conditions.must) {
      filter.must = Array.isArray(conditions.must) ? conditions.must : [conditions.must];
    }
    
    if (conditions.must_not) {
      filter.must_not = Array.isArray(conditions.must_not) ? conditions.must_not : [conditions.must_not];
    }
    
    if (conditions.should) {
      filter.should = Array.isArray(conditions.should) ? conditions.should : [conditions.should];
    }
    
    // Simple key-value filters
    if (conditions.key && conditions.match) {
      filter.must.push({
        key: conditions.key,
        match: { value: conditions.match }
      });
    }
    
    return filter;
  }

  /**
   * Search with filter
   * @param {string} collection - Collection name
   * @param {number[]|object} vector - Query vector
   * @param {object} filter - Filter conditions
   * @param {number} limit - Number of results
   */
  async searchWithFilter(collection, vector, filter, limit = 10) {
    validateCollectionName(collection);
    
    const builtFilter = this.buildFilter(filter);
    
    return await this.searchPoints(collection, vector, {
      limit,
      filter: builtFilter
    });
  }
}

module.exports = { ComprehensiveLayer };

