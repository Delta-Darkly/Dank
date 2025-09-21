# 🚀 Dank Agent Service

**Docker-based AI Agent Orchestration Platform**

Dank is a powerful Node.js service that allows you to define, deploy, and manage AI agents using Docker containers. Each agent runs in its own isolated environment with configurable resources, LLM providers, and custom handlers. Built for production with comprehensive CI/CD support and Docker registry integration.

## ✨ Features

- **🤖 Multi-LLM Support**: OpenAI, Anthropic, Cohere, Ollama, and custom providers
- **🐳 Docker Orchestration**: Isolated agent containers with resource management  
- **⚡ Easy Configuration**: Define agents with simple JavaScript configuration
- **📊 Real-time Monitoring**: Built-in health checks and status monitoring
- **🔧 Flexible Handlers**: Custom event handlers for agent outputs and errors
- **🎯 CLI Interface**: Powerful command-line tools for agent management
- **🏗️ Production Builds**: Build and push Docker images to registries with custom naming
- **🔄 CI/CD Ready**: Seamless integration with GitHub Actions, GitLab CI, and other platforms

## 🚀 Quick Start

### Prerequisites
Before you begin, make sure you have:
- **Node.js 16+** installed
- **Docker Desktop** or **Docker Engine** (will be installed automatically if missing)
- **API keys** for your chosen LLM provider(s)

> **🆕 Auto-Docker Installation**: Dank will automatically detect, install, and start Docker if it's not available on your system. No manual setup required!

### 1. Install Dank globally
```bash
npm install -g dank-ai
```

### 2. Initialize a new project
```bash
# Create and navigate to your project directory
mkdir my-agent-project
cd my-agent-project

# Initialize Dank project
dank init my-agent-project
```

This creates:
```
my-agent-project/
├── dank.config.js         # Your agent configuration
├── agents/                # Custom agent code (optional)
│   └── example-agent.js
└── .dank/                 # Generated files
    └── project.yaml
```

### 3. Set up environment variables
Create a `.env` file or export environment variables:

```bash
# For OpenAI
export OPENAI_API_KEY="your-openai-api-key"

# For Anthropic
export ANTHROPIC_API_KEY="your-anthropic-api-key"

# For Cohere
export COHERE_API_KEY="your-cohere-api-key"
```

### 4. Configure your agents
Edit `dank.config.js` to define your agents:

```javascript
const { createAgent } = require('dank');

module.exports = {
  name: 'my-agent-project',
  
  agents: [
    createAgent('assistant')
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-3.5-turbo',
        temperature: 0.7
      })
      .setPrompt('You are a helpful assistant that responds with enthusiasm!')
      .setResources({
        memory: '512m',
        cpu: 1
      })
      .addHandler('output', (data) => {
        console.log('Assistant says:', data);
      })
  ]
};
```

### 5. Build Docker images (optional)
```bash
# Build agent images (base image is pulled automatically)
dank build

# Or build only the base image
dank build --base
```

### 6. Start your agents
```bash
# Start all agents
dank run

# Or run in detached mode (background)
dank run --detached
```

### 7. Monitor your agents
```bash
# Check agent status
dank status

# Watch status in real-time
dank status --watch

# View agent logs
dank logs assistant

# Follow logs in real-time
dank logs assistant --follow
```

### 8. Build for production (optional)
```bash
# Build production images with custom naming
dank build:prod

# Build and push to registry
dank build:prod --push

# Build with custom tag and registry
dank build:prod --tag v1.0.0 --registry ghcr.io --namespace myorg --push
```

## 📋 CLI Commands

### Core Commands
```bash
dank run                    # Start all defined agents
dank status                 # Show agent status  
dank stop [agents...]       # Stop specific agents
dank stop --all            # Stop all agents
dank logs [agent]          # View agent logs
```

### Management Commands  
```bash
dank init [name]           # Initialize new project
dank build                 # Build Docker images
dank build:prod            # Build agent images with custom naming
dank clean                 # Clean up Docker resources
```

### Agent Image Build Commands
```bash
dank build:prod                    # Build with agent image config
dank build:prod --push             # Build and push to registry (CLI only)
dank build:prod --tag v1.0.0       # Build with custom tag
dank build:prod --registry ghcr.io # Build for specific registry
dank build:prod --force            # Force rebuild without cache
```

> **💡 Push Control**: The `--push` option is the only way to push images to registries. Agent configuration defines naming, CLI controls pushing.

### Advanced Options
```bash
dank run --detached        # Run in background
dank run --no-build        # Skip rebuilding images (default is to rebuild)
dank run --pull            # Pull latest base image before building
dank status --watch        # Live status monitoring
dank logs --follow         # Follow log output
```

### Production Build Options
```bash
dank build:prod --push                    # Build and push to registry
dank build:prod --tag v1.0.0             # Build with custom tag
dank build:prod --registry ghcr.io       # Build for GitHub Container Registry
dank build:prod --namespace mycompany    # Build with custom namespace
dank build:prod --force                  # Force rebuild without cache
```

## 🤖 Agent Configuration

