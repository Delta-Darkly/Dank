# Creating and Publishing Dank Plugins

This guide explains how third-party developers can create, publish, and distribute plugins for the Dank framework.

## Overview

Dank plugins are npm packages that extend agent functionality. They can be:
- **Database plugins**: PostgreSQL, MongoDB, Firebase, etc.
- **Vector database plugins**: Pinecone, Weaviate, Qdrant, etc.
- **State management plugins**: Redis, Memory, File storage
- **Integration plugins**: Slack, Discord, Email, etc.
- **Custom plugins**: Any functionality you want to add

## Step 1: Create Your Plugin

### Project Structure

Create a new npm package with this structure:

```
dank-plugin-myplugin/
├── package.json
├── README.md
├── index.js          # Main plugin file
└── lib/              # Optional: additional files
    └── utils.js
```

### Package.json

Your `package.json` should include:

```json
{
  "name": "dank-plugin-myplugin",
  "version": "1.0.0",
  "description": "My awesome Dank plugin",
  "main": "index.js",
  "keywords": [
    "dank",
    "dank-plugin",
    "dank-ai",
    "plugin"
  ],
  "author": "Your Name",
  "license": "MIT",
  "peerDependencies": {
    "dank-ai": "^1.0.0"
  },
  "dependencies": {
    "joi": "^17.0.0"
  }
}
```

**Important:**
- Package name should follow: `dank-plugin-<name>` or `@scope/dank-plugin-<name>`
- Include `dank-plugin` in keywords for discoverability
- `dank-ai` should be a peerDependency (not a regular dependency)

### Plugin Code (index.js)

```javascript
const { PluginBase } = require('dank-ai');
const { PluginConfig } = require('dank-ai');

class MyPlugin extends PluginBase {
  constructor(config) {
    super('myplugin', config);
    this.client = null;
  }

  async init() {
    // Validate configuration
    const schema = PluginConfig.schemas.database; // or create custom schema
    this.config = PluginConfig.validate(this.name, this.config, schema);

    // Register event handlers
    this.on('request_output:start', (data) => {
      console.log('Plugin received event:', data);
    });

    // Register tools
    this.registerTool('doSomething', {
      description: 'Does something useful',
      category: 'utility',
      parameters: {
        input: {
          type: 'string',
          description: 'Input parameter',
          required: true
        }
      },
      handler: async ({ input }) => {
        return await this.doSomething(input);
      }
    });
  }

  async onStart() {
    // Connect to services, start listeners, etc.
    this.client = new SomeClient(this.config);
    await this.client.connect();
    this.emit('connected');
  }

  async onStop() {
    // Cleanup
    if (this.client) {
      await this.client.disconnect();
    }
  }

  async doSomething(input) {
    // Your plugin logic
    return { result: `Processed: ${input}` };
  }
}

// Export the plugin class
module.exports = MyPlugin;
// Also support default export for ES modules
module.exports.default = MyPlugin;
```

### Configuration Schema

Define a configuration schema for your plugin:

```javascript
const Joi = require('joi');

const schema = Joi.object({
  apiKey: Joi.string().required(),
  baseURL: Joi.string().uri().optional(),
  timeout: Joi.number().min(1000).default(30000)
});

// Use in init()
this.config = PluginConfig.validate(this.name, this.config, schema);
```

## Step 2: Test Your Plugin Locally

### Test Installation

1. Create a test Dank project
2. Install your plugin locally:

```bash
npm install /path/to/dank-plugin-myplugin
```

3. Use it in your agent:

```javascript
const { createAgent } = require('dank-ai');
const { v4: uuidv4 } = require('uuid');

const agent = createAgent('test-agent')
  .setId(uuidv4())
  .setLLM('openai', {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-3.5-turbo'
  })
  .addPlugin('dank-plugin-myplugin', {
    apiKey: process.env.MY_PLUGIN_API_KEY
  });
```

### Test Plugin Functionality

```javascript
// Test tool execution
const result = await agent.useTool('plugin:myplugin:doSomething', {
  input: 'test'
});

// Test event handling
agent.addHandler('plugin:myplugin:connected', () => {
  console.log('Plugin connected!');
});
```

## Step 3: Publish to npm

### Prepare for Publishing

