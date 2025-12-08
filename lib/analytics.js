const https = require('https');
const crypto = require('crypto');

class Analytics {
  constructor() {
    this.enabled = true;
    this.projectToken = process.env.MIXPANEL_PROJECT_TOKEN || '2ab09eb7ea93ec0f288758866280bec6'; // Use env var or fallback
    this.apiUrl = 'https://api.mixpanel.com/track';
    this.userId = this.generateAnonymousId();
    this.sessionId = this.generateSessionId();
    this.installDate = this.getInstallDate();
  }

  generateAnonymousId() {
    // Generate a consistent anonymous ID based on machine characteristics
    const os = require('os');
    const machineId = os.hostname() + os.platform() + os.arch();
    return crypto.createHash('sha256').update(machineId).digest('hex').substring(0, 16);
  }

  generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
  }

  getInstallDate() {
    // Try to get install date from package.json or use current date
    try {
      const pkg = require('../package.json');
      return new Date(pkg.date || Date.now()).toISOString().split('T')[0];
    } catch (error) {
      return new Date().toISOString().split('T')[0];
    }
  }

  async track(event, properties = {}) {
    if (!this.enabled) return;

    const payload = {
      event,
      properties: {
        ...properties,
        distinct_id: this.userId,
        session_id: this.sessionId,
        platform: process.platform,
        arch: process.arch,
        node_version: process.version,
        version: require('../package.json').version,
        time: new Date().toISOString()
      }
    };

    // Send asynchronously without blocking
    this.sendEvent(payload).catch(() => {
      // Fail silently - don't break user experience
    });
  }

  async sendEvent(payload) {
    const data = JSON.stringify(payload);
    
    const options = {
      hostname: 'api.mixpanel.com',
      port: 443,
      path: '/track',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'User-Agent': 'dank-cli'
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        resolve();
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  // ===== INSTALL & ACTIVATION TRACKING =====
  
  async trackInstall() {
    await this.track('Dank Installed', {
      install_date: this.installDate,
      version: require('../package.json').version,
      platform: process.platform,
      arch: process.arch
    });
  }

  async trackDailyActive() {
    await this.track('Dank Daily Active', {
      version: require('../package.json').version,
      platform: process.platform
    });
  }

  async trackMonthlyActive() {
    await this.track('Dank Monthly Active', {
      version: require('../package.json').version,
      platform: process.platform
    });
  }

  // ===== FUNNEL TRACKING =====
  
  async trackFunnelStep(step, properties = {}) {
    await this.track('Dank Funnel Step', {
      funnel_step: step,
      ...properties
    });
  }

  async trackProjectCreated(projectName, template = 'basic') {
    await this.track('Dank Project Created', {
      project_name: projectName,
      template: template,
      funnel_step: 'project_created'
    });
  }

  async trackProjectRun(projectName, agentCount) {
    await this.track('Dank Project Run', {
      project_name: projectName,
      agent_count: agentCount,
      funnel_step: 'project_run'
    });
  }

  async trackFirstAgentRun(projectName) {
    await this.track('Dank First Agent Run', {
      project_name: projectName,
      funnel_step: 'first_agent_run'
    });
  }

  // ===== AGENT TRACKING =====
  
  async trackAgentStart(agentName, success = true, properties = {}) {
    await this.track('Dank Agent Started', {
      agent_name: agentName,
      success: success,
      ...properties
    });
  }

  async trackAgentStop(agentName, success = true, properties = {}) {
    await this.track('Dank Agent Stopped', {
      agent_name: agentName,
      success: success,
      ...properties
    });
  }

  async trackAgentBuild(agentName, success = true, buildTime = null) {
    await this.track('Dank Agent Built', {
      agent_name: agentName,
      success: success,
      build_time: buildTime,
      ...properties
    });
  }

  async trackAgentError(agentName, error, properties = {}) {
    await this.track('Dank Agent Error', {
      agent_name: agentName,
      error_type: error.constructor.name,
      error_message: error.message,
      ...properties
    });
  }

  // ===== COMMAND TRACKING =====
  
  async trackCommand(command, success = true, properties = {}) {
    await this.track('Dank Command Executed', {
      command: command,
      success: success,
      ...properties
    });
  }

  async trackCLIUsage() {
    await this.track('Dank CLI Used', {
      version: require('../package.json').version,
      platform: process.platform
    });
  }

  // ===== DOCKER TRACKING =====
  
  async trackDockerInstall(success = true, platform = process.platform) {
    await this.track('Dank Docker Install', {
      success: success,
      platform: platform
    });
  }

  async trackDockerOperation(operation, success = true, properties = {}) {
    await this.track('Dank Docker Operation', {
      operation: operation,
      success: success,
      ...properties
    });
  }

  // ===== FEATURE USAGE TRACKING =====
  
  async trackFeatureUsed(feature, properties = {}) {
    await this.track('Dank Feature Used', {
      feature: feature,
      ...properties
    });
  }

  async trackProductionBuild(agentName, registry, namespace, tag) {
    await this.track('Dank Production Build', {
      agent_name: agentName,
      registry: registry,
      namespace: namespace,
      tag: tag,
      funnel_step: 'production_build'
    });
  }

  // ===== ERROR TRACKING =====
  
  async trackError(error, context = {}) {
    await this.track('Dank Error', {
      error_type: error.constructor.name,
      error_message: error.message,
      error_stack: error.stack,
      context: context
    });
  }
}

module.exports = new Analytics();
