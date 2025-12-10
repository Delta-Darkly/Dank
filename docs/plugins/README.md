# Dank Plugin System

The Dank plugin system allows you to extend agents with third-party functionality for databases, vector stores, state management, and external integrations. Plugins integrate seamlessly with Dank's event-driven architecture and tool system.

## Overview

Plugins in Dank:
- **Reuse existing patterns**: Use the same event handler and tool patterns as agents
- **Lifecycle management**: Explicit init/start/stop lifecycle hooks
- **State management**: Maintain and share state between plugins
- **Tool integration**: Expose tools that agents can use
- **Event communication**: Listen to agent events and emit custom events
- **Plugin-to-plugin communication**: Plugins can communicate with each other

## Quick Start

### Using a Plugin

```javascript
const { createAgent } = require('dank-ai');
const { v4: uuidv4 } = require('uuid');

const agent = createAgent('my-agent')
  .setId(uuidv4())
  .setLLM('openai', {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-3.5-turbo'
  })
  .setPrompt('You are a helpful assistant')
  .addPlugin('dank-plugin-postgres', {
    connectionString: process.env.POSTGRES_URL,
    poolSize: 10
  })
  .addPlugin('dank-plugin-pinecone', {
    apiKey: process.env.PINECONE_API_KEY,
    environment: 'us-east-1'
  });
```

### Creating a Plugin

```javascript
// Import PluginBase from dank-ai
const { PluginBase } = require('dank-ai');

class MyPlugin extends PluginBase {
  constructor(config) {
    super('my-plugin', config);
    this.client = null;
  }

  async init() {
    // Initialize plugin (connect to DB, setup clients, etc.)
    this.client = new SomeClient(this.config);
    
    // Register event handlers
    this.on('request_output:start', (data) => {
      // Handle prompt start
    });

    // Register tools
    this.registerTool('queryData', {
      description: 'Query data from the plugin',
      parameters: {
        query: {
          type: 'string',
          description: 'Query string',
          required: true
        }
      },
      handler: async ({ query }) => {
        return await this.client.query(query);
      }
    });
  }

  async onStart() {
    // Start plugin services
    await this.client.connect();
  }

  async onStop() {
    // Cleanup
    await this.client.disconnect();
  }
}

// Export the plugin class
module.exports = MyPlugin;
```

## Plugin Lifecycle

Plugins have a well-defined lifecycle:

1. **Construction**: Plugin instance is created
2. **init()**: Plugin initializes (setup, validation, register handlers/tools)
3. **start()**: Plugin starts (connect to services, begin listening)
4. **Running**: Plugin is active and handling events
5. **stop()**: Plugin stops (cleanup, disconnect)
6. **destroy()**: Plugin is destroyed (final cleanup)

```javascript
// Import PluginBase from dank-ai
const { PluginBase } = require('dank-ai');

class MyPlugin extends PluginBase {
  async init() {
    // Called once during initialization
    // Register handlers, tools, validate config
  }

  async onStart() {
    // Called when plugin starts
    // Connect to services, start listeners
  }

  async onStop() {
    // Called when plugin stops
    // Disconnect, cleanup resources
  }

  async onDestroy() {
    // Called during final cleanup
    // Remove all resources
  }
}

module.exports = MyPlugin;
```

## Event Handling

Plugins can listen to agent events and emit their own events:

### Listening to Agent Events

```javascript
async init() {
  // Listen to prompt events
  this.on('request_output:start', (data) => {
    console.log('Prompt started:', data.prompt);
  });

  this.on('request_output:end', (data) => {
    // Save response to database
    this.saveResponse(data);
  });

  // Listen to tool events
  this.on('tool:*', (data) => {
    console.log('Tool executed:', data);
  });
}
```

### Emitting Custom Events

```javascript
// Emit plugin-specific events
this.emit('query:completed', { result, duration });

// Other plugins can listen
otherPlugin.on('plugin:my-plugin:query:completed', (data) => {
  // Handle event
});
```

### Event Pattern Matching

Plugins support the same wildcard patterns as agents:

```javascript
// Match all tool events
this.on('tool:*', handler);

// Match all request_output events
this.on('request_output:*', handler);

// Match specific plugin events
this.on('plugin:postgres:*', handler);
```

## Tool Registration

Plugins can expose tools that agents can use:

```javascript
async init() {
  this.registerTool('queryDatabase', {
    description: 'Query the database',
    category: 'database',
    parameters: {
      sql: {
        type: 'string',
        description: 'SQL query',
        required: true
      }
    },
    handler: async ({ sql }) => {
      const result = await this.db.query(sql);
      return result;
    }
  });
}
```

Tools are automatically prefixed with the plugin name: `plugin:my-plugin:queryDatabase`

Agents can use plugin tools:

```javascript
// In agent code or handlers
const result = await agent.useTool('plugin:my-plugin:queryDatabase', {
  sql: 'SELECT * FROM users'
});
```

## State Management

Plugins can maintain state and share it:

```javascript
// Set state
this.setState('lastQuery', queryResult);
this.setState('connectionCount', 5);

// Get state
const lastQuery = this.getState('lastQuery');

// Get all state
const allState = this.getAllState();

// Clear state
this.clearState();
```

## Plugin-to-Plugin Communication

Plugins can communicate with each other:

