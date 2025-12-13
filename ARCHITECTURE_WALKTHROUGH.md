# Dank Framework Architecture Walkthrough

This document provides a comprehensive explanation of how the Dank AI Agent framework works, from high-level concepts to implementation details.

## Table of Contents

1. [High-Level Overview](#high-level-overview)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Agent Definition & Configuration](#agent-definition--configuration)
5. [Docker Architecture](#docker-architecture)
6. [Runtime Execution](#runtime-execution)
7. [Event System & Handlers](#event-system--handlers)
8. [Tool System](#tool-system)
9. [CLI Commands](#cli-commands)
10. [NPM Package Structure](#npm-package-structure)
11. [Build & Deployment Process](#build--deployment-process)

---

## High-Level Overview

Dank is a framework that allows you to define AI agents using JavaScript configuration, then automatically containerizes and runs them in Docker. Here's the flow:

1. **Define Agents** → Write a `dank.config.js` file describing your agents
2. **Build Images** → Dank creates Docker images for each agent
3. **Run Containers** → Each agent runs in its own isolated Docker container
4. **Interact** → Agents expose HTTP endpoints for prompting, custom routes, and health checks

### Key Concepts

- **Agent**: A single AI agent with its own LLM configuration, handlers, and runtime
- **Project**: A collection of agents defined in `dank.config.js`
- **Container**: Each agent runs in its own Docker container for isolation
- **Handlers**: Callback functions that respond to events (prompt processing, LLM responses, errors)
- **Tools**: External functions agents can call (HTTP requests, database queries, etc.)

---

## Project Structure

```
Dank/
├── lib/                    # Core library code (what gets published to npm)
│   ├── index.js           # Main export (createAgent, DankAgent, etc.)
│   ├── agent.js           # DankAgent class - agent definition & configuration
│   ├── config.js          # AgentConfig - configuration utilities
│   ├── project.js         # DankProject - project initialization
│   ├── constants.js       # Default configs, supported LLMs, instance types
│   ├── docker/
│   │   └── manager.js     # DockerManager - container orchestration
│   ├── cli/               # CLI command handlers
│   │   ├── run.js         # Start agents
│   │   ├── build.js       # Build Docker images
│   │   ├── status.js      # Check agent status
│   │   └── ...
│   └── tools/             # Tool system
│       ├── index.js       # ToolRegistry, ToolExecutor
│       └── builtin.js     # Built-in tools (HTTP, etc.)
├── docker/                # Docker runtime code (runs inside containers)
│   ├── Dockerfile         # Base image definition
│   ├── entrypoint.js      # Container entrypoint (runs agent code)
│   └── package.json      # Runtime dependencies
├── bin/
│   └── dank               # CLI executable
└── package.json           # NPM package definition
```

---

## Core Components

### 1. DankAgent Class (`lib/agent.js`)

The `DankAgent` class is the heart of agent definition. It uses a fluent/builder pattern:

```javascript
createAgent('my-agent')
  .setId(uuidv4())
  .setLLM('openai', { apiKey: '...', model: 'gpt-4' })
  .setPrompt('You are a helpful assistant')
  .addHandler('request_output', (data) => console.log(data))
```

**Key Methods:**
- `setId(id)` - Sets unique UUIDv4 identifier (required)
- `setLLM(provider, config)` - Configures LLM (OpenAI, Anthropic, etc.)
- `setPrompt(prompt)` - Sets system prompt
- `setPromptingServer(options)` - Enables direct prompting HTTP endpoint
- `addHandler(event, handler)` - Registers event handler
- `addRoute(method, path, handler)` - Adds HTTP route
- `addTool(name, definition)` - Registers a tool
- `finalize()` - Validates and auto-detects features

**Auto-Detection:**
The framework automatically enables features based on usage:
- **Event Handlers**: Enabled when `.addHandler()` is called
- **Direct Prompting**: Enabled when both `.setPrompt()` and `.setLLM()` are set
- **HTTP API**: Enabled when routes are added (`.get()`, `.post()`, etc.)

### 2. DockerManager (`lib/docker/manager.js`)

Manages the entire Docker lifecycle:

**Key Responsibilities:**
- **Docker Installation**: Auto-detects and installs Docker if missing
- **Image Building**: Creates agent-specific Docker images
- **Container Management**: Starts, stops, monitors containers
- **Network Management**: Creates isolated Docker network
- **Resource Limits**: Applies memory/CPU constraints based on instance type

**Build Process:**
1. Creates build context directory (`.build-context-{agent-name}`)
2. Copies project files (excluding `node_modules`, `.git`, etc.)
3. Generates agent code (`index.js`) with handlers and routes serialized
4. Creates Dockerfile that extends base image
5. Builds Docker image using `docker buildx`

**Container Configuration:**
- Memory limits from instance type (small: 512m, medium: 1g, etc.)
- CPU quotas based on instance type
- Port bindings for HTTP/prompting endpoints
- Environment variables (API keys, agent config, etc.)
- Restart policy (on-failure with max retries)

### 3. Agent Runtime (`docker/entrypoint.js`)

This is the code that **runs inside each container**. It's the actual agent execution engine.

**Initialization Flow:**
1. Loads agent code from `/app/agent-code/index.js`
2. Initializes LLM client based on provider (OpenAI, Anthropic, etc.)
3. Sets up event handlers from agent configuration
4. Starts HTTP server (health checks, prompting endpoint, custom routes)
5. Executes agent's `main()` function if provided
6. Keeps container alive with heartbeat mechanism

**HTTP Server:**
- Single Express app handles all endpoints
- `/health` - Health check endpoint
- `/prompt` - Direct prompting endpoint (if enabled)
- Custom routes from agent configuration
- Log streaming via WebSocket

**Event System:**
- Handlers are stored in a `Map<eventName, handlerArray>`
- Supports pattern matching (`tool:*`, `request_output:*`)
- Handlers can modify data by returning new values

---

## Agent Definition & Configuration

### Configuration File Structure

```javascript
// dank.config.js
const { createAgent } = require('dank-ai');

module.exports = {
  name: 'my-project',
  agents: [
    createAgent('assistant')
      .setId(require('uuid').v4())
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-3.5-turbo'
      })
      .setPrompt('You are helpful')
      .setPromptingServer({ port: 3000 })
      .addHandler('request_output', (data) => {
        console.log('Response:', data.response);
      })
  ]
};
```

### Configuration Validation

The `DankAgent` class validates configuration using Joi schemas:
- LLM provider must be in `SUPPORTED_LLMS`
- Agent ID must be valid UUIDv4
- Ports must be in valid range (1000-65535)
- Instance types map to resource limits

### Feature Auto-Detection

When `finalize()` is called, the agent:
1. Validates that ID is set (required)
2. Auto-detects event handlers (checks if handlers exist)
3. Auto-detects direct prompting (checks for prompt + LLM)
4. Auto-detects HTTP API (checks if routes exist)

This means you don't need to explicitly enable/disable features - they're inferred from usage.

---

## Docker Architecture

### Base Image (`docker/Dockerfile`)

The base image provides:
- Node.js runtime (node:22-alpine)
- System dependencies (curl, git, python3, etc.)
- Global npm packages (axios, lodash, uuid)
- Entrypoint script (`entrypoint.js`)
- Runtime dependencies (Express, LLM SDKs, etc.)

**Base Image Tags:**
- `deltadarkly/dank-agent-base:nodejs-20`
- `deltadarkly/dank-agent-base:nodejs-22`
- `deltadarkly/dank-agent-base:latest`

### Agent Images

Each agent gets its own image that:
1. Extends the base image (`FROM deltadarkly/dank-agent-base:nodejs-20`)
2. Copies agent code to `/app/agent-code/`
3. Sets environment variables (for production builds)
4. Runs as non-root user (`dankuser`)

**Image Naming:**
- Local: `dank-agent-{agent-name}`
- Production: `{registry}/{namespace}/{agent-name}:{tag}`

### Container Lifecycle

1. **Build**: DockerManager creates build context and builds image
2. **Create**: Container created with resource limits, ports, env vars
3. **Start**: Container starts, entrypoint.js runs
4. **Initialize**: Agent runtime loads code, sets up LLM, starts server
5. **Run**: Agent's `main()` function executes, handlers active
6. **Monitor**: Health checks, log streaming, status reporting

### Networking

- All agents run on `dank-network` (Docker bridge network)
- Each agent exposes ports (default: 3000)
- Ports are bound to host for external access
- Health checks use same port as main server

---

## Runtime Execution

### Container Entrypoint Flow

When a container starts, `entrypoint.js` runs:

```javascript
// 1. Load environment variables
const agentName = process.env.AGENT_NAME;
const agentId = process.env.AGENT_ID;
const llmProvider = process.env.LLM_PROVIDER;

// 2. Create AgentRuntime instance
const runtime = new AgentRuntime();

// 3. Initialize
await runtime.initialize();
  // - Load agent code from /app/agent-code/index.js
  // - Initialize LLM client
  // - Setup handlers
  // - Start HTTP server
  // - Execute agent.main() if exists

// 4. Keep alive
runtime.keepAlive(); // Prevents container from exiting
```

### Agent Code Structure

The generated agent code looks like:

```javascript
// /app/agent-code/index.js (generated)
module.exports = {
  async main(context) {
    const { llmClient, handlers, tools, config } = context;
    // Your custom agent logic here
  },
  
  handlers: {
    'request_output': [
      (data) => { /* handler function */ }
    ]
  },
  
  routes: {
    '/hello': {
      get: (req, res) => { /* route handler */ }
    }
  }
};
```

### LLM Client Initialization

Based on provider, different SDKs are initialized:

```javascript
switch (llmProvider) {
  case 'openai':
    this.llmClient = new OpenAI({ apiKey, baseURL });
    break;
  case 'anthropic':
    this.llmClient = new Anthropic({ apiKey });
    break;
  // ... other providers
}
```

### Direct Prompting Flow

When `/prompt` endpoint is called:

1. **Request received** → Express route handler
2. **`request_output:start` handler** → Can modify prompt
3. **LLM call** → `llmClient.chat.completions.create()`
4. **`request_output` handler** → Receives response
5. **`request_output:end` handler** → Can modify response
6. **Response sent** → Returns to caller

```javascript
// Simplified flow
app.post('/prompt', async (req, res) => {
  let prompt = req.body.prompt;
  
  // Call start handlers
  const startResult = await emitEvent('request_output:start', { prompt });
  if (startResult?.prompt) prompt = startResult.prompt;
  
  // Call LLM
  const response = await llmClient.chat.completions.create({
    messages: [{ role: 'user', content: prompt }]
  });
  
  // Call output handlers
  await emitEvent('request_output', { prompt, response });
  
  // Call end handlers
  const endResult = await emitEvent('request_output:end', { response });
  if (endResult?.response) response = endResult.response;
  
  res.json({ response });
});
```

---

## Event System & Handlers

### Event Types

**System Events:**
- `output` - General agent output
- `error` - Agent errors
- `start` - Agent started
- `stop` - Agent stopped
- `heartbeat` - Periodic heartbeat (every 30s)

**Prompting Events:**
- `request_output` - LLM response received
- `request_output:start` - Before LLM call (can modify prompt)
- `request_output:end` - After LLM call (can modify response)
- `request_output:error` - Error during prompting

**Tool Events:**
- `tool:{toolName}:call` - Tool execution started
- `tool:{toolName}:response` - Tool execution completed
- `tool:*` - Wildcard for all tool events

### Handler Execution

Handlers are stored in a `Map`:

```javascript
handlers = new Map([
  ['request_output', [handler1, handler2]],
  ['error', [errorHandler]]
]);
```

When an event is emitted:

```javascript
async emitEvent(eventName, data) {
  const handlers = this.handlers.get(eventName) || [];
  const results = [];
  
  for (const handler of handlers) {
    const result = await handler(data);
    if (result) results.push(result);
  }
  
  // Merge results (last handler wins for conflicting keys)
  return Object.assign({}, data, ...results);
}
```

### Handler Return Values

Handlers can modify data by returning objects:

```javascript
.addHandler('request_output:start', (data) => {
  return {
    prompt: `Enhanced: ${data.prompt}` // Modifies prompt
  };
})

.addHandler('request_output:end', (data) => {
  return {
    response: `${data.response}\n\n---\nGenerated by Dank` // Modifies response
  };
})
```

---

## Tool System

### Tool Definition

Tools are registered with the agent:

```javascript
agent.addTool('httpRequest', {
  description: 'Make an HTTP request',
  parameters: {
    url: { type: 'string', required: true },
    method: { type: 'string', default: 'GET' }
  },
  handler: async (params, context) => {
    const response = await axios[params.method](params.url);
    return response.data;
  }
});
```

### Tool Registry

The `ToolRegistry` class:
- Validates tool definitions (Joi schema)
- Stores tools in a `Map`
- Organizes by category
- Generates OpenAI function calling schemas

### Tool Execution

The `ToolExecutor` class:
- Validates parameters before execution
- Supports timeouts and retries
- Caches results if `cacheable: true`
- Tracks execution history and statistics

### Built-in Tools

Common tools are pre-registered:
- `httpRequest` - Make HTTP requests
- `readFile` - Read files from filesystem
- `writeFile` - Write files to filesystem
- More in `lib/tools/builtin.js`

---

## CLI Commands

### `dank run`

**Flow:**
1. Loads `dank.config.js`
2. Initializes DockerManager
3. Cleans up existing containers
4. For each agent:
   - Builds Docker image (unless `--no-build`)
   - Creates container with resource limits
   - Starts container
5. Monitors agents (if not `--detached`)

**Key Code:**
```javascript
// lib/cli/run.js
const dockerManager = new DockerManager();
await dockerManager.initialize();

for (const agent of config.agents) {
  await dockerManager.startAgent(agent, {
    rebuild: !options.noBuild,
    projectDir: projectDir
  });
}
```

### `dank build`

Builds Docker images for agents without starting containers.

### `dank build:prod`

Production build with custom naming:
- `--registry` - Docker registry (ghcr.io, docker.io)
- `--namespace` - Organization/namespace
- `--tag` - Image tag
- `--push` - Push to registry after build
- `--tag-by-agent` - Use agent name as tag

### `dank status`

Shows running container status:
- Container ID
- Uptime
- Health status
- Resource usage

### `dank logs`

Streams container logs using Docker log API.

---

## NPM Package Structure

### Package Exports

When you `require('dank-ai')`, you get:

```javascript
const {
  createAgent,      // Convenience function
  DankAgent,        // Main class
  DankProject,       // Project management
  SUPPORTED_LLMS,   // Constants
  DEFAULT_CONFIG    // Defaults
} = require('dank-ai');
```

### Package Files

The `files` field in `package.json` determines what gets published:

```json
{
  "files": [
    "lib/",
    "bin/",
    "docker/",
    "templates/",
    "README.md"
  ]
}
```

This means:
- `lib/` - Core library code
- `bin/dank` - CLI executable
- `docker/` - Runtime code (runs in containers)
- `templates/` - Project templates

### Binary Installation

The `bin` field creates the `dank` command:

```json
{
  "bin": {
    "dank": "./bin/dank"
  }
}
```

When installed globally (`npm install -g dank-ai`), npm creates a symlink:
- `/usr/local/bin/dank` → `node_modules/dank-ai/bin/dank`

---

## Build & Deployment Process

### Local Development Build

1. **User runs `dank run`**
2. **DockerManager.buildAgentImage()**:
   - Creates `.build-context-{agent-name}/` directory
   - Copies project files (excluding `node_modules`, `.git`)
   - Generates `agent-code/index.js` with handlers/routes serialized
   - Creates Dockerfile:
     ```dockerfile
     FROM deltadarkly/dank-agent-base:nodejs-20
     COPY agent-code/ /app/agent-code/
     USER dankuser
     ```
   - Runs `docker buildx build --tag dank-agent-{name}`
3. **Container created** with environment variables injected
4. **Container started**, entrypoint.js runs

### Production Build

1. **User runs `dank build:prod --registry ghcr.io --namespace myorg --tag v1.0.0 --push`**
2. **Same build process**, but:
   - Image name: `ghcr.io/myorg/{agent-name}:v1.0.0`
   - Environment variables embedded in Dockerfile (for portability)
   - Image pushed to registry after build
3. **Metadata generated** (JSON with image names, ports, resources)

### Environment Variables

**Local builds**: Injected at container creation:
```javascript
const env = AgentConfig.generateContainerEnv(agent);
containerConfig.Env = Object.entries(env).map(([k, v]) => `${k}=${v}`);
```

**Production builds**: Embedded in Dockerfile:
```dockerfile
ENV AGENT_NAME="my-agent"
ENV LLM_PROVIDER="openai"
ENV LLM_API_KEY="..."
```

### Build Context

The build context includes:
- Agent code (generated `index.js` with handlers/routes)
- Project files (from project directory, filtered)
- Dockerfile (generated)

**File Filtering:**
- Excludes: `node_modules`, `.git`, `.env`, `*.log`, `.dank/`
- Includes: Everything else from project directory

---

## Key Design Decisions

### Why Docker?

1. **Isolation**: Each agent runs in its own environment
2. **Resource Limits**: Memory/CPU constraints per agent
3. **Portability**: Same image runs locally and in cloud
4. **Dependency Management**: Base image includes all LLM SDKs

### Why Serialize Handlers?

Handlers are JavaScript functions that can't be serialized to JSON. Solution:
1. Convert functions to strings using `.toString()`
2. Embed in generated `index.js` file
3. Container loads and executes the code

### Why Auto-Detection?

Reduces boilerplate - features enable automatically based on usage:
- Add a handler → Event system enabled
- Add a route → HTTP API enabled
- Set prompt + LLM → Direct prompting enabled

### Why UUIDv4 IDs?

Agents need unique identifiers for:
- Container naming
- Cloud deployment tracking
- Agent registration with Dank Cloud services

---

## Summary

Dank provides a complete framework for defining, building, and running AI agents:

1. **Define** agents in JavaScript config files
2. **Build** Docker images automatically
3. **Run** agents in isolated containers
4. **Interact** via HTTP endpoints and event handlers
5. **Deploy** to cloud with production builds

The framework handles all the complexity of Docker, LLM integration, and container orchestration, letting you focus on defining agent behavior through handlers and tools.