### Basic Agent Setup
```javascript
const agent = createAgent('my-agent')
  .setLLM('openai', {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
    temperature: 0.8
  })
  .setPrompt('Your system prompt here')
  .setPromptingServer({
    protocol: 'http',
    port: 3000,
    authentication: false,
    maxConnections: 50
  })
  .setResources({
    memory: '1g',
    cpu: 2,
    timeout: 60000
  });
```

### Supported LLM Providers

#### OpenAI
```javascript
.setLLM('openai', {
  apiKey: 'your-api-key',
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 1000
})
```

#### Anthropic
```javascript
.setLLM('anthropic', {
  apiKey: 'your-api-key', 
  model: 'claude-3-sonnet-20240229',
  maxTokens: 1000
})
```

#### Ollama (Local)
```javascript
.setLLM('ollama', {
  baseURL: 'http://localhost:11434',
  model: 'llama2'
})
```

#### Cohere
```javascript
.setLLM('cohere', {
  apiKey: 'your-api-key',
  model: 'command',
  temperature: 0.7
})
```

#### Hugging Face
```javascript
.setLLM('huggingface', {
  apiKey: 'your-api-key',
  model: 'microsoft/DialoGPT-medium'
})
```

#### Custom Provider
```javascript
.setLLM('custom', {
  baseURL: 'https://api.your-provider.com',
  apiKey: 'your-key',
  model: 'your-model'
})
```

### Event Handlers

Dank provides a comprehensive event system with three main sources of events. Each event handler follows specific naming patterns for maximum flexibility and control.

> **🆕 Auto-Detection**: Dank automatically enables communication features based on your usage:
> - **Event Handlers**: Auto-enabled when you add `.addHandler()` calls
> - **Direct Prompting**: Auto-enabled when you use `.setPrompt()` + `.setLLM()`
> - **HTTP API**: Auto-enabled when you add routes with `.get()`, `.post()`, etc.

#### 🎯 **Event Handler Patterns**

##### **1. Direct Prompting Events** (`request_output`)
Events triggered when agents receive and respond to direct prompts via WebSocket or HTTP:

```javascript
agent
  // Main LLM response event
  .addHandler('request_output', (data) => {
    console.log('LLM Response:', {
      prompt: data.prompt,                    // Original prompt
      finalPrompt: data.finalPrompt,          // Modified prompt (if changed)
      response: data.response,                // LLM response
      conversationId: data.conversationId,
      processingTime: data.processingTime,
      promptModified: data.promptModified,    // Boolean: was prompt modified?
      usage: data.usage,
      model: data.model
    });
  })
  
  // Lifecycle events with modification capabilities
  .addHandler('request_output:start', (data) => {
    console.log('Processing prompt:', data.conversationId);
    console.log('Original prompt:', data.prompt);
    
    // ✨ MODIFY PROMPT: Return modified data to change the prompt sent to LLM
    const enhancedPrompt = `Context: You are a helpful assistant. Please be concise and friendly.\n\nUser Question: ${data.prompt}`;
    
    return {
      prompt: enhancedPrompt  // This will replace the original prompt
    };
  })
  
  .addHandler('request_output:end', (data) => {
    console.log('Completed in:', data.processingTime + 'ms');
    console.log('Original response:', data.response.substring(0, 50) + '...');
    
    // ✨ MODIFY RESPONSE: Return modified data to change the response sent to caller
    const enhancedResponse = `${data.response}\n\n---\n💡 This response was generated by Dank Framework`;
    
    return {
      response: enhancedResponse  // This will replace the original response
    };
  })
  
  .addHandler('request_output:error', (data) => {
    console.error('Prompt processing failed:', data.error);
  });
```

**🔄 Event Modification Capabilities:**

- **`request_output:start`**: Can modify the prompt before it's sent to the LLM by returning an object with a `prompt` property
- **`request_output:end`**: Can modify the response before it's sent back to the caller by returning an object with a `response` property
- **Event Data**: All events include both original and final values, plus modification flags for tracking changes

**⏱️ Event Flow Timeline:**

1. **`request_output:start`** → Fires when prompt is received
   - Can modify prompt before LLM processing
   - Contains: `{ prompt, conversationId, context, timestamp }`

2. **LLM Processing** → The (potentially modified) prompt is sent to the LLM

3. **`request_output`** → Fires after LLM responds successfully
   - Contains: `{ prompt, finalPrompt, response, conversationId, promptModified, ... }`

4. **`request_output:end`** → Fires after `request_output`, before sending to caller
   - Can modify response before returning to client
   - Contains: `{ prompt, finalPrompt, response, conversationId, promptModified, success, ... }`

5. **Response Sent** → The (potentially modified) response is sent back to the caller

**💡 Practical Examples:**

```javascript
// Example 1: Add context and formatting to prompts
.addHandler('request_output:start', (data) => {
  // Add system context and format the user's question
  const enhancedPrompt = `System: You are a helpful AI assistant. Be concise and professional.

User Question: ${data.prompt}

Please provide a clear, helpful response.`;
  
  return { prompt: enhancedPrompt };
})

// Example 2: Add metadata and branding to responses
.addHandler('request_output:end', (data) => {
  // Add footer with metadata and branding
  const brandedResponse = `${data.response}

