/**
 * CLI Clean Command - Clean up Docker resources
 */

const chalk = require('chalk');
const { DockerManager } = require('../docker/manager');

async function cleanCommand(options) {
  console.log(chalk.yellow('🧹 Cleaning up Docker resources...\\n'));

  try {
    const dockerManager = new DockerManager();
    await dockerManager.initialize();

    await dockerManager.cleanup({
      all: options.all,
      containers: options.containers || options.all,
      images: options.images || options.all,
      buildContexts: options.buildContexts || options.all
    });

    console.log(chalk.green('\\n✅ Cleanup completed successfully!'));

  } catch (error) {
    console.error(chalk.red('❌ Cleanup failed:'), error.message);
    process.exit(1);
  }
}

module.exports = { cleanCommand };
