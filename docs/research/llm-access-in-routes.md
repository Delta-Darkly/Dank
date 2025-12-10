# LLM Access in Custom Route Handlers

## Overview

Currently, developers can add custom HTTP endpoints to Dank agents using `.get()`, `.post()`, etc., but these route handlers don't have access to the LLM client. This document proposes solutions to enable LLM calls from within custom route handlers.

## Current Architecture

### How Routes Work Now

1. **Route Definition** (in `dank.config.js`):
```javascript
createAgent('my-agent')
  .get('/api/custom', (req, res) => {
    // Handler function - currently has no access to LLM
    res.json({ message: 'Hello' });
  })
```

2. **Route Serialization** (in `lib/docker/manager.js`):
- Routes are converted to string representations
- Embedded in generated `agent-code/index.js` file
- Routes object structure: `{ '/path': { get: handlerFunction, post: ... } }`

3. **Route Registration** (in `docker/entrypoint.js`):
```javascript
async setupAgentRoutes() {
  Object.entries(this.agentCode.routes).forEach(([path, handlers]) => {
    Object.entries(handlers).forEach(([method, handler]) => {
      this.mainApp[method](path, handler); // Direct registration
    });
  });
}
```

4. **LLM Client**:
- Stored in `this.llmClient` in `AgentRuntime` class
- Initialized in `initializeLLM()` method
- Currently only accessible to `processDirectPrompt()` method

## Proposed Solutions

### Solution 1: Express Request Context (Recommended)

**Concept**: Attach LLM client and other context to Express `req` object via middleware.

**Implementation**:

```javascript
// In docker/entrypoint.js - setupAgentRoutes()
async setupAgentRoutes() {
  // Add middleware to inject context into req object
  this.mainApp.use((req, res, next) => {
    req.agent = {
      llmClient: this.llmClient,
      llmProvider: this.llmProvider,
      llmModel: this.llmModel,
      agentPrompt: this.agentPrompt,
      tools: this.createToolsProxy(),
      callLLM: this.createLLMHelper(),
      agentName: this.agentName,
      agentId: this.agentId
    };
    next();
  });

  // Then register routes as normal
  Object.entries(this.agentCode.routes).forEach(([path, handlers]) => {
    Object.entries(handlers).forEach(([method, handler]) => {
      this.mainApp[method](path, handler);
    });
  });
}
```

**Usage**:

```javascript
createAgent('my-agent')
  .get('/api/analyze', async (req, res) => {
    // Access LLM via req.agent
    const response = await req.agent.llmClient.chat.completions.create({
      model: req.agent.llmModel,
      messages: [
        { role: 'system', content: req.agent.agentPrompt },
        { role: 'user', content: req.body.query }
      ]
    });
    
    res.json({ result: response.choices[0].message.content });
  })
```

**Pros**:
- ✅ Standard Express pattern (familiar to developers)
- ✅ No changes to route definition syntax
- ✅ Context available in all middleware and routes
- ✅ Easy to extend with more context later
- ✅ Works with async/await naturally

**Cons**:
- ❌ Requires developers to know about `req.agent`
- ❌ Slightly more verbose (`req.agent.llmClient` vs `llmClient`)

---

### Solution 2: Helper Function Wrapper

**Concept**: Wrap route handlers to inject context as function parameters.

**Implementation**:

```javascript
// In docker/entrypoint.js
createRouteWrapper(handler) {
  return (req, res, next) => {
    const context = {
      llmClient: this.llmClient,
      llmProvider: this.llmProvider,
      llmModel: this.llmModel,
      agentPrompt: this.agentPrompt,
      tools: this.createToolsProxy(),
      callLLM: this.createLLMHelper(),
      req, // Original Express req
      res, // Original Express res
      next // Original Express next
    };
    
    // Call handler with context
    return handler(context, req, res, next);
  };
}

async setupAgentRoutes() {
  Object.entries(this.agentCode.routes).forEach(([path, handlers]) => {
    Object.entries(handlers).forEach(([method, handler]) => {
      // Wrap handler to inject context
      const wrappedHandler = this.createRouteWrapper(handler);
      this.mainApp[method](path, wrappedHandler);
    });
  });
}
```

**Usage**:

```javascript
createAgent('my-agent')
  .get('/api/analyze', async (context, req, res) => {
    // Context is first parameter
    const response = await context.llmClient.chat.completions.create({
      model: context.llmModel,
      messages: [
        { role: 'system', content: context.agentPrompt },
        { role: 'user', content: req.body.query }
      ]
    });
    
    res.json({ result: response.choices[0].message.content });
  })
```