---
🤖 Generated by Dank Framework Agent
⏱️ Processing time: ${data.processingTime}ms
🆔 Conversation: ${data.conversationId}`;
  
  return { response: brandedResponse };
})

// Example 3: Log and analyze all interactions
.addHandler('request_output', (data) => {
  // Log for analytics
  console.log('Interaction logged:', {
    originalPrompt: data.prompt,
    modifiedPrompt: data.finalPrompt,
    wasModified: data.promptModified,
    responseLength: data.response.length,
    model: data.model,
    usage: data.usage
  });
})
```

##### **2. Tool Events** (`tool:*`)
Events triggered by tool usage, following the pattern `tool:<tool-name>:<action>:<specifics>`:

```javascript
agent
  // HTTP Server Tool Events
  .addHandler('tool:http-server:*', (data) => {
    // Listen to ALL HTTP server events
    console.log('HTTP Activity:', data.type, data.method, data.path);
  })
  
  .addHandler('tool:http-server:call', (data) => {
    // All incoming HTTP requests
    console.log('Request:', data.method, data.path, data.body);
  })
  
  .addHandler('tool:http-server:response', (data) => {
    // All HTTP responses
    console.log('Response:', data.statusCode, data.processingTime);
  })
  
  .addHandler('tool:http-server:call:post', (data) => {
    // Only POST requests
    console.log('POST Request:', data.path, data.body);
  })
  
  .addHandler('tool:http-server:response:get', (data) => {
    // Only GET responses
    console.log('GET Response:', data.path, data.responseData);
  })
  
  .addHandler('tool:http-server:error', (data) => {
    // HTTP server errors
    console.error('HTTP Error:', data.error);
  });
```

**Tool Event Pattern Structure:**
- `tool:<tool-name>:*` - All events for a specific tool
- `tool:<tool-name>:call` - Tool invocation/input events
- `tool:<tool-name>:response` - Tool output/result events
- `tool:<tool-name>:call:<method>` - Specific method calls (e.g., POST, GET)
- `tool:<tool-name>:response:<method>` - Specific method responses
- `tool:<tool-name>:error` - Tool-specific errors

##### **3. System Events** (Legacy/System)
Traditional system-level events:

```javascript
agent
  .addHandler('output', (data) => {
    console.log('General output:', data);
  })
  
  .addHandler('error', (error) => {
    console.error('System error:', error);
  })
  
  .addHandler('heartbeat', () => {
    console.log('Agent heartbeat');
  })
  
  .addHandler('start', () => {
    console.log('Agent started');
  })
  
  .addHandler('stop', () => {
    console.log('Agent stopped');
  });
```

#### 🔥 **Advanced Event Patterns**

**Wildcard Matching:**
```javascript
// Listen to all tool events
.addHandler('tool:*', (data) => {
  console.log('Any tool activity:', data);
})

// Listen to all HTTP responses
.addHandler('tool:http-server:response:*', (data) => {
  console.log('Any HTTP response:', data);
})

// Listen to all request outputs
.addHandler('request_output:*', (data) => {
  console.log('Any request event:', data);
})
```

**Multiple Handlers:**
```javascript
// Multiple handlers for the same event
agent
  .addHandler('request_output', (data) => {
    // Log to console
    console.log('Response:', data.response);
  })
  .addHandler('request_output', (data) => {
    // Save to database
    saveToDatabase(data);
  })
  .addHandler('request_output', (data) => {
    // Send to analytics
    trackAnalytics(data);
  });
```

#### 📊 **Event Data Structures**

**Request Output Event Data:**
```javascript
{
  prompt: "User's input prompt",
  response: "LLM's response",
  conversationId: "unique-conversation-id",
  context: { protocol: "websocket", clientId: "..." },
  usage: { total_tokens: 150, prompt_tokens: 50, completion_tokens: 100 },
  model: "gpt-3.5-turbo",
  processingTime: 1250,
  timestamp: "2024-01-15T10:30:00.000Z"
}
```

**Tool HTTP Event Data:**
```javascript
{
  requestId: "unique-request-id",
  method: "POST",
  path: "/api/chat",
  headers: { "content-type": "application/json" },
  body: { message: "Hello" },
  query: {},
  params: {},
  statusCode: 200,
  responseData: { response: "Hi there!" },
  processingTime: 45,
  timestamp: "2024-01-15T10:30:00.000Z"
}
```

#### 🎛️ **Communication Method Control**

Each communication method can be enabled/disabled independently:

```javascript
createAgent('flexible-agent')
  // Configure direct prompting with specific settings
  .setPromptingServer({ 
    protocol: 'websocket',
    port: 3000,
    authentication: false,
    maxConnections: 50
  })
  .disableDirectPrompting() // Disable if needed
  
  // Enable HTTP API
  .enableHttp({ port: 3001 })
  
  // Listen to direct prompting events only
  .addHandler('request_output', (data) => {
    console.log('WebSocket response:', data.response);
  })
  
  // HTTP events will fire when routes are added
  .get('/api/status', (req, res) => {
    res.json({ status: 'ok' });
  })
  .addHandler('tool:http-server:*', (data) => {
    console.log('HTTP activity:', data);
  });
```

### Resource Management

Configure container resources:

```javascript
.setResources({
  memory: '512m',        // Memory limit (512m, 1g, etc.)
  cpu: 1,                // CPU allocation (0.5, 1, 2, etc.)  
  timeout: 30000,        // Request timeout in ms
  maxRestarts: 3         // Max container restarts
})
```

