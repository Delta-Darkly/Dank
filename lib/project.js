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
    createAgent('example-agent')
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
        console.log('Agent output:', data);
      })
      .addHandler('error', (error) => {
        console.error('Agent error:', error);
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
 * This is an example of how to define a Dank agent.
 * You can create multiple agent files and import them in your config.
 */

const { createAgent } = require('dank');

const exampleAgent = createAgent('example-agent')
  .setLLM('openai', {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-3.5-turbo'
  })
  .setPrompt(\`
    You are a helpful AI assistant with the following capabilities:
    - Answer questions clearly and concisely
    - Provide code examples when appropriate
    - Be friendly and professional
  \`)
  .setResources({
    memory: '512m',
    cpu: 1,
    timeout: 30000
  })
  .addHandlers({
    output: (data) => {
      console.log(\`[\${new Date().toISOString()}] Agent output:\`, data);
    },
    error: (error) => {
      console.error(\`[\${new Date().toISOString()}] Agent error:\`, error);
    },
    start: () => {
      console.log('Agent started successfully');
    },
    stop: () => {
      console.log('Agent stopped');
    }
  });

module.exports = exampleAgent;
`;
  }
}

module.exports = { DankProject };
