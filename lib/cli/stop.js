/**
 * CLI Stop Command - Stop running agents
 */

const chalk = require('chalk');
const { DockerManager } = require('../docker/manager');

async function stopCommand(agents, options) {
  try {
    const dockerManager = new DockerManager();
    await dockerManager.initialize();

    if (options.all) {
      await stopAllAgents(dockerManager, options);
    } else if (agents.length > 0) {
      await stopSpecificAgents(dockerManager, agents, options);
    } else {
      console.log(chalk.yellow('No agents specified. Use --all to stop all agents or specify agent names.'));
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error(chalk.red('❌ Stop failed:'), error.message);
    process.exit(1);
  }
}

async function stopAllAgents(dockerManager, options) {
  console.log(chalk.yellow('🛑 Stopping all agents...\\n'));

  try {
    const containers = await dockerManager.docker.listContainers({
      all: true,
      filters: { name: ['dank-'] }
    });

    if (containers.length === 0) {
      console.log(chalk.gray('No running agents found.'));
      return;
    }

    for (const containerInfo of containers) {
      const agentName = containerInfo.Names[0].replace('/dank-', '').split('-')[0];
      
      try {
        await dockerManager.stopAgent(agentName, options);
        console.log(chalk.green(`✅ Stopped: ${agentName}`));
      } catch (error) {
        console.log(chalk.red(`❌ Failed to stop ${agentName}: ${error.message}`));
      }
    }

    console.log(chalk.green('\\n✅ All agents stopped'));

  } catch (error) {
    throw new Error(`Failed to stop all agents: ${error.message}`);
  }
}

async function stopSpecificAgents(dockerManager, agentNames, options) {
  console.log(chalk.yellow(`🛑 Stopping agents: ${agentNames.join(', ')}\\n`));

  const results = [];

  for (const agentName of agentNames) {
    try {
      await dockerManager.stopAgent(agentName, options);
      console.log(chalk.green(`✅ Stopped: ${agentName}`));
      results.push({ agent: agentName, status: 'stopped' });
    } catch (error) {
      console.log(chalk.red(`❌ Failed to stop ${agentName}: ${error.message}`));
      results.push({ agent: agentName, status: 'failed', error: error.message });
    }
  }

  // Summary
  const stopped = results.filter(r => r.status === 'stopped').length;
  const failed = results.filter(r => r.status === 'failed').length;

  console.log(chalk.yellow('\\n📊 Summary:'));
  console.log(chalk.green(`  ✅ Stopped: ${stopped}`));
  if (failed > 0) {
    console.log(chalk.red(`  ❌ Failed: ${failed}`));
  }
}

module.exports = { stopCommand };