### Agent Image Configuration

Configure Docker image naming and registry settings for agent builds:

```javascript
// Complete agent image configuration
.setAgentImageConfig({
  registry: 'ghcr.io',           // Docker registry URL
  namespace: 'mycompany',        // Organization/namespace
  tag: 'v1.0.0'                 // Image tag
})
```

#### 🏗️ **Agent Image Build Workflow**

The agent image build feature allows you to create properly tagged Docker images for deployment to container registries. This is essential for:

- **CI/CD Pipelines**: Automated builds and deployments
- **Container Orchestration**: Kubernetes, Docker Swarm, etc.
- **Multi-Environment Deployments**: Dev, staging, production
- **Version Management**: Semantic versioning with tags

> **📝 Note**: Image pushing is controlled exclusively by the CLI `--push` option. Agent configuration only defines image naming (registry, namespace, tag) - not push behavior.

#### 📋 **Complete Agent Image Example**

```javascript
const { createAgent } = require('dank');

module.exports = {
  name: 'production-system',
  
  agents: [
    // Production-ready customer service agent
    createAgent('customer-service')
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4',
        temperature: 0.7
      })
      .setPrompt('You are a professional customer service representative.')
      .setPromptingServer({
        protocol: 'http',
        port: 3000,
        authentication: true,
        maxConnections: 100
      })
      .setResources({
        memory: '1g',
        cpu: 2,
        timeout: 60000
      })
      // Agent image configuration
      .setAgentImageConfig({
        registry: 'ghcr.io',
        namespace: 'mycompany',
        tag: 'v1.2.0'
      })
      .addHandler('request_output', (data) => {
        // Log for production monitoring
        console.log(`[${new Date().toISOString()}] Customer Service: ${data.response.substring(0, 100)}...`);
      }),

    // Data processing agent with different registry
    createAgent('data-processor')
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4',
        temperature: 0.1
      })
      .setPrompt('You are a data analysis expert.')
      .setPromptingServer({
        protocol: 'http',
        port: 3001,
        authentication: false,
        maxConnections: 50
      })
      .setResources({
        memory: '2g',
        cpu: 4,
        timeout: 120000
      })
      // Different agent image configuration
      .setAgentImageConfig({
        registry: 'docker.io',
        namespace: 'mycompany',
        tag: 'latest'
      })
      .addHandler('request_output', (data) => {
        console.log(`[Data Processor] Analysis completed: ${data.processingTime}ms`);
      })
  ]
};
```

#### 🚀 **Production Build Commands**

**Basic Production Build:**
```bash
# Build all agents with their image configuration
dank build:prod

# Build with custom configuration file
dank build:prod --config production.config.js
```

**Registry and Tagging:**
```bash
# Build with custom tag
dank build:prod --tag v2.1.0

# Build for GitHub Container Registry
dank build:prod --registry ghcr.io --namespace myorg

# Build for Docker Hub
dank build:prod --registry docker.io --namespace mycompany

# Build for private registry
dank build:prod --registry registry.company.com --namespace ai-agents
```

**Push and Force Rebuild:**
```bash
# Build and push to registry
dank build:prod --push

# Force rebuild without cache
dank build:prod --force

# Force rebuild and push
dank build:prod --force --push

# Build with custom tag and push
dank build:prod --tag release-2024.1 --push
```

#### 🏷️ **Image Naming Convention**

**With Agent Configuration:**
- Format: `{registry}/{namespace}/{agent-name}:{tag}`
- Example: `ghcr.io/mycompany/customer-service:v1.2.0`

**With CLI Override:**
- CLI options override agent configuration
- Example: `dank build:prod --tag v2.0.0` overrides agent's tag

**Without Configuration:**
- Format: `{agent-name}:{tag}`
- Example: `customer-service:latest`

#### 🔧 **Registry Authentication**

**Docker Hub:**
```bash
# Login to Docker Hub
docker login

# Build and push
dank build:prod --registry docker.io --namespace myusername --push
```

**GitHub Container Registry:**
```bash
# Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Build and push
dank build:prod --registry ghcr.io --namespace myorg --push
```

**Private Registry:**
```bash
# Login to private registry
docker login registry.company.com

# Build and push
dank build:prod --registry registry.company.com --namespace ai-agents --push
```

#### 📊 **Build Output Example**

```bash
$ dank build:prod --push

🏗️  Building production Docker images...

📦 Building production image for agent: customer-service
info: Building production image for agent: customer-service -> ghcr.io/mycompany/customer-service:v1.2.0
Step 1/3 : FROM deltadarkly/dank-agent-base:latest
 ---> 7b560f235fe3
Step 2/3 : COPY agent-code/ /app/agent-code/
 ---> d766de6e95c4
Step 3/3 : USER dankuser
 ---> Running in c773e808270c
Successfully built 43a664c636a2
Successfully tagged ghcr.io/mycompany/customer-service:v1.2.0
info: Production image 'ghcr.io/mycompany/customer-service:v1.2.0' built successfully
info: Pushing image to registry: ghcr.io/mycompany/customer-service:v1.2.0
info: Successfully pushed image: ghcr.io/mycompany/customer-service:v1.2.0
✅ Successfully built: ghcr.io/mycompany/customer-service:v1.2.0
🚀 Successfully pushed: ghcr.io/mycompany/customer-service:v1.2.0

📊 Build Summary:
================
✅ Successful builds: 2
🚀 Pushed to registry: 2

📦 Built Images:
  - ghcr.io/mycompany/customer-service:v1.2.0
  - docker.io/mycompany/data-processor:latest

🎉 Production build completed successfully!
```

