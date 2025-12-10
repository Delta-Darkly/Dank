/**
 * PluginBase - Abstract base class for all Dank plugins
 * 
 * Provides lifecycle hooks, event handling, tool registration, and state management
 * for plugins that integrate with Dank agents.
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class PluginBase extends EventEmitter {
  constructor(name, config = {}) {
    super();
    
    if (!name || typeof name !== 'string') {
      throw new Error('Plugin name must be a non-empty string');
    }
    
    this.name = name;
    this.id = uuidv4();
    this.config = config;
    this.state = new Map();
    this.tools = new Map();
    this.handlers = new Map();
    this.status = 'initialized'; // initialized, starting, running, stopping, stopped, error
    this.agentContext = null;
    this.pluginManager = null;
    this.createdAt = new Date().toISOString();
    this.startedAt = null;
    this.stoppedAt = null;
  }

  /**
   * Initialize the plugin
   * Override this method to set up connections, validate config, etc.
   */
  async init() {
    this.status = 'initialized';
    return this;
  }

  /**
   * Start the plugin
   * Override this method to start services, begin listening, etc.
   */
  async start() {
    if (this.status === 'running') {
      return this;
    }
    
    this.status = 'starting';
    this.startedAt = new Date().toISOString();
    
    try {
      await this.onStart();
      this.status = 'running';
      this.emit('started');
      return this;
    } catch (error) {
      this.status = 'error';
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop the plugin
   * Override this method to clean up resources, close connections, etc.
   */
  async stop() {
    if (this.status === 'stopped' || this.status === 'stopping') {
      return this;
    }
    
    this.status = 'stopping';
    
    try {
      await this.onStop();
      this.status = 'stopped';
      this.stoppedAt = new Date().toISOString();
      this.emit('stopped');
      return this;
    } catch (error) {
      this.status = 'error';
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Destroy the plugin (cleanup)
   * Override this method for final cleanup
   */
  async destroy() {
    if (this.status !== 'stopped') {
      await this.stop();
    }
    
    await this.onDestroy();
    this.removeAllListeners();
    this.state.clear();
    this.tools.clear();
    this.handlers.clear();
    return this;
  }

  /**
   * Lifecycle hooks (override these in subclasses)
   */
  async onStart() {
    // Override in subclass
  }

  async onStop() {
    // Override in subclass
  }

  async onDestroy() {
    // Override in subclass
  }

  /**
   * Register an event handler
   * Uses the same pattern as agent handlers
   */
  on(eventType, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }

    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }

    this.handlers.get(eventType).push({
      handler,
      plugin: this.name
    });

    // Also register with EventEmitter for compatibility
    super.on(eventType, handler);
    
    return this;
  }

  /**
   * Remove an event handler
   */
  off(eventType, handler) {
    if (this.handlers.has(eventType)) {
      const handlers = this.handlers.get(eventType);
      const index = handlers.findIndex(h => h.handler === handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
    
    super.off(eventType, handler);
    return this;
  }

  /**
   * Emit an event (delegates to EventEmitter)
   */
  emit(eventName, ...args) {
    // Prefix plugin events with plugin name
    const prefixedEvent = `plugin:${this.name}:${eventName}`;
    super.emit(prefixedEvent, ...args);
    super.emit(eventName, ...args);
    return this;
  }

  /**
   * Register a tool that agents can use
   */
  registerTool(name, definition) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Tool name must be a non-empty string');
    }

    // Prefix tool name with plugin name
    const prefixedName = `plugin:${this.name}:${name}`;
    
    this.tools.set(prefixedName, {
      ...definition,
      name: prefixedName,
      plugin: this.name,
      registeredAt: new Date().toISOString()
    });

    // Emit event for tool registration
    this.emit('tool:registered', { name: prefixedName, definition });
    
    return this;
  }

  /**
   * Get all registered tools
   */
  getTools() {
    return Array.from(this.tools.values());
  }

  /**
   * Get a specific tool
   */
  getTool(name) {
    const prefixedName = name.startsWith(`plugin:${this.name}:`) 
      ? name 
      : `plugin:${this.name}:${name}`;
    return this.tools.get(prefixedName);
  }

  /**
   * Set plugin state (key-value store)
   */
  setState(key, value) {
    this.state.set(key, value);
    this.emit('state:changed', { key, value });
    return this;
  }

  /**
   * Get plugin state
   */
  getState(key) {
    return this.state.get(key);
  }

  /**
   * Get all plugin state
   */
  getAllState() {
    return Object.fromEntries(this.state);
  }

  /**
   * Clear plugin state
   */
  clearState() {
    this.state.clear();
    this.emit('state:cleared');
    return this;
  }

  /**
   * Get agent context (set by PluginManager)
   */
  getAgentContext() {
    return this.agentContext;
  }

  /**
   * Set agent context (called by PluginManager)
   */
  setAgentContext(context) {
    this.agentContext = context;
    return this;
  }

  /**
   * Get plugin manager reference
   */
  getPluginManager() {
    return this.pluginManager;
  }

  /**
   * Set plugin manager reference (called by PluginManager)
   */
  setPluginManager(manager) {
    this.pluginManager = manager;
    return this;
  }

  /**
   * Get another plugin by name
   */
  getPlugin(name) {
    if (!this.pluginManager) {
      throw new Error('Plugin manager not available');
    }
    return this.pluginManager.getPlugin(name);
  }

  /**
   * Get all other plugins
   */
  getPlugins() {
    if (!this.pluginManager) {
      throw new Error('Plugin manager not available');
    }
    return this.pluginManager.getAllPlugins();
  }

  /**
   * Get plugin metadata
   */
  getMetadata() {
    return {
      name: this.name,
      id: this.id,
      status: this.status,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      toolCount: this.tools.size,
      handlerCount: this.handlers.size,
      stateSize: this.state.size
    };
  }

  /**
   * Validate plugin configuration
   * Override this method to add custom validation
   */
  validateConfig(config) {
    // Override in subclass for custom validation
    return true;
  }
}

module.exports = { PluginBase };

