/**
 * Plugin Event System Utilities
 * 
 * Provides utilities for plugin event handling, pattern matching,
 * and event routing between plugins and agents.
 */

class PluginEventSystem {
  /**
   * Check if an event name matches a handler pattern
   * Supports wildcards and specific patterns (same as agent handlers)
   */
  static matchesEventPattern(eventName, pattern) {
    // Exact match
    if (eventName === pattern) {
      return true;
    }

    // Wildcard patterns
    if (pattern.includes('*')) {
      const regexPattern = pattern.replace(/\*/g, '.*').replace(/:/g, ':');
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(eventName);
    }

    // Prefix match (e.g., 'plugin:postgres:*' matches 'plugin:postgres:query')
    if (pattern.endsWith(':*')) {
      const prefix = pattern.slice(0, -2);
      return eventName.startsWith(prefix + ':');
    }

    return false;
  }

  /**
   * Normalize event name (add plugin prefix if needed)
   */
  static normalizeEventName(eventName, pluginName) {
    if (eventName.startsWith('plugin:')) {
      return eventName;
    }
    return `plugin:${pluginName}:${eventName}`;
  }

  /**
   * Extract plugin name from event name
   */
  static extractPluginName(eventName) {
    const match = eventName.match(/^plugin:([^:]+):/);
    return match ? match[1] : null;
  }

  /**
   * Create event name for plugin
   */
  static createPluginEvent(pluginName, eventName) {
    return `plugin:${pluginName}:${eventName}`;
  }

  /**
   * Create tool event name
   */
  static createToolEvent(toolName, action) {
    return `tool:${toolName}:${action}`;
  }

  /**
   * Create plugin tool event name
   */
  static createPluginToolEvent(pluginName, toolName, action) {
    return `plugin:${pluginName}:tool:${toolName}:${action}`;
  }

  /**
   * Find all matching handlers for an event
   */
  static findMatchingHandlers(eventName, handlersMap) {
    const matchingHandlers = [];

    for (const [handlerPattern, handlers] of handlersMap) {
      if (this.matchesEventPattern(eventName, handlerPattern)) {
        matchingHandlers.push(...handlers);
      }
    }

    return matchingHandlers;
  }

  /**
   * Execute handlers and collect responses
   */
  static async executeHandlers(handlers, data) {
    let modifiedData = { ...data };

    for (const handlerObj of handlers) {
      try {
        const handler = typeof handlerObj === 'function' 
          ? handlerObj 
          : handlerObj.handler;

        if (typeof handler !== 'function') {
          continue;
        }

        const result = await handler(modifiedData);

        // If handler returns an object, merge it with the current data
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          modifiedData = { ...modifiedData, ...result };
        }
      } catch (error) {
        console.error(`Error in event handler:`, error);
        // Continue executing other handlers even if one fails
      }
    }

    return modifiedData;
  }

  /**
   * Emit event to multiple targets
   */
  static emitToTargets(targets, eventName, data) {
    targets.forEach(target => {
      if (target && typeof target.emit === 'function') {
        target.emit(eventName, data);
      }
    });
  }

  /**
   * Create event router for plugin-to-plugin communication
   */
  static createEventRouter() {
    const routes = new Map();

    return {
      /**
       * Register a route from event pattern to target
       */
      route(pattern, target) {
        if (!routes.has(pattern)) {
          routes.set(pattern, []);
        }
        routes.get(pattern).push(target);
      },

      /**
       * Remove a route
       */
      unroute(pattern, target) {
        if (routes.has(pattern)) {
          const targets = routes.get(pattern);
          const index = targets.indexOf(target);
          if (index !== -1) {
            targets.splice(index, 1);
          }
        }
      },

      /**
       * Route an event
       */
      emit(eventName, data) {
        for (const [pattern, targets] of routes) {
          if (this.matchesEventPattern(eventName, pattern)) {
            this.emitToTargets(targets, eventName, data);
          }
        }
      },

      /**
       * Get all routes
       */
      getRoutes() {
        return Array.from(routes.entries()).map(([pattern, targets]) => ({
          pattern,
          targets: targets.length
        }));
      }
    };
  }
}

module.exports = { PluginEventSystem };