#### 🔄 **CI/CD Integration**

**GitHub Actions Example:**
```yaml
name: Build and Push Production Images

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install Dank
        run: npm install -g dank-ai
        
      - name: Login to GHCR
        uses: docker/login-action@v2
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
          
      - name: Build and Push Production Images
        run: |
          dank build:prod \
            --registry ghcr.io \
            --namespace ${{ github.repository_owner }} \
            --tag ${{ github.ref_name }} \
            --push
```

**GitLab CI Example:**
```yaml
build_production:
  stage: build
  image: node:18
  before_script:
    - npm install -g dank-ai
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
  script:
    - dank build:prod --registry $CI_REGISTRY --namespace $CI_PROJECT_NAMESPACE --tag $CI_COMMIT_TAG --push
  only:
    - tags
```

#### 🐳 **Docker Compose Integration**

Use your production images in Docker Compose:

```yaml
version: '3.8'

services:
  customer-service:
    image: ghcr.io/mycompany/customer-service:v1.2.0
    ports:
      - "3000:3000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    restart: unless-stopped

  data-processor:
    image: docker.io/mycompany/data-processor:latest
    ports:
      - "3001:3001"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    restart: unless-stopped
```

#### 🚨 **Troubleshooting Production Builds**

**Common Issues:**

1. **Registry Authentication:**
   ```bash
   # Error: authentication required
   # Solution: Login to registry first
   docker login ghcr.io
   ```

2. **Push Permissions:**
   ```bash
   # Error: denied: push access denied
   # Solution: Check namespace permissions or use personal namespace
   dank build:prod --namespace your-username --push
   ```

3. **Image Already Exists:**
   ```bash
   # Error: image already exists
   # Solution: Use different tag or force rebuild
   dank build:prod --tag v1.2.1 --push
   ```

4. **Build Context Issues:**
   ```bash
   # Error: build context too large
   # Solution: Add .dockerignore file
   echo "node_modules/" > .dockerignore
   echo "*.log" >> .dockerignore
   ```

## 🏗️ Project Structure

```
my-project/
├── dank.config.js         # Agent configuration
├── agents/                # Custom agent code (optional)
│   └── example-agent.js
└── .dank/                 # Generated files
    ├── project.yaml       # Project state
    └── logs/              # Agent logs
```

## 📦 Package Exports

When you install Dank via npm, you can import the following:

```javascript
const { 
  createAgent,     // Convenience function to create agents
  DankAgent,       // Main agent class
  DankProject,     // Project management class
  SUPPORTED_LLMS,  // List of supported LLM providers
  DEFAULT_CONFIG   // Default configuration values
} = require("dank");
```

## 📋 Example Files

The `examples/` directory contains two configuration files:

- **`dank.config.js`** - Local development example (uses `../lib/index.js`)
- **`dank.config.template.js`** - Production template (uses `require("dank")`)

### For Local Development
```bash
# Use the example file directly
dank run --config example/dank.config.js
```

### For Production Use
```bash
# 1. Copy the template to your project
cp example/dank.config.template.js ./dank.config.js

# 2. Install dank as a dependency
npm install dank-ai

# 3. The template already uses the correct import
# const { createAgent } = require("dank");

# 4. Run your agents
dank run
```

## 🐳 Docker Architecture

Dank uses a layered Docker approach:

1. **Base Image** (`deltadarkly/dank-agent-base`): Common runtime with Node.js, LLM clients
2. **Agent Images**: Extend base image with agent-specific code and custom tags
3. **Containers**: Running instances with resource limits and networking

### Container Features
- **Isolated Environments**: Each agent runs in its own container
- **Resource Limits**: Memory and CPU constraints per agent
- **Health Monitoring**: Built-in health checks and status reporting
- **Automatic Restarts**: Container restart policies for reliability
- **Logging**: Centralized log collection and viewing

### 🚀 Automatic Docker Management

Dank automatically handles Docker installation and startup for you:

#### **Auto-Detection & Installation**
When you run any Dank command, it will:
1. **Check if Docker is installed** - Runs `docker --version` to detect installation
2. **Install Docker if missing** - Automatically installs Docker for your platform:
   - **macOS**: Uses Homebrew to install Docker Desktop
   - **Linux**: Installs Docker CE via apt package manager
   - **Windows**: Uses Chocolatey to install Docker Desktop
3. **Start Docker if stopped** - Automatically starts Docker service
4. **Wait for availability** - Ensures Docker is ready before proceeding

#### **Platform-Specific Installation**

**macOS:**
```bash
# Dank will automatically run:
brew install --cask docker
open -a Docker
```

**Linux (Ubuntu/Debian):**
```bash
# Dank will automatically run:
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
```

**Windows:**
```bash
# Dank will automatically run:
choco install docker-desktop -y
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
```

