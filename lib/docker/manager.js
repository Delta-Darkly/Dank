/**
 * Docker Container Manager
 * 
 * Manages Docker containers for Dank agents including:
 * - Building agent images
 * - Starting/stopping containers
 * - Monitoring container health
 * - Managing Docker resources
 */

const Docker = require('dockerode');
const fs = require('fs-extra');
const path = require('path');
const tar = require('tar');
const winston = require('winston');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const { DOCKER_CONFIG } = require('../constants');
const { AgentConfig } = require('../config');

const execAsync = promisify(exec);

class DockerManager {
  constructor(options = {}) {
    this.docker = new Docker(options.dockerOptions || {});
    this.logger = options.logger || winston.createLogger({
      level: 'info',
      format: winston.format.simple(),
      transports: [new winston.transports.Console()]
    });
    
    this.defaultBaseImageName = `${DOCKER_CONFIG.baseImagePrefix}:${DOCKER_CONFIG.defaultTag}`;
    this.networkName = DOCKER_CONFIG.networkName;
    this.containers = new Map();
  }

  /**
   * Initialize Docker environment
   */
  async initialize() {
    try {
      // Ensure Docker is available and running
      await this.ensureDockerAvailable();
      
      // Check Docker connection
      await this.docker.ping();
      this.logger.info('Docker connection established');

      // Create network if it doesn't exist
      await this.ensureNetwork();
      
      // Check if default base image exists, pull if not found
      const hasBaseImage = await this.hasImage(this.defaultBaseImageName);
      if (!hasBaseImage) {
        this.logger.info(`Default base image '${this.defaultBaseImageName}' not found. Pulling from registry...`);
        await this.pullBaseImage();
      }

    } catch (error) {
      throw new Error(`Failed to initialize Docker: ${error.message}`);
    }
  }

  /**
   * Ensure Docker is installed and running
   */
  async ensureDockerAvailable() {
    try {
      // First, try to ping Docker to see if it's running
      await this.docker.ping();
      this.logger.info('Docker is running and accessible');
      return;
    } catch (error) {
      this.logger.info('Docker is not accessible, checking installation...');
    }

    // Check if Docker is installed
    const isInstalled = await this.isDockerInstalled();
    
    if (!isInstalled) {
      this.logger.info('Docker is not installed. Installing Docker...');
      await this.installDocker();
    } else {
      this.logger.info('Docker is installed but not running. Starting Docker...');
      await this.startDocker();
    }

    // Wait for Docker to become available
    await this.waitForDocker();
  }

