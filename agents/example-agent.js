/**
 * Example Dank Agent
 * 
 * This is an example of how to define a Dank agent.
 * You can create multiple agent files and import them in your config.
 */

const { createAgent } = require('dank-ai');
const { v4: uuidv4 } = require('uuid');

const exampleAgent = createAgent('example-agent')
  .setId(uuidv4()) // Required: Unique UUIDv4 identifier
  .setLLM('openai', {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-3.5-turbo'
  })
  .setPrompt(`
    You are a helpful AI assistant with the following capabilities:
    - Answer questions clearly and concisely
    - Provide code examples when appropriate
    - Be friendly and professional
  `)
  .setInstanceType('small') // Resource allocation for cloud deployments
  .addHandlers({
    output: (data) => {
      console.log(`[${new Date().toISOString()}] Agent output:`, data);
    },
    error: (error) => {
      console.error(`[${new Date().toISOString()}] Agent error:`, error);
    },
    start: () => {
      console.log('Agent started successfully');
    },
    stop: () => {
      console.log('Agent stopped');
    }
  });

module.exports = exampleAgent;
