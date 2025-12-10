# Agent-to-Agent Communication Architecture

## Overview

This document explores how agents can communicate with each other to accomplish complex tasks, including:
- Local agents (defined in the same `dank.config.js`)
- External agents (defined elsewhere, already running)
- Deployment scenarios (same deployment, different deployments, multiple instances)
- Identity and namespacing to prevent cross-contamination

## Current Architecture

### Agent Definition
- Agents are defined in `dank.config.js` as an array
- Each agent has a unique name within the config
- Agents run in Docker containers on a shared network (`dank-network`)
- Container naming: `dank-{agent-name}-{hash}`
- Each agent exposes HTTP endpoints and optionally a `/prompt` endpoint

### Current Limitations
- No built-in agent-to-agent communication
- No service discovery mechanism
- No way to reference external agents
- No deployment identity/namespacing
- Agents can only communicate via manual HTTP calls using container names

## Use Cases

### 1. Local Agent Communication (Same Config)
**Scenario**: Two agents in the same `dank.config.js` need to collaborate.

```javascript
// Agent A needs to call Agent B
createAgent('orchestrator')
  .post('/api/task', async (req, res) => {
    // How does orchestrator call researcher?
    const result = await callAgent('researcher', {
      prompt: req.body.query
    });
  })

createAgent('researcher')
  .setPrompt('You are a research expert.')
```

**Requirements**:
- Simple reference mechanism (by name)
- Automatic service discovery within same deployment
- Low latency (same network)

### 2. External Agent Communication
**Scenario**: An agent needs to call an agent that's already running elsewhere.

```javascript
createAgent('client-agent')
  .addAgentReference('external-research', {
    url: 'https://research-agent.example.com',
    // or
    agentId: 'abc123',
    // or
    namespace: 'company/research-team'
  })
```

**Requirements**:
- Reference external agents by URL, ID, or namespace
- Handle authentication
- Handle network failures
- Service discovery for external agents

### 3. Multi-Deployment Scenarios
**Scenario**: Same `dank.config.js` deployed multiple times, agents should only communicate within their deployment.

```
Deployment A:
  - orchestrator-a
  - researcher-a
  
Deployment B (copy of same config):
  - orchestrator-b
  - researcher-b
  
Problem: orchestrator-a should NOT call researcher-b
```

**Requirements**:
- Deployment identity/namespace
- Isolation between deployments
- Agents only discover agents in same deployment

### 4. Hybrid Deployments
**Scenario**: Some agents local, some external, some in different deployments.

```javascript
createAgent('hybrid-orchestrator')
  .addAgentReference('local-helper', { type: 'local' })
  .addAgentReference('external-api', { 
    url: 'https://api.example.com' 
  })
  .addAgentReference('partner-agent', {
    namespace: 'partner/agents',
    agentId: 'specialist-123'
  })
```

## Proposed Solutions

### Solution 1: Agent Reference System

**Concept**: Add a method to define agent references that can be local or external.

#### Agent Reference Types

**1. Local Reference** (same config, same deployment):
```javascript
createAgent('orchestrator')
  .addAgentReference('researcher', {
    type: 'local' // or omit type, defaults to local
  })
```

**2. External URL Reference**:
```javascript
createAgent('client')
  .addAgentReference('external-service', {
    type: 'external',
    url: 'https://agent.example.com',
    authentication: {
      type: 'bearer',
      token: process.env.EXTERNAL_AGENT_TOKEN
    }
  })
```

**3. Namespace/ID Reference** (for service discovery):
```javascript
createAgent('client')
  .addAgentReference('partner-agent', {
    type: 'discovery',
    namespace: 'partner/agents',
    agentId: 'specialist-123',
    discoveryService: 'https://discovery.ai-dank.xyz' // Optional
  })
```

#### Implementation

```javascript
// In lib/agent.js
addAgentReference(name, config) {
  if (!this.config.agentReferences) {
    this.config.agentReferences = new Map();
  }
  
  const reference = {
    name,
    type: config.type || 'local',
    url: config.url,
    authentication: config.authentication,
    namespace: config.namespace,
    agentId: config.agentId,
    discoveryService: config.discoveryService,
    timeout: config.timeout || 30000,
    retries: config.retries || 3
  };
  
  this.config.agentReferences.set(name, reference);
  return this;
}
```

---

### Solution 2: Agent Discovery Service

**Concept**: A service that tracks agent locations and health.

#### Architecture

```
┌─────────────────┐
│ Discovery       │
│ Service         │
│                 │
│ - Agent Registry│
│ - Health Checks │
│ - Namespace Mgmt│
└─────────────────┘
         ▲
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼───┐
│Agent A│ │Agent B│
└───────┘ └───────┘
```

#### Agent Registration

When an agent starts:
1. Register with discovery service (if configured)
2. Provide: `agentId`, `namespace`, `deploymentId`, `url`, `healthEndpoint`
3. Send periodic heartbeats
4. Unregister on shutdown

#### Agent Lookup

When an agent needs to call another:
1. Check local references first (same deployment)
2. If external, query discovery service
3. Cache results with TTL
4. Fallback to direct URL if provided

#### Implementation