**Pros**:
- ✅ Clean API - context is explicit parameter
- ✅ No need to access `req.agent`
- ✅ TypeScript-friendly (can type the context parameter)

**Cons**:
- ❌ Breaking change - requires updating all existing route handlers
- ❌ Different signature from standard Express handlers
- ❌ May confuse developers expecting standard Express pattern

---

### Solution 3: Global Context Object

**Concept**: Make LLM client available as a global variable in the agent code module.

**Implementation**:

```javascript
// In docker/entrypoint.js - loadAgentCode()
async loadAgentCode() {
  const codeDir = "/app/agent-code";
  const mainFile = path.join(codeDir, "index.js");
  
  if (fs.existsSync(mainFile)) {
    // Inject global context before requiring
    global.dankAgent = {
      llmClient: this.llmClient,
      llmProvider: this.llmProvider,
      llmModel: this.llmModel,
      agentPrompt: this.agentPrompt,
      tools: this.createToolsProxy(),
      callLLM: this.createLLMHelper(),
      agentName: this.agentName,
      agentId: this.agentId
    };
    
    this.agentCode = require(mainFile);
    
    // Clean up global
    delete global.dankAgent;
  }
}
```

**Usage**:

```javascript
// In dank.config.js - routes are serialized, so we need to reference global
createAgent('my-agent')
  .get('/api/analyze', async (req, res) => {
    // Access via global
    const response = await global.dankAgent.llmClient.chat.completions.create({
      model: global.dankAgent.llmModel,
      messages: [
        { role: 'system', content: global.dankAgent.agentPrompt },
        { role: 'user', content: req.body.query }
      ]
    });
    
    res.json({ result: response.choices[0].message.content });
  })
```

**Pros**:
- ✅ No changes to function signatures
- ✅ Works with existing route handler patterns
- ✅ Simple to understand

**Cons**:
- ❌ Global variables are generally discouraged
- ❌ Harder to test
- ❌ Can cause issues with module caching
- ❌ Not available during route definition (only at runtime)

---

### Solution 4: LLM Helper Method (Hybrid)

**Concept**: Provide a convenient `callLLM()` helper method via `req.agent` that simplifies LLM calls.

**Implementation**:

```javascript
// In docker/entrypoint.js
createLLMHelper() {
  return async (options) => {
    const {
      systemPrompt = this.agentPrompt,
      userPrompt,
      model = this.llmModel,
      temperature = parseFloat(process.env.LLM_TEMPERATURE) || 0.7,
      maxTokens = parseInt(process.env.LLM_MAX_TOKENS) || 1000,
      messages = null // Allow custom messages array
    } = options;

    if (this.llmProvider === 'openai') {
      const messageArray = messages || [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
      
      const completion = await this.llmClient.chat.completions.create({
        model,
        messages: messageArray,
        temperature,
        max_tokens: maxTokens
      });

      return {
        content: completion.choices[0].message.content,
        usage: completion.usage,
        model: completion.model
      };
    }
    
    // Handle other providers...
    throw new Error(`LLM provider ${this.llmProvider} not supported in helper`);
  };
}

async setupAgentRoutes() {
  // Inject context via middleware (Solution 1)
  this.mainApp.use((req, res, next) => {
    req.agent = {
      llmClient: this.llmClient,
      llmProvider: this.llmProvider,
      llmModel: this.llmModel,
      agentPrompt: this.agentPrompt,
      tools: this.createToolsProxy(),
      callLLM: this.createLLMHelper(), // Convenient helper
      agentName: this.agentName,
      agentId: this.agentId
    };
    next();
  });

  // Register routes...
}
```

**Usage**:

```javascript
createAgent('my-agent')
  .get('/api/analyze', async (req, res) => {
    // Simple helper method
    const result = await req.agent.callLLM({
      systemPrompt: 'You are an expert analyst.',
      userPrompt: req.body.query,
      temperature: 0.5
    });
    
    res.json({ result: result.content });
  })
  
  .post('/api/complex', async (req, res) => {
    // Multiple LLM calls
    const research = await req.agent.callLLM({
      systemPrompt: 'You are a researcher.',
      userPrompt: `Research: ${req.body.topic}`
    });
    
    const analysis = await req.agent.callLLM({
      systemPrompt: 'You are an analyst.',
      userPrompt: `Analyze: ${research.content}`
    });
    
    res.json({ 
      research: research.content,
      analysis: analysis.content 
    });
  })
```

