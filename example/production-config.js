/**
 * Dank Agent Configuration - Production Build Example
 *
 * This file demonstrates how to configure agents for production builds
 * with custom Docker registry, namespace, and tagging.
 */

const { createAgent } = require("../lib/index.js");
const { v4: uuidv4 } = require("uuid");

module.exports = {
  name: "production-example",
  
  agents: [
    // Agent with image configuration
    createAgent("customer-service")
      .setId(uuidv4()) // Required: Unique UUIDv4 identifier
      .setLLM("openai", {
        apiKey: process.env.OPENAI_API_KEY,
        model: "gpt-3.5-turbo",
        temperature: 0.7
      })
      .setPrompt("You are a helpful customer service representative.")
      .setPromptingServer({
        port: 3000,
        authentication: false,
        maxConnections: 50
      })
      .setInstanceType("small") // Resource allocation for cloud deployments
      // Agent image configuration
      .setAgentImageConfig({
        registry: "ghcr.io",
        namespace: "mycompany",
        tag: "v1.0.0"
      })
      .addHandler("request_output", (data) => {
        console.log("[Customer Service] Response:", data.response);
      }),

    // Agent with different image configuration
    createAgent("data-analyst")
      .setId(uuidv4()) // Required: Unique UUIDv4 identifier
      .setLLM("openai", {
        apiKey: process.env.OPENAI_API_KEY,
        model: "gpt-4",
        temperature: 0.3
      })
      .setPrompt("You are a data analyst expert.")
      .setPromptingServer({
        port: 3001,
        authentication: false,
        maxConnections: 25
      })
      .setInstanceType("medium") // Resource allocation for cloud deployments
      // Different image configuration
      .setAgentImageConfig({
        registry: "docker.io",
        namespace: "mycompany",
        tag: "latest"
      })
      .addHandler("request_output", (data) => {
        console.log("[Data Analyst] Analysis:", data.response);
      }),

    // Agent without image config (will use CLI defaults)
    createAgent("simple-bot")
      .setId(uuidv4()) // Required: Unique UUIDv4 identifier
      .setLLM("openai", {
        apiKey: process.env.OPENAI_API_KEY,
        model: "gpt-3.5-turbo"
      })
      .setPrompt("You are a simple helpful bot.")
      .setPromptingServer({
        port: 3002,
        authentication: false,
        maxConnections: 10
      })
      .setInstanceType("small") // Resource allocation for cloud deployments
      .addHandler("request_output", (data) => {
        console.log("[Simple Bot] Response:", data.response);
      })
  ]
};
