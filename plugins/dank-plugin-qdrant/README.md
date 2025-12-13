# Dank Plugin Qdrant

Qdrant vector database plugin for Dank AI agents. Provides a three-layer architecture for interacting with Qdrant:

- **Basic Layer**: Core vector operations (store, query, get, delete)
- **Comprehensive Layer**: Full Qdrant API coverage (collections, points, filters)
- **Focused Layer**: High-level use cases (chat history, user data, semantic search)

## Installation

```bash
npm install dank-plugin-qdrant
```

## Prerequisites

- A running Qdrant instance (local or cloud)
- `dank-ai` package installed in your project

## Quick Start

```javascript
const { createAgent } = require('dank-ai');
const { v4: uuidv4 } = require('uuid');

const agent = createAgent('my-agent')
  .setId(uuidv4())
  .addPlugin('dank-plugin-qdrant', {
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY, // Optional
    defaultCollection: 'default'
  });
```

## Configuration

The plugin accepts the following configuration options:

- `url` (required): Qdrant server URL (e.g., `http://localhost:6333` or `https://your-cluster.qdrant.io`)
- `apiKey` (optional): API key for authentication (required for Qdrant Cloud)
- `defaultCollection` (optional): Default collection name (default: `'default'`)
- `timeout` (optional): Request timeout in milliseconds (default: no timeout)

### Environment Variables

You can use environment variables in configuration:

```javascript
.addPlugin('dank-plugin-qdrant', {
  url: '${QDRANT_URL}',
  apiKey: '${QDRANT_API_KEY}'
})
```

## Architecture

### Three-Layer Design

1. **Basic Layer**: Simple vector operations
   - `store`: Store a vector with metadata
   - `query`: Query similar vectors
   - `get`: Retrieve vector by ID
   - `delete`: Delete vector by ID
   - `batchStore`: Batch store multiple vectors

2. **Comprehensive Layer**: Full Qdrant API
   - Collection management (create, delete, list, info)
   - Advanced point operations (upsert, search, scroll, delete, update)
   - Filter operations (build filters, filtered search)

3. **Focused Layer**: High-level use cases
   - Chat history management
   - User data management
   - Semantic search utilities

## Usage Examples

### Basic Layer - Store and Query Vectors

```javascript
// Store a vector
await agent.useTool('plugin:qdrant:store', {
  collection: 'my_collection',
  id: 'point1',
  vector: [0.1, 0.2, 0.3, 0.4],
  payload: { name: 'Test Point', category: 'example' }
});

// Query similar vectors
const results = await agent.useTool('plugin:qdrant:query', {
  collection: 'my_collection',
  vector: [0.1, 0.2, 0.3, 0.4],
  limit: 10
});
```

### Comprehensive Layer - Collection Management

```javascript
// Create a collection
await agent.useTool('plugin:qdrant:collection:create', {
  name: 'documents',
  config: {
    size: 384,
    distance: 'Cosine'
  }
});

// List all collections
const collections = await agent.useTool('plugin:qdrant:collection:list', {});

// Advanced search with filter
const results = await agent.useTool('plugin:qdrant:points:search', {
  collection: 'documents',
  vector: [0.1, 0.2, 0.3],
  options: {
    limit: 10,
    filter: {
      must: [
        {
          key: 'category',
          match: { value: 'article' }
        }
      ]
    }
  }
});
```

### Focused Layer - Chat History

```javascript
// Store a chat message
await agent.useTool('plugin:qdrant:chat:store', {
  conversationId: 'conv_123',
  content: 'Hello, how are you?',
  metadata: {
    role: 'user',
    timestamp: new Date().toISOString()
  }
});

// Retrieve conversation history
const history = await agent.useTool('plugin:qdrant:chat:history', {
  conversationId: 'conv_123',
  limit: 50
});

// Semantic search in chat history
const searchResults = await agent.useTool('plugin:qdrant:chat:search', {
  query: 'how are you',
  conversationId: 'conv_123',
  limit: 10
});
```

### Focused Layer - User Data