```javascript
// In docker/entrypoint.js
class AgentDiscovery {
  constructor(config) {
    this.discoveryService = config.discoveryService;
    this.agentId = process.env.AGENT_ID;
    this.namespace = process.env.AGENT_NAMESPACE;
    this.deploymentId = process.env.DEPLOYMENT_ID;
  }
  
  async register() {
    await axios.post(`${this.discoveryService}/agents/register`, {
      agentId: this.agentId,
      namespace: this.namespace,
      deploymentId: this.deploymentId,
      url: `http://${this.agentName}:${this.mainPort}`,
      healthEndpoint: `http://${this.agentName}:${this.mainPort}/health`
    });
  }
  
  async lookup(agentId, namespace) {
    const response = await axios.get(
      `${this.discoveryService}/agents/lookup`,
      { params: { agentId, namespace } }
    );
    return response.data.url;
  }
}
```

---

### Solution 3: Deployment Identity System

**Concept**: Each deployment gets a unique ID that isolates agent communication.

#### Deployment ID Generation

```javascript
// In lib/cli/run.js or lib/docker/manager.js
const deploymentId = process.env.DEPLOYMENT_ID || 
                     crypto.randomUUID() ||
                     `${config.name}-${Date.now()}`;

// Pass to all agents as environment variable
env.DEPLOYMENT_ID = deploymentId;
```

#### Agent Naming with Deployment ID

```javascript
// Container naming
const containerName = `dank-${deploymentId}-${agent.name}-${hash}`;

// Network scoping (optional - separate networks per deployment)
const networkName = `dank-network-${deploymentId}`;
```

#### Agent Discovery Within Deployment

```javascript
// In docker/entrypoint.js
class LocalAgentDiscovery {
  constructor() {
    this.deploymentId = process.env.DEPLOYMENT_ID;
    this.docker = require('dockerode')();
  }
  
  async findLocalAgent(agentName) {
    // Find containers in same deployment
    const containers = await this.docker.listContainers({
      filters: {
        name: [`dank-${this.deploymentId}-${agentName}`],
        status: ['running']
      }
    });
    
    if (containers.length > 0) {
      const container = containers[0];
      // Get container IP or use Docker network DNS
      return `http://dank-${this.deploymentId}-${agentName}:${port}`;
    }
    
    return null;
  }
}
```

---

### Solution 4: Agent Communication Helper

**Concept**: Provide a convenient API for agents to call other agents.

#### Implementation

```javascript
// In docker/entrypoint.js - add to req.agent context
createAgentCommunicationHelper() {
  const self = this;
  const agentReferences = this.agentCode?.agentReferences || {};
  const deploymentId = process.env.DEPLOYMENT_ID;
  
  return {
    /**
     * Call another agent by reference name
     */
    async callAgent(referenceName, options = {}) {
      const reference = agentReferences[referenceName];
      if (!reference) {
        throw new Error(`Agent reference '${referenceName}' not found`);
      }
      
      // Resolve agent URL
      let agentUrl;
      
      if (reference.type === 'local' || !reference.type) {
        // Local agent - use Docker network DNS
        agentUrl = await this.resolveLocalAgent(reference.name, deploymentId);
      } else if (reference.type === 'external' && reference.url) {
        // External agent - use provided URL
        agentUrl = reference.url;
      } else if (reference.type === 'discovery') {
        // Use discovery service
        agentUrl = await this.discoveryService.lookup(
          reference.agentId,
          reference.namespace
        );
      }
      
      // Make HTTP call to agent
      return await this.callAgentHTTP(agentUrl, options, reference);
    },
    
    /**
     * Resolve local agent URL
     */
    async resolveLocalAgent(agentName, deploymentId) {
      // Option 1: Docker network DNS (simplest)
      const port = 3000; // Default, could be from config
      return `http://dank-${deploymentId}-${agentName}:${port}`;
      
      // Option 2: Query Docker API for container IP
      // const container = await docker.getContainer(`dank-${deploymentId}-${agentName}`);
      // const inspect = await container.inspect();
      // return `http://${inspect.NetworkSettings.IPAddress}:${port}`;
    },
    
    /**
     * Make HTTP call to agent
     */
    async callAgentHTTP(agentUrl, options, reference) {
      const axios = require('axios');
      
      const config = {
        url: `${agentUrl}/prompt`,
        method: 'POST',
        data: {
          prompt: options.prompt,
          context: options.context
        },
        timeout: reference.timeout || 30000,
        headers: {}
      };
      
      // Add authentication if configured
      if (reference.authentication) {
        if (reference.authentication.type === 'bearer') {
          config.headers.Authorization = `Bearer ${reference.authentication.token}`;
        }
      }
      
      try {
        const response = await axios(config);
        return {
          content: response.data.content,
          metadata: response.data.metadata
        };
      } catch (error) {
        // Retry logic
        if (reference.retries > 0) {
          return await this.callAgentHTTP(agentUrl, options, {
            ...reference,
            retries: reference.retries - 1
          });
        }
        throw error;
      }
    }
  };
}
```

#### Usage in Routes

```javascript
createAgent('orchestrator')
  .addAgentReference('researcher', { type: 'local' })
  .addAgentReference('external-api', {
    type: 'external',
    url: 'https://api.example.com'
  })
  .post('/api/task', async (req, res) => {
    // Call local agent
    const research = await req.agent.agents.callAgent('researcher', {
      prompt: `Research: ${req.body.topic}`
    });
    
    // Call external agent
    const analysis = await req.agent.agents.callAgent('external-api', {
      prompt: `Analyze: ${research.content}`
    });
    
    res.json({
      research: research.content,
      analysis: analysis.content
    });
  })
