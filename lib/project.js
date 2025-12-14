/**
 * Dank Project Management
 * 
 * Handles project initialization, configuration generation, and scaffolding
 */

const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class DankProject {
  constructor(name, options = {}) {
    this.name = name;
    this.options = {
      configFile: 'dank.config.js',
      template: 'basic',
      ...options
    };
    this.projectPath = path.resolve(process.cwd(), name);
  }

  /**
   * Initialize project structure and create example files
   */
  async init() {
    const projectDir = this.projectPath;
    
    // Create project directory if it doesn't exist
    await fs.ensureDir(projectDir);
    
    // Create example config file
    const exampleConfig = this._generateExampleConfig();
    const configPath = path.join(projectDir, this.options.configFile);
    
    if (!(await fs.pathExists(configPath))) {
      await fs.writeFile(configPath, exampleConfig, 'utf8');
      console.log(`Created example configuration: ${configPath}`);
    }

    console.log(`\\nDank project '${this.name}' initialized!`);
    console.log(`\\nNext steps:`);
    console.log(`1. Edit ${this.options.configFile} to configure your agents`);
    console.log(`2. Run 'dank run' to start your agents`);
    
    return {
      projectPath: projectDir,
      configFile: configPath
    };
  }

  /**
   * Generate example configuration file
   */
  _generateExampleConfig() {
    // Check if we're in development mode (local lib directory exists)
    const isDevelopment = fs.existsSync(path.join(this.projectPath, '../lib/index.js'));
    
    const requirePath = isDevelopment ? '../lib/index.js' : 'dank-ai';
    
    // Generate UUIDv4 IDs for each agent in the template
    const promptAgentId = uuidv4();
    
    return `/**
 * Dank Agent Configuration
 * 
 * This file defines your AI agents and their configurations.
 * Run 'dank run' to start all defined agents.
 * 
 * NPM PACKAGES: You can import any npm package at the top of this file
 * and use it in your handlers. Just make sure packages are in your package.json.
 * 
 * IMPORTANT: Agent IDs (UUIDv4)
 * ==============================
 * Each agent has a unique UUIDv4 identifier that is generated when you initialize
 * your project. These IDs are used to identify and track your agents.
 * 
 * - You can generate new UUIDv4s if needed (use: require('uuid').v4())
 * - Once agents register with Dank Cloud services using these IDs, they become
 *   locked in and owned by your account
 */

// Import npm packages - these will be available in your handlers
const axios = require('axios');
const { format } = require('date-fns');

const { createAgent } = require('${requirePath}');

// Agent IDs - Generated UUIDv4 identifiers for each agent
// These IDs are used to uniquely identify your agents across deployments
const AGENT_IDS = {
  PROMPT_AGENT: '${promptAgentId}'
};

module.exports = {
  // Project configuration
  name: '${this.name}',
  
  // Define your agents
  // Each agent can have custom Docker image configuration for production builds
  agents: [
    // Example 1: Direct Prompting Agent with Event Handlers
    createAgent('prompt-agent')
      .setId(AGENT_IDS.PROMPT_AGENT) // Required: Unique UUIDv4 identifier
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-3.5-turbo',
        temperature: 0.7
      })
      .setPrompt('You are a helpful AI assistant. Be concise and friendly in your responses.')
      .setBaseImage('nodejs-20')
      .setPromptingServer({
        port: 3000
      })
      .setInstanceType('small')
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
      .addHandler('request_output', async (data) => {
        // Example: Using imported packages in handlers
        const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
        console.log(\`[\${timestamp}] LLM Response:\`, {
          prompt: data.prompt,
          response: data.response,
          processingTime: data.processingTime
        });
        
        // Example: Make HTTP requests with axios (uncomment to use)
        // await axios.post('https://your-api.com/log', { response: data.response });
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
      })
  ]
};
`;
  }
}

module.exports = { DankProject };