/**
 * DankProject - Project Management Class
 * 
 * This class manages a collection of agents and provides
 * project-level configuration and operations.
 */

const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const { DankAgent } = require('./agent');

class DankProject {
  constructor(name, options = {}) {
    this.name = name;
    this.options = {
      configFile: 'dank.config.js',
      agentsDir: 'agents',
      outputDir: '.dank',
      ...options
    };
    
    this.agents = new Map();
    this.projectPath = process.cwd();
    this.configPath = path.join(this.projectPath, this.options.configFile);
    this.createdAt = new Date().toISOString();
  }

  /**
   * Add an agent to the project
   */
  addAgent(agent) {
    if (!(agent instanceof DankAgent)) {
      throw new Error('Agent must be an instance of DankAgent');
    }

    if (this.agents.has(agent.name)) {
      throw new Error(`Agent with name '${agent.name}' already exists`);
    }

    this.agents.set(agent.name, agent);
    return this;
  }

  /**
   * Remove an agent from the project
   */
  removeAgent(name) {
    if (!this.agents.has(name)) {
      throw new Error(`Agent '${name}' not found`);
    }

    this.agents.delete(name);
    return this;
  }

  /**
   * Get an agent by name
   */
  getAgent(name) {
    return this.agents.get(name);
  }

  /**
   * Get all agents
   */
  getAllAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * Save project configuration to file
   */
  async save() {
    const config = this.toConfig();
    
    // Ensure output directory exists
    await fs.ensureDir(path.join(this.projectPath, this.options.outputDir));
    
    // Save as YAML for readability
    const yamlConfig = yaml.dump(config, { 
      indent: 2,
      lineWidth: 120,
      noCompatMode: true
    });
    
    const configFile = path.join(this.projectPath, this.options.outputDir, 'project.yaml');
    await fs.writeFile(configFile, yamlConfig, 'utf8');
    
    console.log(`Project configuration saved to: ${configFile}`);
    return configFile;
  }

  /**
   * Load project configuration from file
   */
  async load() {
    const configFile = path.join(this.projectPath, this.options.outputDir, 'project.yaml');
    
    if (!(await fs.pathExists(configFile))) {
      throw new Error(`Project configuration not found: ${configFile}`);
    }

    const yamlContent = await fs.readFile(configFile, 'utf8');
    const config = yaml.load(yamlContent);
    
    return this.fromConfig(config);
  }

  /**
   * Initialize a new project structure
   */
  async init() {
    const projectDir = this.projectPath;
    
    // Create directory structure
    await fs.ensureDir(path.join(projectDir, this.options.agentsDir));
    await fs.ensureDir(path.join(projectDir, this.options.outputDir));
    
    // Create example config file
    const exampleConfig = this._generateExampleConfig();
    const configPath = path.join(projectDir, this.options.configFile);
    
    if (!(await fs.pathExists(configPath))) {
      await fs.writeFile(configPath, exampleConfig, 'utf8');
      console.log(`Created example configuration: ${configPath}`);
    }

    // Create example agent
    const exampleAgent = this._generateExampleAgent();
    const agentPath = path.join(projectDir, this.options.agentsDir, 'example-agent.js');
    
    if (!(await fs.pathExists(agentPath))) {
      await fs.writeFile(agentPath, exampleAgent, 'utf8');
      console.log(`Created example agent: ${agentPath}`);
    }

    console.log(`\\nDank project '${this.name}' initialized!`);
    console.log(`\\nNext steps:`);
    console.log(`1. Edit ${this.options.configFile} to configure your agents`);
    console.log(`2. Run 'dank run' to start your agents`);
    
    return this;
  }

  /**
   * Convert project to configuration object
   */
  toConfig() {
    return {
      name: this.name,
      version: '1.0.0',
      createdAt: this.createdAt,
      options: this.options,
      agents: Object.fromEntries(
        Array.from(this.agents.entries()).map(([name, agent]) => [
          name,
          agent.toConfig()
        ])
      )
    };
  }

  /**
   * Create project from configuration object
   */
  fromConfig(config) {
    this.name = config.name;
    this.createdAt = config.createdAt;
    this.options = { ...this.options, ...config.options };
    
    // Restore agents
    this.agents.clear();
    if (config.agents) {
      Object.entries(config.agents).forEach(([name, agentConfig]) => {
        const agent = DankAgent.fromConfig(agentConfig);
        this.agents.set(name, agent);
      });
    }
    
    return this;
  }