```

---

### Solution 5: Config-Level Agent References

**Concept**: Define agent references at the config level, making them available to all agents.

#### Implementation

```javascript
// In dank.config.js
module.exports = {
  name: 'my-project',
  
  // Global agent references (available to all agents)
  agentReferences: {
    'external-research': {
      type: 'external',
      url: 'https://research.example.com'
    },
    'partner-agent': {
      type: 'discovery',
      namespace: 'partner/agents',
      agentId: 'specialist-123'
    }
  },
  
  agents: [
    createAgent('orchestrator')
      // Can use global references
      .post('/api/task', async (req, res) => {
        const result = await req.agent.agents.callAgent('external-research', {
          prompt: req.body.query
        });
        res.json({ result: result.content });
      })
  ]
};
```

---

## Communication Protocols

### 1. HTTP (Primary)

**Pros**:
- Simple and familiar
- Works across networks
- Easy to debug
- Supports authentication

**Cons**:
- Request/response only (no streaming)
- Higher latency for multiple calls
- No built-in pub/sub

**Implementation**: Standard REST API calls to `/prompt` or custom endpoints.

### 2. WebSocket (Optional)

**Pros**:
- Real-time bidirectional communication
- Lower latency for multiple messages
- Can stream responses

**Cons**:
- More complex
- Connection management
- Not all agents need it

**Implementation**: Optional WebSocket endpoint for agents that need real-time communication.

### 3. Message Queue (Advanced)

**Pros**:
- Decoupled communication
- Reliable delivery
- Can handle high throughput

**Cons**:
- Requires external service (Redis, RabbitMQ, etc.)
- More infrastructure complexity

**Implementation**: Optional integration with message queues for advanced use cases.

---

## Agent Identity and Namespacing

### Identity Components

1. **Agent Name**: Unique within a config (e.g., `researcher`)
2. **Agent ID**: Globally unique identifier (UUID)
3. **Namespace**: Logical grouping (e.g., `company/team`, `project/agents`)
4. **Deployment ID**: Unique per deployment instance

### Identity Structure

```
Agent Identity:
  - agentId: "550e8400-e29b-41d4-a716-446655440000"
  - name: "researcher"
  - namespace: "company/research-team"
  - deploymentId: "deployment-abc123"
  - url: "https://research-agent.example.com"
```

### Namespace Hierarchy

```
Namespace Examples:
  - "company/research-team" → Company-wide research agents
  - "project/alpha/agents" → Project-specific agents
  - "partner/external" → External partner agents
  - "local" → Local agents (same deployment)
```

### Preventing Cross-Contamination

**Problem**: Multiple deployments of same config should not interfere.

**Solution**:
1. **Deployment ID**: Each deployment gets unique ID
2. **Network Isolation**: Optional separate Docker networks per deployment
3. **Discovery Filtering**: Discovery service filters by deployment ID
4. **Reference Validation**: Validate agent references match deployment

```javascript
// Agent reference validation
if (reference.type === 'local') {
  // Ensure agent is in same deployment
  const targetDeploymentId = await getAgentDeploymentId(reference.name);
  if (targetDeploymentId !== this.deploymentId) {
    throw new Error(`Agent ${reference.name} is in different deployment`);
  }
}
```

---

## Deployment Scenarios

### Scenario 1: Single Local Deployment

**Setup**:
```javascript
// dank.config.js
agents: [
  createAgent('agent-a'),
  createAgent('agent-b')
]
```

**Communication**:
- Agents use Docker network DNS: `http://dank-{deploymentId}-agent-b:3000`
- No external dependencies
- Fast, low-latency communication

### Scenario 2: Hybrid Deployment (Local + External)

**Setup**:
```javascript
agents: [
  createAgent('local-agent')
    .addAgentReference('external-agent', {
      type: 'external',
      url: 'https://external.example.com'
    })
]
```

**Communication**:
- Local agents: Docker network DNS
- External agents: HTTP calls to provided URL
- Requires network connectivity

### Scenario 3: Multiple Deployments (Same Config)

**Problem**: Two teams deploy same config independently.

**Solution**:
- Each deployment gets unique `DEPLOYMENT_ID`
- Agents only discover agents in same deployment
- Container names include deployment ID: `dank-{deploymentId}-{agentName}`

**Communication**:
- Agents in same deployment: Local network
- Agents in different deployments: Treated as external (if explicitly referenced)

### Scenario 4: Distributed Agents (Different Deployments)

**Setup**:
```javascript
// Team A's config
agents: [
  createAgent('orchestrator')
    .addAgentReference('specialist', {
      type: 'discovery',
      namespace: 'team-b/agents',
      agentId: 'specialist-123'
    })
]

// Team B's config (deployed separately)
agents: [
  createAgent('specialist')
    // Registers with discovery service
]
```

**Communication**:
- Uses discovery service to find agent
- Discovery service returns current URL
- Agents communicate via HTTP

### Scenario 5: Unknown URLs at Config Time (Post-Deployment Resolution)

**Problem**: User defines two agents in same config, deploys them to separate cloud environments. HTTPS addresses are unknown until after deployment.

**Example**:
```javascript
// dank.config.js - defined BEFORE deployment
module.exports = {
  agents: [
    createAgent('agent-a')
      .addAgentReference('agent-b', {
        // ❌ Problem: We don't know the URL yet!
        // url: 'https://???'
      }),
    
    createAgent('agent-b')
  ]
};

// Deploy to:
// - agent-a → https://agent-a-abc123.cloud-provider.com
// - agent-b → https://agent-b-xyz789.cloud-provider.com
```

**Solutions**:

#### Solution A: Discovery Service (Recommended)

**Concept**: Use logical identifiers (agentId + namespace) instead of URLs. Agents register with discovery service after deployment.

**Config**:
```javascript
module.exports = {
  name: 'my-system',
  
  // Define namespace for this deployment
  namespace: 'my-company/my-project',
  
  agents: [
    createAgent('agent-a')
      .setAgentId('agent-a-v1') // Stable identifier
      .addAgentReference('agent-b', {
        type: 'discovery',
        namespace: 'my-company/my-project', // Same namespace
        agentId: 'agent-b-v1', // Reference by ID, not URL
        discoveryService: process.env.DISCOVERY_SERVICE_URL || 'https://discovery.ai-dank.xyz'
      }),
    
    createAgent('agent-b')
      .setAgentId('agent-b-v1') // Stable identifier
      // Automatically registers with discovery service on startup
  ]
};
```

