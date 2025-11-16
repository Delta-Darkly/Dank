/**
 * CLI Build Command - Pull Docker images
 */

const chalk = require('chalk');
const { DockerManager } = require('../docker/manager');

async function buildCommand(options) {
  try {
    const dockerManager = new DockerManager();
    await dockerManager.initialize();

    if (options.base) {
      await pullBaseImage(dockerManager, options);
    } else {
      console.log(chalk.yellow('📥 Pulling Docker images...\\n'));
      
      // Pull base image
      await pullBaseImage(dockerManager, options);
      
      console.log(chalk.green('\\n✅ Pull completed successfully!'));
    }

    process.exit(0);
  } catch (error) {
    console.error(chalk.red('❌ Pull failed:'), error.message);
    process.exit(1);
  }
}

async function pullBaseImage(dockerManager, options) {
  console.log(chalk.blue('📥 Pulling base image...'));
  
  try {
    await dockerManager.pullBaseImage();
    
    console.log(chalk.green('✅ Base image pulled successfully'));
    
  } catch (error) {
    throw new Error(`Base image pull failed: ${error.message}`);
  }
}

module.exports = { buildCommand };
