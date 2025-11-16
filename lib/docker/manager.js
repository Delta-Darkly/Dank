/**
 * Docker Container Manager
 *
 * Manages Docker containers for Dank agents including:
 * - Building agent images
 * - Starting/stopping containers
 * - Monitoring container health
 * - Managing Docker resources
 */

const Docker = require("dockerode");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const tar = require("tar");
const winston = require("winston");
const { spawn, exec } = require("child_process");
const { promisify } = require("util");
const { DOCKER_CONFIG } = require("../constants");
const { AgentConfig } = require("../config");
const analytics = require("../analytics");

const execAsync = promisify(exec);

class DockerManager {
  /**
   * Resolve docker executable path
   */
  async resolveDockerCommand() {
    const dockerPaths = [
      "/usr/local/bin/docker",
      "/opt/homebrew/bin/docker",
      "/usr/bin/docker",
      "docker",
    ];
    for (const path of dockerPaths) {
      try {
        await execAsync(`${path} --version`);
        return path;
      } catch (_) {
        // continue
      }
    }
    throw new Error("Docker executable not found in expected locations");
  }
  constructor(options = {}) {
    this.docker = new Docker(options.dockerOptions || {});
    this.logger =
      options.logger ||
      winston.createLogger({
        level: "info",
        format: winston.format.simple(),
        transports: [new winston.transports.Console()],
      });

    this.defaultBaseImageName = `${DOCKER_CONFIG.baseImagePrefix}:${DOCKER_CONFIG.defaultTag}`;
    this.networkName = DOCKER_CONFIG.networkName;
    this.containers = new Map();
  }

  /**
   * Create Docker client with proper socket detection
   */
  createDockerClient() {
    const fs = require("fs-extra");
    const path = require("path");

    // Common Docker socket locations
    const socketPaths = [
      "/var/run/docker.sock", // Standard Linux
      "//var/run/docker.sock", // Windows WSL2
      "\\\\.\\pipe\\docker_engine", // Windows named pipe
      path.join(os.homedir(), ".docker", "run", "docker.sock"), // macOS Docker Desktop
      "/Users/Shared/docker.sock", // Alternative macOS location
    ];

    // Find the first available socket
    for (const socketPath of socketPaths) {
      try {
        if (fs.existsSync(socketPath)) {
          this.logger.info(`Found Docker socket at: ${socketPath}`);
          return new Docker({ socketPath });
        }
      } catch (error) {
        // Continue to next socket path
      }
    }

    // If no socket found, try default connection (will use environment variables)
    this.logger.info("No Docker socket found, using default connection");
    return new Docker();
  }

