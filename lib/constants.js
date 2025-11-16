/**
 * Constants and default configurations
 */

const SUPPORTED_LLMS = [
  'openai',
  'anthropic', 
  'cohere',
  'huggingface',
  'ollama',
  'custom'
];

const DEFAULT_CONFIG = {
  llm: {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 1000
  },
  prompt: 'You are a helpful AI assistant.',
  instanceType: 'small',
  environment: {},
  custom: {}
};

// Instance type mappings: instanceType -> { memory, cpu }
const INSTANCE_TYPES = {
  small: {
    memory: '512m',
    cpu: 1
  },
  medium: {
    memory: '1g',
    cpu: 2
  },
  large: {
    memory: '2g',
    cpu: 2
  },
  xlarge: {
    memory: '4g',
    cpu: 4
  }
};

const DOCKER_CONFIG = {
  baseImage: 'deltadarkly/dank-agent-base',
  baseImagePrefix: 'deltadarkly/dank-agent-base',
  defaultTag: 'latest',
  networkName: 'dank-network',
  volumeName: 'dank-volume',
  workDir: '/app',
  codeDropPath: '/app/agent-code',
  entrypoint: '/app/entrypoint.js',
  defaultPort: 3000,
  healthCheckPort: 3001
};

const AGENT_EVENTS = {
  OUTPUT: 'output',
  ERROR: 'error', 
  START: 'start',
  STOP: 'stop',
  HEARTBEAT: 'heartbeat',
  CUSTOM: 'custom'
};

module.exports = {
  SUPPORTED_LLMS,
  DEFAULT_CONFIG,
  DOCKER_CONFIG,
  AGENT_EVENTS,
  INSTANCE_TYPES
};