#### **Manual Fallback**
If automatic installation fails, Dank will provide clear instructions:
```bash
# Example output when manual installation is needed
❌ Docker installation failed: Homebrew not found
💡 Please install Docker Desktop manually from:
   https://www.docker.com/products/docker-desktop/
```

#### **Status Messages**
Dank provides clear feedback during the process:
```bash
🔍 Checking Docker availability...
📦 Docker is not installed. Installing Docker...
🖥️  Installing Docker Desktop for macOS...
⏳ Installing Docker Desktop via Homebrew...
✅ Docker installation completed
🚀 Starting Docker Desktop...
⏳ Waiting for Docker to become available...
✅ Docker is now available
🐳 Docker connection established
```

## 💼 Using Dank in Your Project

### Step-by-Step Integration Guide

#### 1. Project Setup
```bash
# In your existing project directory
npm install -g dank-ai

# Initialize Dank configuration
dank init

# This creates dank.config.js in your current directory
```

#### 2. Basic Agent Configuration
Start with a simple agent configuration in `dank.config.js`:

```javascript
const { createAgent } = require('dank');

module.exports = {
  name: 'my-project',
  
  agents: [
    // Simple assistant agent
    createAgent('helper')
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-3.5-turbo'
      })
      .setPrompt('You are a helpful assistant.')
      .addHandler('output', console.log)
  ]
};
```

#### 3. Multi-Agent Setup
Configure multiple specialized agents:

```javascript
const { createAgent } = require('dank');

module.exports = {
  name: 'multi-agent-system',
  
  agents: [
    // Customer service agent
    createAgent('customer-service')
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-3.5-turbo',
        temperature: 0.7
      })
      .setPrompt(`
        You are a friendly customer service representative.
        - Be helpful and professional
        - Resolve customer issues quickly
        - Escalate complex problems appropriately
      `)
      .setResources({ memory: '512m', cpu: 1 })
      .addHandler('output', (data) => {
        console.log('[Customer Service]:', data);
        // Add your business logic here
      }),

    // Data analyst agent
    createAgent('analyst')
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4',
        temperature: 0.3
      })
      .setPrompt(`
        You are a data analyst expert.
        - Analyze trends and patterns
        - Provide statistical insights
        - Create actionable recommendations
      `)
      .setResources({ memory: '1g', cpu: 2 })
      .addHandler('output', (data) => {
        console.log('[Analyst]:', data);
        // Save analysis results to database
      }),

    // Content creator agent
    createAgent('content-creator')
      .setLLM('anthropic', {
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: 'claude-3-sonnet-20240229'
      })
      .setPrompt(`
        You are a creative content writer.
        - Write engaging, original content
        - Adapt tone to target audience
        - Follow brand guidelines
      `)
      .setResources({ memory: '512m', cpu: 1 })
      .addHandler('output', (data) => {
        console.log('[Content Creator]:', data);
        // Process and publish content
      })
  ]
};
```

### 🎯 Common Use Cases

#### Use Case 1: Customer Support Automation
```javascript
createAgent('support-bot')
  .setLLM('openai', {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-3.5-turbo'
  })
  .setPrompt(`
    You are a customer support specialist for [Your Company].
    
    Guidelines:
    - Always be polite and helpful
    - For technical issues, provide step-by-step solutions
    - If you cannot resolve an issue, escalate to human support
    - Use the customer's name when available
    
    Knowledge Base:
    - Product features: [list your features]
    - Common issues: [list common problems and solutions]
    - Contact info: support@yourcompany.com
  `)
  .addHandler('output', (response) => {
    // Send response back to customer via your chat system
    sendToCustomer(response);
  })
  .addHandler('error', (error) => {
    // Fallback to human support
    escalateToHuman(error);
  });
```

#### Use Case 2: Content Generation Pipeline
```javascript
const contentAgents = [
  // Research agent
  createAgent('researcher')
    .setLLM('openai', { model: 'gpt-4' })
    .setPrompt('Research and gather information on given topics')
    .addHandler('output', (research) => {
      // Pass research to writer agent
      triggerContentCreation(research);
    }),

  // Writer agent  
  createAgent('writer')
    .setLLM('anthropic', { model: 'claude-3-sonnet' })
    .setPrompt('Write engaging blog posts based on research data')
    .addHandler('output', (article) => {
      // Save draft and notify editor
      saveDraft(article);
      notifyEditor(article);
    }),

  // SEO optimizer agent
  createAgent('seo-optimizer')
    .setLLM('openai', { model: 'gpt-3.5-turbo' })
    .setPrompt('Optimize content for SEO and readability')
    .addHandler('output', (optimizedContent) => {
      // Publish optimized content
      publishContent(optimizedContent);
    })
];
```

#### Use Case 3: Data Analysis Workflow
```javascript
createAgent('data-processor')
  .setLLM('openai', {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
    temperature: 0.1  // Low temperature for consistent analysis
  })
  .setPrompt(`
    You are a data analyst. Analyze the provided data and:
    1. Identify key trends and patterns
    2. Calculate important metrics
    3. Provide actionable insights
    4. Format results as JSON
  `)
  .setResources({
    memory: '2g',    // More memory for data processing
    cpu: 2,          // More CPU for complex calculations
    timeout: 120000  // Longer timeout for large datasets
  })
  .addHandler('output', (analysis) => {
    try {
      const results = JSON.parse(analysis);
      // Store results in database
      saveAnalysisResults(results);
      // Generate reports
      generateReport(results);
      // Send alerts if thresholds are met
      checkAlerts(results);
    } catch (error) {
      console.error('Failed to parse analysis:', error);
    }
  });
```

