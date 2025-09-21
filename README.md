# my-interactive-project

A Dank AI agent project with modern event handling and Docker orchestration.

## Features

- 🤖 **AI Agents**: Powered by multiple LLM providers (OpenAI, Anthropic, Google AI)
- 🐳 **Docker Integration**: Containerized agents with automatic management
- 📡 **Event System**: Real-time event handling for prompts, responses, and tools
- 🔧 **Auto-Detection**: Automatically enables features based on usage
- 📊 **Monitoring**: Built-in logging and status monitoring

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Configure your agents:**
   Edit `dank.config.js` to define your agents and their capabilities.

4. **Start your agents:**
   ```bash
   npm start
   # or
   dank run
   ```

## Available Commands

- `npm start` - Start all agents
- `npm run dev` - Start in development mode
- `npm run stop` - Stop all agents
- `npm run status` - Check agent status
- `npm run logs` - View agent logs
- `npm run build` - Build agent images
- `npm run clean` - Clean up containers and images

## Event Handlers

This project includes examples of the three main event types:

### 1. Direct Prompting Events (`request_output`)
Handle LLM interactions and modify prompts/responses:

```javascript
.addHandler('request_output:start', (data) => {
  // Modify the prompt before sending to LLM
  return { prompt: `Enhanced: ${data.prompt}` };
})

.addHandler('request_output:end', (data) => {
  // Modify the response before sending back
  return { response: `${data.response} [Enhanced by Dank]` };
})
```

### 2. HTTP API Events (`tool:http-server`)
Handle HTTP requests and responses:

```javascript
.addHandler('tool:http-server:call', (data) => {
  console.log('HTTP request received:', data.method, data.path);
})

.addHandler('tool:http-server:response', (data) => {
  console.log('HTTP response sent:', data.statusCode);
})
```

### 3. System Events
Handle agent lifecycle and errors:

```javascript
.addHandler('output', (data) => {
  console.log('Agent output:', data);
})

.addHandler('error', (error) => {
  console.error('Agent error:', error);
})
```

## Configuration

Edit `dank.config.js` to:

- Define your agents and their capabilities
- Set up LLM providers and models
- Configure event handlers
- Set Docker and resource limits
- Enable/disable communication features

## Documentation

For more information, visit the [Dank Framework Documentation](https://github.com/your-org/dank).

## License

ISC
