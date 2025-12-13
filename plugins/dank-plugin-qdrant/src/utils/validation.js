/**
 * Validation utilities for Qdrant plugin
 */

const Joi = require('joi');

/**
 * Validate vector array
 */
function validateVector(vector) {
  if (!Array.isArray(vector)) {
    throw new Error('Vector must be an array');
  }
  if (vector.length === 0) {
    throw new Error('Vector cannot be empty');
  }
  if (!vector.every(v => typeof v === 'number' && !isNaN(v))) {
    throw new Error('Vector must contain only numbers');
  }
  return true;
}

/**
 * Validate collection name
 */
function validateCollectionName(name) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Collection name must be a non-empty string');
  }
  return true;
}

/**
 * Validate point ID
 */
function validatePointId(id) {
  if (typeof id !== 'string' && typeof id !== 'number') {
    throw new Error('Point ID must be a string or number');
  }
  return true;
}

/**
 * Validate payload object
 */
function validatePayload(payload) {
  if (payload !== null && typeof payload !== 'object') {
    throw new Error('Payload must be an object or null');
  }
  return true;
}

/**
 * Schema for point creation
 */
const pointSchema = Joi.object({
  id: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
  vector: Joi.alternatives().try(
    Joi.array().items(Joi.number()),
    Joi.object().pattern(Joi.string(), Joi.array().items(Joi.number()))
  ).required(),
  payload: Joi.object().allow(null).optional()
});

/**
 * Validate point object
 */
function validatePoint(point) {
  const { error } = pointSchema.validate(point);
  if (error) {
    throw new Error(`Invalid point: ${error.message}`);
  }
  return true;
}

module.exports = {
  validateVector,
  validateCollectionName,
  validatePointId,
  validatePayload,
  validatePoint,
  pointSchema
};