**How It Works**:
1. **Before Deployment**: Config uses logical identifiers (agentId, namespace)
2. **During Deployment**: Each agent gets deployed, receives HTTPS URL
3. **After Deployment**: Agents register with discovery service:
   ```javascript
   // Agent registers itself
   POST /discovery/agents/register
   {
     agentId: 'agent-b-v1',
     namespace: 'my-company/my-project',
     url: 'https://agent-b-xyz789.cloud-provider.com', // Known after deployment
     healthEndpoint: 'https://agent-b-xyz789.cloud-provider.com/health'
   }
   ```
4. **At Runtime**: When agent-a needs agent-b:
   ```javascript
   // Agent-a looks up agent-b
   GET /discovery/agents/lookup?agentId=agent-b-v1&namespace=my-company/my-project
   // Returns: { url: 'https://agent-b-xyz789.cloud-provider.com' }
   ```

#### Detailed Example: Complete Flow

**Step 1: Define Config with Discovery References**

```javascript
// dank.config.js
const { createAgent } = require('dank-ai');

module.exports = {
  name: 'research-system',
  
  // Define namespace for this project/deployment
  namespace: 'acme-corp/research-team',
  
  agents: [
    // Orchestrator agent that coordinates other agents
    createAgent('orchestrator')
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4',
        temperature: 0.7
      })
      .setPrompt('You are an orchestrator that coordinates research tasks.')
      .setAgentId('orchestrator-v1') // Stable identifier
      .setPromptingServer({ port: 3000 })
      
      // Reference to researcher agent (will be discovered)
      .addAgentReference('researcher', {
        type: 'discovery',
        namespace: 'acme-corp/research-team', // Same namespace
        agentId: 'researcher-v1', // Reference by stable ID
        discoveryService: process.env.DISCOVERY_SERVICE_URL || 'https://discovery.ai-dank.xyz'
      })
      
      // Reference to analyzer agent (will be discovered)
      .addAgentReference('analyzer', {
        type: 'discovery',
        namespace: 'acme-corp/research-team',
        agentId: 'analyzer-v1',
        discoveryService: process.env.DISCOVERY_SERVICE_URL || 'https://discovery.ai-dank.xyz'
      })
      
      // Custom route that uses agent communication
      .post('/api/research-task', async (req, res) => {
        const { topic } = req.body;
        
        try {
          // Step 1: Call researcher agent
          const researchResult = await req.agent.agents.callAgent('researcher', {
            prompt: `Research the topic: ${topic}. Provide a comprehensive analysis.`
          });
          
          // Step 2: Call analyzer agent with research results
          const analysisResult = await req.agent.agents.callAgent('analyzer', {
            prompt: `Based on this research: ${researchResult.content}\n\nAnalyze the key insights and implications.`
          });
          
          // Step 3: Synthesize results using orchestrator's own LLM
          const synthesis = await req.agent.callLLM({
            systemPrompt: 'You are a synthesizer that creates executive summaries.',
            userPrompt: `Research: ${researchResult.content}\n\nAnalysis: ${analysisResult.content}\n\nCreate a comprehensive summary.`
          });
          
          res.json({
            success: true,
            research: researchResult.content,
            analysis: analysisResult.content,
            synthesis: synthesis.content,
            metadata: {
              researchTokens: researchResult.metadata?.usage?.total_tokens || 0,
              analysisTokens: analysisResult.metadata?.usage?.total_tokens || 0,
              synthesisTokens: synthesis.usage?.total_tokens || 0
            }
          });
        } catch (error) {
          res.status(500).json({
            success: false,
            error: 'Agent communication failed',
            message: error.message
          });
        }
      }),
    
    // Researcher agent - specialized for research tasks
    createAgent('researcher')
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4',
        temperature: 0.3 // Lower temperature for factual research
      })
      .setPrompt('You are an expert researcher. Provide detailed, factual research on any topic.')
      .setAgentId('researcher-v1') // Stable identifier
      .setPromptingServer({ port: 3001 })
      // Automatically registers with discovery service on startup
      ,
    
    // Analyzer agent - specialized for analysis
    createAgent('analyzer')
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4',
        temperature: 0.5
      })
      .setPrompt('You are an expert analyst. Analyze information and provide strategic insights.')
      .setAgentId('analyzer-v1') // Stable identifier
      .setPromptingServer({ port: 3002 })
      // Automatically registers with discovery service on startup
  ]
};
```

**Step 2: Deploy Agents to Separate Cloud Environments**

```bash
# Deploy orchestrator to Cloud Provider A
dank build:prod --config dank.config.js --tag orchestrator
dank deploy --agent orchestrator --platform cloud-provider-a

# Result: orchestrator deployed to
# https://orchestrator-abc123.cloud-provider-a.com

# Deploy researcher to Cloud Provider B
dank build:prod --config dank.config.js --tag researcher
dank deploy --agent researcher --platform cloud-provider-b

# Result: researcher deployed to
# https://researcher-xyz789.cloud-provider-b.com

# Deploy analyzer to Cloud Provider C
dank build:prod --config dank.config.js --tag analyzer
dank deploy --agent analyzer --platform cloud-provider-c

# Result: analyzer deployed to
# https://analyzer-def456.cloud-provider-c.com
```

**Step 3: Agent Registration (Automatic on Startup)**

When each agent starts, it automatically registers with the discovery service:

