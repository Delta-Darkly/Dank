/**
 * CLI Production Build Command - Build and optionally push production Docker images
 */

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { DockerManager } = require('../docker/manager');
const analytics = require('../analytics');

/**
 * Extract deployment metadata from an agent configuration
 */
function extractAgentMetadata(agent, buildOptions, imageName) {
  // Validate that agent ID is set (required)
  if (!agent.id || !agent.config?.id) {
    throw new Error(
      `Agent ID is required for agent "${agent.name}". ` +
      `Use .setId(uuidv4) to set a unique UUIDv4 identifier. ` +
      `Example: createAgent('${agent.name}').setId(require('uuid').v4())`
    );
  }
  
  const config = agent.config || {};
  const dockerConfig = config.docker || {};
  const communication = config.communication || {};
  const directPrompting = communication.directPrompting || {};
  const httpConfig = config.http || {};
  const llmConfig = config.llm || {};

  // Extract base image tag (remove prefix)
  // setBaseImage() sets docker.baseImage to "deltadarkly/dank-agent-base:tag"
  const baseImage = dockerConfig.baseImage || '';
  let baseImageTag = '';
  if (baseImage.includes(':')) {
    baseImageTag = baseImage.split(':').slice(1).join(':'); // Handle tags with colons
  } else if (baseImage) {
    baseImageTag = baseImage;
  }

  // Extract prompting server configuration
  const promptingServer = directPrompting.enabled ? {
    protocol: directPrompting.protocol || 'http',
    port: dockerConfig.port || 3000,
    authentication: directPrompting.authentication || false,
    maxConnections: directPrompting.maxConnections || 50,
    timeout: directPrompting.timeout || 30000
  } : null;

  // Extract resources configuration from instance type
  const { AgentConfig } = require('../config');
  const instanceType = config.instanceType || 'small';
  const resourcesConfig = AgentConfig.getResourcesFromInstanceType(instanceType);

  // Extract HTTP server configuration if enabled
  const httpServer = httpConfig.enabled ? {
    port: httpConfig.port || 3000,
    host: httpConfig.host || '0.0.0.0',
    cors: httpConfig.cors !== false,
    routes: httpConfig.routes ? Array.from(httpConfig.routes.keys()).map(routeKey => {
      const [method, path] = routeKey.split(':');
      return { method, path };
    }) : []
  } : null;

  // Extract handler information
  const handlers = agent.handlers ? Array.from(agent.handlers.keys()) : [];

  // Extract LLM configuration (without sensitive data)
  const llm = llmConfig.provider ? {
    provider: llmConfig.provider,
    model: llmConfig.model || 'gpt-3.5-turbo',
    temperature: llmConfig.temperature || 0.7,
    maxTokens: llmConfig.maxTokens || 1000,
    baseURL: llmConfig.baseURL || null
  } : null;

  // Collect ports that need to be opened
  const ports = [];
  if (promptingServer) {
    ports.push({
      port: promptingServer.port,
      protocol: promptingServer.protocol,
      description: 'Direct prompting server'
    });
  }
  if (httpServer) {
    ports.push({
      port: httpServer.port,
      protocol: 'http',
      description: 'HTTP API server'
    });
  }

  // Determine features enabled
  const features = {
    directPrompting: directPrompting.enabled || false,
    httpApi: communication.httpApi?.enabled || httpConfig.enabled || false,
    eventHandlers: communication.eventHandlers?.enabled || handlers.length > 0 || false
  };

  return {
    id: agent.id, // Agent UUIDv4 identifier from setId()
    name: agent.name,
    imageName: imageName,
    baseImage: {
      full: baseImage,
      tag: baseImageTag
    },
    buildOptions: {
      registry: buildOptions.registry || null,
      namespace: buildOptions.namespace || null,
      tag: buildOptions.tag || 'latest',
      tagByAgent: buildOptions.tagByAgent || false
    },
    promptingServer: promptingServer,
    resources: resourcesConfig,
    httpServer: httpServer,
    ports: ports,
    features: features,
    llm: llm,
    handlers: handlers,
    hasPrompt: !!config.prompt,
    environment: config.environment || {}
  };
}

