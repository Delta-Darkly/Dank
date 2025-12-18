<div align="center">
  <img src="assets/danklarge.png" alt="Dank Logo" width="400">
</div>

# 🚀 Dank Agent Service

**Docker-based AI Agent Orchestration Platform**

Dank is a powerful Node.js service that allows you to define, deploy, and manage AI agents using Docker containers. Each agent runs in its own isolated environment with configurable resources, LLM providers, and custom handlers. Built for production with comprehensive CI/CD support and Docker registry integration.

🌐 **Website**: [https://ai-dank.xyz](https://ai-dank.xyz)  
📦 **NPM Package**: [https://www.npmjs.com/package/dank-ai](https://www.npmjs.com/package/dank-ai)  
☁️ **Cloud Deployment**: [https://cloud.ai-dank.xyz](https://cloud.ai-dank.xyz) - **Serverless for AI Agents**

## ☁️ Deploy to the Cloud

**Serverless for AI Agents** - Deploy your Dank agents seamlessly to the cloud with zero infrastructure management.

👉 **[https://cloud.ai-dank.xyz](https://cloud.ai-dank.xyz)** - The seamless cloud deployment management serverless solution for Dank. Scale your AI agents automatically, pay only for what you use, and focus on building great agents instead of managing servers.

## ✨ Features

- **🤖 Multi-LLM Support**: OpenAI, Anthropic, Cohere, Ollama, and custom providers
- **🐳 Docker Orchestration**: Isolated agent containers with resource management  
- **⚡ Easy Configuration**: Define agents with simple JavaScript configuration
- **📦 NPM Package Support**: Use any npm package in your handlers with top-level imports
- **📘 TypeScript Ready**: Full support for TypeScript and compiled projects
- **📊 Real-time Monitoring**: Built-in health checks and status monitoring
- **🔧 Flexible Handlers**: Custom event handlers for agent outputs and errors
- **🎯 CLI Interface**: Powerful command-line tools for agent management
- **🏗️ Production Builds**: Build and push Docker images to registries with custom naming
- **🔄 CI/CD Ready**: Seamless integration with GitHub Actions, GitLab CI, and other platforms

## 🚀 Quick Start

### Prerequisites
- **Node.js 16+** installed
- **Docker Desktop** or **Docker Engine** (auto-installed if missing)
- **API keys** for your chosen LLM provider(s)

> **🆕 Auto-Docker Installation**: Dank automatically detects, installs, and starts Docker if unavailable. No manual setup required!

### Installation & Setup

```bash
# 1. Install globally
npm install -g dank-ai

# 2. Initialize project
mkdir my-agent-project && cd my-agent-project
dank init my-agent-project

# 3. Set environment variables
export OPENAI_API_KEY="your-api-key"

# 4. Configure agents in dank.config.js
# (see Agent Configuration section below)

# 5. Start agents
dank run

# 6. Monitor
dank status --watch
dank logs assistant --follow
```

<details>
<summary><b>📁 Project Structure</b></summary>

```
my-project/
├── dank.config.js         # Agent configuration
├── agents/                # Custom agent code (optional)
│   └── example-agent.js
└── .dank/                 # Generated files
    ├── project.yaml       # Project state
    └── logs/              # Agent logs
```
</details>

## 📋 CLI Commands

### Core Commands
```bash
dank run                    # Start all defined agents
dank run --config <path>   # Use custom config path (for compiled projects)
dank status [--watch]      # Show agent status (live updates)
dank stop [agents...]      # Stop specific agents or --all
dank logs [agent] [--follow] # View agent logs
dank init [name]           # Initialize new project
dank build                  # Build Docker images
dank build:prod            # Build production images
dank clean                  # Clean up Docker resources
```

### Production Build Options
```bash
dank build:prod --push                      # Build and push to registry
dank build:prod --tag v1.0.0               # Custom tag
dank build:prod --registry ghcr.io         # GitHub Container Registry
dank build:prod --namespace mycompany     # Custom namespace
dank build:prod --tag-by-agent            # Use agent name as tag
dank build:prod --force                   # Force rebuild
dank build:prod --output-metadata <file>  # Generate deployment metadata
dank build:prod --json                    # JSON output
```

> **💡 Push Control**: The `--push` option is the only way to push images. Agent config defines naming, CLI controls pushing.

## 🤖 Agent Configuration

### Basic Setup

```javascript
// Import npm packages at the top - they'll be available in handlers
const axios = require('axios');
const { format } = require('date-fns');
const { processData } = require('./utils'); // Local files work too

const { createAgent } = require('dank-ai');
const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: 'my-project',
  agents: [
    createAgent('assistant')
      .setId(uuidv4()) // Required: Unique UUIDv4
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-3.5-turbo',
        temperature: 0.7
      })
      .setPrompt('You are a helpful assistant.')
      .setPromptingServer({ port: 3000 })
      .setInstanceType('small') // Cloud only: 'small', 'medium', 'large', 'xlarge'
      .addHandler('request_output', async (data) => {
        // Use imported packages directly in handlers
        console.log(`[${format(new Date(), 'yyyy-MM-dd HH:mm')}] Response:`, data.response);
        await axios.post('https://api.example.com/log', { response: data.response });
        processData(data);
      })
  ]
};
```

> **📦 NPM Packages**: Any packages you `require()` at the top of your config are automatically available in your handlers. Just make sure they're in your `package.json`.

<details>
<summary><b>📦 Dynamic Imports (ESM-only packages)</b></summary>

For ESM-only packages that don't support `require()`, use dynamic `import()`:

```javascript
// Dynamic imports return Promises - define at top level
const uniqueString = import("unique-string").then((m) => m.default);
const chalk = import("chalk").then((m) => m.default);

// Multiline .then() is also supported
const ora = import("ora").then((m) => {
  return m.default;
});

module.exports = {
  agents: [
    createAgent('my-agent')
      .addHandler('output', async (data) => {
        // Await the promise to get the actual module
        const generateString = await uniqueString;
        const colors = await chalk;
        
        console.log(colors.green(`ID: ${generateString()}`));
      })
  ]
};
```

**Note:** Dynamic imports are asynchronous, so you must `await` them inside your handlers.

</details>

### Supported LLM Providers

| Provider | Configuration |
|----------|-------------|
| **OpenAI** | `.setLLM('openai', { apiKey, model, temperature, maxTokens })` |
| **Anthropic** | `.setLLM('anthropic', { apiKey, model, maxTokens })` |
| **Ollama** | `.setLLM('ollama', { baseURL, model })` |
| **Cohere** | `.setLLM('cohere', { apiKey, model, temperature })` |
| **Hugging Face** | `.setLLM('huggingface', { apiKey, model })` |
| **Custom** | `.setLLM('custom', { baseURL, apiKey, model })` |

### HTTP Routes

HTTP automatically enables when you add routes:

```javascript
createAgent('api-agent')
  .setPromptingServer({ port: 3000 })
  .post('/hello', (req, res) => {
    res.json({ message: 'Hello, World!', received: req.body });
  })
  .get('/status', (req, res) => {
    res.json({ status: 'ok' });
  });
```

### Event Handlers

> **🆕 Auto-Detection**: Dank automatically enables features based on usage:
> - Event Handlers: Auto-enabled with `.addHandler()`
> - Direct Prompting: Auto-enabled with `.setPrompt()` + `.setLLM()`
> - HTTP API: Auto-enabled with `.get()`, `.post()`, etc.

<details>
<summary><b>📡 Event Handler Patterns</b></summary>

#### Direct Prompting Events (`request_output`)

```javascript
agent
  // Main response event
  .addHandler('request_output', (data) => {
    console.log('Response:', data.response);
  })
  
  // Modify prompt before LLM processing
  .addHandler('request_output:start', (data) => {
    return { prompt: `Enhanced: ${data.prompt}` };
  })
  
  // Modify response before returning
  .addHandler('request_output:end', (data) => {
    return { response: `${data.response}\n\n---\nGenerated by Dank` };
  })
  
  // Error handling
  .addHandler('request_output:error', (data) => {
    console.error('Error:', data.error);
  });
```

**Event Flow**: `request_output:start` → LLM Processing → `request_output` → `request_output:end` → Response Sent

#### Passing Custom Data to Handlers

You can pass any custom data in the request body to the `/prompt` endpoint, and it will be available in your handlers via `data.metadata`. This enables powerful use cases like user authentication, conversation tracking, RAG (Retrieval-Augmented Generation), and custom lookups.

**Client Request:**
```javascript
// POST /prompt
{
  "prompt": "What's the weather today?",
  "userId": "user-12345",
  "conversationId": "conv-abc-xyz",
  "sessionId": "sess-789",
  "userPreferences": {
    "language": "en",
    "timezone": "America/New_York"
  }
}
```

**Handler Access:**
```javascript
agent
  .addHandler('request_output:start', async (data) => {
    // Access custom data via data.metadata
    const userId = data.metadata.userId;
    const conversationId = data.metadata.conversationId;
    
    // Perform authentication
    const user = await authenticateUser(userId);
    if (!user) throw new Error('Unauthorized');
    
    // Load conversation history for context
    const history = await getConversationHistory(conversationId);
    
    // Perform RAG lookup
    const relevantDocs = await vectorSearch(data.prompt, userId);
    
    // Enhance prompt with context
    return {
      prompt: `Context: ${JSON.stringify(history)}\n\nRelevant Docs: ${relevantDocs}\n\nUser Question: ${data.prompt}`
    };
  })
  
  .addHandler('request_output', async (data) => {
    // Log with user context
    await logInteraction({
      userId: data.metadata.userId,
      conversationId: data.metadata.conversationId,
      prompt: data.prompt,
      response: data.response,
      timestamp: data.timestamp
    });
    
    // Update user preferences based on interaction
    if (data.metadata.userPreferences) {
      await updateUserPreferences(data.metadata.userId, data.metadata.userPreferences);
    }
  });
```

**Use Cases:**
- **User Authentication**: Pass `userId` or `apiKey` to authenticate and authorize requests
- **Conversation Tracking**: Pass `conversationId` to maintain context across multiple requests
- **RAG (Retrieval-Augmented Generation)**: Pass user context to fetch relevant documents from vector databases
- **Personalization**: Pass `userPreferences` to customize responses
- **Analytics**: Pass tracking IDs to correlate requests with user sessions
- **Multi-tenancy**: Pass `tenantId` or `organizationId` for isolated data access

**Available Data Structure:**
```javascript
{
  prompt: "User's prompt",
  metadata: {
    // All custom fields from request body
    userId: "...",
    conversationId: "...",
    // ... any other fields you pass
  },
  // System fields (directly on data object)
  protocol: "http",
  clientIp: "127.0.0.1",
  response: "LLM response",
  usage: { total_tokens: 150 },
  model: "gpt-3.5-turbo",
  processingTime: 1234,
  timestamp: "2024-01-01T00:00:00.000Z"
}
```

#### Tool Events (`tool:*`)

```javascript
.addHandler('tool:httpRequest:*', (data) => {
  console.log('HTTP Request Tool:', data);
});
```

Pattern: `tool:<tool-name>:<action>` (e.g., `tool:httpRequest:call`, `tool:httpRequest:response`)

#### System Events

```javascript
.addHandler('output', (data) => console.log('Output:', data))
.addHandler('error', (error) => console.error('Error:', error))
.addHandler('start', () => console.log('Agent started'))
.addHandler('stop', () => console.log('Agent stopped'))
```

#### Advanced Patterns

```javascript
// Wildcard matching
.addHandler('tool:*', (data) => console.log('Any tool:', data))
.addHandler('request_output:*', (data) => console.log('Any request event:', data))

// Multiple handlers for same event
.addHandler('request_output', (data) => console.log('Log:', data))
.addHandler('request_output', (data) => saveToDatabase(data))
.addHandler('request_output', (data) => trackAnalytics(data))
```
</details>

### Resource Management

```javascript
.setInstanceType('small')  // Options: 'small', 'medium', 'large', 'xlarge'
// small: 512m, 1 CPU
// medium: 1g, 2 CPU
// large: 2g, 2 CPU
// xlarge: 4g, 4 CPU
```

**Note:** `setInstanceType()` is only used during deployments to Dank Cloud. Local runs with `dank run` disregard this setting.

### Production Image Configuration

```javascript
.setAgentImageConfig({
  registry: 'ghcr.io',      // Docker registry URL
  namespace: 'mycompany',    // Organization/namespace
  tag: 'v1.0.0'             // Image tag
})
```

<details>
<summary><b>🏗️ Production Build Details</b></summary>

#### Image Naming

- **Default**: `{registry}/{namespace}/{agent-name}:{tag}`
- **Tag by Agent** (`--tag-by-agent`): `{registry}/{namespace}/dank-agent:{agent-name}`
- **No Config**: `{agent-name}:{tag}`

#### Deployment Metadata

The `--output-metadata` option generates JSON with:
- Base image, ports, resource limits
- LLM provider and model info
- Event handlers, environment variables
- Build options (registry, namespace, tag)

Perfect for CI/CD pipelines to auto-configure deployment infrastructure.

<details>
<summary><b>Example Metadata Output</b></summary>

```json
{
  "project": "my-agent-project",
  "agents": [{
    "name": "customer-service",
    "imageName": "ghcr.io/mycompany/customer-service:v1.2.0",
    "baseImage": { "full": "deltadarkly/dank-agent-base:nodejs-20" },
    "promptingServer": { "port": 3000, "authentication": false },
    "resources": { "memory": "512m", "cpu": 1 },
    "llm": { "provider": "openai", "model": "gpt-3.5-turbo" },
    "handlers": ["request_output", "request_output:start"]
  }]
}
```
</details>

#### Registry Authentication

```bash
# Docker Hub
docker login
dank build:prod --registry docker.io --namespace myusername --push

# GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
dank build:prod --registry ghcr.io --namespace myorg --push

# Private Registry
docker login registry.company.com
dank build:prod --registry registry.company.com --namespace ai-agents --push
```

#### CI/CD Integration

<details>
<summary><b>GitHub Actions Example</b></summary>

```yaml
name: Build and Push Production Images
on:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install -g dank-ai
      - uses: docker/login-action@v2
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - run: |
          dank build:prod \
            --registry ghcr.io \
            --namespace ${{ github.repository_owner }} \
            --tag ${{ github.ref_name }} \
            --push
```
</details>

<details>
<summary><b>Docker Compose Example</b></summary>

```yaml
version: '3.8'
services:
  customer-service:
    image: ghcr.io/mycompany/customer-service:v1.2.0
    ports: ["3000:3000"]
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    restart: unless-stopped
```
</details>
</details>

## 🐳 Docker Architecture

Dank uses a layered Docker approach:
1. **Base Image** (`deltadarkly/dank-agent-base`): Common runtime with Node.js, LLM clients
2. **Agent Images**: Extend base image with agent-specific code
3. **Containers**: Running instances with resource limits and networking

### Container Features
- **Isolated Environments**: Each agent runs in its own container
- **Resource Limits**: Memory and CPU constraints per agent
- **Health Monitoring**: Built-in health checks and status reporting
- **Automatic Restarts**: Container restart policies for reliability
- **Logging**: Centralized log collection and viewing

<details>
<summary><b>🚀 Automatic Docker Management</b></summary>

Dank automatically handles Docker installation and startup:

**Auto-Detection & Installation:**
1. Checks if Docker is installed
2. Installs Docker if missing (macOS: Homebrew, Linux: apt, Windows: Chocolatey)
3. Starts Docker if stopped
4. Waits for availability

**Platform-Specific:**
- **macOS**: `brew install --cask docker && open -a Docker`
- **Linux**: `sudo apt-get install docker-ce && sudo systemctl start docker`
- **Windows**: `choco install docker-desktop`

If automatic installation fails, Dank provides clear manual instructions.
</details>

## 💼 Usage Examples

<details>
<summary><b>🎯 Common Use Cases</b></summary>

#### Customer Support Automation
```javascript
createAgent('support-bot')
  .setLLM('openai', { apiKey: process.env.OPENAI_API_KEY, model: 'gpt-3.5-turbo' })
  .setPrompt('You are a customer support specialist. Be polite, helpful, and escalate when needed.')
  .addHandler('output', (response) => sendToCustomer(response))
  .addHandler('error', (error) => escalateToHuman(error));
```

#### Content Generation Pipeline
```javascript
const agents = [
  createAgent('researcher')
    .setLLM('openai', { model: 'gpt-4' })
    .setPrompt('Research and gather information on given topics')
    .addHandler('output', (research) => triggerContentCreation(research)),

  createAgent('writer')
    .setLLM('anthropic', { model: 'claude-3-sonnet' })
    .setPrompt('Write engaging blog posts based on research data')
    .addHandler('output', (article) => saveDraft(article)),
  
  createAgent('seo-optimizer')
    .setLLM('openai', { model: 'gpt-3.5-turbo' })
    .setPrompt('Optimize content for SEO and readability')
    .addHandler('output', (content) => publishContent(content))
];
```

#### Data Analysis Workflow
```javascript
createAgent('data-processor')
  .setLLM('openai', { model: 'gpt-4', temperature: 0.1 })
  .setPrompt('Analyze data and provide insights as JSON: trends, metrics, recommendations')
  .setInstanceType('large')
  .addHandler('output', (analysis) => {
      const results = JSON.parse(analysis);
      saveAnalysisResults(results);
      generateReport(results);
      checkAlerts(results);
  });
```
</details>

<details>
<summary><b>🔧 Advanced Configuration</b></summary>

#### Custom Agent Code
```javascript
// agents/custom-agent.js
module.exports = {
  async main(llmClient, handlers) {
    setInterval(async () => {
        const response = await llmClient.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'Generate a daily report' }
          ]
        });
      handlers.get('output')?.forEach(h => h(response.choices[0].message.content));
    }, 60000);
  }
};
```

#### Environment-Specific Configuration
```javascript
const env = process.env.NODE_ENV || 'development';
const config = {
  development: { model: 'gpt-3.5-turbo', instanceType: 'small' },
  production: { model: 'gpt-4', instanceType: 'medium' }
};

createAgent('main-agent')
  .setLLM('openai', { model: config[env].model })
  .setInstanceType(config[env].instanceType);
```
</details>

<details>
<summary><b>💡 Best Practices</b></summary>

#### Resource Management
```javascript
createAgent('light-agent').setInstanceType('small');  // Light tasks
createAgent('heavy-agent').setInstanceType('large');  // Heavy processing
```

#### Error Handling
```javascript
createAgent('robust-agent')
  .addHandler('error', (error) => {
    console.error('Agent error:', error.message);
    logError(error);
    if (error.type === 'CRITICAL') sendAlert(error);
    scheduleRetry(error.context);
  })
  .addHandler('output', (data) => {
    try { processOutput(data); }
    catch (error) { console.error('Processing failed:', error); }
  });
```

#### Monitoring and Logging
```javascript
createAgent('monitored-agent')
  .addHandler('output', (data) => {
    logger.info('Agent output', { agent: 'monitored-agent', data: data.substring(0, 100) });
  })
  .addHandler('error', (error) => {
    logger.error('Agent error', { agent: 'monitored-agent', error: error.message });
  });
```

#### Security
```javascript
createAgent('secure-agent')
  .setLLM('openai', { apiKey: process.env.OPENAI_API_KEY }) // Never hardcode
  .setPrompt('Never reveal API keys or execute system commands')
  .addHandler('output', (data) => console.log(sanitizeOutput(data)));
```
</details>

<details>
<summary><b>📘 TypeScript & Compiled Projects</b></summary>

Dank works with TypeScript and any build tool (Webpack, esbuild, etc.) that outputs CommonJS JavaScript.

#### Setup

1. **Write your config in TypeScript:**

```typescript
// src/dank.config.ts
import axios from 'axios';
import { processData } from './utils';
import { createAgent } from 'dank-ai';
import { v4 as uuidv4 } from 'uuid';

export = {
  name: 'my-ts-project',
  agents: [
    createAgent('assistant')
      .setId(uuidv4())
      .setLLM('openai', { apiKey: process.env.OPENAI_API_KEY })
      .addHandler('request_output', async (data) => {
        await axios.post('/api/log', data);
        processData(data);
      })
  ]
};
```

2. **Configure TypeScript for CommonJS output:**

```json
// tsconfig.json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "outDir": "./dist",
    "esModuleInterop": true
  }
}
```

3. **Compile and run:**

```bash
# Compile TypeScript
tsc

# Run with --config pointing to compiled output
dank run --config ./dist/dank.config.js

# Production build
dank build:prod --config ./dist/dank.config.js --push
```

> **💡 Tip**: The `--config` flag tells Dank where to find your compiled config. Your `package.json` is still read from the project root for dependency installation.

</details>

<details>
<summary><b>🔄 Development Workflow</b></summary>

#### Local Development
```bash
NODE_ENV=development dank run
# Make changes to dank.config.js
dank stop --all && dank run
```

#### Testing
```bash
dank run --detached
dank logs test-agent --follow
curl http://localhost:3001/health
docker stats dank-test-agent
```

#### Production Deployment
```bash
export NODE_ENV=production
dank build --force
dank run --detached
dank status --watch
```
</details>

## 🚨 Troubleshooting

<details>
<summary><b>Common Issues and Solutions</b></summary>

**1. Docker Connection Issues**
```bash
# Dank handles this automatically, but if manual steps needed:
docker --version && docker ps
# macOS/Windows: Start Docker Desktop
# Linux: sudo systemctl start docker
```

**2. API Key Issues**
```bash
export OPENAI_API_KEY="sk-your-key-here"
# Or create .env file: echo "OPENAI_API_KEY=sk-..." > .env
```

**3. Base Image Not Found**
```bash
dank build --base
# Or manually: docker pull deltadarkly/dank-agent-base:nodejs-20
```

**4. Container Resource Issues**
```javascript
// Increase memory allocation (cloud only)
createAgent('my-agent').setInstanceType('medium');
```

**5. Agent Not Starting**
```bash
dank logs agent-name
docker ps -f name=dank-
docker logs container-id
```

**Production Build Issues:**
- **Authentication**: `docker login ghcr.io`
- **Push Permissions**: Check namespace permissions
- **Image Exists**: Use different tag or `--force`
- **Build Context**: Add `.dockerignore` file
</details>

## 📦 Package Exports

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

The `examples/` directory contains:
- **`dank.config.js`** - Local development example
- **`dank.config.template.js`** - Production template

```bash
# Local development
dank run --config example/dank.config.js

# Production
cp example/dank.config.template.js ./dank.config.js
npm install dank-ai
dank run
```

## 📦 Installation

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

- **Issues**: [GitHub Issues](https://github.com/your-org/dank/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/dank/discussions)

---
