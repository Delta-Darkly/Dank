/**
 * CLI Run Command - Start all defined agents
 */

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { DockerManager } = require('../docker/manager');
const { DankProject } = require('../project');

async function runCommand(options) {
  console.log(chalk.yellow('🚀 Starting Dank agents...\\n'));

  try {
    // Load configuration
    const configPath = path.resolve(options.config);
    if (!(await fs.pathExists(configPath))) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    console.log(chalk.blue('📋 Loading configuration...'));
    
    // Clear require cache to get fresh config
    delete require.cache[require.resolve(configPath)];
    const config = require(configPath);
    
    if (!config.agents || !Array.isArray(config.agents)) {
      throw new Error('No agents defined in configuration');
    }

    console.log(chalk.green(`✅ Found ${config.agents.length} agents`));

    // Initialize Docker manager
    console.log(chalk.blue('🐳 Initializing Docker...'));
    const dockerManager = new DockerManager();
    await dockerManager.initialize();

    // Clean up existing containers from previous runs
    console.log(chalk.blue('🧹 Cleaning up existing containers...'));
    await dockerManager.cleanupExistingContainers(config.agents);

    // Pull base image if needed
    if (options.pull) {
      console.log(chalk.blue('📥 Pulling base image...'));
      await dockerManager.pullBaseImage();
    }

    // Start agents
    console.log(chalk.blue('\\n🎯 Starting agents...'));
    
    const parallel = parseInt(options.parallel) || 3;
    const agentBatches = chunkArray(config.agents, parallel);
    
    const results = [];
    
    for (const batch of agentBatches) {
      const batchPromises = batch.map(async (agent) => {
        try {
          console.log(chalk.gray(`  Starting ${agent.name}...`));
          
          const container = await dockerManager.startAgent(agent, {
            rebuild: !options.noBuild  // Rebuild by default unless --no-build is specified
          });
          
          console.log(chalk.green(`  ✅ ${agent.name} started (${container.id.substring(0, 12)})`));
          
          return { agent: agent.name, status: 'started', containerId: container.id };
          
        } catch (error) {
          console.log(chalk.red(`  ❌ ${agent.name} failed: ${error.message}`));
          return { agent: agent.name, status: 'failed', error: error.message };
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(r => r.value || r.reason));
    }

    // Summary
    console.log(chalk.yellow('\\n📊 Summary:'));
    const started = results.filter(r => r.status === 'started').length;
    const failed = results.filter(r => r.status === 'failed').length;
    
    console.log(chalk.green(`  ✅ Started: ${started}`));
    if (failed > 0) {
      console.log(chalk.red(`  ❌ Failed: ${failed}`));
    }

    if (options.detached) {
      console.log(chalk.cyan('\\n🔧 Agents running in detached mode'));
      console.log(chalk.gray('Use "dank status" to check agent status'));
      console.log(chalk.gray('Use "dank logs <agent>" to view logs'));
    } else {
      console.log(chalk.cyan('\\n👀 Monitoring agents (Ctrl+C to stop)...'));
      
      // Monitor agents
      await monitorAgents(dockerManager, config.agents);
    }

  } catch (error) {
    console.error(chalk.red('❌ Run failed:'), error.message);
    process.exit(1);
  }
}

/**
 * Monitor running agents
 */
async function monitorAgents(dockerManager, agents) {
  const monitorInterval = setInterval(async () => {
    try {
      console.log(chalk.gray('\\n--- Agent Status ---'));
      
      for (const agent of agents) {
        const status = await dockerManager.getAgentStatus(agent.name);
        
        const statusColor = status.status === 'running' ? chalk.green : 
                           status.status === 'stopped' ? chalk.yellow : chalk.red;
        
        const uptime = status.uptime ? formatUptime(status.uptime) : 'N/A';
        
        console.log(`${statusColor('●')} ${agent.name}: ${status.status} (${uptime})`);
      }
      
    } catch (error) {
      console.error(chalk.red('Monitor error:'), error.message);
    }
  }, 10000); // Check every 10 seconds

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\\n🛑 Stopping agents...'));
    clearInterval(monitorInterval);
    
    try {
      for (const agent of agents) {
        await dockerManager.stopAgent(agent.name);
      }
      console.log(chalk.green('✅ All agents stopped'));
    } catch (error) {
      console.error(chalk.red('❌ Error stopping agents:'), error.message);
    }
    
    process.exit(0);
  });
}

/**
 * Chunk array into smaller arrays
 */
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Format uptime in human readable format
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

module.exports = { runCommand };
