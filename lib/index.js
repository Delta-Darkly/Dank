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
const { PluginBase, PluginRegistry, PluginManager, PluginConfig, PluginEventSystem } = require('./plugins');

module.exports = {
  // Main classes
  DankAgent,
  DankProject,
  AgentConfig,
  
  // Plugin system
  PluginBase,
  PluginRegistry,
  PluginManager,
  PluginConfig,
  PluginEventSystem,
  
  // Constants
  SUPPORTED_LLMS,
  DEFAULT_CONFIG,
  
  // Convenience functions
  createAgent: (name, config) => new DankAgent(name, config),
  createProject: (name, options) => new DankProject(name, options)
};
