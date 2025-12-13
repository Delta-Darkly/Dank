# Qdrant Plugin Review & Testing Guide

## Plugin Review Summary

### ✅ What's Correct

1. **Package Structure**: Correct naming (`dank-plugin-qdrant`), proper `package.json` with `dank-ai` as peerDependency
2. **Plugin Base Class**: Properly extends `PluginBase` from `dank-ai`
3. **Export Format**: Correct default export pattern
4. **Configuration**: Proper validation using Joi
5. **Tool Registration**: Comprehensive tool set across three layers
6. **Lifecycle Methods**: Implements `onStart()`, `onStop()`, `onDestroy()`

### ⚠️ Issues Found

#### Issue 1: Tool Registration Timing

**Problem**: Tools are registered in `onStart()` instead of `init()`. According to the plugin system architecture, tools should be registered in `init()` so they're available when the plugin is added to the agent.

**Current Code**:
```javascript
async onStart() {
  // ... client initialization ...
  this.registerAllTools(); // ❌ Too late - tools won't be available during agent setup
}
```

**Why This Matters**: The `PluginManager._registerPlugin()` method calls `plugin.getTools()` during agent finalization (before container starts). If tools are registered in `onStart()`, they won't be available at that time.

**Solution**: Register tools in `init()` but delay client initialization until `onStart()`. Use lazy initialization in tool handlers.

#### Issue 2: Missing `init()` Override

The plugin doesn't override `init()` to register tools. It should register tools there, even if the client isn't ready yet.

### 🔧 Recommended Fixes

#### Fix 1: Move Tool Registration to `init()`

```javascript
async init() {
  // Register tools early (before client is initialized)
  // Tool handlers will check if client is ready when called
  this.registerAllTools();
  return this;
}

async onStart() {
  const config = PluginConfig.injectEnvVars(this.config);
  this.validateConfig(config);
  
  // Initialize Qdrant client
  const clientConfig = {
    url: config.url
  };
  
  if (config.apiKey) {
    clientConfig.apiKey = config.apiKey;
  }
  
  if (config.timeout) {
    clientConfig.timeout = config.timeout;
  }
  
  this.client = new QdrantClient(clientConfig);
  
  // Test connection
  try {
    await this.client.getCollections();
  } catch (error) {
    throw new Error(`Failed to connect to Qdrant: ${error.message}`);
  }
  
  // Initialize layers (now that client is ready)
  this.basicLayer = new BasicLayer(this.client, this.defaultCollection);
  this.comprehensiveLayer = new ComprehensiveLayer(this.client, this.defaultCollection);
  this.focusedLayer = new FocusedLayer(
    this.client,
    this.defaultCollection,
    this.basicLayer,
    this.comprehensiveLayer
  );
  
  this.emit('connected', { url: config.url });
}
```

#### Fix 2: Update Tool Handlers to Check Client Readiness

```javascript
registerAllTools() {
  // ... tool registrations ...
  
  this.registerTool('store', {
    description: 'Store a single vector with metadata in Qdrant',
    parameters: { /* ... */ },
    handler: async (params) => {
      // Check if client is ready
      if (!this.client || !this.basicLayer) {
        throw new Error('Qdrant plugin not initialized. Ensure plugin has started.');
      }
      return await this.basicLayer.storeVector(/* ... */);
    },
    // ...
  });
  
  // Apply same pattern to all tool handlers
}
```

### Alternative Approach: Lazy Layer Initialization

If you want to keep the current structure, you could use lazy initialization:

```javascript
getBasicLayer() {
  if (!this.basicLayer && this.client) {
    this.basicLayer = new BasicLayer(this.client, this.defaultCollection);
  }
  return this.basicLayer;
}

// In tool handlers:
handler: async (params) => {
  const layer = this.getBasicLayer();
  if (!layer) {
    throw new Error('Qdrant plugin not initialized');
  }
  return await layer.storeVector(/* ... */);
}
```

## Testing Guide

### Prerequisites

1. **Qdrant Instance**: You need a running Qdrant instance
   - Local: `docker run -p 6333:6333 qdrant/qdrant`
   - Or use Qdrant Cloud

2. **Dank Framework**: Since this is experimental, you'll need to use `npm link`

### Step 1: Link Dank Framework Locally

```bash
# In the Dank repository root
cd /Users/hishamel-halabi/Documents/GitHub/Dank
npm link
```

This creates a global symlink to your local Dank installation.

### Step 2: Link Qdrant Plugin Locally

```bash
# In the plugin directory
cd /Users/hishamel-halabi/Documents/GitHub/Dank/plugins/dank-plugin-qdrant
npm link
```

### Step 3: Create Test Project

```bash
# Create a test directory
mkdir dank-qdrant-test
cd dank-qdrant-test
npm init -y

# Link both packages
npm link dank-ai
npm link dank-plugin-qdrant

# Install other dependencies
npm install uuid
```

### Step 4: Create Test Configuration