```javascript
// In docker/entrypoint.js - AgentRuntime.initialize()

async initialize() {
  // ... existing initialization ...
  
  // Register with discovery service if configured
  if (this.agentReferences && this.hasDiscoveryReferences()) {
    await this.registerWithDiscoveryService();
  }
  
  // ... rest of initialization ...
}

async registerWithDiscoveryService() {
  const agentId = process.env.AGENT_ID; // 'researcher-v1'
  const namespace = process.env.AGENT_NAMESPACE; // 'acme-corp/research-team'
  const discoveryService = process.env.DISCOVERY_SERVICE_URL;
  
  // Get the agent's public URL (provided by deployment platform)
  const agentUrl = process.env.AGENT_PUBLIC_URL || 
                   `http://${this.agentName}:${this.mainPort}`;
  
  try {
    const response = await axios.post(
      `${discoveryService}/agents/register`,
      {
        agentId: agentId,
        namespace: namespace,
        url: agentUrl,
        healthEndpoint: `${agentUrl}/health`,
        metadata: {
          agentName: this.agentName,
          model: this.llmModel,
          provider: this.llmProvider,
          version: process.env.AGENT_VERSION || '1.0.0'
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DISCOVERY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    logger.info(`Registered with discovery service: ${agentId} at ${agentUrl}`);
    
    // Start heartbeat to keep registration alive
    this.startDiscoveryHeartbeat(discoveryService, agentId, namespace);
    
  } catch (error) {
    logger.error(`Failed to register with discovery service: ${error.message}`);
    // Continue anyway - agent can still function, just won't be discoverable
  }
}

startDiscoveryHeartbeat(discoveryService, agentId, namespace) {
  // Send heartbeat every 30 seconds
  setInterval(async () => {
    try {
      await axios.post(
        `${discoveryService}/agents/heartbeat`,
        {
          agentId: agentId,
          namespace: namespace
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.DISCOVERY_API_KEY}`
          },
          timeout: 5000
        }
      );
    } catch (error) {
      logger.warn(`Discovery heartbeat failed: ${error.message}`);
    }
  }, 30000);
}
```

**Registration Requests**:

```javascript
// Researcher agent registers:
POST https://discovery.ai-dank.xyz/agents/register
Headers: {
  Authorization: Bearer <api-key>
}
Body: {
  agentId: "researcher-v1",
  namespace: "acme-corp/research-team",
  url: "https://researcher-xyz789.cloud-provider-b.com",
  healthEndpoint: "https://researcher-xyz789.cloud-provider-b.com/health",
  metadata: {
    agentName: "researcher",
    model: "gpt-4",
    provider: "openai",
    version: "1.0.0"
  }
}

// Response:
{
  success: true,
  registered: true,
  expiresAt: "2024-01-15T10:30:00Z" // Registration expires if no heartbeat
}

// Analyzer agent registers:
POST https://discovery.ai-dank.xyz/agents/register
Body: {
  agentId: "analyzer-v1",
  namespace: "acme-corp/research-team",
  url: "https://analyzer-def456.cloud-provider-c.com",
  healthEndpoint: "https://analyzer-def456.cloud-provider-c.com/health",
  metadata: { ... }
}
```

**Step 4: Agent Lookup (At Runtime)**

When orchestrator needs to call researcher:

```javascript
// In docker/entrypoint.js - AgentCommunicationHelper

async callAgent(referenceName, options = {}) {
  const reference = this.agentReferences[referenceName];
  if (!reference) {
    throw new Error(`Agent reference '${referenceName}' not found`);
  }
  
  let agentUrl;
  
  if (reference.type === 'discovery') {
    // Lookup agent URL from discovery service
    agentUrl = await this.lookupAgentFromDiscovery(
      reference.agentId,
      reference.namespace,
      reference.discoveryService
    );
  } else if (reference.type === 'local') {
    // Local agent - use Docker network DNS
    agentUrl = await this.resolveLocalAgent(reference.name);
  } else if (reference.type === 'external' && reference.url) {
    // External agent - use provided URL
    agentUrl = reference.url;
  }
  
  // Make HTTP call to agent
  return await this.callAgentHTTP(agentUrl, options, reference);
}

async lookupAgentFromDiscovery(agentId, namespace, discoveryService) {
  // Check cache first
  const cacheKey = `${agentId}:${namespace}`;
  const cached = this.discoveryCache?.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < 60000) { // 1 minute cache
    return cached.url;
  }
  
  try {
    const response = await axios.get(
      `${discoveryService}/agents/lookup`,
      {
        params: {
          agentId: agentId,
          namespace: namespace
        },
        headers: {
          'Authorization': `Bearer ${process.env.DISCOVERY_API_KEY}`
        },
        timeout: 5000
      }
    );
    
    const agentInfo = response.data;
    
    // Cache the result
    if (!this.discoveryCache) {
      this.discoveryCache = new Map();
    }
    this.discoveryCache.set(cacheKey, {
      url: agentInfo.url,
      timestamp: Date.now()
    });
    
    return agentInfo.url;
    
  } catch (error) {
    logger.error(`Discovery lookup failed: ${error.message}`);
    throw new Error(`Failed to lookup agent ${agentId}: ${error.message}`);
  }
}
```

**Lookup Request**:

```javascript
// Orchestrator looks up researcher:
GET https://discovery.ai-dank.xyz/agents/lookup?agentId=researcher-v1&namespace=acme-corp/research-team
Headers: {
  Authorization: Bearer <api-key>
}

// Response:
{
  success: true,
  agent: {
    agentId: "researcher-v1",
    namespace: "acme-corp/research-team",
    url: "https://researcher-xyz789.cloud-provider-b.com",
    healthEndpoint: "https://researcher-xyz789.cloud-provider-b.com/health",
    status: "online",
    lastHeartbeat: "2024-01-15T10:29:45Z",
    metadata: {
      agentName: "researcher",
      model: "gpt-4",
      provider: "openai"
    }
  }
}
```

**Step 5: Agent Communication (HTTP Call)**

```javascript
async callAgentHTTP(agentUrl, options, reference) {
  const axios = require('axios');
  
  const config = {
    url: `${agentUrl}/prompt`,
    method: 'POST',
    data: {
      prompt: options.prompt,
      context: options.context || {},
      conversationId: options.conversationId || require('uuid').v4()
    },
    timeout: reference.timeout || 30000,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  // Add authentication if configured
  if (reference.authentication) {
    if (reference.authentication.type === 'bearer') {
      config.headers.Authorization = `Bearer ${reference.authentication.token}`;
    }
  }
  
  try {
    const response = await axios(config);
    return {
      content: response.data.content,
      metadata: response.data.metadata || {}
    };
  } catch (error) {
    // Retry logic
    if (reference.retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s
      return await this.callAgentHTTP(agentUrl, options, {
        ...reference,
        retries: reference.retries - 1
      });
    }
    throw new Error(`Agent call failed: ${error.message}`);
  }
}
```

**Step 6: Complete Request Flow**

```javascript
// User makes request to orchestrator
POST https://orchestrator-abc123.cloud-provider-a.com/api/research-task
Body: {
  topic: "Climate change impact on agriculture"
}

// Orchestrator's handler executes:
// 1. Looks up researcher URL from discovery service
//    GET /discovery/agents/lookup?agentId=researcher-v1&namespace=acme-corp/research-team
//    Returns: https://researcher-xyz789.cloud-provider-b.com

// 2. Calls researcher agent
POST https://researcher-xyz789.cloud-provider-b.com/prompt
Body: {
  prompt: "Research the topic: Climate change impact on agriculture. Provide a comprehensive analysis."
}

// Researcher responds:
{
  content: "Climate change significantly impacts agriculture through...",
  metadata: { usage: { total_tokens: 1250 } }
}

// 3. Looks up analyzer URL from discovery service
//    GET /discovery/agents/lookup?agentId=analyzer-v1&namespace=acme-corp/research-team
//    Returns: https://analyzer-def456.cloud-provider-c.com

// 4. Calls analyzer agent
POST https://analyzer-def456.cloud-provider-c.com/prompt
Body: {
  prompt: "Based on this research: [research content]... Analyze the key insights."
}

// Analyzer responds:
{
  content: "Key insights include...",
  metadata: { usage: { total_tokens: 890 } }
}

// 5. Orchestrator synthesizes using its own LLM
// 6. Returns final response to user
{
  success: true,
  research: "...",
  analysis: "...",
  synthesis: "...",
  metadata: { ... }
}
```

**Step 7: Error Handling and Resilience**

```javascript
// In route handler with error handling
.post('/api/research-task', async (req, res) => {
  const { topic } = req.body;
  
  try {
    // Call researcher with retry logic
    let researchResult;
    try {
      researchResult = await req.agent.agents.callAgent('researcher', {
        prompt: `Research: ${topic}`,
        retries: 3,
        timeout: 30000
      });
    } catch (error) {
      // Fallback: Use orchestrator's own LLM for research
      logger.warn(`Researcher agent unavailable, using fallback: ${error.message}`);
      researchResult = await req.agent.callLLM({
        systemPrompt: 'You are a researcher. Provide detailed research.',
        userPrompt: `Research: ${topic}`
      });
    }
    
    // Continue with analysis...
    const analysisResult = await req.agent.agents.callAgent('analyzer', {
      prompt: `Analyze: ${researchResult.content}`
    });
    
    res.json({ research: researchResult.content, analysis: analysisResult.content });
    
  } catch (error) {
    res.status(500).json({
      error: 'Research task failed',
      message: error.message
    });
  }
})
```

**Step 8: Discovery Service API Specification**

```javascript
// Discovery Service Endpoints

// 1. Register Agent
POST /agents/register
Headers: { Authorization: Bearer <api-key> }
Body: {
  agentId: string,
  namespace: string,
  url: string,
  healthEndpoint: string,
  metadata?: object
}
Response: {
  success: boolean,
  registered: boolean,
  expiresAt: string
}

// 2. Lookup Agent
GET /agents/lookup?agentId=<id>&namespace=<namespace>
Headers: { Authorization: Bearer <api-key> }
Response: {
  success: boolean,
  agent: {
    agentId: string,
    namespace: string,
    url: string,
    status: 'online' | 'offline',
    lastHeartbeat: string,
    metadata: object
  }
}

// 3. Heartbeat
POST /agents/heartbeat
Headers: { Authorization: Bearer <api-key> }
Body: {
  agentId: string,
  namespace: string
}
Response: {
  success: boolean,
  expiresAt: string
}

// 4. List Agents in Namespace
GET /agents/list?namespace=<namespace>
Headers: { Authorization: Bearer <api-key> }
Response: {
  success: boolean,
  agents: [
    {
      agentId: string,
      url: string,
      status: string,
      metadata: object
    }
  ]
}

// 5. Unregister Agent
DELETE /agents/unregister?agentId=<id>&namespace=<namespace>
Headers: { Authorization: Bearer <api-key> }
Response: {
  success: boolean
}
```

**Pros**:
- ✅ No URLs needed in config
- ✅ Works across any deployment platform
- ✅ Handles URL changes automatically
- ✅ Supports multiple instances of same agent

**Cons**:
- ❌ Requires discovery service
- ❌ Additional network call for lookups (can be cached)

---

#### Solution B: Environment Variable Placeholders

**Concept**: Use environment variables that get resolved at runtime or during deployment.

**Config**:
```javascript
module.exports = {
  agents: [
    createAgent('agent-a')
      .addAgentReference('agent-b', {
        type: 'external',
        // Use env var placeholder - resolved at runtime
        url: process.env.AGENT_B_URL || '${AGENT_B_URL}'
      }),
    
    createAgent('agent-b')
      // Agent B's URL will be set as env var after deployment
  ]
};
```

**Deployment Process**:
1. Deploy agent-b → Get URL: `https://agent-b-xyz789.cloud-provider.com`
2. Set environment variable: `AGENT_B_URL=https://agent-b-xyz789.cloud-provider.com`
3. Deploy agent-a with env var set
4. Agent-a resolves reference at runtime

**Alternative: Deployment-time Resolution**:
```javascript
// dank.config.js supports placeholders
.addAgentReference('agent-b', {
  type: 'external',
  url: '${AGENT_B_URL}' // Placeholder syntax
})

// During deployment, CLI resolves placeholders
// dank deploy --set AGENT_B_URL=https://agent-b-xyz789.cloud-provider.com
```

**Pros**:
- ✅ Simple, no discovery service needed
- ✅ Works with existing deployment tools
- ✅ Familiar pattern (env vars)

**Cons**:
- ❌ Requires manual URL management
- ❌ URLs must be known before deploying dependent agents
- ❌ Doesn't handle URL changes automatically

---

#### Solution C: Deployment Metadata Injection

**Concept**: Deployment platform provides metadata that agents can use to discover each other.

**Config**:
```javascript
module.exports = {
  agents: [
    createAgent('agent-a')
      .addAgentReference('agent-b', {
        type: 'metadata',
        // Reference by logical name, resolve via deployment metadata
        agentName: 'agent-b',
        metadataSource: 'deployment' // Use deployment-provided metadata
      }),
    
    createAgent('agent-b')
  ]
};
```

**How It Works**:
1. **Deployment Platform** (e.g., Dank Cloud) tracks all deployed agents
2. **After Deployment**: Platform provides metadata endpoint:
   ```javascript
   // Available to all agents in same deployment/project
   GET /metadata/agents
   // Returns:
   {
     'agent-a': { url: 'https://agent-a-abc123.cloud-provider.com' },
     'agent-b': { url: 'https://agent-b-xyz789.cloud-provider.com' }
   }
   ```
3. **At Runtime**: Agent-a queries metadata to find agent-b's URL

**Pros**:
- ✅ No URLs in config
- ✅ Automatic discovery
- ✅ Platform-managed

**Cons**:
- ❌ Requires platform support
- ❌ Platform-specific solution

---

#### Solution D: Two-Phase Configuration

**Concept**: Define logical references in config, update with actual URLs after deployment.

**Phase 1 - Config Definition**:
```javascript
module.exports = {
  agents: [
    createAgent('agent-a')
      .addAgentReference('agent-b', {
        type: 'pending', // Placeholder - will be resolved
        agentName: 'agent-b'
      }),
    
    createAgent('agent-b')
  ]
};
```

**Phase 2 - Post-Deployment Update**:
```bash
# Deploy agents
dank deploy:prod

# Get deployment URLs
dank get-deployment-urls
# Returns:
# agent-a: https://agent-a-abc123.cloud-provider.com
# agent-b: https://agent-b-xyz789.cloud-provider.com

# Update references
dank update-references \
  --agent agent-a \
  --reference agent-b \
  --url https://agent-b-xyz789.cloud-provider.com
```

**Or: Automatic Resolution**:
```javascript
// CLI automatically resolves references after deployment
dank deploy:prod --auto-resolve-references

// CLI:
// 1. Deploys all agents
// 2. Collects URLs
// 3. Updates agent configs with actual URLs
// 4. Redeploys agents with updated configs (or updates runtime config)
```

**Pros**:
- ✅ Clear separation of concerns
- ✅ Flexible - can update references later
- ✅ Works with any deployment platform

**Cons**:
- ❌ Two-step process
- ❌ May require redeployment or runtime config updates

---

#### Solution E: Namespace + Agent Name Resolution

**Concept**: Use a consistent naming/URL pattern that can be derived from agent names.

**Config**:
```javascript
module.exports = {
  name: 'my-system',
  namespace: 'my-company/my-project',
  
  agents: [
    createAgent('agent-a')
      .addAgentReference('agent-b', {
        type: 'resolved',
        // URL pattern derived from namespace + agent name
        namespace: 'my-company/my-project',
        agentName: 'agent-b',
        // URL template: https://{namespace-slug}-{agent-name}.ai-dank.xyz
        urlPattern: 'https://{namespace}-{agent}.ai-dank.xyz'
      }),
    
    createAgent('agent-b')
  ]
};
```

**URL Resolution**:
```javascript
// Resolve URL from pattern
const namespaceSlug = namespace.replace(/\//g, '-'); // 'my-company-my-project'
const url = `https://${namespaceSlug}-agent-b.ai-dank.xyz`;
// Result: https://my-company-my-project-agent-b.ai-dank.xyz
```

**Pros**:
- ✅ Predictable URLs
- ✅ No discovery service needed
- ✅ Works if platform uses consistent naming

**Cons**:
- ❌ Requires platform to follow naming convention
- ❌ Less flexible for custom deployments

---

## Recommended Solution for Unknown URLs

**For Cloud Deployments**: **Solution A (Discovery Service)** is recommended because:

1. **No URLs in Config**: Config uses logical identifiers only
2. **Automatic Resolution**: Agents register after deployment, URLs resolved at runtime
3. **Platform Agnostic**: Works with any deployment platform
4. **Handles Changes**: If agent URL changes, just re-registers
5. **Supports Multiple Instances**: Can have multiple instances of same agent

**Implementation Priority**: High - This is essential for cloud deployments where URLs are dynamic.

**Fallback**: If discovery service is not available, use **Solution B (Environment Variables)** with deployment-time injection.

---

## Implementation Plan

### Phase 1: Local Agent Communication

**Priority**: High  
**Effort**: Medium

1. Add `DEPLOYMENT_ID` generation and injection
2. Update container naming to include deployment ID
3. Add `addAgentReference()` method
4. Implement local agent resolution (Docker DNS)
5. Add `req.agent.agents.callAgent()` helper
6. Update route handlers to use agent communication

**Changes**:
- `lib/agent.js`: Add `addAgentReference()` method
- `lib/docker/manager.js`: Generate and inject `DEPLOYMENT_ID`
- `docker/entrypoint.js`: Add agent communication helper
- `lib/config.js`: Store agent references in config

### Phase 2: External Agent Communication

**Priority**: High  
**Effort**: Medium

1. Support external URL references
2. Add authentication support
3. Add retry and timeout handling
4. Add health checking for external agents

**Changes**:
- `docker/entrypoint.js`: Enhance `callAgentHTTP()` with auth, retries
- `lib/agent.js`: Validate external reference configs

### Phase 3: Discovery Service (Optional)

**Priority**: Medium  
**Effort**: High

1. Design discovery service API
2. Implement agent registration
3. Implement agent lookup
4. Add health check integration
5. Add caching for lookups

**Changes**:
- New service: `lib/discovery/client.js`
- `docker/entrypoint.js`: Register agent on startup
- `lib/agent.js`: Support discovery-based references

### Phase 4: Advanced Features

**Priority**: Low  
**Effort**: High

1. WebSocket support for real-time communication
2. Message queue integration
3. Agent versioning
4. Load balancing for multiple agent instances

---

## Example Configurations

### Example 1: Local Multi-Agent System

```javascript
module.exports = {
  name: 'research-system',
  agents: [
    createAgent('orchestrator')
      .addAgentReference('researcher', { type: 'local' })
      .addAgentReference('analyzer', { type: 'local' })
      .post('/api/research', async (req, res) => {
        // Step 1: Research
        const research = await req.agent.agents.callAgent('researcher', {
          prompt: `Research: ${req.body.topic}`
        });
        
        // Step 2: Analyze
        const analysis = await req.agent.agents.callAgent('analyzer', {
          prompt: `Analyze: ${research.content}`
        });
        
        res.json({
          research: research.content,
          analysis: analysis.content
        });
      }),
    
    createAgent('researcher')
      .setPrompt('You are a research expert.')
      .setPromptingServer({ port: 3001 }),
    
    createAgent('analyzer')
      .setPrompt('You are an analyst.')
      .setPromptingServer({ port: 3002 })
  ]
};
```

### Example 2: Hybrid System (Local + External)

```javascript
module.exports = {
  name: 'hybrid-system',
  agents: [
    createAgent('client')
      .addAgentReference('local-helper', { type: 'local' })
      .addAgentReference('external-api', {
        type: 'external',
        url: 'https://api.partner.com',
        authentication: {
          type: 'bearer',
          token: process.env.PARTNER_API_TOKEN
        }
      })
      .post('/api/task', async (req, res) => {
        // Use local helper
        const localResult = await req.agent.agents.callAgent('local-helper', {
          prompt: req.body.query
        });
        
        // Call external API
        const externalResult = await req.agent.agents.callAgent('external-api', {
          prompt: localResult.content
        });
        
        res.json({ result: externalResult.content });
      }),
    
    createAgent('local-helper')
      .setPrompt('You are a helpful assistant.')
  ]
};
```

### Example 3: Distributed System with Discovery

```javascript
// Team A's config
module.exports = {
  name: 'team-a-system',
  agents: [
    createAgent('orchestrator')
      .addAgentReference('team-b-specialist', {
        type: 'discovery',
        namespace: 'team-b/agents',
        agentId: 'specialist-123',
        discoveryService: 'https://discovery.ai-dank.xyz'
      })
      .post('/api/task', async (req, res) => {
        const result = await req.agent.agents.callAgent('team-b-specialist', {
          prompt: req.body.query
        });
        res.json({ result: result.content });
      })
  ]
};

// Team B's config (deployed separately)
module.exports = {
  name: 'team-b-system',
  agents: [
    createAgent('specialist')
      .setPrompt('You are a specialist.')
      // Automatically registers with discovery service
  ]
};
```

---

## Security Considerations

### 1. Authentication

**Between Agents**:
- Bearer tokens
- API keys
- mTLS (mutual TLS) for production

**Discovery Service**:
- API keys for registration
- Namespace-based access control

### 2. Network Security

- Agents in same deployment: Trusted network (Docker network)
- External agents: HTTPS only
- Firewall rules for external access

### 3. Authorization

- Namespace-based access control
- Agent-level permissions
- Rate limiting per agent

---

## Summary

**Recommended Approach**:

1. **Phase 1**: Implement local agent communication with deployment ID isolation
2. **Phase 2**: Add external agent support with URL references
3. **Phase 3**: Optional discovery service for distributed systems

**Key Design Decisions**:

- **Deployment ID**: Essential for preventing cross-contamination
- **Agent References**: Flexible system supporting local, external, and discovery-based
- **Communication Helper**: Convenient API via `req.agent.agents.callAgent()`
- **HTTP Primary**: Start with HTTP, add WebSocket/queues later if needed

This architecture enables:
- ✅ Local agent collaboration
- ✅ External agent integration
- ✅ Multi-deployment isolation
- ✅ Distributed agent systems
- ✅ Flexible communication patterns