  /**
   * Generate example configuration file
   */
  _generateExampleConfig() {
    // Detect if we're in development mode (inside the dank repo)
    const isDevelopment = this.projectPath.includes('/dank') && 
                         fs.existsSync(path.join(this.projectPath, '../lib/index.js'));
    
    const requirePath = isDevelopment ? '../lib/index.js' : 'dank';
    
    return `/**
 * Dank Agent Configuration
 * 
 * This file defines your AI agents and their configurations.
 * Run 'dank run' to start all defined agents.
 */

const { createAgent } = require('${requirePath}');

module.exports = {
  // Project configuration
  name: '${this.name}',
  
  // Define your agents
  agents: [
    // Example 1: Direct Prompting Agent with Event Handlers
    createAgent('prompt-agent')
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-3.5-turbo',
        temperature: 0.7
      })
      .setPrompt('You are a helpful AI assistant. Be concise and friendly in your responses.')
      .setBaseImage('nodejs-20')
      .setPort(3000)
      .setResources({
        memory: '512m',
        cpu: 1
      })
      // Event handlers for prompt modification and response enhancement
      .addHandler('request_output:start', (data) => {
        console.log('[Prompt Agent] Processing prompt:', data.conversationId);
        console.log('[Prompt Agent] Original prompt:', data.prompt);
        
        // Enhance the prompt with context
        const enhancedPrompt = \`Context: You are a helpful AI assistant. Please be concise and friendly.\\n\\nUser Question: \${data.prompt}\\n\\nPlease provide a clear, helpful response.\`;
        
        console.log('[Prompt Agent] Enhanced prompt:', enhancedPrompt);
        
        return {
          prompt: enhancedPrompt
        };
      })
      .addHandler('request_output', (data) => {
        console.log('[Prompt Agent] LLM Response:', {
          prompt: data.prompt,
          finalPrompt: data.finalPrompt,
          promptModified: data.promptModified,
          response: data.response,
          conversationId: data.conversationId,
          processingTime: data.processingTime,
          usage: data.usage,
          model: data.model
        });
      })
      .addHandler('request_output:end', (data) => {
        console.log('[Prompt Agent] Completed in:', data.processingTime + 'ms');
        console.log('[Prompt Agent] Original response:', data.response ? data.response.substring(0, 50) + '...' : 'N/A');
        
        // Enhance the response with metadata
        const enhancedResponse = \`\${data.response}\\n\\n---\\n🤖 Generated by Dank Framework Agent\\n⏱️ Processing time: \${data.processingTime}ms\\n\`;
        
        console.log('[Prompt Agent] Enhanced response:', enhancedResponse.substring(0, 100) + '...');
        
        return {
          response: enhancedResponse
        };
      })
      .addHandler('request_output:error', (data) => {
        console.error('[Prompt Agent] Error processing prompt:', data.error);
      })
      .addHandler('output', (data) => {
        console.log('[Prompt Agent] System output:', data);
      })
      .addHandler('error', (error) => {
        console.error('[Prompt Agent] System error:', error);
      }),

    // Example 2: HTTP API Agent with Tool Events
    createAgent('api-agent')
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4',
        temperature: 0.3
      })
      .setPrompt('You are a specialized API assistant that helps with data processing and analysis.')
      .setBaseImage('nodejs-20')
      .setPort(3001)
      .setResources({
        memory: '1g',
        cpu: 2
      })
      // HTTP API routes
      .get('/health', (req, res) => {
        res.json({ status: 'healthy', timestamp: new Date().toISOString() });
      })
      .post('/analyze', (req, res) => {
        res.json({ 
          message: 'Data analysis endpoint',
          data: req.body,
          timestamp: new Date().toISOString()
        });
      })
      .get('/status', (req, res) => {
        res.json({ 
          agent: 'api-agent',
          status: 'running',
          uptime: process.uptime()
        });
      })
      // Tool event handlers for HTTP requests
      .addHandler('tool:http-server:call', (data) => {
        console.log('[API Agent] HTTP Request:', {
          method: data.method,
          path: data.path,
          headers: data.headers,
          body: data.body,
          timestamp: data.timestamp
        });
      })
      .addHandler('tool:http-server:response', (data) => {
        console.log('[API Agent] HTTP Response:', {
          statusCode: data.statusCode,
          headers: data.headers,
          body: data.body,
          processingTime: data.processingTime,
          timestamp: data.timestamp
        });
      })
      .addHandler('tool:http-server:error', (data) => {
        console.error('[API Agent] HTTP Error:', {
          error: data.error,
          method: data.method,
          path: data.path,
          timestamp: data.timestamp
        });
      })
      .addHandler('output', (data) => {
        console.log('[API Agent] System output:', data);
      })
      .addHandler('error', (error) => {
        console.error('[API Agent] System error:', error);
      }),

    // Example 3: Multi-Modal Agent with All Features
    createAgent('multi-agent')
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4',
        temperature: 0.5
      })
      .setPrompt('You are a versatile AI assistant that can handle both direct prompts and API requests. You excel at creative tasks and problem-solving.')
      .setBaseImage('nodejs-20')
      .setPort(3002)
      .setResources({
        memory: '2g',
        cpu: 2
      })
      // HTTP API routes
      .get('/creative', (req, res) => {
        res.json({ 
          message: 'Creative writing endpoint',
          timestamp: new Date().toISOString()
        });
      })
      .post('/solve', (req, res) => {
        res.json({ 
          message: 'Problem solving endpoint',
          data: req.body,
          timestamp: new Date().toISOString()
        });
      })
      // Comprehensive event handling
      .addHandler('request_output:start', (data) => {
        console.log('[Multi Agent] Processing request:', data.conversationId);
        return {
          prompt: \`[Multi-Modal Assistant] \${data.prompt}\\n\\nPlease provide a comprehensive and creative response.\`
        };
      })
      .addHandler('request_output:end', (data) => {
        console.log('[Multi Agent] Response completed in:', data.processingTime + 'ms');
        return {
          response: \`\${data.response}\\n\\n✨ Enhanced by Multi-Modal Dank Agent\`
        };
      })
      .addHandler('tool:http-server:*', (data) => {
        console.log('[Multi Agent] HTTP Activity:', {
          type: data.type,
          method: data.method,
          path: data.path,
          timestamp: data.timestamp
        });
      })
      .addHandler('output', (data) => {
        console.log('[Multi Agent] System output:', data);
      })
      .addHandler('error', (error) => {
        console.error('[Multi Agent] System error:', error);
      })
  ]
};
`;
  }

