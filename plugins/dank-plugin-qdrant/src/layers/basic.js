/**
 * Basic Layer - Core vector operations
 * 
 * Provides fundamental vector storage and querying operations
 * that all other layers build upon.
 */

const { validateCollectionName, validatePointId, validatePoint } = require('../utils/validation');

class BasicLayer {
  constructor(client, defaultCollection) {
    this.client = client;
    this.defaultCollection = defaultCollection;
  }

  /**
   * Store a single vector with metadata
   * @param {string} collection - Collection name
   * @param {string|number} id - Point ID
   * @param {number[]|object} vector - Vector or named vectors
   * @param {object} payload - Metadata payload
   */
  async storeVector(collection, id, vector, payload = null) {
    validateCollectionName(collection);
    validatePointId(id);
    
    const point = {
      id,
      vector,
      payload: payload || {}
    };
    
    validatePoint(point);
    
    await this.client.upsert(collection, {
      wait: true,
      points: [point]
    });
    
    return { success: true, id, collection };
  }

  /**
   * Query similar vectors
   * @param {string} collection - Collection name
   * @param {number[]|object} vector - Query vector
   * @param {number} limit - Number of results
   * @param {object} filter - Optional filter
   */
  async queryVector(collection, vector, limit = 10, filter = null) {
    validateCollectionName(collection);
    
    const searchParams = {
      vector,
      limit,
      with_payload: true,
      with_vector: false
    };
    
    if (filter) {
      searchParams.filter = filter;
    }
    
    const result = await this.client.search(collection, searchParams);
    
    return {
      results: result.map(r => ({
        id: r.id,
        score: r.score,
        payload: r.payload
      })),
      count: result.length
    };
  }

  /**
   * Retrieve vector by ID
   * @param {string} collection - Collection name
   * @param {string|number} id - Point ID
   */
  async getVector(collection, id) {
    validateCollectionName(collection);
    validatePointId(id);
    
    const result = await this.client.retrieve(collection, {
      ids: [id],
      with_payload: true,
      with_vector: true
    });
    
    if (result.length === 0) {
      return null;
    }
    
    return {
      id: result[0].id,
      vector: result[0].vector,
      payload: result[0].payload
    };
  }

  /**
   * Delete vector by ID
   * @param {string} collection - Collection name
   * @param {string|number} id - Point ID
   */
  async deleteVector(collection, id) {
    validateCollectionName(collection);
    validatePointId(id);
    
    await this.client.delete(collection, {
      wait: true,
      points: [id]
    });
    
    return { success: true, id, collection };
  }

  /**
   * Batch store multiple vectors
   * @param {string} collection - Collection name
   * @param {array} points - Array of point objects
   */
  async batchStore(collection, points) {
    validateCollectionName(collection);
    
    if (!Array.isArray(points) || points.length === 0) {
      throw new Error('Points must be a non-empty array');
    }
    
    // Validate all points
    points.forEach(point => validatePoint(point));
    
    await this.client.upsert(collection, {
      wait: true,
      points
    });
    
    return {
      success: true,
      count: points.length,
      collection
    };
  }
}

module.exports = { BasicLayer };