**Pros**:
- ✅ Simplifies common LLM call patterns
- ✅ Consistent API across all routes
- ✅ Handles provider differences internally
- ✅ Can add conversation history support later
- ✅ Still allows direct `llmClient` access for advanced use

**Cons**:
- ❌ Additional abstraction layer
- ❌ Need to support all LLM providers in helper

---

### Solution 5: Route Handler Factory

**Concept**: Provide a factory function that creates route handlers with context pre-injected.

**Implementation**:

```javascript
// In lib/agent.js - add new method
createRoute(method, path, handler) {
  // Store handler with metadata
  this.addRoute(method, path, handler);
  return this;
}

// In docker/entrypoint.js - modify route registration
async setupAgentRoutes() {
  const routeContext = {
    llmClient: this.llmClient,
    llmProvider: this.llmProvider,
    llmModel: this.llmModel,
    agentPrompt: this.agentPrompt,
    tools: this.createToolsProxy(),
    callLLM: this.createLLMHelper()
  };

  Object.entries(this.agentCode.routes).forEach(([path, handlers]) => {
    Object.entries(handlers).forEach(([method, handler]) => {
      // Bind context to handler
      const boundHandler = handler.bind(null, routeContext);
      this.mainApp[method](path, (req, res, next) => {
        return boundHandler(req, res, next);
      });
    });
  });
}
```

**Usage**:

```javascript
createAgent('my-agent')
  .get('/api/analyze', (context, req, res) => {
    // Context is bound as first parameter
    return context.callLLM({
      userPrompt: req.body.query
    }).then(result => {
      res.json({ result: result.content });
    });
  })
```

**Pros**:
- ✅ Context is explicit and bound
- ✅ Can be used with both sync and async handlers

**Cons**:
- ❌ Breaking change to handler signature
- ❌ More complex implementation
- ❌ Less intuitive than Express standard

---

## Recommended Solution: Hybrid Approach

**Combine Solution 1 (Request Context) + Solution 4 (Helper Method)**

This provides:
1. **Standard Express pattern** - Context via `req.agent`
2. **Convenient helper** - `req.agent.callLLM()` for common cases
3. **Full access** - `req.agent.llmClient` for advanced use
4. **Extensible** - Easy to add more context later

### Implementation Details

```javascript
// In docker/entrypoint.js

/**
 * Create LLM helper method for convenient LLM calls
 */
createLLMHelper() {
  const self = this;
  return async function callLLM(options = {}) {
    const {
      systemPrompt = self.agentPrompt,
      userPrompt,
      model = self.llmModel,
      temperature = parseFloat(process.env.LLM_TEMPERATURE) || 0.7,
      maxTokens = parseInt(process.env.LLM_MAX_TOKENS) || 1000,
      messages = null,
      conversationHistory = [] // For multi-turn conversations
    } = options;

    if (self.llmProvider === 'openai') {
      const messageArray = messages || [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: userPrompt }
      ];
      
      const completion = await self.llmClient.chat.completions.create({
        model,
        messages: messageArray,
        temperature,
        max_tokens: maxTokens
      });

      return {
        content: completion.choices[0].message.content,
        usage: completion.usage,
        model: completion.model,
        message: completion.choices[0].message
      };
    }
    
    // Add support for other providers...
    throw new Error(`LLM provider ${self.llmProvider} not yet supported in callLLM helper`);
  };
}

/**
 * Setup agent routes with context injection
 */
async setupAgentRoutes() {
  // Inject agent context into all requests
  this.mainApp.use((req, res, next) => {
    req.agent = {
      // LLM access
      llmClient: this.llmClient,
      llmProvider: this.llmProvider,
      llmModel: this.llmModel,
      agentPrompt: this.agentPrompt,
      callLLM: this.createLLMHelper(),
      
      // Tools access
      tools: this.createToolsProxy(),
      
      // Agent metadata
      agentName: this.agentName,
      agentId: this.agentId,
      
      // Conversation history (for multi-turn)
      conversationHistory: [] // Can be extended later
    };
    next();
  });

  // Register user routes
  if (this.agentCode && this.agentCode.routes) {
    Object.entries(this.agentCode.routes).forEach(([path, handlers]) => {
      if (typeof handlers === "object") {
        Object.entries(handlers).forEach(([method, handler]) => {
          if (typeof handler === "function") {
            const lowerMethod = method.toLowerCase();
            if (this.mainApp[lowerMethod]) {
              this.mainApp[lowerMethod](path, handler);
              logger.info(`Registered route: ${method.toUpperCase()} ${path}`);
            }
          }
        });
      }
    });
  }
  
  // ... rest of setup
}
```

