# Testing Guide for dank-plugin-qdrant

## Quick Summary

The Qdrant plugin has been reviewed and fixed. The main issue was **tool registration timing** - tools were being registered in `onStart()` instead of `init()`. This has been fixed.

## How to Test Locally with npm link

Since the Dank CLI is experimental and not yet published to npm, you need to use `npm link` to test locally.

### Step 1: Link Dank Framework

```bash
# In the Dank repository root
cd /Users/hishamel-halabi/Documents/GitHub/Dank
npm link
```

This creates a global symlink so other projects can use your local Dank installation.

### Step 2: Link Qdrant Plugin

```bash
# In the plugin directory
cd /Users/hishamel-halabi/Documents/GitHub/Dank/plugins/dank-plugin-qdrant
npm link
```

### Step 3: Create Test Project

```bash
# Create a new directory for testing
mkdir ~/dank-qdrant-test
cd ~/dank-qdrant-test
npm init -y

# Link both packages
npm link dank-ai
npm link dank-plugin-qdrant

# Install other dependencies
npm install uuid
```

### Step 4: Start Qdrant (if not running)

```bash
# Using Docker
docker run -d -p 6333:6333 --name qdrant qdrant/qdrant

# Verify it's running
curl http://localhost:6333/collections
```

### Step 5: Create Test Configuration

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
  ]
};
```

### Step 6: Set Environment Variables

```bash
export QDRANT_URL="http://localhost:6333"
export OPENAI_API_KEY="sk-your-key-here"
```

### Step 7: Test Plugin Loading

Create `test-loading.js`:

```javascript
const { createAgent } = require('dank-ai');
const { v4: uuidv4 } = require('uuid');

async function test() {
  console.log('Creating agent with Qdrant plugin...');
  
  const agent = createAgent('test-agent')
    .setId(uuidv4())
    .addPlugin('dank-plugin-qdrant', {
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      defaultCollection: 'test'
    });
  
  // Finalize agent (this initializes plugins)
  agent.finalize();
  
  // Check if plugin is loaded
  const plugin = agent.getPlugin('qdrant');
  if (plugin) {
    console.log('✅ Plugin loaded successfully');
    console.log('Plugin status:', plugin.status);
    console.log('Plugin tools count:', plugin.getTools().length);
    
    // List first 5 tools
    const tools = plugin.getTools();
    console.log('\nFirst 5 tools:');
    tools.slice(0, 5).forEach(tool => {
      console.log(`  - ${tool.name}`);
    });
  } else {
    console.log('❌ Plugin not found');
    process.exit(1);
  }
}

test().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
```

Run it:
```bash
node test-loading.js
```

**Expected output:**
```
Creating agent with Qdrant plugin...
✅ Plugin loaded successfully
Plugin status: initialized
Plugin tools count: 20+

First 5 tools:
  - plugin:qdrant:store
  - plugin:qdrant:query
  - plugin:qdrant:get
  - plugin:qdrant:delete
  - plugin:qdrant:batchStore
```

### Step 8: Test Tool Execution

Create `test-tools.js`:

```javascript
const { createAgent } = require('dank-ai');
const { v4: uuidv4 } = require('uuid');

async function test() {
  const agent = createAgent('test-agent')
    .setId(uuidv4())
    .addPlugin('dank-plugin-qdrant', {
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      defaultCollection: 'test'
    });
  
  agent.finalize();
  
  // Start plugin (connects to Qdrant)
  const plugin = agent.getPlugin('qdrant');
  if (!plugin) {
    console.log('❌ Plugin not found');
    process.exit(1);
  }
  
  await plugin.start();
  console.log('✅ Plugin started');
  
  // Test collection list tool
  try {
    const result = await agent.useTool('plugin:qdrant:collection:list', {});
    console.log('✅ Collection list tool works');
    console.log('Collections:', result);
  } catch (error) {
    console.error('❌ Tool execution failed:', error.message);
    process.exit(1);
  }
  
  // Test storing a vector
  try {
    const storeResult = await agent.useTool('plugin:qdrant:store', {
      collection: 'test_collection',
      id: 'test1',
      vector: [0.1, 0.2, 0.3, 0.4],
      payload: { name: 'Test Point' }
    });
    console.log('✅ Store tool works:', storeResult);
  } catch (error) {
    console.error('❌ Store tool failed:', error.message);
    // This might fail if collection doesn't exist - that's okay for testing
  }
}

test().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
```

Run it:
```bash
node test-tools.js
```

### Step 9: Test Full Agent with Docker

```bash
# Run the agent
dank run

# In another terminal, test the prompt endpoint
curl -X POST http://localhost:3000/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello, can you list the collections in the vector database?"}'
```

### Step 10: Check Logs

```bash
# View agent logs
dank logs test-agent

# Follow logs in real-time
dank logs test-agent --follow
```

## Verification Checklist

- [ ] Plugin loads without errors (`test-loading.js` passes)
- [ ] Tools are registered (20+ tools available)
- [ ] Plugin connects to Qdrant when started
- [ ] Tools can be executed after plugin starts
- [ ] Tools work inside Docker container
- [ ] Error handling works (test with invalid Qdrant URL)

## Common Issues

### "Cannot find module 'dank-ai'"
**Solution**: Run `npm link dank-ai` in your test project directory

### "Plugin not found"
**Solution**: 
1. Ensure `npm link` was run in both Dank root and plugin directory
2. Ensure `npm link dank-ai` and `npm link dank-plugin-qdrant` were run in test project

### "Qdrant plugin not initialized"
**Solution**: This means tools are being called before `plugin.start()` is called. Ensure the plugin is started before using tools.

### "Failed to connect to Qdrant"
**Solution**:
- Check Qdrant is running: `curl http://localhost:6333/collections`
- Verify URL in config matches your Qdrant instance
- For Qdrant Cloud, ensure API key is set

## Next Steps After Testing

1. If all tests pass, the plugin is ready for use
2. Consider adding more comprehensive integration tests
3. Update documentation with any findings
4. Prepare for npm publication when ready

