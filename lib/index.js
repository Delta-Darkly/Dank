/**
 * Dank Agent Service - Main Library Export
 * 
 * This is the main entry point for the Dank library that users will import
 * to define and configure their AI agents.
 */

const { DankAgent } = require('./agent');
const { DankProject } = require('./project');
const { AgentConfig } = require('./config');
const { SUPPORTED_LLMS, DEFAULT_CONFIG } = require('./constants');

module.exports = {
  // Main classes
  DankAgent,
  DankProject,
  AgentConfig,
  
  // Constants
  SUPPORTED_LLMS,
  DEFAULT_CONFIG,
  
  // Convenience functions
  createAgent: (name, config) => new DankAgent(name, config),
  createProject: (name, options) => new DankProject(name, options)
};