```javascript
// Store user data
await agent.useTool('plugin:qdrant:user:store', {
  userId: 'user_123',
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
  userId: 'user_123'
});

// Update user data
await agent.useTool('plugin:qdrant:user:update', {
  userId: 'user_123',
  data: {
    preferences: {
      theme: 'light'
    }
  }
});

// Find similar users
const similarUsers = await agent.useTool('plugin:qdrant:user:similar', {
  userId: 'user_123',
  limit: 10
});
```

### Semantic Search

```javascript
// Text-based semantic search
const results = await agent.useTool('plugin:qdrant:search:semantic', {
  collection: 'documents',
  queryText: 'machine learning algorithms',
  limit: 10
});

// Hybrid search (text + vector)
const hybridResults = await agent.useTool('plugin:qdrant:search:hybrid', {
  collection: 'documents',
  queryText: 'neural networks',
  vector: [0.1, 0.2, 0.3], // Optional pre-computed vector
  limit: 10
});
```

## Available Tools

### Basic Layer Tools
- `plugin:qdrant:store` - Store a vector
- `plugin:qdrant:query` - Query similar vectors
- `plugin:qdrant:get` - Get vector by ID
- `plugin:qdrant:delete` - Delete vector by ID
- `plugin:qdrant:batchStore` - Batch store vectors

### Comprehensive Layer Tools
- `plugin:qdrant:collection:create` - Create collection
- `plugin:qdrant:collection:delete` - Delete collection
- `plugin:qdrant:collection:list` - List collections
- `plugin:qdrant:collection:info` - Get collection info
- `plugin:qdrant:points:upsert` - Upsert points
- `plugin:qdrant:points:search` - Advanced search
- `plugin:qdrant:points:scroll` - Scroll through points
- `plugin:qdrant:points:delete` - Delete points by filter
- `plugin:qdrant:search:filter` - Search with filter

### Focused Layer Tools
- `plugin:qdrant:chat:store` - Store chat message
- `plugin:qdrant:chat:history` - Get chat history
- `plugin:qdrant:chat:search` - Search chat history
- `plugin:qdrant:chat:delete` - Delete conversation
- `plugin:qdrant:user:store` - Store user data
- `plugin:qdrant:user:get` - Get user data
- `plugin:qdrant:user:update` - Update user data
- `plugin:qdrant:user:similar` - Find similar users
- `plugin:qdrant:search:semantic` - Semantic search
- `plugin:qdrant:search:similar` - Find similar vectors
- `plugin:qdrant:search:hybrid` - Hybrid search

## Use Cases

### 1. Chat History Management

Store and retrieve conversation history to maintain context across sessions:

```javascript
// Store messages as they come in
await agent.useTool('plugin:qdrant:chat:store', {
  conversationId: conversationId,
  content: message,
  metadata: { role: 'user', timestamp: new Date().toISOString() }
});

// Retrieve history before responding
const history = await agent.useTool('plugin:qdrant:chat:history', {
  conversationId: conversationId,
  limit: 20
});
```

### 2. User Data Personalization

Store user preferences and retrieve them to tailor responses:

```javascript
// Store user data
await agent.useTool('plugin:qdrant:user:store', {
  userId: userId,
  data: { preferences: { language: 'en', theme: 'dark' } }
});

// Retrieve before generating response
const userData = await agent.useTool('plugin:qdrant:user:get', {
  userId: userId
});
```

### 3. Semantic Search

Enable semantic search over documents, knowledge bases, or chat history:

```javascript
// Search for relevant information
const results = await agent.useTool('plugin:qdrant:search:semantic', {
  collection: 'knowledge_base',
  queryText: userQuery,
  limit: 5
});
```

## Notes

- The plugin uses a simple hash-based embedding function for text by default. In production, you should use a proper embedding model (OpenAI, sentence-transformers, etc.) and pass the embedding to the tools.
- All tools are async and return promises.
- The plugin automatically creates collections if they don't exist when storing data (for focused layer features).
- Vector dimensions should match your collection configuration.

## License

MIT

