/**
 * Plugin Registry - Discovery, loading, and lifecycle management
 * 
 * Manages plugin discovery, loading from npm packages or local paths,
 * validates plugin schemas, and tracks plugin dependencies.
 */

const fs = require('fs-extra');
const path = require('path');
const { PluginBase } = require('./base');
const { PluginConfig } = require('./config');

class PluginRegistry {
  constructor() {
    this.plugins = new Map(); // name -> plugin instance
    this.pluginClasses = new Map(); // name -> Plugin class
    this.loadedPaths = new Map(); // name -> path
    this.dependencies = new Map(); // name -> [dependencies]
  }

  /**
   * Register a plugin class
   */
  register(name, PluginClass, options = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('Plugin name must be a non-empty string');
    }

    if (!PluginClass || !(PluginClass.prototype instanceof PluginBase)) {
      throw new Error(`Plugin '${name}' must extend PluginBase`);
    }

    this.pluginClasses.set(name, PluginClass);
    
    if (options.dependencies) {
      this.dependencies.set(name, options.dependencies);
    }

    return this;
  }

  /**
   * Load plugin from npm package
   */
  async loadFromNpm(packageName, config = {}) {
    try {
      // Try to require the package
      let PluginClass;
      try {
        const pluginModule = require(packageName);
        PluginClass = pluginModule.default || pluginModule;
      } catch (error) {
        // If not installed, try to install it
        if (error.code === 'MODULE_NOT_FOUND') {
          throw new Error(
            `Plugin package '${packageName}' not found. ` +
            `Install it with: npm install ${packageName}`
          );
        }
        throw error;
      }

      // Validate it's a PluginBase subclass
      if (!PluginClass || !(PluginClass.prototype instanceof PluginBase)) {
        throw new Error(
          `Package '${packageName}' does not export a PluginBase subclass`
        );
      }

      // Extract plugin name from package or use package name
      const pluginName = PluginClass.name || packageName.replace(/^dank-plugin-/, '');
      
      this.pluginClasses.set(pluginName, PluginClass);
      this.loadedPaths.set(pluginName, `npm:${packageName}`);

      return { name: pluginName, PluginClass };
    } catch (error) {
      throw new Error(`Failed to load plugin from npm package '${packageName}': ${error.message}`);
    }
  }

  /**
   * Load plugin from local file path
   */
  async loadFromPath(filePath, config = {}) {
    try {
      const resolvedPath = path.resolve(filePath);
      
      if (!(await fs.pathExists(resolvedPath))) {
        throw new Error(`Plugin file not found: ${resolvedPath}`);
      }

      // Clear require cache for this file
      delete require.cache[require.resolve(resolvedPath)];

      const pluginModule = require(resolvedPath);
      const PluginClass = pluginModule.default || pluginModule;

      if (!PluginClass || !(PluginClass.prototype instanceof PluginBase)) {
        throw new Error(
          `File '${resolvedPath}' does not export a PluginBase subclass`
        );
      }

      const pluginName = config.name || PluginClass.name || path.basename(resolvedPath, '.js');
      
      this.pluginClasses.set(pluginName, PluginClass);
      this.loadedPaths.set(pluginName, resolvedPath);

      return { name: pluginName, PluginClass };
    } catch (error) {
      throw new Error(`Failed to load plugin from path '${filePath}': ${error.message}`);
    }
  }

  /**
   * Create plugin instance
   */
  async create(name, config = {}) {
    const PluginClass = this.pluginClasses.get(name);
    
    if (!PluginClass) {
      throw new Error(`Plugin '${name}' not registered. Load it first with loadFromNpm() or loadFromPath()`);
    }

    // Inject environment variables into config
    const injectedConfig = PluginConfig.injectEnvVars(config);

    // Create plugin instance
    const plugin = new PluginClass(injectedConfig);

    // Validate plugin config if plugin has validateConfig method
    if (typeof plugin.validateConfig === 'function') {
      plugin.validateConfig(injectedConfig);
    }

    // Initialize plugin
    await plugin.init();

    this.plugins.set(name, plugin);

    return plugin;
  }

  /**
   * Get plugin instance
   */
  get(name) {
    return this.plugins.get(name);
  }

  /**
   * Get all plugin instances
   */
  getAll() {
    return Array.from(this.plugins.values());
  }

  /**
   * Check if plugin is registered
   */
  has(name) {
    return this.pluginClasses.has(name);
  }

  /**
   * Check if plugin is loaded (has instance)
   */
  isLoaded(name) {
    return this.plugins.has(name);
  }

  /**
   * Get plugin class
   */
  getClass(name) {
    return this.pluginClasses.get(name);
  }

  /**
   * Get plugin dependencies
   */
  getDependencies(name) {
    return this.dependencies.get(name) || [];
  }

  /**
   * Resolve plugin dependencies (topological sort)
   */
  resolveDependencies(pluginNames) {
    const resolved = [];
    const visited = new Set();
    const visiting = new Set();

    const visit = (name) => {
      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected involving plugin '${name}'`);
      }
      
      if (visited.has(name)) {
        return;
      }

      visiting.add(name);
      
      const deps = this.getDependencies(name);
      for (const dep of deps) {
        if (!this.has(dep)) {
          throw new Error(`Plugin '${name}' depends on '${dep}' which is not registered`);
        }
        visit(dep);
      }

      visiting.delete(name);
      visited.add(name);
      resolved.push(name);
    };

    for (const name of pluginNames) {
      visit(name);
    }

    return resolved;
  }

  /**
   * Unload plugin
   */
  async unload(name) {
    const plugin = this.plugins.get(name);
    
    if (plugin) {
      await plugin.destroy();
      this.plugins.delete(name);
    }

    return this;
  }

  /**
   * Unload all plugins
   */
  async unloadAll() {
    const names = Array.from(this.plugins.keys());
    for (const name of names) {
      await this.unload(name);
    }
    return this;
  }

  /**
   * Get registry metadata
   */
  getMetadata() {
    return {
      registered: Array.from(this.pluginClasses.keys()),
      loaded: Array.from(this.plugins.keys()).map(name => ({
        name,
        status: this.plugins.get(name).status,
        path: this.loadedPaths.get(name)
      })),
      dependencies: Object.fromEntries(this.dependencies)
    };
  }
}

module.exports = { PluginRegistry };

