/**
 * CLI Init Command - Initialize new Dank project
 */

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { DankProject } = require('../project');

async function initCommand(projectName, options) {
  let name = projectName;
  let npmProjectName = projectName;
  
  // If no project name provided, prompt for both directory name and npm project name
  if (!name) {
    const inquirer = await import('inquirer');
    const answers = await inquirer.default.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'What should the project directory be named?',
        default: path.basename(process.cwd()),
        validate: (input) => {
          if (!input.trim()) {
            return 'Project name is required';
          }
          if (!/^[a-zA-Z0-9-_]+$/.test(input)) {
            return 'Project name can only contain letters, numbers, hyphens, and underscores';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'npmProjectName',
        message: 'What should the npm package name be?',
        default: (answers) => answers.projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        validate: (input) => {
          if (!input.trim()) {
            return 'NPM project name is required';
          }
          if (!/^[a-z0-9-]+$/.test(input)) {
            return 'NPM project name can only contain lowercase letters, numbers, and hyphens';
          }
          return true;
        }
      }
    ]);
    
    name = answers.projectName;
    npmProjectName = answers.npmProjectName;
  } else {
    // If project name provided, use it for both directory and npm name
    npmProjectName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }
  
  console.log(chalk.yellow(`🚀 Initializing Dank project: ${name}`));
  console.log(chalk.cyan(`📦 NPM package name: ${npmProjectName}\n`));

  try {
    // Create project instance
    const project = new DankProject(name, {
      template: options.template,
      force: options.force
    });

    // Initialize project structure
    await project.init();

    // Create package.json
    await createPackageJson(npmProjectName, project.projectPath);

    // Create .env.example file
    await createEnvExample(project.projectPath);

    // Create .gitignore
    await createGitignore(project.projectPath);

    // Create README.md
    await createReadme(name, project.projectPath);

    console.log(chalk.green('\n✅ Project initialized successfully!'));
    console.log(chalk.cyan('\nNext steps:'));
    console.log(chalk.gray('  1. Copy .env.example to .env and set your API keys'));
    console.log(chalk.gray('  2. Run "npm install" to install dependencies'));
    console.log(chalk.gray('  3. Edit dank.config.js to configure your agents'));
    console.log(chalk.gray('  4. Run "dank run" to start your agents'));
    console.log(chalk.gray('\nFor more information, visit: https://github.com/your-org/dank'));

  } catch (error) {
    console.error(chalk.red('❌ Initialization failed:'), error.message);
    process.exit(1);
  }
}

/**
 * Create package.json for the new project
 */
async function createPackageJson(npmProjectName, projectPath) {
  const packageJson = {
    name: npmProjectName,
    version: '1.0.0',
    description: `Dank AI agents for ${npmProjectName}`,
    main: 'dank.config.js',
    scripts: {
      start: 'dank run',
      dev: 'dank run --config dank.config.js',
      stop: 'dank stop',
      status: 'dank status',
      logs: 'dank logs',
      build: 'dank build',
      clean: 'dank clean'
    },
    dependencies: {
      'dank-ai': '^1.0.0'
    },
    keywords: ['dank', 'ai', 'agents', 'automation', 'llm'],
    author: '',
    license: 'ISC',
    engines: {
      node: '>=16.0.0',
      npm: '>=8.0.0'
    }
  };

  const packagePath = path.join(projectPath, 'package.json');
  await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2), 'utf8');
  console.log(chalk.green(`Created package.json: ${packagePath}`));
}

/**
 * Create .env.example file
 */
async function createEnvExample(projectPath) {
  const envExample = `# Dank AI Agent Environment Variables
# Copy this file to .env and fill in your API keys

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-3.5-turbo

# Anthropic Configuration (optional)
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ANTHROPIC_MODEL=claude-3-sonnet-20240229

# Google AI Configuration (optional)
GOOGLE_AI_API_KEY=your_google_ai_api_key_here
GOOGLE_AI_MODEL=gemini-pro

# Agent Configuration
DANK_LOG_LEVEL=info
DANK_MAX_CONCURRENT_AGENTS=3

# Docker Configuration (optional)
DOCKER_REGISTRY=your_registry_here
DOCKER_NAMESPACE=your_namespace_here
`;

  const envPath = path.join(projectPath, '.env.example');
  await fs.writeFile(envPath, envExample, 'utf8');
  console.log(chalk.green(`Created .env.example: ${envPath}`));
}

