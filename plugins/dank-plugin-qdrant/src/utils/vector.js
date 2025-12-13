/**
 * Vector utilities for Qdrant plugin
 */

/**
 * Generate a simple embedding from text (placeholder - in production, use a real embedding model)
 * This is a simple hash-based embedding for demonstration
 */
function simpleTextEmbedding(text, dimensions = 128) {
  if (typeof text !== 'string') {
    throw new Error('Text must be a string');
  }
  
  // Simple hash-based embedding (not production-ready)
  // In production, use OpenAI embeddings, sentence-transformers, etc.
  const vector = new Array(dimensions).fill(0);
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const index = charCode % dimensions;
    vector[index] = (vector[index] + charCode / 1000) % 1;
  }
  
  return vector;
}

/**
 * Normalize vector to unit length
 */
function normalizeVector(vector) {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('Vector must be a non-empty array');
  }
  
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) {
    return vector;
  }
  
  return vector.map(val => val / magnitude);
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vec1, vec2) {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }
  
  const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
  if (magnitude === 0) {
    return 0;
  }
  
  return dotProduct / magnitude;
}

module.exports = {
  simpleTextEmbedding,
  normalizeVector,
  cosineSimilarity
};

