/**
 * Dank Agent Configuration - Auto-Detection Features
 *
 * This file demonstrates the new auto-detection capabilities:
 * - Event handlers are auto-enabled only when .addHandler() is used
 * - Direct prompting is auto-enabled only when .setPrompt() + .setLLM() are set
 * - HTTP API is auto-enabled only when routes (.get(), .post(), etc.) are added
 *
 * No more explicit .enableHttpApi() or .disableEventHandlers() calls needed!
 * Run 'dank run' to start all defined agents.
 * 
 * NOTE: This file uses the local development version (../lib/index.js).
 * For production use, copy example/dank.config.template.js to your project
 * and install dank via npm, then update the require statement.
 */

const { createAgent } = require("../lib/index.js");
const { v4: uuidv4 } = require("uuid");

module.exports = {
  // Project configuration
  name: "test-project",

  // Define your agents
  agents: [
    // 1. DIRECT PROMPTING ONLY - Auto-enabled because it has setPrompt() + setLLM() + handlers
    createAgent("prompt-only-agent")
      .setId(uuidv4()) // Required: Unique UUIDv4 identifier
      .setLLM("openai", {
        apiKey:
          "x",
        model: "gpt-3.5-turbo",
        temperature: 0.7,
      })
      //add in a pre-prompt pipeline that handler that can be used to modify and moderate requests to the prompt before it is sent to the LLM, and handler for when the llm responds with response but before it is sent to the client
      .setPrompt("You are a helpful assistant that responds to direct prompts.") // ✅ Auto-enables direct prompting
      .setBaseImage("nodejs-22") //latest is nodejs-20
      .setPromptingServer({
        port: 3000,
        authentication: false,
        maxConnections: 50,
      })
      .setInstanceType("small") // Resource allocation for cloud deployments
      // HTTP API auto-disabled (no routes added)
      // Event handlers auto-enabled (handlers added below)
      // Adding handlers auto-enables event handling ✅
      .addHandler("request_output", (data) => {
        console.log("[Prompt-Only Agent] LLM Response:", {
          originalPrompt: data.prompt.substring(0, 50) + "...",
          finalPrompt: data.finalPrompt
            ? data.finalPrompt.substring(0, 50) + "..."
            : "N/A",
          promptModified: data.promptModified,
          response: data.response.substring(0, 100) + "...",
          processingTime: data.processingTime + "ms",
          model: data.model,
        });
      })
      .addHandler("request_output:start", (data) => {
        console.log(
          "[Prompt-Only Agent] Processing prompt:",
          data.conversationId
        );
        console.log("[Prompt-Only Agent] Original prompt:", data.prompt);

        // Example: Add context to the prompt
        const enhancedPrompt = `Context: You are a helpful assistant. Please be concise and friendly.

User Question: ${data.prompt}`;

        console.log("[Prompt-Only Agent] Enhanced prompt:", enhancedPrompt);

        // Return modified data - this will replace the prompt sent to the LLM
        return {
          prompt: enhancedPrompt,
        };
      })
      .addHandler("request_output:end", (data) => {
        console.log(
          "[Prompt-Only Agent] Completed in:",
          data.processingTime + "ms"
        );
        console.log(
          "[Prompt-Only Agent] Original response:",
          data.response.substring(0, 50) + "..."
        );

        // Example: Add a simple footer to the response
        const enhancedResponse = `${data.response}\n\n[Enhanced by Dank Framework]`;

        console.log(
          "[Prompt-Only Agent] Enhanced response:",
          enhancedResponse.substring(0, 100) + "..."
        );

        // Return modified data - this will replace the response sent to the caller
        return {
          response: "dank response:" + enhancedResponse,
        };
      })
      .addHandler("error", (error) => {
        console.error("[Prompt-Only Agent] Error:", error);
      }),

    /*
    // 2. HTTP API ONLY - Auto-enabled because it has routes, auto-disabled direct prompting (no setPrompt)
    createAgent('api-only-agent')
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4',
        temperature: 0.5
      })
      // ❌ No setPrompt() = Direct prompting auto-disabled
      .setBaseImage('nodejs-20')
      // ❌ No more .disableDirectPrompting() or .enableHttpApi() needed!
      // Direct prompting auto-disabled (no setPrompt())
      // HTTP API auto-enabled (routes added below)
      // Event handlers auto-enabled (handlers added below)
      // Optional: .enableHttp({ port: 3001, cors: true }) to configure HTTP options
      // Adding routes auto-enables HTTP API ✅
      .get('/chat', (req, res) => {
        res.json({
          message: 'Hello from API-only agent!',
          query: req.query,
          timestamp: new Date().toISOString()
        });
      })
      .post('/process', (req, res) => {
        res.json({
          processed: true,
          input: req.body,
          agent: 'api-only-agent',
          timestamp: new Date().toISOString()
        });
      })
      .setResources({
        memory: '1g',
        cpu: 2
      }),
    // 3. MINIMAL AGENT - Auto-disables everything (no setPrompt, no routes, no handlers)
    createAgent('minimal-agent')
      .setLLM('anthropic', {
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: 'claude-3-sonnet-20240229',
        temperature: 0.3
      })
      // ❌ No setPrompt() = Direct prompting auto-disabled
      // ❌ No routes = HTTP API auto-disabled
      // ❌ No handlers = Event handling auto-disabled
      .setBaseImage('python-311')
      // ❌ No more explicit disable calls needed!
      // All features auto-disabled based on usage
      .setResources({
        memory: '1g',
        cpu: 1
      }),
      // This agent only has basic LLM functionality available

    // 4. EVENT HANDLERS ONLY - Auto-enabled because it has handlers, auto-disabled others
    /*
    createAgent('event-only-agent')
      .setLLM('anthropic', {
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: 'claude-3-sonnet-20240229',
        temperature: 0.3
      })
      // ❌ No setPrompt() = Direct prompting auto-disabled
      // ❌ No routes = HTTP API auto-disabled
      // ✅ Has handlers = Event handling auto-enabled
      .setBaseImage('python-311')
      .setResources({
        memory: '1g',
        cpu: 1
      })
      // Adding handlers auto-enables event handling ✅
      .addHandler('output', (data) => {
        console.log('[Event-Only Agent] Processing output:', data);
      })
      .addHandler('error', (error) => {
        console.error('[Event-Only Agent] Handling error:', error);
      })
      .addHandler('custom', (data) => {
        console.log('[Event-Only Agent] Custom event:', data);
      }),
    */

    // 5. FULL-FEATURED AGENT - Auto-enables all features based on usage
    /*
    createAgent('full-featured-agent')
      .setLLM('openai', {
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4',
        temperature: 0.6
      })
      .setPrompt('You are a versatile agent supporting all communication methods.')  // ✅ Auto-enables direct prompting
      .setBaseImage('latest')
      .setPromptingServer({
        port: 3003,
        authentication: true,
        maxConnections: 100
      })
      // Optional: .enableHttp({ port: 8080, cors: true }) to configure HTTP options
      // ❌ No more .enableHttpApi() or .enableEventHandlers() needed!
      // Direct prompting auto-enabled (has setPrompt() + setLLM())
      // HTTP API auto-enabled (routes added below)
      // Event handlers auto-enabled (handlers added below)
      
      // Adding routes auto-enables HTTP API ✅
      .get('/status', (req, res) => {
        res.json({
          agent: 'full-featured-agent',
          features: {
            directPrompting: 'auto-enabled (has prompt + LLM)',
            httpApi: 'auto-enabled (has routes)',
            eventHandlers: 'auto-enabled (has handlers)'
          },
          timestamp: new Date().toISOString()
        });
      })
      .post('/chat', (req, res) => {
        res.json({
          response: `I received: ${req.body.message}`,
          via: 'HTTP API',
          timestamp: new Date().toISOString()
        });
      })
      .setResources({
        memory: '2g',
        cpu: 3
      })
      // Adding handlers auto-enables event handling ✅
      .addHandler('output', (data) => {
        console.log('[Full-Featured Agent] Output:', data);
      })
      .addHandler('error', (error) => {
        console.error('[Full-Featured Agent] Error:', error);
      })
      .addHandler('heartbeat', () => {
        console.log('[Full-Featured Agent] Heartbeat - All systems operational');
      })
      // Event patterns for all communication methods
      .addHandler('request_output', (data) => {
        console.log('[Full-Featured Agent] Direct Prompt Response:', {
          conversationId: data.conversationId,
          responseLength: data.response.length,
          processingTime: data.processingTime + 'ms'
        });
      })
    */
  ],
};