  /**
   * Initialize Docker environment
   */
  async initialize() {
    try {
      // Ensure Docker is available and running
      await this.ensureDockerAvailable();

      // Initialize Docker client with proper socket detection
      this.docker = this.createDockerClient();

      // Check Docker connection
      await this.docker.ping();
      this.logger.info("Docker connection established");

      // Create network if it doesn't exist
      await this.ensureNetwork();

      // Check if default base image exists, pull if not found
      const hasBaseImage = await this.hasImage(this.defaultBaseImageName);
      if (!hasBaseImage) {
        this.logger.info(
          `Default base image '${this.defaultBaseImageName}' not found. Pulling from registry...`
        );
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
      // Initialize Docker client with proper socket detection
      this.docker = this.createDockerClient();

      // First, try to ping Docker to see if it's running
      await this.docker.ping();
      this.logger.info("Docker is running and accessible");
      return;
    } catch (error) {
      this.logger.info("Docker is not accessible, checking installation...");
    }

    // Check if Docker is installed
    const isInstalled = await this.isDockerInstalled();

    if (!isInstalled) {
      this.logger.info("Docker is not installed. Installing Docker...");
      await this.installDocker();
    } else {
      this.logger.info(
        "Docker is installed but not running. Starting Docker..."
      );
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
      // Check if docker command is available using multiple paths
      const dockerPaths = [
        "/usr/local/bin/docker",
        "/opt/homebrew/bin/docker",
        "/usr/bin/docker",
        "docker", // fallback to PATH
      ];

      let dockerFound = false;
      for (const path of dockerPaths) {
        try {
          await execAsync(`${path} --version`);
          dockerFound = true;
          break;
        } catch (error) {
          // Try next path
        }
      }

      if (!dockerFound) {
        return false;
      }

      // On macOS, also check if Docker Desktop is installed
      if (process.platform === "darwin") {
        const dockerAppPath = "/Applications/Docker.app";
        const fs = require("fs-extra");
        if (!(await fs.pathExists(dockerAppPath))) {
          this.logger.info("Docker CLI found but Docker Desktop not installed");
          return false;
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if Docker is accessible and running
   */
  async checkDockerAccess() {
    try {
      // Try to run a simple docker command to check if Docker is accessible
      // Use full path to docker command to avoid PATH issues after installation
      const dockerPaths = [
        "/usr/local/bin/docker",
        "/opt/homebrew/bin/docker",
        "/usr/bin/docker",
        "docker", // fallback to PATH
      ];

      let dockerCommand = "docker";
      let dockerFound = false;

      for (const path of dockerPaths) {
        try {
          this.logger.info(`Trying Docker path: ${path}`);
          const result = await execAsync(`${path} --version`);
          this.logger.info(`✅ Docker found at: ${path}`);
          this.logger.info(`Docker version: ${result.stdout.trim()}`);
          dockerCommand = path;
          dockerFound = true;
          break;
        } catch (error) {
          this.logger.debug(
            `❌ Docker not found at: ${path} - ${error.message}`
          );
        }
      }

      if (!dockerFound) {
        throw new Error("Docker executable not found in any expected location");
      }

      // Test if Docker daemon service is accessible and running
      this.logger.info("🔍 Testing Docker daemon service...");
      try {
        const result = await execAsync(`${dockerCommand} ps`);
        this.logger.info("✅ Docker daemon service is running and accessible");
        this.logger.debug(`Docker ps output: ${result.stdout.trim()}`);
        return true;
      } catch (error) {
        this.logger.error(
          `❌ Docker daemon service not accessible: ${error.message}`
        );
        this.logger.error(`STDERR: ${error.stderr || "No stderr"}`);

        // Provide helpful error information
        if (error.message.includes("Cannot connect to the Docker daemon")) {
          this.logger.info(
            "💡 Docker daemon is not running. Please start Docker Desktop or Docker service."
          );
        } else if (error.message.includes("permission denied")) {
          this.logger.info(
            "💡 Permission denied. You may need to add your user to the docker group or restart your terminal."
          );
        } else if (error.message.includes("connection refused")) {
          this.logger.info(
            "💡 Connection refused. Docker daemon may not be started yet."
          );
        }

        throw new Error(
          `Docker daemon service is not accessible: ${error.message}`
        );
      }
    } catch (error) {
      this.logger.error(`Docker access check failed: ${error.message}`);
      throw new Error(`Docker is not accessible: ${error.message}`);
    }
  }

  /**
   * Install Docker on the system
   */
  async installDocker() {
    const platform = process.platform;

    this.logger.info(`Installing Docker for ${platform}...`);

    // Track Docker installation attempt
    await analytics.trackDockerInstall(true, platform);

    try {
      if (platform === "darwin") {
        await this.installDockerMacOS();
      } else if (platform === "linux") {
        await this.installDockerLinux();
      } else if (platform === "win32") {
        await this.installDockerWindows();
      } else {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      this.logger.info("Docker installation completed");
      
      // Track successful Docker installation
      await analytics.trackDockerInstall(true, platform);
    } catch (error) {
      // Track failed Docker installation
      await analytics.trackDockerInstall(false, platform);
      await analytics.trackError(error, { context: 'docker_install', platform });
      
      throw new Error(`Failed to install Docker: ${error.message}`);
    }
  }

  /**
   * Install Docker on macOS
   */
  async installDockerMacOS() {
    this.logger.info("Installing Docker Desktop for macOS...");

    try {
      // Download Docker Desktop installer
      await this.downloadDockerInstaller();

      // Launch the installer
      await this.launchDockerInstaller();

      // Prompt user to complete installation
      this.promptUserToCompleteInstallation();

      // Wait for Docker to be installed and available
      await this.waitForDockerInstallation();
    } catch (error) {
      this.logger.error("Docker installation failed:", error.message);
      throw new Error(`Docker Desktop installation failed: ${error.message}`);
    }
  }

  /**
   * Wait for Docker to be ready and accessible
   */
  async waitForDockerReady(maxWaitTime = 120000) {
    // 2 minutes max wait
    const startTime = Date.now();
    const checkInterval = 5000; // Check every 5 seconds

    this.logger.info("Checking if Docker is ready...");

    while (Date.now() - startTime < maxWaitTime) {
      try {
        await this.checkDockerAccess();
        this.logger.info("Docker is ready and accessible!");
        return true;
      } catch (error) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        this.logger.info(
          `Docker not ready yet (${elapsed}s elapsed), waiting...`
        );
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }
    }

    throw new Error(
      `Docker did not become ready within ${maxWaitTime / 1000} seconds`
    );
  }

  /**
   * Download a file using Node.js built-in modules with proper binary handling
   */
  async downloadFile(url, filePath) {
    this.logger.info(`Downloading file from ${url} to ${filePath}`);

    const https = require("https");
    const http = require("http");
    const fs = require("fs-extra");
    const { URL } = require("url");

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === "https:" ? https : http;

      const request = client.get(url, (response) => {
        if (response.statusCode === 200) {
          const file = fs.createWriteStream(filePath);

          // Handle binary data properly
          response.setEncoding("binary");

          response.on("data", (chunk) => {
            file.write(chunk, "binary");
          });

          response.on("end", () => {
            file.end();
            this.logger.info("File downloaded successfully");
            resolve();
          });

          file.on("error", (error) => {
            fs.unlink(filePath, () => {}); // Delete the file on error
            reject(new Error(`File write error: ${error.message}`));
          });
        } else if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirects
          this.logger.info(
            `Following redirect to: ${response.headers.location}`
          );
          this.downloadFile(response.headers.location, filePath)
            .then(resolve)
            .catch(reject);
        } else {
          reject(
            new Error(
              `HTTP error: ${response.statusCode} ${response.statusMessage}`
            )
          );
        }
      });

      request.on("error", (error) => {
        reject(new Error(`Download error: ${error.message}`));
      });
    });
  }

  /**
   * Download Docker Desktop installer for the current platform
   */
  async downloadDockerInstaller() {
    this.logger.info("Downloading Docker Desktop installer...");

    try {
      // Determine the correct download URL based on platform and architecture
      let downloadUrl, installerName, installerPath;

      if (process.platform === "darwin") {
        const arch = process.arch === "arm64" ? "arm64" : "amd64";
        downloadUrl = `https://desktop.docker.com/mac/main/${arch}/Docker.dmg`;
        installerName = "Docker.dmg";
        installerPath = path.join(os.homedir(), "Downloads", installerName);
      } else if (process.platform === "win32") {
        downloadUrl =
          "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe";
        installerName = "Docker Desktop Installer.exe";
        installerPath = path.join(os.homedir(), "Downloads", installerName);
      } else if (process.platform === "linux") {
        downloadUrl =
          "https://desktop.docker.com/linux/main/amd64/docker-desktop-4.46.0-amd64.deb";
        installerName = "docker-desktop.deb";
        installerPath = path.join(os.homedir(), "Downloads", installerName);
      } else {
        throw new Error(`Unsupported platform: ${process.platform}`);
      }

      this.logger.info(
        `Downloading Docker Desktop for ${process.platform} (${process.arch})...`
      );
      this.logger.info(`URL: ${downloadUrl}`);
      this.logger.info(`Destination: ${installerPath}`);

      // Download the installer using Node.js built-in modules
      await this.downloadFile(downloadUrl, installerPath);

      this.logger.info("Docker Desktop installer downloaded successfully");
      return { installerPath, installerName };
    } catch (error) {
      this.logger.error(
        "Failed to download Docker Desktop installer:",
        error.message
      );
      throw new Error(
        `Failed to download Docker Desktop installer: ${error.message}`
      );
    }
  }

  /**
   * Launch the Docker Desktop installer
   */
  async launchDockerInstaller() {
    this.logger.info("Launching Docker Desktop installer...");

    try {
      let launchCommand;

      if (process.platform === "darwin") {
        // Mount DMG and copy Docker.app to Applications
        const dmgPath = path.join(os.homedir(), "Downloads", "Docker.dmg");

        // Mount the DMG
        const mountCommand = `hdiutil attach "${dmgPath}"`;
        this.logger.info(`🔧 About to run command: ${mountCommand}`);
        await this.runCommand(mountCommand, "Mounting Docker Desktop DMG");

        // Wait a moment for the mount to complete
        await this.sleep(2000);

        // Check if the volume was mounted and find the correct path
        const fs = require("fs-extra");
        const possiblePaths = [
          "/Volumes/Docker/Docker.app",
          "/Volumes/Docker.app",
          "/Volumes/Docker Desktop/Docker.app",
        ];

        let dockerAppPath = null;
        for (const path of possiblePaths) {
          if (await fs.pathExists(path)) {
            dockerAppPath = path;
            break;
          }
        }

        if (!dockerAppPath) {
          throw new Error("Could not find Docker.app in mounted volume");
        }

        // Copy Docker.app to Applications folder
        this.logger.info("Copying Docker.app to Applications folder...");
        const copyCommand = `cp -R "${dockerAppPath}" /Applications/`;
        this.logger.info(`🔧 About to run command: ${copyCommand}`);
        await this.runCommand(
          copyCommand,
          "Copying Docker.app to Applications"
        );

        // Unmount the DMG
        this.logger.info("Unmounting DMG...");
        const unmountCommand = "hdiutil detach /Volumes/Docker";
        this.logger.info(`🔧 About to run command: ${unmountCommand}`);
        try {
          await this.runCommand(unmountCommand, "Unmounting DMG");
        } catch (error) {
          this.logger.warn(
            "Could not unmount DMG (may already be unmounted):",
            error.message
          );
        }

        // Launch Docker Desktop from Applications
        launchCommand = "open -a Docker";
      } else if (process.platform === "win32") {
        const installerPath = path.join(
          os.homedir(),
          "Downloads",
          "Docker Desktop Installer.exe"
        );
        launchCommand = `"${installerPath}"`;
      } else if (process.platform === "linux") {
        const installerPath = path.join(
          os.homedir(),
          "Downloads",
          "docker-desktop.deb"
        );
        launchCommand = `sudo dpkg -i "${installerPath}"`;
      }

      this.logger.info(`🔧 About to run command: ${launchCommand}`);
      await this.runCommand(
        launchCommand,
        "Launching Docker Desktop installer"
      );

      this.logger.info("Docker Desktop installer launched successfully");
    } catch (error) {
      this.logger.error(
        "Failed to launch Docker Desktop installer:",
        error.message
      );
      throw new Error(
        `Failed to launch Docker Desktop installer: ${error.message}`
      );
    }
  }

  /**
   * Prompt user to complete Docker installation
   */
  promptUserToCompleteInstallation() {
    console.log("\n" + "=".repeat(60));
    console.log("🐳 DOCKER INSTALLATION REQUIRED");
    console.log("=".repeat(60));
    console.log("");
    console.log("The Docker Desktop installer has been launched.");
    console.log("Please follow these steps to complete the installation:");
    console.log("");

    if (process.platform === "darwin") {
      console.log(
        "1. Docker.app has been automatically copied to Applications"
      );
      console.log("2. Docker Desktop should launch automatically");
      console.log("3. Follow the setup wizard to complete installation");
      console.log("4. Start Docker Desktop when prompted");
    } else if (process.platform === "win32") {
      console.log("1. The Docker Desktop installer should open automatically");
      console.log("2. Follow the installation wizard");
      console.log("3. Restart your computer if prompted");
      console.log("4. Launch Docker Desktop from Start Menu");
    } else if (process.platform === "linux") {
      console.log("1. The Docker Desktop package has been installed");
      console.log("2. Launch Docker Desktop from your applications menu");
      console.log("3. Follow the setup wizard to complete installation");
    }

    console.log("");
    console.log("⏳ Waiting for Docker to be installed and started...");
    console.log("   (This may take a few minutes)");
    console.log("");
    console.log("=".repeat(60));
  }

  /**
   * Wait for Docker to be installed and available
   */
  async waitForDockerInstallation() {
    this.logger.info("Waiting for Docker to be installed and available...");

    const maxWaitTime = 300000; // 5 minutes max wait
    const checkInterval = 5000; // Check every 5 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Check if Docker is installed and running
        await this.checkDockerAccess();
        this.logger.info("Docker is installed and running!");
        return true;
      } catch (error) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const remaining = Math.round(
          (maxWaitTime - (Date.now() - startTime)) / 1000
        );

        this.logger.info(
          `Docker not ready yet (${elapsed}s elapsed, ${remaining}s remaining)...`
        );

        // Show progress every 30 seconds
        if (elapsed % 30 === 0) {
          console.log(`⏳ Still waiting for Docker... (${elapsed}s elapsed)`);
        }

        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }
    }

