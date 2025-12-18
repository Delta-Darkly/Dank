/**
 * Plugin Manager - Integrates plugins with DankAgent
 * 
 * Manages plugin lifecycle, integrates plugin handlers and tools with agents,
 * handles plugin-to-plugin communication, and manages plugin state persistence.
 */

const { PluginRegistry } = require('./registry');
const { PluginEventSystem } = require('./events');

class PluginManager {
  constructor(agent) {
    this.agent = agent;
    this.registry = new PluginRegistry();
    this.plugins = new Map(); // name -> plugin instance
    this.eventRouter = PluginEventSystem.createEventRouter();
    this.isInitialized = false;
  }

  /**
   * Add a plugin to the agent
   */
  async addPlugin(name, config = {}) {
    // If name is a string, try to load from npm or local path
    if (typeof name === 'string') {
      // Check if it's already loaded
      if (this.plugins.has(name)) {
        throw new Error(`Plugin '${name}' is already loaded`);
      }

      // Try to load from npm first (if it looks like a package name)
      if (name.startsWith('dank-plugin-') || name.includes('/')) {
        try {
          const { name: pluginName, PluginClass } = await this.registry.loadFromNpm(name);
          const plugin = await this.registry.create(pluginName, config);
          return await this._registerPlugin(pluginName, plugin);
        } catch (error) {
          // If npm load fails, try as local path
          if (name.includes('/') || name.endsWith('.js')) {
            const { name: pluginName, PluginClass } = await this.registry.loadFromPath(name, { name });
            const plugin = await this.registry.create(pluginName, config);
            return await this._registerPlugin(pluginName, plugin);
          }
          throw error;
        }
      } else {
        // Assume it's a registered plugin name
        const plugin = await this.registry.create(name, config);
        return await this._registerPlugin(name, plugin);
      }
    } else {
      // name is a PluginBase instance
      const plugin = name;
      const pluginName = plugin.name;
      
      if (this.plugins.has(pluginName)) {
        throw new Error(`Plugin '${pluginName}' is already loaded`);
      }

      return await this._registerPlugin(pluginName, plugin);
    }
  }

  /**
   * Register a plugin instance
   */
  async _registerPlugin(name, plugin) {
    // Set agent context
    plugin.setAgentContext({
      agent: this.agent,
      agentId: this.agent.id,
      agentName: this.agent.name,
      toolRegistry: this.agent.toolRegistry,
      toolExecutor: this.agent.toolExecutor
    });

    // Set plugin manager reference
    plugin.setPluginManager(this);

    // Register plugin tools with agent
    const tools = plugin.getTools();
    for (const tool of tools) {
      this.agent.toolRegistry.register(tool.name, {
        description: tool.description || `Tool from plugin '${name}'`,
        parameters: tool.parameters || {},
        handler: tool.handler,
        category: tool.category || 'plugin',
        version: tool.version || '1.0.0',
        timeout: tool.timeout || 30000,
        retries: tool.retries || 1,
        async: tool.async !== false,
        cacheable: tool.cacheable || false,
        cacheTime: tool.cacheTime || 0,
        metadata: {
          ...tool.metadata,
          plugin: name
        }
      });
    }

    // Register plugin handlers with agent
    for (const [eventType, handlers] of plugin.handlers) {
      for (const handlerObj of handlers) {
        this.agent.addHandler(eventType, handlerObj.handler);
      }
    }

    // Set up event routing
    this.eventRouter.route(`plugin:${name}:*`, this.agent);
    this.eventRouter.route(`plugin:${name}:*`, plugin);

    // Store plugin
    this.plugins.set(name, plugin);

    // Don't start plugin here - it will be started at runtime
    // Starting plugins during build would try to connect to databases/services
    // which is not available during Docker build
    // Plugins will be started when the agent container starts

    return plugin;
  }

  /**
   * Add multiple plugins
   */
  async addPlugins(plugins) {
    // Resolve dependencies first
    const pluginNames = Object.keys(plugins);
    const resolved = this.registry.resolveDependencies(pluginNames);

    // Load plugins in dependency order
    for (const name of resolved) {
      await this.addPlugin(name, plugins[name]);
    }

    return this;
  }

  /**
   * Get a plugin by name
   */
  getPlugin(name) {
    return this.plugins.get(name);
  }

  /**
   * Get all plugins
   */
  getAllPlugins() {
    return Array.from(this.plugins.values());
  }

  /**
   * Check if plugin is loaded
   */
  hasPlugin(name) {
    return this.plugins.has(name);
  }

  /**
   * Remove a plugin
   */
  async removePlugin(name) {
    const plugin = this.plugins.get(name);
    
    if (!plugin) {
      return this;
    }

    // Stop plugin
    await plugin.stop();

    // Remove plugin tools from agent
    const tools = plugin.getTools();
    for (const tool of tools) {
      // Note: ToolRegistry doesn't have an unregister method yet
      // This would need to be added if we want to fully remove tools
    }

    // Remove event routes
    this.eventRouter.unroute(`plugin:${name}:*`, this.agent);
    this.eventRouter.unroute(`plugin:${name}:*`, plugin);

    // Remove from registry
    await this.registry.unload(name);

    // Remove from plugins map
    this.plugins.delete(name);

    return this;
  }

  /**
   * Remove all plugins
   */
  async removeAllPlugins() {
    const names = Array.from(this.plugins.keys());
    for (const name of names) {
      await this.removePlugin(name);
    }
    return this;
  }

  /**
   * Start all plugins
   * This should be called at runtime when the agent container starts
   */
  async startAll() {
    for (const plugin of this.plugins.values()) {
      if (plugin.status === 'initialized' || plugin.status === 'stopped') {
        await plugin.start();
      }
    }
    return this;
  }

  /**
   * Stop all plugins
   */
  async stopAll() {
    for (const plugin of this.plugins.values()) {
      if (plugin.status !== 'stopped') {
        await plugin.stop();
      }
    }
    return this;
  }

  /**
   * Get plugin manager metadata
   */
  getMetadata() {
    return {
      plugins: Array.from(this.plugins.values()).map(p => p.getMetadata()),
      registry: this.registry.getMetadata(),
      eventRoutes: this.eventRouter.getRoutes()
    };
  }

  /**
   * Emit event to all plugins
   */
  emitToPlugins(eventName, data) {
    for (const plugin of this.plugins.values()) {
      plugin.emit(eventName, data);
    }
  }

  /**
   * Route event through event router
   */
  routeEvent(eventName, data) {
    this.eventRouter.emit(eventName, data);
  }
}

module.exports = { PluginManager };

