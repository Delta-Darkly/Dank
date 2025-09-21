/**
 * CLI Status Command - Show agent status
 */

const chalk = require('chalk');
const { DockerManager } = require('../docker/manager');

async function statusCommand(options) {
  try {
    const dockerManager = new DockerManager();
    await dockerManager.initialize();

    if (options.watch) {
      await watchStatus(dockerManager, options);
    } else {
      await showStatus(dockerManager, options);
    }

  } catch (error) {
    console.error(chalk.red('❌ Status check failed:'), error.message);
    process.exit(1);
  }
}

async function showStatus(dockerManager, options) {
  console.log(chalk.yellow('📊 Agent Status\\n'));

  try {
    // Get all Dank containers
    const containers = await dockerManager.docker.listContainers({
      all: true,
      filters: { name: ['dank-'] }
    });

    if (containers.length === 0) {
      console.log(chalk.gray('No agents found. Run "dank run" to start agents.'));
      return;
    }

    const statuses = [];

    for (const containerInfo of containers) {
      const container = dockerManager.docker.getContainer(containerInfo.Id);
      const data = await container.inspect();
      
      const agentName = containerInfo.Names[0].replace('/dank-', '').split('-')[0];
      const status = {
        name: agentName,
        id: containerInfo.Id.substring(0, 12),
        status: data.State.Running ? 'running' : 'stopped',
        uptime: data.State.Running ? Date.now() - new Date(data.State.StartedAt).getTime() : 0,
        restarts: data.RestartCount,
        health: data.State.Health?.Status || 'unknown',
        memory: data.HostConfig.Memory,
        cpu: data.HostConfig.CpuQuota / 1000
      };

      statuses.push(status);
    }

    if (options.json) {
      console.log(JSON.stringify(statuses, null, 2));
      return;
    }

    // Display status table
    console.log(chalk.bold('NAME\\t\\tSTATUS\\t\\tUPTIME\\t\\tRESTARTS\\tHEALTH'));
    console.log('─'.repeat(70));

    for (const status of statuses) {
      const statusColor = status.status === 'running' ? chalk.green : chalk.red;
      const healthColor = status.health === 'healthy' ? chalk.green : 
                         status.health === 'unhealthy' ? chalk.red : chalk.yellow;
      
      const uptime = status.uptime > 0 ? formatUptime(status.uptime) : 'N/A';
      
      console.log(
        `${status.name.padEnd(12)}\\t${statusColor(status.status.padEnd(8))}\\t${uptime.padEnd(8)}\\t${status.restarts}\\t\\t${healthColor(status.health)}`
      );
    }

    console.log('\\n' + chalk.gray(`Total agents: ${statuses.length}`));

  } catch (error) {
    throw new Error(`Failed to get status: ${error.message}`);
  }
}

async function watchStatus(dockerManager, options) {
  console.log(chalk.yellow('👀 Watching agent status (Ctrl+C to stop)...\\n'));

  const interval = setInterval(async () => {
    // Clear screen
    process.stdout.write('\\x1Bc');
    
    console.log(chalk.yellow('📊 Agent Status (Live)\\n'));
    console.log(chalk.gray(`Last updated: ${new Date().toLocaleTimeString()}\\n`));
    
    try {
      await showStatus(dockerManager, { ...options, json: false });
    } catch (error) {
      console.error(chalk.red('Status update failed:'), error.message);
    }
  }, 2000);

  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log(chalk.yellow('\\n👋 Status monitoring stopped'));
    process.exit(0);
  });
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

module.exports = { statusCommand };