```javascript
// Get another plugin
const dbPlugin = this.getPlugin('postgres');

// Access plugin state (if exposed)
const data = dbPlugin.getState('lastQuery');

// Listen to another plugin's events
this.on('plugin:postgres:query:completed', (data) => {
  // Handle event from postgres plugin
});

// Emit events that other plugins can listen to
this.emit('data:processed', { result });
```

## Configuration

Plugins support environment variable injection:

```javascript
agent.addPlugin('postgres', {
  connectionString: '${POSTGRES_URL}',
  poolSize: '${POOL_SIZE:10}' // with default
});
```

Configuration is validated using Joi schemas (plugins can define their own schemas).

## Plugin Discovery

### NPM Packages

Plugins can be published as npm packages following the naming convention:
- `dank-plugin-<name>` (e.g., `dank-plugin-postgres`)
- `@scope/dank-plugin-<name>` (e.g., `@myorg/dank-plugin-custom`)

**Installation:**
```bash
npm install dank-plugin-postgres
```

**Usage:**
```javascript
agent.addPlugin('dank-plugin-postgres', config);
```

**Finding Plugins:**
- Search npm: `npm search dank-plugin`
- Browse packages with `dank-plugin` keyword
- Check community lists and awesome-dank repositories

### Local Plugins

Load plugins from local files:

```javascript
// From file path
agent.addPlugin('./plugins/my-plugin.js', config);

// From directory
agent.addPlugin('./plugins/my-plugin', config);
```

### Programmatic Registration

```javascript
const { PluginRegistry } = require('dank-ai');
const MyPlugin = require('./my-plugin');

const registry = new PluginRegistry();
registry.register('my-plugin', MyPlugin);

// Then use in agent
agent.addPlugin('my-plugin', config);
```

## Creating Your Own Plugin

Want to create and publish a plugin? See the complete guide:
- **[Creating and Publishing Plugins](CREATING_PLUGINS.md)** - Step-by-step guide for third-party developers

## Plugin Types

### Database Plugins

Database plugins provide data persistence:

```javascript
agent.addPlugin('dank-plugin-postgres', {
  connectionString: process.env.POSTGRES_URL
});

// Use in agent
await agent.useTool('plugin:postgres:query', {
  sql: 'SELECT * FROM users WHERE id = $1',
  params: [userId]
});
```

### Vector Database Plugins

Vector database plugins provide embedding and similarity search:

```javascript
agent.addPlugin('dank-plugin-pinecone', {
  apiKey: process.env.PINECONE_API_KEY,
  environment: 'us-east-1'
});

// Use in agent
await agent.useTool('plugin:pinecone:search', {
  vector: embedding,
  topK: 10
});
```

### State Management Plugins

State plugins manage agent state and conversation history:

```javascript
agent.addPlugin('dank-plugin-redis', {
  host: 'localhost',
  port: 6379
});

// Plugin automatically manages state
```

### Integration Plugins

Integration plugins connect to external services:

```javascript
agent.addPlugin('dank-plugin-slack', {
  token: process.env.SLACK_TOKEN
});

// Plugin handles webhooks and emits events
```

## Best Practices

1. **Error Handling**: Always handle errors gracefully in plugin code
2. **Resource Cleanup**: Properly clean up resources in `onStop()` and `onDestroy()`
3. **Configuration Validation**: Validate plugin configuration in `init()`
4. **Event Naming**: Use clear, namespaced event names (`plugin:name:action`)
5. **Tool Documentation**: Provide clear descriptions and parameter documentation
6. **State Isolation**: Be careful about state sharing between plugins
7. **Dependencies**: Declare plugin dependencies clearly

## Examples

See the `examples/` directory for complete plugin examples:
- Database plugin example
- Vector database plugin example
- State management plugin example
- Integration plugin example

## API Reference

### PluginBase

- `constructor(name, config)` - Create plugin instance
- `async init()` - Initialize plugin
- `async start()` - Start plugin
- `async stop()` - Stop plugin
- `async destroy()` - Destroy plugin
- `on(eventType, handler)` - Register event handler
- `off(eventType, handler)` - Remove event handler
- `emit(eventName, ...args)` - Emit event
- `registerTool(name, definition)` - Register tool
- `getTools()` - Get all registered tools
- `setState(key, value)` - Set state
- `getState(key)` - Get state
- `getPlugin(name)` - Get another plugin
- `getAgentContext()` - Get agent context

### PluginManager

- `addPlugin(name, config)` - Add plugin to agent
- `addPlugins(plugins)` - Add multiple plugins
- `getPlugin(name)` - Get plugin instance
- `getAllPlugins()` - Get all plugins
- `removePlugin(name)` - Remove plugin

## Troubleshooting

### Plugin Not Loading

- Check plugin name/path is correct
- Verify plugin extends `PluginBase`
- Check for configuration errors
- Review plugin logs

### Tools Not Available

- Ensure plugin is loaded before agent starts
- Check tool name includes plugin prefix: `plugin:name:tool`
- Verify tool is registered in `init()`

### Events Not Firing

- Check event name matches exactly
- Verify handler is registered in `init()`
- Check plugin is started
- Review event pattern matching

## Contributing

To create a plugin for the Dank ecosystem:

1. Extend `PluginBase`
2. Implement lifecycle methods
3. Register tools and handlers
4. Publish to npm as `dank-plugin-<name>`
5. Add `dank-plugin` keyword to package.json
6. Document configuration and usage

See the plugin development guide for more details.