1. **Version your plugin**: Follow [semantic versioning](https://semver.org/)
   - `1.0.0` - Initial release
   - `1.0.1` - Bug fixes
   - `1.1.0` - New features (backward compatible)
   - `2.0.0` - Breaking changes

2. **Write documentation**: Create a comprehensive README.md

3. **Add license**: Include a LICENSE file

4. **Test thoroughly**: Ensure your plugin works in various scenarios

### Publish

```bash
# Login to npm (if not already)
npm login

# Publish
npm publish

# For scoped packages
npm publish --access public
```

### Example README.md

```markdown
# dank-plugin-myplugin

A Dank plugin for [description of what your plugin does].

## Installation

```bash
npm install dank-plugin-myplugin
```

## Usage

```javascript
const { createAgent } = require('dank-ai');

const agent = createAgent('my-agent')
  .addPlugin('dank-plugin-myplugin', {
    apiKey: process.env.MY_PLUGIN_API_KEY,
    // ... other config
  });
```

## Configuration

- `apiKey` (required): Your API key
- `baseURL` (optional): Custom base URL
- `timeout` (optional): Request timeout in ms (default: 30000)

## Tools

This plugin provides the following tools:

- `plugin:myplugin:doSomething` - Does something useful

## Events

This plugin emits the following events:

- `plugin:myplugin:connected` - Emitted when plugin connects
- `plugin:myplugin:error` - Emitted on errors

## License

MIT
```

## Step 4: Make It Discoverable

### npm Keywords

Ensure your package.json includes these keywords:

```json
{
  "keywords": [
    "dank",
    "dank-plugin",
    "dank-ai",
    "plugin",
    "your-specific-keywords"
  ]
}
```

### GitHub Repository

1. Create a GitHub repository
2. Add it to your package.json:

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/dank-plugin-myplugin.git"
  },
  "bugs": {
    "url": "https://github.com/yourusername/dank-plugin-myplugin/issues"
  },
  "homepage": "https://github.com/yourusername/dank-plugin-myplugin#readme"
}
```

### Documentation Site (Optional)

Consider creating:
- GitHub Pages documentation
- Plugin showcase page
- Usage examples and tutorials

## Step 5: Plugin Registry (Future)

In the future, Dank may have an official plugin registry. For now, plugins are discovered via:

1. **npm search**: `npm search dank-plugin`
2. **npm keywords**: Packages with `dank-plugin` keyword
3. **Community lists**: GitHub awesome-dank lists, etc.

## Best Practices

### 1. Error Handling

```javascript
async doSomething(input) {
  try {
    return await this.client.process(input);
  } catch (error) {
    this.emit('error', { error, operation: 'doSomething' });
    throw new Error(`Plugin operation failed: ${error.message}`);
  }
}
```

### 2. Configuration Validation

Always validate configuration:

```javascript
async init() {
  const schema = Joi.object({
    requiredField: Joi.string().required(),
    optionalField: Joi.string().optional()
  });
  
  this.config = PluginConfig.validate(this.name, this.config, schema);
}
```

### 3. Resource Cleanup

Always clean up resources:

```javascript
async onStop() {
  if (this.client) {
    await this.client.disconnect();
  }
  if (this.timer) {
    clearInterval(this.timer);
  }
}
```

### 4. Event Documentation

Document all events your plugin emits:

```javascript
/**
 * Emits:
 * - plugin:myplugin:connected - When connection is established
 * - plugin:myplugin:data - When data is received
 * - plugin:myplugin:error - On errors
 */
```

### 5. Tool Documentation

Provide clear tool descriptions:

```javascript
this.registerTool('query', {
  description: 'Query the database with SQL',
  parameters: {
    sql: {
      type: 'string',
      description: 'SQL query to execute',
      required: true
    }
  },
  handler: async ({ sql }) => {
    // Implementation
  }
});
```

### 6. Version Compatibility

Test with different versions of Dank:

```json
{
  "peerDependencies": {
    "dank-ai": "^1.0.0 || ^2.0.0"
  }
}
```

### 7. TypeScript Support (Optional)

If you want TypeScript support:

```typescript
import { PluginBase } from 'dank-ai';

export interface MyPluginConfig {
  apiKey: string;
  baseURL?: string;
}

export class MyPlugin extends PluginBase {
  constructor(config: MyPluginConfig) {
    super('myplugin', config);
  }
  // ...
}
```

## Example: Complete Plugin Package

See the example plugins in `docs/plugins/examples/`:
- `postgres-plugin.js` - Database plugin example
- `vector-db-plugin.js` - Vector database example
- `memory-plugin.js` - State management example

## Distribution Checklist

- [ ] Plugin extends `PluginBase`
- [ ] Package name follows `dank-plugin-<name>` convention
- [ ] `dank-plugin` keyword in package.json
- [ ] `dank-ai` as peerDependency
- [ ] Comprehensive README.md
- [ ] Configuration schema validation
- [ ] Error handling
- [ ] Resource cleanup in `onStop()`
- [ ] Event documentation
- [ ] Tool documentation
- [ ] Tested locally
- [ ] Published to npm
- [ ] GitHub repository (optional but recommended)

## Getting Help

- **Documentation**: See `docs/plugins/README.md`
- **Examples**: See `docs/plugins/examples/`
- **Issues**: Open an issue on the Dank repository
- **Community**: Join Dank community discussions

## Next Steps

1. Create your plugin following this guide
2. Test it thoroughly
3. Publish to npm
4. Share it with the community!

Happy plugin development! 🚀

