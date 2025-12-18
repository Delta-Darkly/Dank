/**
 * Dank Plugin System - Main Exports
 * 
 * Provides the plugin system infrastructure for extending Dank agents
 * with third-party plugins for databases, vector stores, and other services.
 */

const { PluginBase } = require('./base');
const { PluginRegistry } = require('./registry');
const { PluginManager } = require('./manager');
const { PluginConfig } = require('./config');
const { PluginEventSystem } = require('./events');

module.exports = {
  // Core classes
  PluginBase,
  PluginRegistry,
  PluginManager,
  PluginConfig,
  PluginEventSystem,

  // Convenience exports
  createPlugin: (name, config) => {
    // This is a helper for creating plugins, but typically plugins
    // should extend PluginBase directly
    throw new Error('Plugins must extend PluginBase. Use: class MyPlugin extends PluginBase { ... }');
  }
};

