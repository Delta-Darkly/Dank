/**
 * CLI Init Command - Initialize new Dank project
 */

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { DankProject } = require('../project');

async function initCommand(projectName, options) {
  const name = projectName || path.basename(process.cwd());
  
  console.log(chalk.yellow(`🚀 Initializing Dank project: ${name}\\n`));

  try {
    // Create project instance
    const project = new DankProject(name, {
      template: options.template,
      force: options.force
    });

    // Initialize project structure
    await project.init();

    console.log(chalk.green('\\n✅ Project initialized successfully!'));
    console.log(chalk.cyan('\\nNext steps:'));
    console.log(chalk.gray('  1. Set your API keys in environment variables'));
    console.log(chalk.gray('  2. Edit dank.config.js to configure your agents'));
    console.log(chalk.gray('  3. Run "dank run" to start your agents'));
    console.log(chalk.gray('\\nFor more information, visit: https://github.com/your-org/dank'));

  } catch (error) {
    console.error(chalk.red('❌ Initialization failed:'), error.message);
    process.exit(1);
  }
}

module.exports = { initCommand };