### Usage Examples

**Simple LLM call**:
```javascript
createAgent('simple-agent')
  .post('/api/chat', async (req, res) => {
    const result = await req.agent.callLLM({
      userPrompt: req.body.message
    });
    res.json({ response: result.content });
  })
```

**Multi-step workflow**:
```javascript
createAgent('workflow-agent')
  .post('/api/analyze', async (req, res) => {
    // Step 1: Research
    const research = await req.agent.callLLM({
      systemPrompt: 'You are a research expert.',
      userPrompt: `Research: ${req.body.topic}`,
      temperature: 0.3
    });
    
    // Step 2: Analysis
    const analysis = await req.agent.callLLM({
      systemPrompt: 'You are an analyst.',
      userPrompt: `Analyze: ${research.content}`,
      temperature: 0.5
    });
    
    // Step 3: Synthesis
    const synthesis = await req.agent.callLLM({
      systemPrompt: 'You are a synthesizer.',
      userPrompt: `Synthesize:\nResearch: ${research.content}\nAnalysis: ${analysis.content}`
    });
    
    res.json({
      research: research.content,
      analysis: analysis.content,
      synthesis: synthesis.content,
      totalTokens: research.usage.total_tokens + 
                   analysis.usage.total_tokens + 
                   synthesis.usage.total_tokens
    });
  })
```

**Advanced usage with direct LLM client**:
```javascript
createAgent('advanced-agent')
  .post('/api/custom', async (req, res) => {
    // Direct access to LLM client for advanced use cases
    const completion = await req.agent.llmClient.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: req.agent.agentPrompt },
        { role: 'user', content: req.body.prompt },
        { role: 'assistant', content: 'Previous response...' },
        { role: 'user', content: 'Follow-up question' }
      ],
      temperature: 0.7,
      stream: true // Streaming support
    });
    
    // Handle streaming...
    res.json({ result: 'streaming...' });
  })
```

**Using tools between LLM calls**:
```javascript
createAgent('tool-agent')
  .post('/api/enhanced', async (req, res) => {
    // Use tool to get data
    const data = await req.agent.tools.httpRequest({
      url: 'https://api.example.com/data',
      method: 'GET'
    });
    
    // Use LLM to process data
    const result = await req.agent.callLLM({
      userPrompt: `Process this data: ${JSON.stringify(data.data)}`
    });
    
    res.json({ result: result.content });
  })
```

---

## Migration Path

For existing routes, no changes are required - they'll continue to work. New routes can optionally use `req.agent`:

```javascript
// Old route (still works)
.get('/old', (req, res) => {
  res.json({ message: 'Hello' });
})

// New route with LLM access
.post('/new', async (req, res) => {
  const result = await req.agent.callLLM({
    userPrompt: req.body.query
  });
  res.json({ result: result.content });
})
```

---

## Additional Considerations

### Error Handling

```javascript
.post('/api/chat', async (req, res) => {
  try {
    const result = await req.agent.callLLM({
      userPrompt: req.body.message
    });
    res.json({ response: result.content });
  } catch (error) {
    res.status(500).json({ 
      error: 'LLM call failed',
      message: error.message 
    });
  }
})
```

### Rate Limiting

Consider adding rate limiting per route if making multiple LLM calls:

```javascript
.post('/api/expensive', async (req, res) => {
  // This endpoint makes 3 LLM calls - consider rate limiting
  const step1 = await req.agent.callLLM({ ... });
  const step2 = await req.agent.callLLM({ ... });
  const step3 = await req.agent.callLLM({ ... });
  // ...
})
```

### Token Usage Tracking

The helper returns usage information:

```javascript
const result = await req.agent.callLLM({ ... });
console.log('Tokens used:', result.usage.total_tokens);
```

### Conversation History (Future)

The helper can support conversation history for multi-turn conversations:

```javascript
// Store conversation in session/request
req.agent.conversationHistory = [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there!' }
];

const result = await req.agent.callLLM({
  userPrompt: 'What did I say before?',
  conversationHistory: req.agent.conversationHistory
});
```

---

## Summary

**Recommended Approach**: Solution 1 (Request Context) + Solution 4 (Helper Method)

- ✅ Non-breaking - existing routes continue to work
- ✅ Familiar - standard Express pattern
- ✅ Flexible - both helper and direct LLM client access
- ✅ Extensible - easy to add more context
- ✅ Simple - minimal changes to codebase

**Implementation Priority**: High - This enables powerful multi-step workflows in custom routes.