async function productionBuildCommand(options) {
  // Track production build command
  await analytics.trackCommand('build:prod', true, {
    push: options.push || false,
    force: options.force || false
  });

  try {
    console.log(chalk.yellow('🏗️  Building production Docker images...\n'));

    // Load configuration
    const configPath = path.resolve(options.config);
    if (!await fs.pathExists(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    // Get project directory (directory containing the config file)
    const projectDir = path.dirname(configPath);

    // Clear require cache to get fresh config (important for development)
    delete require.cache[require.resolve(configPath)];
    const config = require(configPath);
    if (!config.agents || !Array.isArray(config.agents)) {
      throw new Error('No agents found in configuration');
    }

    // Initialize Docker manager
    const dockerManager = new DockerManager();
    await dockerManager.initialize();

    // Build production images for each agent
    const buildResults = [];
    const metadata = [];
    
    for (const agent of config.agents) {
      try {
        console.log(chalk.blue(`📦 Building production image for agent: ${agent.name}`));
        
        // Use agent's image config if available, otherwise use CLI options
        const agentImageConfig = agent.config?.agentImage || {};
        const buildOptions = {
          tag: options.tag || agentImageConfig.tag || 'latest',
          registry: options.registry || agentImageConfig.registry,
          namespace: options.namespace || agentImageConfig.namespace,
          tagByAgent: Boolean(options.tagByAgent || agentImageConfig.tagByAgent),
          force: options.force || false,
          push: options.push || false,
          baseImageOverride: options.baseImageOverride || null,
          projectDir: projectDir  // Pass project directory so external files can be copied
        };
        
        const result = await dockerManager.buildProductionImage(agent, buildOptions);

        // Track production build success
        await analytics.trackProductionBuild(
          agent.name, 
          buildOptions.registry, 
          buildOptions.namespace, 
          buildOptions.tag
        );

        buildResults.push({
          agent: agent.name,
          imageName: result.imageName,
          success: true,
          pushed: result.pushed || false
        });

        // Extract deployment metadata for successfully built agents
        const agentMetadata = extractAgentMetadata(agent, buildOptions, result.imageName);
        metadata.push(agentMetadata);

        console.log(chalk.green(`✅ Successfully built: ${result.imageName}`));
        if (result.pushed) {
          console.log(chalk.green(`🚀 Successfully pushed: ${result.imageName}`));
        }

      } catch (error) {
        console.error(chalk.red(`❌ Failed to build agent ${agent.name}:`), error.message);
        buildResults.push({
          agent: agent.name,
          success: false,
          error: error.message
        });
      }
    }

    // Output metadata file if requested
    if (options.outputMetadata) {
      const metadataPath = path.resolve(options.outputMetadata);
      const metadataOutput = {
        project: config.name,
        buildTimestamp: new Date().toISOString(),
        agents: metadata,
        summary: {
          total: metadata.length,
          successful: buildResults.filter(r => r.success).length,
          failed: buildResults.filter(r => !r.success).length,
          pushed: buildResults.filter(r => r.pushed).length
        }
      };
      
      await fs.writeJson(metadataPath, metadataOutput, { spaces: 2 });
      console.log(chalk.cyan(`\n📄 Deployment metadata saved to: ${metadataPath}`));
    }

    // Output
    if (options.json) {
      const payload = {
        success: buildResults.every(r => r.success),
        results: buildResults
      };
      // Always print JSON to stdout for machine consumption
      console.log(JSON.stringify(payload));
      process.exit(payload.success ? 0 : 1);
    } else {
      // Human summary
      console.log(chalk.yellow('\n📊 Build Summary:'));
      console.log(chalk.gray('================'));
      
      const successful = buildResults.filter(r => r.success);
      const failed = buildResults.filter(r => !r.success);
      const pushed = buildResults.filter(r => r.pushed);

      console.log(chalk.green(`✅ Successful builds: ${successful.length}`));
      if (pushed.length > 0) {
        console.log(chalk.blue(`🚀 Pushed to registry: ${pushed.length}`));
      }
      if (failed.length > 0) {
        console.log(chalk.red(`❌ Failed builds: ${failed.length}`));
      }

      // List built images
      if (successful.length > 0) {
        console.log(chalk.cyan('\n📦 Built Images:'));
        successful.forEach(result => {
          console.log(chalk.gray(`  - ${result.imageName}`));
        });
      }

      // List failed builds
      if (failed.length > 0) {
        console.log(chalk.red('\n❌ Failed Builds:'));
        failed.forEach(result => {
          console.log(chalk.gray(`  - ${result.agent}: ${result.error}`));
        });
        process.exit(1);
      }

      console.log(chalk.green('\n🎉 Production build completed successfully!'));
      process.exit(0);
    }

  } catch (error) {
    console.error(chalk.red('❌ Production build failed:'), error.message);
    process.exit(1);
  }
}

module.exports = { productionBuildCommand };