### 🔧 Advanced Configuration

#### Custom Agent Code
For complex logic, create custom agent files in the `agents/` directory:

```javascript
// agents/custom-agent.js
module.exports = {
  async main(llmClient, handlers) {
    console.log('Custom agent starting...');
    
    // Your custom agent logic
    setInterval(async () => {
      try {
        // Make LLM request
        const response = await llmClient.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'Generate a daily report' }
          ]
        });
        
        // Trigger output handlers
        const outputHandlers = handlers.get('output') || [];
        outputHandlers.forEach(handler => 
          handler(response.choices[0].message.content)
        );
        
      } catch (error) {
        // Trigger error handlers
        const errorHandlers = handlers.get('error') || [];
        errorHandlers.forEach(handler => handler(error));
      }
    }, 60000); // Run every minute
  },
  
  // Define custom handlers
  handlers: {
    output: [
      (data) => console.log('Custom output:', data)
    ],
    error: [
      (error) => console.error('Custom error:', error)
    ]
  }
};
```

#### Environment-Specific Configuration
```javascript
// dank.config.js
const { createAgent } = require('dank');

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  name: 'my-project',
  
  agents: [
    createAgent('main-agent')
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: isDevelopment ? 'gpt-3.5-turbo' : 'gpt-4',
        temperature: isDevelopment ? 0.9 : 0.7
      })
      .setResources({
        memory: isDevelopment ? '256m' : '1g',
        cpu: isDevelopment ? 0.5 : 2
      })
      .addHandler('output', (data) => {
        if (isDevelopment) {
          console.log('DEV:', data);
        } else {
          // Production logging
          logger.info('Agent output', { data });
        }
      })
  ]
};
```

### 🔧 Advanced Usage

#### Environment Variables
```bash
export OPENAI_API_KEY="your-key"
export ANTHROPIC_API_KEY="your-key"  
export LOG_LEVEL="debug"
export DOCKER_HOST="unix:///var/run/docker.sock"
export NODE_ENV="production"
```

#### Integration with Existing Applications
```javascript
// In your existing Node.js application
const { spawn } = require('child_process');

// Start Dank agents programmatically
function startAgents() {
  const dankProcess = spawn('dank', ['run', '--detached'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });
  
  dankProcess.on('close', (code) => {
    console.log(`Dank agents exited with code ${code}`);
  });
  
  return dankProcess;
}

// Stop agents gracefully
function stopAgents() {
  spawn('dank', ['stop', '--all'], { stdio: 'inherit' });
}

// Check agent status
async function getAgentStatus() {
  return new Promise((resolve) => {
    const statusProcess = spawn('dank', ['status', '--json'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    statusProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    statusProcess.on('close', () => {
      try {
        resolve(JSON.parse(output));
      } catch {
        resolve(null);
      }
    });
  });
}
```

### 🚨 Troubleshooting

#### Common Issues and Solutions

**1. Docker Connection Issues**
```bash
# Error: Cannot connect to Docker daemon
# Solution: Dank will automatically handle this!

# If automatic installation fails, manual steps:
docker --version
docker ps

# On macOS/Windows: Start Docker Desktop manually
# On Linux: Start Docker service
sudo systemctl start docker
```

**1a. Docker Installation Issues**
```bash
# If automatic installation fails, try manual installation:

# macOS (with Homebrew):
brew install --cask docker
open -a Docker

# Linux (Ubuntu/Debian):
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io
sudo systemctl start docker
sudo usermod -aG docker $USER

# Windows (with Chocolatey):
choco install docker-desktop -y
# Then start Docker Desktop from Start Menu
```

**2. API Key Issues**
```bash
# Error: Invalid API key
# Solution: Check your environment variables
echo $OPENAI_API_KEY

# Set the key properly
export OPENAI_API_KEY="sk-your-actual-key-here"

# Or create a .env file in your project
echo "OPENAI_API_KEY=sk-your-actual-key-here" > .env
```

**3. Base Image Not Found**
```bash
# Error: Base image 'deltadarkly/dank-agent-base' not found
# Solution: The base image is pulled automatically, but you can build it manually
dank build --base
```

**4. Container Resource Issues**
```bash
# Error: Container exits with code 137 (out of memory)
# Solution: Increase memory allocation
createAgent('my-agent')
  .setResources({
    memory: '1g',  // Increase from 512m to 1g
    cpu: 2
  })
```

**5. Agent Not Starting**
```bash
# Check agent logs for detailed error information
dank logs agent-name

# Check container status
docker ps -f name=dank-

# View Docker logs directly
docker logs container-id
```

### 💡 Best Practices

#### 1. Resource Management
```javascript
// Good: Appropriate resource allocation
createAgent('light-agent')
  .setResources({
    memory: '256m',     // Light tasks
    cpu: 0.5
  });

createAgent('heavy-agent')
  .setResources({
    memory: '2g',       // Heavy processing
    cpu: 2,
    timeout: 120000     // Longer timeout
  });
```

