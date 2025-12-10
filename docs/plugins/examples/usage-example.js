/**
 * Example: Using Plugins with Dank Agents
 * 
 * This example shows how to use plugins with Dank agents,
 * including database, vector database, and memory plugins.
 */

const { createAgent } = require('dank-ai');
const { v4: uuidv4 } = require('uuid');

// Example 1: Agent with PostgreSQL plugin
const dbAgent = createAgent('database-agent')
  .setId(uuidv4())
  .setLLM('openai', {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-3.5-turbo'
  })
  .setPrompt('You are a helpful assistant that can query databases.')
  .setInstanceType('small')
  .addPlugin('dank-plugin-postgres', {
    connectionString: process.env.POSTGRES_URL,
    poolSize: 10,
    autoSave: true // Auto-save responses to database
  })
  .addHandler('request_output', async (data) => {
    // Use plugin tool to query database
    const users = await dbAgent.useTool('plugin:postgres:query', {
      sql: 'SELECT * FROM users LIMIT 10',
      params: []
    });
    
    console.log('Users from database:', users);
  });

// Example 2: Agent with Vector Database and Memory plugins
const vectorAgent = createAgent('vector-agent')
  .setId(uuidv4())
  .setLLM('openai', {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4'
  })
  .setPrompt('You are an assistant that can search and store vector embeddings.')
  .setInstanceType('medium')
  .addPlugin('dank-plugin-pinecone', {
    apiKey: process.env.PINECONE_API_KEY,
    environment: 'us-east-1',
    index: 'my-index',
    autoStore: true // Auto-store response embeddings
  })
  .addPlugin('./plugins/memory-plugin.js', {
    persist: true,
    storagePath: './data/memories'
  })
  .addHandler('request_output:start', async (data) => {
    // Search for similar past conversations
    const memories = await vectorAgent.useTool('plugin:memory:recall', {
      conversationId: data.conversationId,
      limit: 5
    });
    
    // Search vector database for similar content
    const embedding = await vectorAgent.useTool('plugin:vectordb:embed', {
      text: data.prompt,
      model: 'text-embedding-ada-002'
    });
    
    const similar = await vectorAgent.useTool('plugin:vectordb:search', {
      vector: embedding,
      topK: 5
    });
    
    // Enhance prompt with context
    return {
      prompt: `${data.prompt}\n\nPrevious conversations: ${JSON.stringify(memories)}\nSimilar content: ${JSON.stringify(similar)}`
    };
  });

// Example 3: Agent with multiple plugins working together
const multiPluginAgent = createAgent('multi-plugin-agent')
  .setId(uuidv4())
  .setLLM('openai', {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4'
  })
  .setPrompt('You are a comprehensive assistant with database, vector search, and memory capabilities.')
  .setInstanceType('large')
  .addPlugins({
    'dank-plugin-postgres': {
      connectionString: process.env.POSTGRES_URL,
      poolSize: 10
    },
    'dank-plugin-pinecone': {
      apiKey: process.env.PINECONE_API_KEY,
      environment: 'us-east-1'
    },
    './plugins/memory-plugin.js': {
      persist: true,
      storagePath: './data/memories'
    }
  })
  .addHandler('request_output:end', async (data) => {
    // Use multiple plugins together
    const postgresPlugin = multiPluginAgent.getPlugin('postgres');
    const memoryPlugin = multiPluginAgent.getPlugin('memory');
    
    // Save to database
    await multiPluginAgent.useTool('plugin:postgres:insert', {
      table: 'conversations',
      data: {
        conversation_id: data.conversationId,
        prompt: data.prompt,
        response: data.response,
        created_at: new Date().toISOString()
      }
    });
    
    // Store in memory
    await memoryPlugin.remember(data.conversationId, data.response, 'assistant');
    
    // Generate and store embedding
    const embedding = await multiPluginAgent.useTool('plugin:vectordb:embed', {
      text: data.response
    });
    
    await multiPluginAgent.useTool('plugin:vectordb:store', {
      id: `conversation:${data.conversationId}`,
      vector: embedding,
      metadata: {
        conversationId: data.conversationId,
        prompt: data.prompt
      }
    });
  });

module.exports = {
  dbAgent,
  vectorAgent,
  multiPluginAgent
};