    throw new Error(
      `Docker did not become available within ${
        maxWaitTime / 1000
      } seconds. Please ensure Docker Desktop is installed and running.`
    );
  }

  /**
   * Install Docker Desktop manually by downloading and installing the DMG
   */
  async installDockerDesktopManually() {
    this.logger.info("Downloading Docker Desktop manually...");

    try {
      // Determine the correct download URL based on architecture
      const arch = process.arch === "arm64" ? "arm64" : "amd64";
      const downloadUrl = `https://desktop.docker.com/mac/main/${arch}/Docker.dmg`;
      const dmgPath = path.join(os.homedir(), "Downloads", "Docker.dmg");

      this.logger.info(`Downloading Docker Desktop for ${arch}...`);
      this.logger.info(`URL: ${downloadUrl}`);
      this.logger.info(`Destination: ${dmgPath}`);

      // Download the DMG file
      const downloadCommand = `curl -L "${downloadUrl}" -o "${dmgPath}"`;
      this.logger.info(`🔧 About to run command: ${downloadCommand}`);
      await this.runCommandWithEnv(
        downloadCommand,
        "Downloading Docker Desktop"
      );

      // Mount the DMG
      this.logger.info("Mounting Docker Desktop DMG...");
      const mountCommand = `hdiutil attach "${dmgPath}"`;
      this.logger.info(`🔧 About to run command: ${mountCommand}`);
      await this.runCommandWithEnv(mountCommand, "Mounting Docker Desktop DMG");

      // Copy Docker.app to Applications
      this.logger.info("Installing Docker Desktop to Applications...");
      const copyCommand = 'cp -R "/Volumes/Docker/Docker.app" /Applications/';
      this.logger.info(`🔧 About to run command: ${copyCommand}`);
      await this.runCommandWithEnv(copyCommand, "Installing Docker Desktop");

      // Unmount the DMG
      this.logger.info("Unmounting Docker Desktop DMG...");
      const unmountCommand = "hdiutil detach /Volumes/Docker";
      this.logger.info(`🔧 About to run command: ${unmountCommand}`);
      await this.runCommandWithEnv(
        unmountCommand,
        "Unmounting Docker Desktop DMG"
      );

      // Clean up the DMG file
      this.logger.info("Cleaning up downloaded DMG...");
      const cleanupCommand = `rm "${dmgPath}"`;
      this.logger.info(`🔧 About to run command: ${cleanupCommand}`);
      await this.runCommandWithEnv(cleanupCommand, "Cleaning up DMG file");

      this.logger.info(
        "Docker Desktop installed successfully via manual download"
      );

      // Try to start Docker Desktop
      this.logger.info("Starting Docker Desktop...");
      try {
        const startCommand = "open -a Docker";
        this.logger.info(`🔧 About to run command: ${startCommand}`);
        await this.runCommandWithEnv(startCommand, "Starting Docker Desktop");

        // Wait for Docker to be ready
        this.logger.info("Waiting for Docker Desktop to start...");
        await this.waitForDockerReady();
      } catch (startError) {
        this.logger.warn(
          "Could not start Docker Desktop automatically. Please start it manually from Applications."
        );
      }
    } catch (error) {
      this.logger.error(
        "Manual Docker Desktop installation failed:",
        error.message
      );
      throw new Error(
        `Manual Docker Desktop installation failed: ${error.message}`
      );
    }
  }

  /**
   * Install Docker on Linux
   */
  async installDockerLinux() {
    this.logger.info("Installing Docker on Linux...");

    try {
      // Download Docker Desktop installer
      await this.downloadDockerInstaller();

      // Launch the installer
      await this.launchDockerInstaller();

      // Prompt user to complete installation
      this.promptUserToCompleteInstallation();

      // Wait for Docker to be installed and available
      await this.waitForDockerInstallation();
    } catch (error) {
      this.logger.error("Docker installation failed:", error.message);
      throw new Error(`Docker Desktop installation failed: ${error.message}`);
    }
  }

  /**
   * Install Docker on Windows
   */
  async installDockerWindows() {
    this.logger.info("Installing Docker Desktop for Windows...");

    try {
      // Download Docker Desktop installer
      await this.downloadDockerInstaller();

      // Launch the installer
      await this.launchDockerInstaller();

      // Prompt user to complete installation
      this.promptUserToCompleteInstallation();

      // Wait for Docker to be installed and available
      await this.waitForDockerInstallation();
    } catch (error) {
      this.logger.error("Docker installation failed:", error.message);
      throw new Error(`Docker Desktop installation failed: ${error.message}`);
    }
  }

  /**
   * Start Docker service
   */
  async startDocker() {
    const platform = process.platform;

    try {
      if (platform === "darwin") {
        // On macOS, try to start Docker Desktop
        await this.runCommand("open -a Docker", "Starting Docker Desktop");
      } else if (platform === "linux") {
        // On Linux, start Docker service
        await this.runCommand(
          "sudo systemctl start docker",
          "Starting Docker service"
        );
        await this.runCommand(
          "sudo systemctl enable docker",
          "Enabling Docker service"
        );
      } else if (platform === "win32") {
        // On Windows, try to start Docker Desktop
        await this.runCommand(
          'start "" "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"',
          "Starting Docker Desktop"
        );
      }

      this.logger.info("Docker service started");
    } catch (error) {
      this.logger.warn(`Failed to start Docker service: ${error.message}`);
      this.logger.info("Please start Docker manually and try again");
      throw error;
    }
  }

  /**
   * Wait for Docker to become available
   */
  async waitForDocker() {
    const maxWaitTime = 300000; // 5 minutes
    const checkInterval = 3000; // 3 seconds
    const stabilityCheckDuration = 10000; // 10 seconds of consistent readiness
    const stabilityCheckInterval = 2000; // Check every 2 seconds during stability phase
    let elapsedTime = 0;

    this.logger.info(
      "⏳ Waiting for Docker daemon service to become available..."
    );
    this.logger.info("This may take a few minutes if Docker is starting up...");

    while (elapsedTime < maxWaitTime) {
      try {
        await this.checkDockerAccess();
        this.logger.info("✅ Docker daemon detected! Verifying stability...");

        // Wait for Docker to be consistently ready for stabilityCheckDuration
        const stabilityStartTime = Date.now();
        let consecutiveSuccessfulChecks = 0;
        const requiredConsecutiveChecks = Math.ceil(
          stabilityCheckDuration / stabilityCheckInterval
        );

        while (Date.now() - stabilityStartTime < stabilityCheckDuration) {
          try {
            await this.checkDockerAccess();
            consecutiveSuccessfulChecks++;
            this.logger.info(
              `Stability check ${consecutiveSuccessfulChecks}/${requiredConsecutiveChecks} passed`
            );

            if (consecutiveSuccessfulChecks >= requiredConsecutiveChecks) {
              this.logger.info("✅ Docker daemon is stable and ready!");
              return;
            }
          } catch (error) {
            this.logger.info(
              "Docker daemon became unstable, restarting stability check..."
            );
            consecutiveSuccessfulChecks = 0;
          }

          await this.sleep(stabilityCheckInterval);
        }

        // If we get here, stability check timed out
        this.logger.warn(
          "Docker daemon stability check timed out, continuing anyway..."
        );
        return;
      } catch (error) {
        const remainingTime = Math.round((maxWaitTime - elapsedTime) / 1000);
        const elapsedSeconds = Math.round(elapsedTime / 1000);

        if (elapsedSeconds % 30 === 0) {
          // Log every 30 seconds
          this.logger.info(
            `Docker daemon service not ready yet (${elapsedSeconds}s elapsed, ${remainingTime}s remaining)...`
          );
          this.logger.info(`Last error: ${error.message}`);
        }

        await this.sleep(checkInterval);
        elapsedTime += checkInterval;
      }
    }

    this.logger.error(
      "❌ Docker daemon service did not become available within the expected time"
    );
    this.logger.error("Please check:");
    this.logger.error(
      "1. Docker is installed and the daemon service is running"
    );
    this.logger.error("2. Docker daemon has finished starting up");
    this.logger.error("3. You have permission to access Docker");
    this.logger.error('4. Try running "docker ps" manually to test');

    throw new Error("Docker did not become available within the expected time");
  }

  /**
   * Run a command and log output
   */
  async runCommand(command, description) {
    this.logger.info(`${description}...`);
    this.logger.debug(`Executing command: ${command}`);

    return new Promise((resolve, reject) => {
      const child = spawn(command, {
        stdio: ["inherit", "pipe", "pipe"],
        shell: true,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        const output = data.toString();
        stdout += output;
        // Log output in debug mode
        this.logger.debug(`STDOUT: ${output.trim()}`);
      });

      child.stderr.on("data", (data) => {
        const output = data.toString();
        stderr += output;
        // Log stderr in debug mode
        this.logger.debug(`STDERR: ${output.trim()}`);
      });

      child.on("close", (code) => {
        if (code === 0) {
          this.logger.info(`${description} completed successfully`);
          resolve({ stdout, stderr });
        } else {
          const error = new Error(
            `Command failed with exit code ${code}: ${stderr}`
          );
          this.logger.error(`${description} failed: ${error.message}`);
          this.logger.error(`Command: ${command}`);
          this.logger.error(`STDOUT: ${stdout}`);
          this.logger.error(`STDERR: ${stderr}`);
          reject(error);
        }
      });

      child.on("error", (error) => {
        this.logger.error(`${description} failed: ${error.message}`);
        this.logger.error(`Command: ${command}`);
        reject(error);
      });
    });
  }

  /**
   * Run a command with proper environment setup for Homebrew
   */
  async runCommandWithEnv(command, description) {
    this.logger.info(`${description}...`);
    this.logger.debug(`Executing command: ${command}`);

    return new Promise((resolve, reject) => {
      // Set up environment for Homebrew
      const homebrewPaths = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/opt/homebrew/sbin",
        "/usr/local/sbin",
      ];

      const existingPath = process.env.PATH || "";
      const allPaths = [...homebrewPaths, ...existingPath.split(":")];
      const uniquePaths = [...new Set(allPaths.filter((p) => p))];
      const effectivePath = uniquePaths.join(":");

      const env = {
        ...process.env,
        PATH: effectivePath,
        HOMEBREW_NO_AUTO_UPDATE: "1",
        HOMEBREW_NO_INSTALL_CLEANUP: "1",
        HOMEBREW_PREFIX: "/opt/homebrew",
        HOMEBREW_CELLAR: "/opt/homebrew/Cellar",
        HOMEBREW_REPOSITORY: "/opt/homebrew",
        HOMEBREW_SHELLENV_PREFIX: "/opt/homebrew",
      };

      // Debug: Log environment details
      this.logger.debug(`Environment PATH: ${env.PATH}`);
      this.logger.debug(`HOMEBREW_PREFIX: ${env.HOMEBREW_PREFIX}`);
      this.logger.debug(
        `HOMEBREW_NO_AUTO_UPDATE: ${env.HOMEBREW_NO_AUTO_UPDATE}`
      );
      this.logger.debug(
        `HOMEBREW_NO_INSTALL_CLEANUP: ${env.HOMEBREW_NO_INSTALL_CLEANUP}`
      );

      // Use zsh with login shell for better environment support on macOS
      const child = spawn("zsh", ["-l", "-c", command], {
        stdio: ["inherit", "pipe", "pipe"],
        shell: false,
        env: env,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        const output = data.toString();
        stdout += output;
        // Log output in debug mode
        this.logger.debug(`STDOUT: ${output.trim()}`);
      });

      child.stderr.on("data", (data) => {
        const output = data.toString();
        stderr += output;
        // Log stderr in debug mode
        this.logger.debug(`STDERR: ${output.trim()}`);
      });

      child.on("close", (code) => {
        if (code === 0) {
          this.logger.info(`${description} completed successfully`);
          resolve({ stdout, stderr });
        } else {
          const error = new Error(
            `Command failed with exit code ${code}: ${stderr}`
          );
          this.logger.error(`${description} failed: ${error.message}`);
          this.logger.error(`Command: ${command}`);
          this.logger.error(`STDOUT: ${stdout}`);
          this.logger.error(`STDERR: ${stderr}`);
          reject(error);
        }
      });

      child.on("error", (error) => {
        this.logger.error(`${description} failed: ${error.message}`);
        this.logger.error(`Command: ${command}`);
        reject(error);
      });
    });
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Pull the base Docker image
   */
  async pullBaseImage(baseImageName = null, options = {}) {
    const imageName = baseImageName || this.defaultBaseImageName;
    this.logger.info(`Pulling base Docker image: ${imageName}`);

    try {
      const stream = await this.docker.pull(imageName);

      await this.followPullProgress(stream, "Base image pull");

      // Verify the image was pulled
      const hasImage = await this.hasImage(imageName);
      if (hasImage) {
        this.logger.info(`Base image '${imageName}' pulled successfully`);
      } else {
        throw new Error(
          `Base image '${imageName}' was not pulled successfully`
        );
      }
    } catch (error) {
      throw new Error(`Failed to pull base image: ${error.message}`);
    }
  }

  /**
   * Clean up existing containers from previous runs
   */
  async cleanupExistingContainers(agents) {
    this.logger.info("Cleaning up existing containers from previous runs...");

    try {
      // Get all containers (running and stopped) that match our agent naming pattern
      const containers = await this.docker.listContainers({ all: true });

      const agentNames = agents.map((agent) => agent.name.toLowerCase());
      const containersToCleanup = containers.filter((container) => {
        // Check if container name matches our dank agent pattern
        const containerName = container.Names[0].replace(/^\//, ""); // Remove leading slash
        return agentNames.some(
          (agentName) =>
            containerName.startsWith(`dank-${agentName}-`) ||
            containerName === `dank-${agentName}`
        );
      });

      if (containersToCleanup.length === 0) {
        this.logger.info("No existing containers found to cleanup");
        return;
      }

      this.logger.info(
        `Found ${containersToCleanup.length} existing containers to cleanup`
      );

      // Stop and remove each container
      for (const containerInfo of containersToCleanup) {
        const container = this.docker.getContainer(containerInfo.Id);
        const containerName = containerInfo.Names[0].replace(/^\//, "");

        try {
          // Stop container if running
          if (containerInfo.State === "running") {
            this.logger.info(`Stopping container: ${containerName}`);
            await container.stop({ t: 10 }); // 10 second timeout
          }

          // Remove container
          this.logger.info(`Removing container: ${containerName}`);
          await container.remove({ force: true });
        } catch (error) {
          // Log but don't fail if we can't clean up a specific container
          this.logger.warn(
            `Failed to cleanup container ${containerName}: ${error.message}`
          );
        }
      }

      this.logger.info("Container cleanup completed");
    } catch (error) {
      this.logger.error(
        "Failed to cleanup existing containers:",
        error.message
      );
      // Don't throw - we want to continue even if cleanup fails
    }
  }

  /**
   * Normalize Docker image name/tag components
   * Docker allows: lowercase letters, digits, underscores, periods, and hyphens
   * Cannot start or end with period or hyphen, max 128 chars for tags
   */
  normalizeDockerName(name) {
    if (!name || typeof name !== 'string') return 'invalid';
    const lower = String(name).toLowerCase();
    let sanitized = lower.replace(/[^a-z0-9_.-]/g, '-');
    sanitized = sanitized.replace(/\.{2,}/g, '.'); // Replace multiple periods with single
    sanitized = sanitized.replace(/-{2,}/g, '-'); // Replace multiple hyphens with single
    sanitized = sanitized.replace(/^[.-]+/, '').replace(/[.-]+$/, ''); // Remove leading/trailing . or -
    if (!sanitized || !/^[a-z0-9]/.test(sanitized)) sanitized = `a${sanitized || ''}`;
    if (sanitized.length > 128) sanitized = sanitized.slice(0, 128);
    return sanitized;
  }

  /**
   * Build agent-specific image
   */
  async buildAgentImage(agent, options = {}) {
    const normalizedName = this.normalizeDockerName(agent.name);
    const imageName = `dank-agent-${normalizedName}`;
    this.logger.info(`Building image for agent: ${agent.name}`);

    // Finalize agent configuration before building
    // This ensures ports and other configs are properly set
    agent.finalize();

    try {
      const buildContext = await this.createAgentBuildContext(agent, {
        projectDir: options.projectDir
      });
      const dockerCmd = await this.resolveDockerCommand();

      const buildCommand = [
        dockerCmd,
        'buildx',
        'build',
        '--platform', 'linux/amd64',
        '--tag', imageName,
        '--file', path.join(buildContext, 'Dockerfile'),
        '--load',
        ...(options.rebuild || options.noCache ? ['--no-cache'] : []),
        buildContext
      ].join(' ');

      await this.runCommand(buildCommand, `Agent ${agent.name} build`);

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
   * 
   * @param {Object} agent - The agent to build
   * @param {Object} options - Build options
   * @param {string} [options.tag="latest"] - Image tag
   * @param {string} [options.registry] - Docker registry
   * @param {string} [options.namespace] - Docker namespace
   * @param {boolean} [options.tagByAgent=false] - Use agent name as tag
   * @param {boolean} [options.force=false] - Force rebuild without cache
   * @param {boolean} [options.push=false] - Push to registry after build
   * @param {string} [options.baseImageOverride=null] - Production-only: Override base image for all agents (replaces agent's configured base image)
   * @returns {Promise<Object>} Build result with imageName and pushed status
   */
  async buildProductionImage(agent, options = {}) {
    const {
      tag = "latest",
      registry,
      namespace,
      tagByAgent = false,
      force = false,
      push = false,
      baseImageOverride = null, // Production-only: override base image for all agents
      projectDir = null, // Project directory to copy files from
    } = options;

    // Normalize all components
    const normalizedAgentName = this.normalizeDockerName(agent.name);
    const normalizedTag = this.normalizeDockerName(tag);

    //construct full repo name
    let repoName;
    if(!tagByAgent){
      // Per-agent repository: {registry}/{namespace}/{agent-name}
      repoName = `${registry?`${registry}/`:''}${namespace?`${namespace}/`:''}${normalizedAgentName}`;
    }else{
      // Common repository: {registry}/{namespace}
      repoName = `${registry?`${registry}/`:''}${namespace?`${namespace}/`:''}`;
    }
    
    repoName = repoName.replace(/\/+$/, '');

    // Final tag selection - normalize both agent name tags and user-provided tags
    const finalTag = tagByAgent ? normalizedAgentName : normalizedTag;
    const imageName = `${repoName}:${finalTag}`;

    this.logger.info(
      `Building production image for agent: ${agent.name} -> ${imageName}`
    );

    // Finalize agent configuration before building
    // This ensures ports and other configs are properly set
    agent.finalize();

    // Log base image override if provided
    if (baseImageOverride) {
      this.logger.info(`🔧 Production build: Using custom base image override: ${baseImageOverride}`);
    }

    try {
      const buildContext = await this.createAgentBuildContext(agent, { 
        isProductionBuild: true,
        baseImageOverride: baseImageOverride,
        projectDir: projectDir
      });
      const dockerCmd = await this.resolveDockerCommand();

      const buildCommand = [
        dockerCmd,
        'buildx',
        'build',
        '--platform', 'linux/amd64',
        '--tag', imageName,
        '--file', path.join(buildContext, 'Dockerfile'),
        ...(push ? ['--push'] : ['--load']),
        ...(force ? ['--no-cache'] : []),
        buildContext
      ].join(' ');

      await this.runCommand(buildCommand, `Production build for ${agent.name}`);

      this.logger.info(`Production image '${imageName}' built successfully`);
      if (push) {
        this.logger.info(`Successfully pushed image: ${imageName}`);
      }

      // Clean up build context
      await fs.remove(buildContext);

      return {
        imageName,
        pushed: push,
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
        handlerList.forEach((handlerObj) => {
          if (handlerObj && typeof handlerObj.handler === "function") {
            // Convert function to string, handling the function properly
            const handlerStr = handlerObj.handler.toString();
            handlers[eventName].push(handlerStr);
          }
        });
      }
    }

    // Generate the JavaScript object code
    const handlersEntries = Object.entries(handlers)
      .map(([eventName, handlerArray]) => {
        const handlersStr = handlerArray.join(",\n      ");
        // Quote event names that contain special characters (like colons)
        const quotedEventName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(eventName)
          ? eventName
          : `"${eventName}"`;
        return `    ${quotedEventName}: [\n      ${handlersStr}\n    ]`;
      })
      .join(",\n");

    return `{\n${handlersEntries}\n  }`;
  }

  /**
   * Generate routes code from agent configuration
   */
  generateRoutesCode(agent) {
    const routes = {};

    // Add routes from agent HTTP configuration
    if (agent.config?.http?.routes && agent.config.http.routes.size > 0) {
      for (const [routeKey, routeList] of agent.config.http.routes) {
        const [method, path] = routeKey.split(':');
        if (!routes[path]) {
          routes[path] = {};
        }

        // Convert route handlers to string representations
        routeList.forEach((routeObj) => {
          if (routeObj && typeof routeObj.handler === "function") {
            const handlerStr = routeObj.handler.toString();
            routes[path][method.toLowerCase()] = handlerStr;
          }
        });
      }
    }

    // Generate the JavaScript object code
    if (Object.keys(routes).length === 0) {
      return '{}';
    }

    const routesEntries = Object.entries(routes)
      .map(([path, methods]) => {
        const methodsEntries = Object.entries(methods)
          .map(([method, handler]) => {
            return `      ${method}: ${handler}`;
          })
          .join(",\n");
        // Quote paths that contain special characters
        const quotedPath = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(path)
          ? path
          : JSON.stringify(path);
        return `    ${quotedPath}: {\n${methodsEntries}\n    }`;
      })
      .join(",\n");

    return `{\n${routesEntries}\n  }`;
  }

  /**
   * Start agent container
   */
  async startAgent(agent, options = {}) {
    // Track agent start attempt
    await analytics.trackAgentStart(agent.name, true, {
      rebuild: options.rebuild || false,
      has_docker_config: !!agent.config.docker
    });

    // Finalize agent configuration (auto-detect features)
    // This will validate that agent.id is set (required)
    agent.finalize();

    const imageName = `dank-agent-${agent.name.toLowerCase()}`;
    
    // Ensure agent.id is set (should be validated by finalize(), but double-check for safety)
    if (!agent.id) {
      throw new Error(
        `Agent ID is required for agent "${agent.name}". ` +
        `Use .setId(uuidv4) to set a unique UUIDv4 identifier. ` +
        `Example: createAgent('${agent.name}').setId(require('uuid').v4())`
      );
    }
    
    const containerName = `dank-${agent.name.toLowerCase()}-${agent.id
      .split("_")
      .pop()}`;
    const baseImageName =
      agent.config.docker?.baseImage || this.defaultBaseImageName;

    try {
      // Ensure base image exists
      const hasBaseImage = await this.hasImage(baseImageName);
      if (!hasBaseImage) {
        this.logger.info(
          `Base image '${baseImageName}' not found for agent ${agent.name}. Pulling...`
        );
        await this.pullBaseImage(baseImageName);
      }

      // Check if agent image exists, build if necessary
      const hasImage = await this.hasImage(imageName);
      if (!hasImage || options.rebuild) {
        await this.buildAgentImage(agent, {
          projectDir: options.projectDir
        });
      }

      // Prepare container configuration
      const containerConfig = {
        Image: imageName,
        name: containerName,
        Env: this.prepareEnvironmentVariables(agent),
        HostConfig: {
          Memory: AgentConfig.parseMemory(AgentConfig.getResourcesFromInstanceType(agent.config.instanceType).memory),
          CpuQuota: Math.floor(AgentConfig.getResourcesFromInstanceType(agent.config.instanceType).cpu * 100000),
          CpuPeriod: 100000,
          RestartPolicy: {
            Name: "on-failure",
            MaximumRetryCount: 3, // Default max restarts
          },
          NetworkMode: this.networkName,
          ...this.preparePortConfiguration(agent),
        },
        NetworkingConfig: {
          EndpointsConfig: {
            [this.networkName]: {},
          },
        },
        ...this.prepareExposedPorts(agent),
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
        status: "running",
      });

      agent.containerId = container.id;
      agent.status = "running";

      this.logger.info(
        `Agent ${agent.name} started successfully (${container.id.substring(
          0,
          12
        )})`
      );

      // Track successful agent start
      await analytics.trackAgentStart(agent.name, true, {
        success: true,
        container_id: container.id.substring(0, 12)
      });

      return container;
    } catch (error) {
      // Track failed agent start
      await analytics.trackAgentStart(agent.name, false, {
        error: error.message
      });
      await analytics.trackAgentError(agent.name, error, {
        context: 'agent_start'
      });
      
      agent.status = "error";
      throw new Error(`Failed to start agent ${agent.name}: ${error.message}`);
    }
  }

  /**
   * Stop agent container
   */
  async stopAgent(agentName, options = {}) {
    // Track agent stop attempt
    await analytics.trackAgentStop(agentName, true, {
      force: options.force || false
    });

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
      agent.status = "stopped";
      agent.containerId = null;

      this.logger.info(`Agent ${agentName} stopped successfully`);
      
      // Track successful agent stop
      await analytics.trackAgentStop(agentName, true, {
        success: true
      });
    } catch (error) {
      // Track failed agent stop
      await analytics.trackAgentStop(agentName, false, {
        error: error.message
      });
      await analytics.trackAgentError(agentName, error, {
        context: 'agent_stop'
      });
      
      throw new Error(`Failed to stop agent ${agentName}: ${error.message}`);
    }
  }

  /**
   * Get agent status
   */
  async getAgentStatus(agentName) {
    const containerInfo = this.containers.get(agentName);
    if (!containerInfo) {
      return { status: "not_running" };
    }

    try {
      const { container, agent, startTime } = containerInfo;
      const containerData = await container.inspect();

      return {
        status: containerData.State.Running ? "running" : "stopped",
        containerId: container.id,
        startTime,
        uptime: Date.now() - startTime.getTime(),
        health: containerData.State.Health?.Status || "unknown",
        restartCount: containerData.RestartCount,
        resources: AgentConfig.getResourcesFromInstanceType(agent.config.instanceType),
      };
    } catch (error) {
      return { status: "error", error: error.message };
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
      timestamps: true,
    });

    return logStream;
  }

  /**
   * Create build context for base image
   */
  async createBaseBuildContext() {
    const contextDir = path.join(__dirname, "../../.build-context-base");
    await fs.ensureDir(contextDir);

    // Copy Docker files
    await fs.copy(path.join(__dirname, "../../docker"), contextDir);

    // Create runtime directory
    const runtimeDir = path.join(contextDir, "runtime");
    await fs.ensureDir(runtimeDir);

    // Create tarball
    const tarPath = path.join(__dirname, "../../.base-build-context.tar");
    await tar.create(
      {
        file: tarPath,
        cwd: contextDir,
      },
      ["."]
    );

    return tarPath;
  }

  /**
   * Copy project files to build context (excluding common ignore patterns)
   */
  async copyProjectFiles(projectDir, contextDir) {
    const agentCodeDir = path.join(contextDir, "agent-code");
    await fs.ensureDir(agentCodeDir);
    
    // Patterns to exclude when copying project files
    const ignorePatterns = [
      'node_modules',
      '.git',
      '.build-context-*',
      '.env',
      '.env.*',
      '*.log',
      '.DS_Store',
      'dist',
      'build',
      '.dank',
      'coverage',
      '.nyc_output'
    ];
    
    try {
      // Copy all files from project directory, filtering out ignored patterns
      const items = await fs.readdir(projectDir);
      
      for (const item of items) {
        const sourcePath = path.join(projectDir, item);
        const destPath = path.join(agentCodeDir, item);
        const stat = await fs.stat(sourcePath);
        
        // Skip if matches ignore pattern
        const shouldIgnore = ignorePatterns.some(pattern => {
          if (pattern.includes('*')) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            return regex.test(item);
          }
          return item === pattern;
        });
        
        if (shouldIgnore) {
          continue;
        }
        
        // Copy file or directory
        if (stat.isDirectory()) {
          await fs.copy(sourcePath, destPath);
        } else if (stat.isFile()) {
          await fs.copy(sourcePath, destPath);
        }
      }
      
      this.logger.info(`📁 Copied project files from ${projectDir} to build context`);
    } catch (error) {
      this.logger.warn(`⚠️  Failed to copy project files: ${error.message}`);
      // Don't fail the build if copying project files fails
    }
  }

  /**
   * Create build context for agent
   */
  async createAgentBuildContext(agent, options = {}) {
    const contextDir = path.join(
      __dirname,
      `../../.build-context-${agent.name}`
    );
    await fs.ensureDir(contextDir);
    
    // Copy project files if project directory is provided
    // This allows handlers to reference functions from other files
    if (options.projectDir) {
      await this.copyProjectFiles(options.projectDir, contextDir);
    }

    // Get the base image for this agent
    // Production builds can override the base image via baseImageOverride option
    let baseImageName;
    if (options.isProductionBuild && options.baseImageOverride) {
      baseImageName = options.baseImageOverride;
      this.logger.info(`🔧 Using production base image override: ${baseImageName} (instead of ${agent.config.docker?.baseImage || this.defaultBaseImageName})`);
    } else {
      baseImageName = agent.config.docker?.baseImage || this.defaultBaseImageName;
    }

    // Generate environment variables
    // For production builds, these need to be embedded in the image
    // For normal builds, they're injected at container creation time via startAgent()
    const env = AgentConfig.generateContainerEnv(agent);
    
    // Embed env vars in Dockerfile for production builds
    // For normal builds, env vars are injected at container creation time
    const isProductionBuild = options.isProductionBuild || false;
    
    let envStatements = '';
    if (isProductionBuild) {
      // Embed environment variables in Dockerfile for production builds
      // This ensures they're available when the image is deployed elsewhere
      envStatements = Object.entries(env)
        .map(([key, value]) => {
          // Escape special characters in values for Dockerfile ENV
          const escapedValue = String(value).replace(/\$/g, '$$$$').replace(/"/g, '\\"');
          return `ENV ${key}="${escapedValue}"`;
        })
        .join('\n');
      
      this.logger.info(`🔌 Production build: Embedding environment variables in Dockerfile`);
      this.logger.info(`   - DOCKER_PORT: ${env.DOCKER_PORT || 'not set'}`);
    }

    // Create Dockerfile for agent
    const dockerfile = `FROM ${baseImageName}
COPY agent-code/ /app/agent-code/
${envStatements}
USER dankuser
`;

    await fs.writeFile(path.join(contextDir, "Dockerfile"), dockerfile);

    // Copy agent code if it exists
    const agentCodeDir = path.join(contextDir, "agent-code");
    await fs.ensureDir(agentCodeDir);

    // Create basic agent code structure
    // Generate handlers from agent configuration
    const handlersCode = this.generateHandlersCode(agent);
    const routesCode = this.generateRoutesCode(agent);

    // Check if project files were copied (indicated by presence of files other than index.js)
    const hasProjectFiles = options.projectDir ? true : false;
    const projectFilesNote = hasProjectFiles 
      ? `// Note: Project files from your project directory have been copied here.
// You can require them in your handlers using relative paths.
// Example: const { myFunction } = require('./utils');`
      : '';

    const agentCode = `
// Agent: ${agent.name}
// Generated by Dank Agent Service

${projectFilesNote}

module.exports = {
  async main(context) {
    const { llmClient, handlers, tools, config } = context;
    console.log('Agent ${agent.name} started');
    console.log('Available context:', Object.keys(context));
    
    // Basic agent loop
    setInterval(async () => {
      try {
        // Trigger heartbeat handlers (no logging)
        const heartbeatHandlers = handlers.get('heartbeat') || [];
        heartbeatHandlers.forEach(handler => {
          try {
            handler();
          } catch (handlerError) {
            console.error('Heartbeat handler error:', handlerError);
          }
        });
        
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
  
  handlers: ${handlersCode},
  routes: ${routesCode}
};
`;

    await fs.writeFile(path.join(agentCodeDir, "index.js"), agentCode);

    // Return directory path (CLI build commands work with directories directly)
    return contextDir;
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
    this.logger.info(`🔌 Binding main agent port: ${mainPort} (from docker.port: ${agent.config.docker?.port || 'default'})`);
    portBindings[`${mainPort}/tcp`] = [{ HostPort: mainPort.toString() }];

    // Only bind HTTP port if HTTP is explicitly enabled AND different from main port
    // Check both http.enabled and communication.httpApi.enabled to be safe
    const httpEnabled = agent.config.http?.enabled === true;
    const httpApiEnabled = agent.config.communication?.httpApi?.enabled === true;
    if (httpEnabled || httpApiEnabled) {
      const httpPort = agent.config.http?.port;
      if (httpPort && httpPort !== mainPort) {
        portBindings[`${httpPort}/tcp`] = [{ HostPort: httpPort.toString() }];
      }
    }

    // Health check uses the same port as the main agent port, so no separate binding needed

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

    // Only expose HTTP port if HTTP is explicitly enabled AND different from main port
    // Check both http.enabled and communication.httpApi.enabled to be safe
    const httpEnabled = agent.config.http?.enabled === true;
    const httpApiEnabled = agent.config.communication?.httpApi?.enabled === true;
    if (httpEnabled || httpApiEnabled) {
      const httpPort = agent.config.http?.port;
      if (httpPort && httpPort !== mainPort) {
        exposedPorts[`${httpPort}/tcp`] = {};
      }
    }

    // Health check uses the same port as the main agent port, so no separate exposure needed

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
          Driver: "bridge",
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
      this.docker.modem.followProgress(
        stream,
        (err, res) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        },
        (event) => {
          if (event.stream) {
            process.stdout.write(event.stream);
          } else if (event.status) {
            this.logger.debug(`${buildName}: ${event.status}`);
          }
        }
      );
    });
  }

  /**
   * Follow pull progress and log output
   */
  async followPullProgress(stream, pullName) {
    return new Promise((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (err, res) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        },
        (event) => {
          if (event.status) {
            if (event.progress) {
              process.stdout.write(
                `\r${pullName}: ${event.status} ${event.progress}`
              );
            } else {
              this.logger.info(`${pullName}: ${event.status}`);
            }
          }
        }
      );
    });
  }

  /**
   * Clean up Docker resources
   */
  async cleanup(options = {}) {
    this.logger.info("Cleaning up Docker resources...");

    try {
      if (options.containers || options.all) {
        // Stop and remove all Dank containers
        const containers = await this.docker.listContainers({
          all: true,
          filters: { name: ["dank-"] },
        });

        for (const containerInfo of containers) {
          const container = this.docker.getContainer(containerInfo.Id);
          try {
            if (containerInfo.State === "running") {
              await container.stop();
            }
            await container.remove();
            this.logger.info(`Removed container: ${containerInfo.Names[0]}`);
          } catch (error) {
            this.logger.warn(
              `Failed to remove container ${containerInfo.Names[0]}: ${error.message}`
            );
          }
        }
      }

      if (options.images || options.all) {
        // Remove Dank images
        const images = await this.docker.listImages({
          filters: { reference: ["dank-*"] },
        });

        for (const imageInfo of images) {
          const image = this.docker.getImage(imageInfo.Id);
          try {
            await image.remove();
            this.logger.info(
              `Removed image: ${imageInfo.RepoTags?.[0] || imageInfo.Id}`
            );
          } catch (error) {
            this.logger.warn(`Failed to remove image: ${error.message}`);
          }
        }
      }

      if (options.buildContexts || options.all) {
        // Clean up build context directories and tarballs
        await this.cleanupBuildContexts();
      }

      this.logger.info("Cleanup completed");
    } catch (error) {
      throw new Error(`Cleanup failed: ${error.message}`);
    }
  }

  /**
   * Clean up build context directories and tarballs
   */
  async cleanupBuildContexts() {
    const projectRoot = path.join(__dirname, "../..");

    try {
      // Find all build context directories
      const entries = await fs.readdir(projectRoot);
      const buildContextDirs = entries.filter((entry) =>
        entry.startsWith(".build-context-")
      );

      // Remove build context directories
      for (const dir of buildContextDirs) {
        const dirPath = path.join(projectRoot, dir);
        try {
          await fs.remove(dirPath);
          this.logger.info(`Removed build context directory: ${dir}`);
        } catch (error) {
          this.logger.warn(
            `Failed to remove build context directory ${dir}: ${error.message}`
          );
        }
      }

      // Find and remove tarball files
      const tarballs = entries.filter(
        (entry) =>
          entry.endsWith("-context.tar") || entry.endsWith("-build-context.tar")
      );

      for (const tarball of tarballs) {
        const tarballPath = path.join(projectRoot, tarball);
        try {
          await fs.remove(tarballPath);
          this.logger.info(`Removed build context tarball: ${tarball}`);
        } catch (error) {
          this.logger.warn(
            `Failed to remove tarball ${tarball}: ${error.message}`
          );
        }
      }

      if (buildContextDirs.length === 0 && tarballs.length === 0) {
        this.logger.info("No build context files found to clean up");
      }
    } catch (error) {
      this.logger.warn(`Error during build context cleanup: ${error.message}`);
    }
  }
}

module.exports = { DockerManager };
