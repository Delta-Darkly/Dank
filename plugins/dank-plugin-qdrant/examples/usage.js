/**
 * Example usage of Dank Qdrant Plugin
 * 
 * This demonstrates how to use the plugin at different layers:
 * - Basic: Core vector operations
 * - Comprehensive: Full Qdrant API
 * - Focused: High-level use cases
 */

const { createAgent } = require('dank-ai');
const { v4: uuidv4 } = require('uuid');

// Example: Basic layer usage
async function basicLayerExample() {
  const agent = createAgent('basic-example')
    .setId(uuidv4())
    .addPlugin('dank-plugin-qdrant', {
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      defaultCollection: 'test_collection'
    });

  // Wait for plugin to initialize
  await agent.pluginManager.startAll();

  const qdrantPlugin = agent.getPlugin('qdrant');

  // Store a vector
  await agent.useTool('plugin:qdrant:store', {
    collection: 'test_collection',
    id: 'point1',
    vector: [0.1, 0.2, 0.3, 0.4],
    payload: { name: 'Test Point', category: 'example' }
  });

  // Query similar vectors
  const results = await agent.useTool('plugin:qdrant:query', {
    collection: 'test_collection',
    vector: [0.1, 0.2, 0.3, 0.4],
    limit: 5
  });

  console.log('Query results:', results);
}

// Example: Comprehensive layer usage
async function comprehensiveLayerExample() {
  const agent = createAgent('comprehensive-example')
    .setId(uuidv4())
    .addPlugin('dank-plugin-qdrant', {
      url: process.env.QDRANT_URL || 'http://localhost:6333'
    });

  await agent.pluginManager.startAll();

  // Create a collection
  await agent.useTool('plugin:qdrant:collection:create', {
    name: 'my_collection',
    config: {
      size: 384,
      distance: 'Cosine'
    }
  });

  // List collections
  const collections = await agent.useTool('plugin:qdrant:collection:list', {});
  console.log('Collections:', collections);

  // Advanced search with filter
  const searchResults = await agent.useTool('plugin:qdrant:points:search', {
    collection: 'my_collection',
    vector: [0.1, 0.2, 0.3],
    options: {
      limit: 10,
      filter: {
        must: [
          {
            key: 'category',
            match: { value: 'example' }
          }
        ]
      }
    }
  });

  console.log('Search results:', searchResults);
}

// Example: Focused layer - Chat history
async function chatHistoryExample() {
  const agent = createAgent('chat-example')
    .setId(uuidv4())
    .addPlugin('dank-plugin-qdrant', {
      url: process.env.QDRANT_URL || 'http://localhost:6333'
    });

  await agent.pluginManager.startAll();

  const conversationId = 'conv_123';

  // Store chat messages
  await agent.useTool('plugin:qdrant:chat:store', {
    conversationId,
    content: 'Hello, how are you?',
    metadata: {
      role: 'user',
      timestamp: new Date().toISOString()
    }
  });

  await agent.useTool('plugin:qdrant:chat:store', {
    conversationId,
    content: 'I am doing well, thank you!',
    metadata: {
      role: 'assistant',
      timestamp: new Date().toISOString()
    }
  });

  // Retrieve chat history
  const history = await agent.useTool('plugin:qdrant:chat:history', {
    conversationId,
    limit: 50
  });

  console.log('Chat history:', history);

  // Semantic search in chat history
  const searchResults = await agent.useTool('plugin:qdrant:chat:search', {
    query: 'how are you',
    conversationId,
    limit: 5
  });

  console.log('Search results:', searchResults);
}

// Example: Focused layer - User data
async function userDataExample() {
  const agent = createAgent('user-example')
    .setId(uuidv4())
    .addPlugin('dank-plugin-qdrant', {
      url: process.env.QDRANT_URL || 'http://localhost:6333'
    });

  await agent.pluginManager.startAll();

  const userId = 'user_123';

  // Store user data
  await agent.useTool('plugin:qdrant:user:store', {
    userId,
    data: {
      name: 'John Doe',
      email: 'john@example.com',
      preferences: {
        theme: 'dark',
        language: 'en'
      }
    }
  });

  // Retrieve user data
  const userData = await agent.useTool('plugin:qdrant:user:get', {
    userId
  });

  console.log('User data:', userData);

  // Update user data
  await agent.useTool('plugin:qdrant:user:update', {
    userId,
    data: {
      preferences: {
        theme: 'light',
        language: 'en'
      }
    }
  });

  // Find similar users
  const similarUsers = await agent.useTool('plugin:qdrant:user:similar', {
    userId,
    limit: 5
  });

  console.log('Similar users:', similarUsers);
}

// Example: Semantic search
async function semanticSearchExample() {
  const agent = createAgent('search-example')
    .setId(uuidv4())
    .addPlugin('dank-plugin-qdrant', {
      url: process.env.QDRANT_URL || 'http://localhost:6333'
    });

  await agent.pluginManager.startAll();

  // Text-based semantic search
  const results = await agent.useTool('plugin:qdrant:search:semantic', {
    collection: 'documents',
    queryText: 'machine learning algorithms',
    limit: 10
  });

  console.log('Semantic search results:', results);

  // Hybrid search
  const hybridResults = await agent.useTool('plugin:qdrant:search:hybrid', {
    collection: 'documents',
    queryText: 'neural networks',
    vector: [0.1, 0.2, 0.3], // Optional pre-computed vector
    limit: 10
  });

  console.log('Hybrid search results:', hybridResults);
}

// Run examples (commented out - uncomment to run)
// basicLayerExample();
// comprehensiveLayerExample();
// chatHistoryExample();
// userDataExample();
// semanticSearchExample();

module.exports = {
  basicLayerExample,
  comprehensiveLayerExample,
  chatHistoryExample,
  userDataExample,
  semanticSearchExample
};