Create `dank.config.js`:

```javascript
const { createAgent } = require('dank-ai');
const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: 'qdrant-test',
  agents: [
    createAgent('test-agent')
      .setId(uuidv4())
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-3.5-turbo'
      })
      .setPrompt('You are a helpful assistant with access to a vector database.')
      .setPromptingServer({ port: 3000 })
      .addPlugin('dank-plugin-qdrant', {
        url: process.env.QDRANT_URL || 'http://localhost:6333',
        apiKey: process.env.QDRANT_API_KEY, // Optional
        defaultCollection: 'test_collection'
      })
      .addHandler('request_output:start', async (data) => {
        console.log('Agent received prompt:', data.prompt);
        
        // Test plugin tool
        try {
          const agent = data.agent; // If available in context
          // Note: Tool access might need to be through agent context
          console.log('Plugin tools available');
        } catch (error) {
          console.error('Tool test error:', error);
        }
      })
  ]
};
```

### Step 5: Set Environment Variables

```bash
export QDRANT_URL="http://localhost:6333"
export QDRANT_API_KEY=""  # Optional, only for Qdrant Cloud
export OPENAI_API_KEY="sk-..."  # Required for LLM
```

### Step 6: Test Plugin Loading

Create a simple test script `test-plugin.js`:

```javascript
const { createAgent } = require('dank-ai');
const { v4: uuidv4 } = require('uuid');

async function testPlugin() {
  console.log('Creating agent with Qdrant plugin...');
  
  const agent = createAgent('test-agent')
    .setId(uuidv4())
    .addPlugin('dank-plugin-qdrant', {
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      defaultCollection: 'test'
    });
  
  // Finalize agent (this will initialize plugins)
  agent.finalize();
  
  // Check if plugin is loaded
  const plugin = agent.getPlugin('qdrant');
  if (plugin) {
    console.log('✅ Plugin loaded successfully');
    console.log('Plugin status:', plugin.status);
    console.log('Plugin tools:', plugin.getTools().length);
    
    // List available tools
    const tools = plugin.getTools();
    console.log('\nAvailable tools:');
    tools.forEach(tool => {
      console.log(`  - ${tool.name}`);
    });
  } else {
    console.log('❌ Plugin not found');
  }
}

testPlugin().catch(console.error);
```

Run it:
```bash
node test-plugin.js
```

### Step 7: Test Tool Execution

Create `test-tools.js`:

```javascript
const { createAgent } = require('dank-ai');
const { v4: uuidv4 } = require('uuid');

async function testTools() {
  const agent = createAgent('test-agent')
    .setId(uuidv4())
    .addPlugin('dank-plugin-qdrant', {
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      defaultCollection: 'test'
    });
  
  agent.finalize();
  
  // Start plugin (this connects to Qdrant)
  const plugin = agent.getPlugin('qdrant');
  if (plugin) {
    await plugin.start();
    console.log('✅ Plugin started');
    
    // Test a tool
    try {
      const result = await agent.useTool('plugin:qdrant:collection:list', {});
      console.log('✅ Collection list tool works:', result);
    } catch (error) {
      console.error('❌ Tool execution failed:', error.message);
    }
  }
}

testTools().catch(console.error);
```

### Step 8: Full Integration Test with Agent

```bash
# Start Qdrant (if not already running)
docker run -d -p 6333:6333 --name qdrant qdrant/qdrant

# Run the agent
dank run
```

Then test the `/prompt` endpoint:

```bash
curl -X POST http://localhost:3000/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello, can you store this in the vector database?"}'
```

### Step 9: Test in Container

To test the full Docker flow:

```bash
# Build and run
dank run

# Check logs
dank logs test-agent

# Test tools via agent handlers
# (Tools should be available in agent code running inside container)
```

## Verification Checklist

- [ ] Plugin loads without errors
- [ ] Tools are registered and available via `agent.getTools()`
- [ ] Plugin connects to Qdrant in `onStart()`
- [ ] Tools can be executed after plugin starts
- [ ] Tools work inside Docker container
- [ ] Error handling works (test with invalid Qdrant URL)
- [ ] Plugin cleanup works in `onStop()`

## Common Issues & Solutions

### Issue: "Plugin not found"
**Solution**: Ensure `npm link` was run for both `dank-ai` and `dank-plugin-qdrant`

### Issue: "Tools not available"
**Solution**: This is the timing issue mentioned above - tools need to be registered in `init()`

### Issue: "Cannot connect to Qdrant"
**Solution**: 
- Check Qdrant is running: `curl http://localhost:6333/collections`
- Verify URL in config
- Check firewall/network settings

### Issue: "Module not found: dank-ai"
**Solution**: The plugin needs `dank-ai` as a peer dependency. Use `npm link dank-ai` in your test project.

## Next Steps

1. Fix the tool registration timing issue
2. Test locally with `npm link`
3. Test in Docker container
4. Add integration tests
5. Update documentation if needed

