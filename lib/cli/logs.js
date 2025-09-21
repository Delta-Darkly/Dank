/**
 * CLI Logs Command - View agent logs
 */

const chalk = require('chalk');
const { DockerManager } = require('../docker/manager');

async function logsCommand(agentName, options) {
  try {
    const dockerManager = new DockerManager();
    await dockerManager.initialize();

    if (agentName) {
      await showAgentLogs(dockerManager, agentName, options);
    } else {
      await showAllLogs(dockerManager, options);
    }

  } catch (error) {
    console.error(chalk.red('❌ Logs failed:'), error.message);
    process.exit(1);
  }
}

async function showAgentLogs(dockerManager, agentName, options) {
  console.log(chalk.yellow(`📋 Logs for agent: ${agentName}\\n`));

  try {
    const logStream = await dockerManager.getAgentLogs(agentName, {
      follow: options.follow,
      tail: parseInt(options.tail) || 100,
      since: options.since
    });

    logStream.on('data', (chunk) => {
      // Docker log format includes 8-byte header, remove it
      const logLine = chunk.toString('utf8').substring(8);
      
      // Color code log levels
      const coloredLine = logLine
        .replace(/\\[ERROR\\]/g, chalk.red('[ERROR]'))
        .replace(/\\[WARN\\]/g, chalk.yellow('[WARN]'))
        .replace(/\\[INFO\\]/g, chalk.blue('[INFO]'))
        .replace(/\\[DEBUG\\]/g, chalk.gray('[DEBUG]'));
      
      process.stdout.write(coloredLine);
    });

    logStream.on('end', () => {
      if (!options.follow) {
        console.log(chalk.gray('\\n--- End of logs ---'));
      }
    });

    if (options.follow) {
      console.log(chalk.gray('Following logs (Ctrl+C to stop)...'));
      
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\\n👋 Stopped following logs'));
        process.exit(0);
      });
    }

  } catch (error) {
    throw new Error(`Failed to get logs for ${agentName}: ${error.message}`);
  }
}

async function showAllLogs(dockerManager, options) {
  console.log(chalk.yellow('📋 Logs from all agents\\n'));

  try {
    const containers = await dockerManager.docker.listContainers({
      all: true,
      filters: { name: ['dank-'] }
    });

    if (containers.length === 0) {
      console.log(chalk.gray('No agents found.'));
      return;
    }

    for (const containerInfo of containers) {
      const agentName = containerInfo.Names[0].replace('/dank-', '').split('-')[0];
      
      console.log(chalk.cyan(`\\n=== ${agentName} ===`));
      
      try {
        const logStream = await dockerManager.getAgentLogs(agentName, {
          follow: false,
          tail: parseInt(options.tail) || 50
        });

        logStream.on('data', (chunk) => {
          const logLine = chunk.toString('utf8').substring(8);
          const coloredLine = logLine
            .replace(/\\[ERROR\\]/g, chalk.red('[ERROR]'))
            .replace(/\\[WARN\\]/g, chalk.yellow('[WARN]'))
            .replace(/\\[INFO\\]/g, chalk.blue('[INFO]'))
            .replace(/\\[DEBUG\\]/g, chalk.gray('[DEBUG]'));
          
          process.stdout.write(`[${agentName}] ${coloredLine}`);
        });

        // Wait for logs to finish
        await new Promise((resolve) => {
          logStream.on('end', resolve);
        });

      } catch (error) {
        console.log(chalk.red(`Failed to get logs for ${agentName}: ${error.message}`));
      }
    }

    console.log(chalk.gray('\\n--- End of all logs ---'));

  } catch (error) {
    throw new Error(`Failed to get all logs: ${error.message}`);
  }
}

module.exports = { logsCommand };