  /**
   * Check if Docker is installed on the system
   */
  async isDockerInstalled() {
    try {
      await execAsync('docker --version');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Install Docker on the system
   */
  async installDocker() {
    const platform = process.platform;
    
    this.logger.info(`Installing Docker for ${platform}...`);
    
    try {
      if (platform === 'darwin') {
        await this.installDockerMacOS();
      } else if (platform === 'linux') {
        await this.installDockerLinux();
      } else if (platform === 'win32') {
        await this.installDockerWindows();
      } else {
        throw new Error(`Unsupported platform: ${platform}`);
      }
      
      this.logger.info('Docker installation completed');
    } catch (error) {
      throw new Error(`Failed to install Docker: ${error.message}`);
    }
  }

  /**
   * Install Docker on macOS
   */
  async installDockerMacOS() {
    this.logger.info('Installing Docker Desktop for macOS...');
    
    // Check if Homebrew is available
    try {
      await execAsync('which brew');
      this.logger.info('Using Homebrew to install Docker Desktop...');
      
      // Install Docker Desktop via Homebrew
      await this.runCommand('brew install --cask docker', 'Installing Docker Desktop via Homebrew');
      
    } catch (error) {
      this.logger.warn('Homebrew not found. Please install Docker Desktop manually from https://www.docker.com/products/docker-desktop/');
      throw new Error('Docker Desktop installation requires manual intervention. Please install from https://www.docker.com/products/docker-desktop/');
    }
  }

  /**
   * Install Docker on Linux
   */
  async installDockerLinux() {
    this.logger.info('Installing Docker on Linux...');
    
    try {
      // Update package index
      await this.runCommand('sudo apt-get update', 'Updating package index');
      
      // Install prerequisites
      await this.runCommand('sudo apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release', 'Installing prerequisites');
      
      // Add Docker's official GPG key
      await this.runCommand('curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg', 'Adding Docker GPG key');
      
      // Add Docker repository
      await this.runCommand('echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null', 'Adding Docker repository');
      
      // Update package index again
      await this.runCommand('sudo apt-get update', 'Updating package index with Docker repository');
      
      // Install Docker
      await this.runCommand('sudo apt-get install -y docker-ce docker-ce-cli containerd.io', 'Installing Docker');
      
      // Add current user to docker group
      await this.runCommand('sudo usermod -aG docker $USER', 'Adding user to docker group');
      
      this.logger.info('Docker installation completed. You may need to log out and back in for group changes to take effect.');
      
    } catch (error) {
      throw new Error(`Failed to install Docker on Linux: ${error.message}`);
    }
  }

  /**
   * Install Docker on Windows
   */
  async installDockerWindows() {
    this.logger.info('Installing Docker Desktop for Windows...');
    
    // Check if Chocolatey is available
    try {
      await execAsync('choco --version');
      this.logger.info('Using Chocolatey to install Docker Desktop...');
      
      // Install Docker Desktop via Chocolatey
      await this.runCommand('choco install docker-desktop -y', 'Installing Docker Desktop via Chocolatey');
      
    } catch (error) {
      this.logger.warn('Chocolatey not found. Please install Docker Desktop manually from https://www.docker.com/products/docker-desktop/');
      throw new Error('Docker Desktop installation requires manual intervention. Please install from https://www.docker.com/products/docker-desktop/');
    }
  }

  /**
   * Start Docker service
   */
  async startDocker() {
    const platform = process.platform;
    
    try {
      if (platform === 'darwin') {
        // On macOS, try to start Docker Desktop
        await this.runCommand('open -a Docker', 'Starting Docker Desktop');
      } else if (platform === 'linux') {
        // On Linux, start Docker service
        await this.runCommand('sudo systemctl start docker', 'Starting Docker service');
        await this.runCommand('sudo systemctl enable docker', 'Enabling Docker service');
      } else if (platform === 'win32') {
        // On Windows, try to start Docker Desktop
        await this.runCommand('start "" "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"', 'Starting Docker Desktop');
      }
      
      this.logger.info('Docker service started');
    } catch (error) {
      this.logger.warn(`Failed to start Docker service: ${error.message}`);
      this.logger.info('Please start Docker manually and try again');
      throw error;
    }
  }

  /**
   * Wait for Docker to become available
   */
  async waitForDocker() {
    this.logger.info('Waiting for Docker to become available...');
    
    const maxAttempts = 30; // 30 seconds
    const delay = 1000; // 1 second
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.docker.ping();
        this.logger.info('Docker is now available');
        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          throw new Error('Docker did not become available within the expected time');
        }
        
        this.logger.info(`Waiting for Docker... (${attempt}/${maxAttempts})`);
        await this.sleep(delay);
      }
    }
  }

  /**
   * Run a command and log output
   */
  async runCommand(command, description) {
    this.logger.info(`${description}...`);
    
    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', command], { 
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: true 
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          this.logger.info(`${description} completed successfully`);
          resolve({ stdout, stderr });
        } else {
          const error = new Error(`Command failed with exit code ${code}: ${stderr}`);
          this.logger.error(`${description} failed: ${error.message}`);
          reject(error);
        }
      });
      
      child.on('error', (error) => {
        this.logger.error(`${description} failed: ${error.message}`);
        reject(error);
      });
    });
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Pull the base Docker image
   */
  async pullBaseImage(baseImageName = null, options = {}) {
    const imageName = baseImageName || this.defaultBaseImageName;
    this.logger.info(`Pulling base Docker image: ${imageName}`);
    
    try {
      const stream = await this.docker.pull(imageName);
      
      await this.followPullProgress(stream, 'Base image pull');
      
      // Verify the image was pulled
      const hasImage = await this.hasImage(imageName);
      if (hasImage) {
        this.logger.info(`Base image '${imageName}' pulled successfully`);
      } else {
        throw new Error(`Base image '${imageName}' was not pulled successfully`);
      }
      
    } catch (error) {
      throw new Error(`Failed to pull base image: ${error.message}`);
    }
  }

  /**
   * Clean up existing containers from previous runs
   */
  async cleanupExistingContainers(agents) {
    this.logger.info('Cleaning up existing containers from previous runs...');
    
    try {
      // Get all containers (running and stopped) that match our agent naming pattern
      const containers = await this.docker.listContainers({ all: true });
      
      const agentNames = agents.map(agent => agent.name.toLowerCase());
      const containersToCleanup = containers.filter(container => {
        // Check if container name matches our dank agent pattern
        const containerName = container.Names[0].replace(/^\//, ''); // Remove leading slash
        return agentNames.some(agentName => 
          containerName.startsWith(`dank-${agentName}-`) || 
          containerName === `dank-${agentName}`
        );
      });

      if (containersToCleanup.length === 0) {
        this.logger.info('No existing containers found to cleanup');
        return;
      }

      this.logger.info(`Found ${containersToCleanup.length} existing containers to cleanup`);

      // Stop and remove each container
      for (const containerInfo of containersToCleanup) {
        const container = this.docker.getContainer(containerInfo.Id);
        const containerName = containerInfo.Names[0].replace(/^\//, '');
        
        try {
          // Stop container if running
          if (containerInfo.State === 'running') {
            this.logger.info(`Stopping container: ${containerName}`);
            await container.stop({ t: 10 }); // 10 second timeout
          }
          
          // Remove container
          this.logger.info(`Removing container: ${containerName}`);
          await container.remove({ force: true });
          
        } catch (error) {
          // Log but don't fail if we can't clean up a specific container
          this.logger.warn(`Failed to cleanup container ${containerName}: ${error.message}`);
        }
      }

      this.logger.info('Container cleanup completed');
      
    } catch (error) {
      this.logger.error('Failed to cleanup existing containers:', error.message);
      // Don't throw - we want to continue even if cleanup fails
    }
  }

  /**
   * Build agent-specific image
   */
  async buildAgentImage(agent, options = {}) {
    const imageName = `dank-agent-${agent.name.toLowerCase()}`;
    this.logger.info(`Building image for agent: ${agent.name}`);

    try {
      const buildContext = await this.createAgentBuildContext(agent);
      
      const stream = await this.docker.buildImage(buildContext, {
        t: imageName,
        dockerfile: 'Dockerfile',
        nocache: options.rebuild || options.noCache || false
      });

      await this.followBuildProgress(stream, `Agent ${agent.name} build`);
      
      this.logger.info(`Agent image '${imageName}' built successfully`);
      
      // Clean up build context
      await fs.remove(buildContext);
      
      return imageName;
      
    } catch (error) {
      throw new Error(`Failed to build agent image: ${error.message}`);
    }
  }

  /**
   * Build production image with custom naming and tagging
   */
  async buildProductionImage(agent, options = {}) {
    const {
      tag = 'latest',
      registry,
      namespace,
      force = false,
      push = false
    } = options;

    // Construct production image name
    let imageName = agent.name.toLowerCase();
    
    // Add namespace if provided
    if (namespace) {
      imageName = `${namespace}/${imageName}`;
    }
    
    // Add registry if provided
    if (registry) {
      imageName = `${registry}/${imageName}`;
    }
    
    // Add tag
    imageName = `${imageName}:${tag}`;

    this.logger.info(`Building production image for agent: ${agent.name} -> ${imageName}`);

    try {
      const buildContext = await this.createAgentBuildContext(agent);
      
      const stream = await this.docker.buildImage(buildContext, {
        t: imageName,
        dockerfile: 'Dockerfile',
        nocache: force
      });

      await this.followBuildProgress(stream, `Production build for ${agent.name}`);
      
      this.logger.info(`Production image '${imageName}' built successfully`);
      
      // Clean up build context
      await fs.remove(buildContext);
      
      let pushed = false;
      
      // Push to registry if requested
      if (push) {
        try {
          this.logger.info(`Pushing image to registry: ${imageName}`);
          const pushStream = await this.docker.getImage(imageName).push();
          await this.followBuildProgress(pushStream, `Push ${imageName}`);
          this.logger.info(`Successfully pushed image: ${imageName}`);
          pushed = true;
        } catch (pushError) {
          this.logger.warn(`Failed to push image ${imageName}: ${pushError.message}`);
          // Don't fail the build if push fails
        }
      }
      
      return {
        imageName,
        pushed
      };
      
    } catch (error) {
      throw new Error(`Failed to build production image: ${error.message}`);
    }
  }

  /**
   * Generate handlers code from agent configuration
   */
  generateHandlersCode(agent) {
    const handlers = {};
    
    // Add default handlers
    handlers.output = ['(data) => console.log("Output:", data)'];
    handlers.error = ['(error) => console.error("Error:", error)'];
    
    // Add custom handlers from agent configuration
    if (agent.handlers && agent.handlers.size > 0) {
      for (const [eventName, handlerList] of agent.handlers) {
        if (!handlers[eventName]) {
          handlers[eventName] = [];
        }
        
        // Convert handler functions to string representations
        handlerList.forEach(handlerObj => {
          if (handlerObj && typeof handlerObj.handler === 'function') {
            // Convert function to string, handling the function properly
            const handlerStr = handlerObj.handler.toString();
            handlers[eventName].push(handlerStr);
          }
        });
      }
    }
    
    // Generate the JavaScript object code
    const handlersEntries = Object.entries(handlers).map(([eventName, handlerArray]) => {
      const handlersStr = handlerArray.join(',\n      ');
      // Quote event names that contain special characters (like colons)
      const quotedEventName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(eventName) ? eventName : `"${eventName}"`;
      return `    ${quotedEventName}: [\n      ${handlersStr}\n    ]`;
    }).join(',\n');
    
    return `{\n${handlersEntries}\n  }`;
  }

  /**
   * Start agent container
   */
  async startAgent(agent, options = {}) {
    // Finalize agent configuration (auto-detect features)
    agent.finalize();
    
    const imageName = `dank-agent-${agent.name.toLowerCase()}`;
    const containerName = `dank-${agent.name.toLowerCase()}-${agent.id.split('_').pop()}`;
    const baseImageName = agent.config.docker?.baseImage || this.defaultBaseImageName;

    try {
      // Ensure base image exists
      const hasBaseImage = await this.hasImage(baseImageName);
      if (!hasBaseImage) {
        this.logger.info(`Base image '${baseImageName}' not found for agent ${agent.name}. Pulling...`);
        await this.pullBaseImage(baseImageName);
      }

      // Check if agent image exists, build if necessary
      const hasImage = await this.hasImage(imageName);
      if (!hasImage || options.rebuild) {
        await this.buildAgentImage(agent, options);
      }

      // Prepare container configuration
      const containerConfig = {
        Image: imageName,
        name: containerName,
        Env: this.prepareEnvironmentVariables(agent),
        HostConfig: {
          Memory: AgentConfig.parseMemory(agent.config.resources.memory),
          CpuQuota: Math.floor(agent.config.resources.cpu * 100000),
          CpuPeriod: 100000,
          RestartPolicy: {
            Name: 'on-failure',
            MaximumRetryCount: agent.config.resources.maxRestarts || 3
          },
          NetworkMode: this.networkName,
          ...this.preparePortConfiguration(agent)
        },
        NetworkingConfig: {
          EndpointsConfig: {
            [this.networkName]: {}
          }
        },
        ...this.prepareExposedPorts(agent)
      };

      // Create container
      this.logger.info(`Creating container for agent: ${agent.name}`);
      const container = await this.docker.createContainer(containerConfig);
      
      // Start container
      await container.start();
      
      // Store container reference
      this.containers.set(agent.name, {
        container,
        agent,
        startTime: new Date(),
        status: 'running'
      });

      agent.containerId = container.id;
      agent.status = 'running';

      this.logger.info(`Agent ${agent.name} started successfully (${container.id.substring(0, 12)})`);
      
      return container;
      
    } catch (error) {
      agent.status = 'error';
      throw new Error(`Failed to start agent ${agent.name}: ${error.message}`);
    }
  }

  /**
   * Stop agent container
   */
  async stopAgent(agentName, options = {}) {
    const containerInfo = this.containers.get(agentName);
    if (!containerInfo) {
      throw new Error(`Agent ${agentName} not found or not running`);
    }

    try {
      const { container, agent } = containerInfo;
      
      this.logger.info(`Stopping agent: ${agentName}`);
      
      if (options.force) {
        await container.kill();
      } else {
        await container.stop({ t: 10 }); // 10 second timeout
      }
      
      await container.remove();
      
      this.containers.delete(agentName);
      agent.status = 'stopped';
      agent.containerId = null;
      
      this.logger.info(`Agent ${agentName} stopped successfully`);
      
    } catch (error) {
      throw new Error(`Failed to stop agent ${agentName}: ${error.message}`);
    }
  }

  /**
   * Get agent status
   */
  async getAgentStatus(agentName) {
    const containerInfo = this.containers.get(agentName);
    if (!containerInfo) {
      return { status: 'not_running' };
    }

    try {
      const { container, agent, startTime } = containerInfo;
      const containerData = await container.inspect();
      
      return {
        status: containerData.State.Running ? 'running' : 'stopped',
        containerId: container.id,
        startTime,
        uptime: Date.now() - startTime.getTime(),
        health: containerData.State.Health?.Status || 'unknown',
        restartCount: containerData.RestartCount,
        resources: {
          memory: agent.config.resources.memory,
          cpu: agent.config.resources.cpu
        }
      };
      
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Get container logs
   */
  async getAgentLogs(agentName, options = {}) {
    const containerInfo = this.containers.get(agentName);
    if (!containerInfo) {
      throw new Error(`Agent ${agentName} not found`);
    }

    const { container } = containerInfo;
    
    const logStream = await container.logs({
      stdout: true,
      stderr: true,
      follow: options.follow || false,
      tail: options.tail || 100,
      since: options.since || undefined,
      timestamps: true
    });

    return logStream;
  }

  /**
   * Create build context for base image
   */
  async createBaseBuildContext() {
    const contextDir = path.join(__dirname, '../../.build-context-base');
    await fs.ensureDir(contextDir);

    // Copy Docker files
    await fs.copy(path.join(__dirname, '../../docker'), contextDir);
    
    // Create runtime directory
    const runtimeDir = path.join(contextDir, 'runtime');
    await fs.ensureDir(runtimeDir);
    
    // Create tarball
    const tarPath = path.join(__dirname, '../../.base-build-context.tar');
    await tar.create({
      file: tarPath,
      cwd: contextDir
    }, ['.']);

    return tarPath;
  }

  /**
   * Create build context for agent
   */
  async createAgentBuildContext(agent) {
    const contextDir = path.join(__dirname, `../../.build-context-${agent.name}`);
    await fs.ensureDir(contextDir);

    // Get the base image for this agent
    const baseImageName = agent.config.docker?.baseImage || this.defaultBaseImageName;

    // Create Dockerfile for agent
    const dockerfile = `FROM ${baseImageName}
COPY agent-code/ /app/agent-code/
USER dankuser
`;
    
    await fs.writeFile(path.join(contextDir, 'Dockerfile'), dockerfile);
    
    // Copy agent code if it exists
    const agentCodeDir = path.join(contextDir, 'agent-code');
    await fs.ensureDir(agentCodeDir);
    
    // Create basic agent code structure
    // Generate handlers from agent configuration
    const handlersCode = this.generateHandlersCode(agent);
    
    const agentCode = `
// Agent: ${agent.name}
// Generated by Dank Agent Service

module.exports = {
  async main(context) {
    const { llmClient, handlers, tools, config } = context;
    console.log('Agent ${agent.name} started');
    console.log('Available context:', Object.keys(context));
    
    // Basic agent loop
    setInterval(async () => {
      try {
        // Trigger heartbeat
        const heartbeatHandlers = handlers.get('heartbeat') || [];
        heartbeatHandlers.forEach(handler => {
          try {
            handler();
          } catch (handlerError) {
            console.error('Heartbeat handler error:', handlerError);
          }
        });
        
        // Custom agent logic would go here
        console.log('Agent ${agent.name} heartbeat - uptime:', Math.floor(process.uptime()), 'seconds');
        
      } catch (error) {
        console.error('Agent loop error:', error);
        const errorHandlers = handlers.get('error') || [];
        errorHandlers.forEach(handler => {
          try {
            handler(error);
          } catch (handlerError) {
            console.error('Error handler failed:', handlerError);
          }
        });
      }
    }, 10000);
  },
  
  handlers: ${handlersCode}
};
`;
    
    await fs.writeFile(path.join(agentCodeDir, 'index.js'), agentCode);
    
    // Create tarball
    const tarPath = path.join(__dirname, `../../.agent-${agent.name}-context.tar`);
    await tar.create({
      file: tarPath,
      cwd: contextDir
    }, ['.']);

    return tarPath;
  }

  /**
   * Prepare environment variables for container
   */
  prepareEnvironmentVariables(agent) {
    const env = AgentConfig.generateContainerEnv(agent);
    return Object.entries(env).map(([key, value]) => `${key}=${value}`);
  }

  /**
   * Prepare port configuration for container
   */
  preparePortConfiguration(agent) {
    const portConfig = {};
    const portBindings = {};
    
    // Always bind the main agent port
    const mainPort = agent.config.docker?.port || DOCKER_CONFIG.defaultPort;
    portBindings[`${mainPort}/tcp`] = [{ HostPort: mainPort.toString() }];
    
    // Also bind HTTP port if HTTP is enabled and different from main port
    if (agent.config.http && agent.config.http.enabled) {
      const httpPort = agent.config.http.port;
      if (httpPort !== mainPort) {
        portBindings[`${httpPort}/tcp`] = [{ HostPort: httpPort.toString() }];
      }
    }
    
    // Always bind health check port
    const healthPort = DOCKER_CONFIG.healthCheckPort;
    portBindings[`${healthPort}/tcp`] = [{ HostPort: healthPort.toString() }];
    
    portConfig.PortBindings = portBindings;
    return portConfig;
  }

  /**
   * Prepare exposed ports for container
   */
  prepareExposedPorts(agent) {
    const exposedPorts = {};
    
    // Always expose the main agent port
    const mainPort = agent.config.docker?.port || DOCKER_CONFIG.defaultPort;
    exposedPorts[`${mainPort}/tcp`] = {};
    
    // Also expose HTTP port if HTTP is enabled and different from main port
    if (agent.config.http && agent.config.http.enabled) {
      const httpPort = agent.config.http.port;
      if (httpPort !== mainPort) {
        exposedPorts[`${httpPort}/tcp`] = {};
      }
    }
    
    // Always expose health check port
    const healthPort = DOCKER_CONFIG.healthCheckPort;
    exposedPorts[`${healthPort}/tcp`] = {};
    
    return { ExposedPorts: exposedPorts };
  }

  /**
   * Ensure Docker network exists
   */
  async ensureNetwork() {
    try {
      await this.docker.getNetwork(this.networkName).inspect();
      this.logger.debug(`Network '${this.networkName}' already exists`);
    } catch (error) {
      if (error.statusCode === 404) {
        this.logger.info(`Creating Docker network: ${this.networkName}`);
        await this.docker.createNetwork({
          Name: this.networkName,
          Driver: 'bridge'
        });
      } else {
        throw error;
      }
    }
  }

  /**
   * Check if Docker image exists
   */
  async hasImage(imageName) {
    try {
      await this.docker.getImage(imageName).inspect();
      return true;
    } catch (error) {
      if (error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Follow build progress and log output
   */
  async followBuildProgress(stream, buildName) {
    return new Promise((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      }, (event) => {
        if (event.stream) {
          process.stdout.write(event.stream);
        } else if (event.status) {
          this.logger.debug(`${buildName}: ${event.status}`);
        }
      });
    });
  }

  /**
   * Follow pull progress and log output
   */
  async followPullProgress(stream, pullName) {
    return new Promise((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      }, (event) => {
        if (event.status) {
          if (event.progress) {
            process.stdout.write(`\r${pullName}: ${event.status} ${event.progress}`);
          } else {
            this.logger.info(`${pullName}: ${event.status}`);
          }
        }
      });
    });
  }

  /**
   * Clean up Docker resources
   */
  async cleanup(options = {}) {
    this.logger.info('Cleaning up Docker resources...');

    try {
      if (options.containers || options.all) {
        // Stop and remove all Dank containers
        const containers = await this.docker.listContainers({
          all: true,
          filters: { name: ['dank-'] }
        });

        for (const containerInfo of containers) {
          const container = this.docker.getContainer(containerInfo.Id);
          try {
            if (containerInfo.State === 'running') {
              await container.stop();
            }
            await container.remove();
            this.logger.info(`Removed container: ${containerInfo.Names[0]}`);
          } catch (error) {
            this.logger.warn(`Failed to remove container ${containerInfo.Names[0]}: ${error.message}`);
          }
        }
      }

      if (options.images || options.all) {
        // Remove Dank images
        const images = await this.docker.listImages({
          filters: { reference: ['dank-*'] }
        });

        for (const imageInfo of images) {
          const image = this.docker.getImage(imageInfo.Id);
          try {
            await image.remove();
            this.logger.info(`Removed image: ${imageInfo.RepoTags?.[0] || imageInfo.Id}`);
          } catch (error) {
            this.logger.warn(`Failed to remove image: ${error.message}`);
          }
        }
      }

      if (options.buildContexts || options.all) {
        // Clean up build context directories and tarballs
        await this.cleanupBuildContexts();
      }

      this.logger.info('Cleanup completed');

    } catch (error) {
      throw new Error(`Cleanup failed: ${error.message}`);
    }
  }

  /**
   * Clean up build context directories and tarballs
   */
  async cleanupBuildContexts() {
    const projectRoot = path.join(__dirname, '../..');
    
    try {
      // Find all build context directories
      const entries = await fs.readdir(projectRoot);
      const buildContextDirs = entries.filter(entry => entry.startsWith('.build-context-'));
      
      // Remove build context directories
      for (const dir of buildContextDirs) {
        const dirPath = path.join(projectRoot, dir);
        try {
          await fs.remove(dirPath);
          this.logger.info(`Removed build context directory: ${dir}`);
        } catch (error) {
          this.logger.warn(`Failed to remove build context directory ${dir}: ${error.message}`);
        }
      }
      
      // Find and remove tarball files
      const tarballs = entries.filter(entry => 
        entry.endsWith('-context.tar') || entry.endsWith('-build-context.tar')
      );
      
      for (const tarball of tarballs) {
        const tarballPath = path.join(projectRoot, tarball);
        try {
          await fs.remove(tarballPath);
          this.logger.info(`Removed build context tarball: ${tarball}`);
        } catch (error) {
          this.logger.warn(`Failed to remove tarball ${tarball}: ${error.message}`);
        }
      }
      
      if (buildContextDirs.length === 0 && tarballs.length === 0) {
        this.logger.info('No build context files found to clean up');
      }
      
    } catch (error) {
      this.logger.warn(`Error during build context cleanup: ${error.message}`);
    }
  }
}

module.exports = { DockerManager };