#### 2. Error Handling
```javascript
// Good: Comprehensive error handling
createAgent('robust-agent')
  .addHandler('error', (error) => {
    console.error('Agent error:', error.message);
    
    // Log to monitoring system
    logError(error);
    
    // Send alert if critical
    if (error.type === 'CRITICAL') {
      sendAlert(error);
    }
    
    // Implement retry logic
    scheduleRetry(error.context);
  })
  .addHandler('output', (data) => {
    try {
      processOutput(data);
    } catch (error) {
      console.error('Output processing failed:', error);
    }
  });
```

#### 3. Environment Configuration
```javascript
// Good: Environment-specific settings
const config = {
  development: {
    model: 'gpt-3.5-turbo',
    memory: '256m',
    logLevel: 'debug'
  },
  production: {
    model: 'gpt-4',
    memory: '1g',
    logLevel: 'info'
  }
};

const env = process.env.NODE_ENV || 'development';
const settings = config[env];

createAgent('environment-aware')
  .setLLM('openai', {
    model: settings.model,
    temperature: 0.7
  })
  .setResources({
    memory: settings.memory
  });
```

#### 4. Monitoring and Logging
```javascript
// Good: Structured logging
createAgent('monitored-agent')
  .addHandler('output', (data) => {
    logger.info('Agent output', {
      agent: 'monitored-agent',
      timestamp: new Date().toISOString(),
      data: data.substring(0, 100) // Truncate for logs
    });
  })
  .addHandler('error', (error) => {
    logger.error('Agent error', {
      agent: 'monitored-agent',
      error: error.message,
      stack: error.stack
    });
  })
  .addHandler('start', () => {
    logger.info('Agent started', { agent: 'monitored-agent' });
  });
```

#### 5. Security Considerations
```javascript
// Good: Secure configuration
createAgent('secure-agent')
  .setLLM('openai', {
    apiKey: process.env.OPENAI_API_KEY, // Never hardcode keys
    model: 'gpt-3.5-turbo'
  })
  .setPrompt(`
    You are a helpful assistant.
    
    IMPORTANT SECURITY RULES:
    - Never reveal API keys or sensitive information
    - Don't execute system commands
    - Validate all inputs before processing
    - Don't access external URLs unless explicitly allowed
  `)
  .addHandler('output', (data) => {
    // Sanitize output before logging
    const sanitized = sanitizeOutput(data);
    console.log(sanitized);
  });
```

### 📊 Performance Optimization

#### 1. Resource Tuning
```bash
# Monitor resource usage
dank status --watch

# Check container stats
docker stats $(docker ps -f name=dank- -q)

# Optimize based on usage patterns
```

#### 2. Parallel Agent Management
```javascript
// Good: Balanced agent distribution
module.exports = {
  agents: [
    // CPU-intensive agents
    createAgent('analyzer').setResources({ cpu: 2, memory: '1g' }),
    
    // Memory-intensive agents  
    createAgent('processor').setResources({ cpu: 1, memory: '2g' }),
    
    // Light agents
    createAgent('notifier').setResources({ cpu: 0.5, memory: '256m' })
  ]
};
```

#### 3. Efficient Prompt Design
```javascript
// Good: Clear, specific prompts
.setPrompt(`
  You are a customer service agent. Follow these steps:
  
  1. Greet the customer politely
  2. Understand their issue by asking clarifying questions
  3. Provide a solution or escalate if needed
  4. Confirm resolution
  
  Response format: JSON with fields: greeting, questions, solution, status
`);
```

### 🔄 Development Workflow

#### 1. Local Development
```bash
# 1. Start with development configuration
NODE_ENV=development dank run

# 2. Make changes to dank.config.js

# 3. Restart agents to apply changes
dank stop --all
dank run --build  # Rebuild if needed

# 4. Test with reduced resources
createAgent('dev-agent').setResources({ memory: '128m', cpu: 0.25 })
```

#### 2. Testing Agents
```bash
# Test individual agents
dank run --detached
dank logs test-agent --follow

# Check health endpoints
curl http://localhost:3001/health

# Monitor resource usage
docker stats dank-test-agent
```

#### 3. Production Deployment
```bash
# 1. Set production environment
export NODE_ENV=production

# 2. Build optimized images
dank build --force

# 3. Start with image config
dank run --detached

# 4. Monitor and scale as needed
dank status --watch
```

### Monitoring and Debugging

```bash
# Watch all agents in real-time
dank status --watch

# Follow logs from specific agent  
dank logs my-agent --follow

# View container details
docker ps -f name=dank-

# Check agent health
curl http://localhost:3001/health
```

## 📦 Installation

### Prerequisites
- Node.js 16+ 
- Docker Desktop or Docker Engine
- npm or yarn

### Global Installation
```bash
npm install -g dank-ai
```

### Local Development
```bash
git clone https://github.com/your-org/dank
cd dank
npm install
npm link  # Creates global symlink
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

ISC License - see LICENSE file for details.

## 🆘 Support

- **Documentation**: [Wiki](https://github.com/your-org/dank/wiki)
- **Issues**: [GitHub Issues](https://github.com/your-org/dank/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/dank/discussions)

---

**Built with 💯 energy for the AI agent revolution!** 🚀