  /**
   * Generate example agent file
   */
  _generateExampleAgent() {
    return `/**
 * Example Dank Agent
 * 
 * This is an example of how to define a Dank agent with modern event handling.
 * You can create multiple agent files and import them in your config.
 */

const { createAgent } = require('dank');

const exampleAgent = createAgent('example-agent')
  .setLLM('openai', {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-3.5-turbo',
    temperature: 0.7
  })
  .setPrompt(\`
    You are a helpful AI assistant with the following capabilities:
    - Answer questions clearly and concisely
    - Provide code examples when appropriate
    - Be friendly and professional
    - Help with problem-solving and creative tasks
  \`)
  .setBaseImage('nodejs-20')
  .setPort(3000)
  .setResources({
    memory: '512m',
    cpu: 1,
    timeout: 30000
  })
  // HTTP API routes
  .get('/info', (req, res) => {
    res.json({ 
      agent: 'example-agent',
      status: 'running',
      capabilities: ['direct-prompting', 'http-api'],
      timestamp: new Date().toISOString()
    });
  })
  .post('/chat', (req, res) => {
    res.json({ 
      message: 'Chat endpoint ready',
      data: req.body,
      timestamp: new Date().toISOString()
    });
  })
  // Event handlers for prompt processing
  .addHandler('request_output:start', (data) => {
    console.log(\`[\${new Date().toISOString()}] Processing prompt:\`, data.conversationId);
    console.log('Original prompt:', data.prompt);
    
    // Enhance the prompt
    const enhancedPrompt = \`[Enhanced] \${data.prompt}\\n\\nPlease provide a helpful and detailed response.\`;
    
    return {
      prompt: enhancedPrompt
    };
  })
  .addHandler('request_output', (data) => {
    console.log(\`[\${new Date().toISOString()}] LLM Response:\`, {
      conversationId: data.conversationId,
      promptModified: data.promptModified,
      processingTime: data.processingTime,
      model: data.model
    });
  })
  .addHandler('request_output:end', (data) => {
    console.log(\`[\${new Date().toISOString()}] Response completed in:\`, data.processingTime + 'ms');
    
    // Enhance the response
    const enhancedResponse = \`\${data.response}\\n\\n---\\n🤖 Powered by Dank Framework\`;
    
    return {
      response: enhancedResponse
    };
  })
  .addHandler('request_output:error', (data) => {
    console.error(\`[\${new Date().toISOString()}] Error processing prompt:\`, data.error);
  })
  // HTTP tool event handlers
  .addHandler('tool:http-server:call', (data) => {
    console.log(\`[\${new Date().toISOString()}] HTTP Request:\`, {
      method: data.method,
      path: data.path,
      body: data.body
    });
  })
  .addHandler('tool:http-server:response', (data) => {
    console.log(\`[\${new Date().toISOString()}] HTTP Response:\`, {
      statusCode: data.statusCode,
      processingTime: data.processingTime
    });
  })
  // System event handlers
  .addHandler('output', (data) => {
    console.log(\`[\${new Date().toISOString()}] Agent output:\`, data);
  })
  .addHandler('error', (error) => {
    console.error(\`[\${new Date().toISOString()}] Agent error:\`, error);
  });

module.exports = exampleAgent;
`;
  }
}

module.exports = { DankProject };