/**
 * Create .gitignore file
 */
async function createGitignore(projectPath) {
  const gitignore = `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Dank Framework specific
.dank/
agent-code/
build-contexts/
dank-agent-*
container-logs/
agent-logs/
conversation-data/
*.agent.js

# Docker
.dockerignore
*.dockerignore

# macOS
.DS_Store

# Windows
Thumbs.db
ehthumbs.db
*.stackdump

# IDEs
.vscode/
.idea/
*.sublime-project
*.sublime-workspace

# Logs
logs/
*.log

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory
coverage/
*.lcov

# nyc test coverage
.nyc_output

# Dependency directories
jspm_packages/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity
`;

  const gitignorePath = path.join(projectPath, '.gitignore');
  await fs.writeFile(gitignorePath, gitignore, 'utf8');
  console.log(chalk.green(`Created .gitignore: ${gitignorePath}`));
}

/**
 * Create README.md for the project
 */
async function createReadme(projectName, projectPath) {
  const readme = `# ${projectName}

A Dank AI agent project with modern event handling and Docker orchestration.

## Features

- 🤖 **AI Agents**: Powered by multiple LLM providers (OpenAI, Anthropic, Google AI)
- 🐳 **Docker Integration**: Containerized agents with automatic management
- 📡 **Event System**: Real-time event handling for prompts, responses, and tools
- 🔧 **Auto-Detection**: Automatically enables features based on usage
- 📊 **Monitoring**: Built-in logging and status monitoring

## Quick Start

1. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

2. **Set up environment:**
   \`\`\`bash
   cp .env.example .env
   # Edit .env with your API keys
   \`\`\`

3. **Configure your agents:**
   Edit \`dank.config.js\` to define your agents and their capabilities.

4. **Start your agents:**
   \`\`\`bash
   npm start
   # or
   dank run
   \`\`\`

## Available Commands

- \`npm start\` - Start all agents
- \`npm run dev\` - Start in development mode
- \`npm run stop\` - Stop all agents
- \`npm run status\` - Check agent status
- \`npm run logs\` - View agent logs
- \`npm run build\` - Build agent images
- \`npm run clean\` - Clean up containers and images

## Event Handlers

This project includes examples of the three main event types:

### 1. Direct Prompting Events (\`request_output\`)
Handle LLM interactions and modify prompts/responses:

\`\`\`javascript
.addHandler('request_output:start', (data) => {
  // Modify the prompt before sending to LLM
  return { prompt: \`Enhanced: \${data.prompt}\` };
})

.addHandler('request_output:end', (data) => {
  // Modify the response before sending back
  return { response: \`\${data.response} [Enhanced by Dank]\` };
})
\`\`\`

### 2. HTTP API Events (\`tool:http-server\`)
Handle HTTP requests and responses:

\`\`\`javascript
.addHandler('tool:http-server:call', (data) => {
  console.log('HTTP request received:', data.method, data.path);
})

.addHandler('tool:http-server:response', (data) => {
  console.log('HTTP response sent:', data.statusCode);
})
\`\`\`

### 3. System Events
Handle agent lifecycle and errors:

\`\`\`javascript
.addHandler('output', (data) => {
  console.log('Agent output:', data);
})

.addHandler('error', (error) => {
  console.error('Agent error:', error);
})
\`\`\`

## Configuration

Edit \`dank.config.js\` to:

- Define your agents and their capabilities
- Set up LLM providers and models
- Configure event handlers
- Set Docker and resource limits
- Enable/disable communication features

## Documentation

For more information, visit the [Dank Framework Documentation](https://github.com/your-org/dank).

## License

ISC
`;

  const readmePath = path.join(projectPath, 'README.md');
  await fs.writeFile(readmePath, readme, 'utf8');
  console.log(chalk.green(`Created README.md: ${readmePath}`));
}

module.exports = { initCommand };
