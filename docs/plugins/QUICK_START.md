# Plugin Quick Start Guide

## For Plugin Users

### Install a Plugin

```bash
npm install dank-plugin-postgres
```

### Use in Your Agent

```javascript
const { createAgent } = require('dank-ai');
const { v4: uuidv4 } = require('uuid');

const agent = createAgent('my-agent')
  .setId(uuidv4())
  .setLLM('openai', {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-3.5-turbo'
  })
  .addPlugin('dank-plugin-postgres', {
    connectionString: process.env.POSTGRES_URL
  });
```

### Find Plugins

- Search npm: `npm search dank-plugin`
- Browse packages with `dank-plugin` keyword
- Check community lists

---

## For Plugin Developers

### 1. Create Plugin Package

```bash
mkdir dank-plugin-myplugin
cd dank-plugin-myplugin
npm init -y
```

### 2. Install Dependencies

```bash
npm install --save-peer dank-ai
npm install --save joi
```

### 3. Create Plugin Code

**package.json:**
```json
{
  "name": "dank-plugin-myplugin",
  "version": "1.0.0",
  "main": "index.js",
  "keywords": ["dank", "dank-plugin", "dank-ai"],
  "peerDependencies": {
    "dank-ai": "^1.0.0"
  }
}
```

**index.js:**
```javascript
const { PluginBase } = require('dank-ai');

class MyPlugin extends PluginBase {
  constructor(config) {
    super('myplugin', config);
  }

  async init() {
    // Register tools and handlers
    this.registerTool('doSomething', {
      description: 'Does something',
      parameters: {
        input: { type: 'string', required: true }
      },
      handler: async ({ input }) => {
        return { result: `Processed: ${input}` };
      }
    });
  }

  async onStart() {
    // Connect to services
  }

  async onStop() {
    // Cleanup
  }
}

module.exports = MyPlugin;
```

### 4. Test Locally

```bash
# In your plugin directory
npm link

# In your Dank project
npm link dank-plugin-myplugin
```

### 5. Publish to npm

```bash
npm publish
```

### 6. Share with Community

- Add to awesome-dank lists
- Post on community forums
- Create GitHub repository

---

## Complete Documentation

- **[Full Plugin Guide](README.md)** - Complete plugin system documentation
- **[Creating Plugins](CREATING_PLUGINS.md)** - Detailed plugin development guide
- **[Examples](examples/)** - Example plugin implementations

