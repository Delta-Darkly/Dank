/**
 * Example Memory Plugin
 * 
 * This is an example of how to create a state/memory management plugin for Dank.
 * This plugin manages conversation history and agent state.
 * 
 * IMPORTANT: You must import PluginBase from 'dank-ai'
 */

// Import required classes from dank-ai
const { PluginBase } = require('dank-ai');

class MemoryPlugin extends PluginBase {
  constructor(config) {
    super('memory', config);
    this.memories = new Map(); // conversationId -> messages
    this.state = new Map(); // key -> value
  }

  async init() {
    // Register memory management tools
    this.registerTool('remember', {
      description: 'Store a memory for a conversation',
      category: 'memory',
      parameters: {
        conversationId: {
          type: 'string',
          description: 'Conversation ID',
          required: true
        },
        message: {
          type: 'string',
          description: 'Message to remember',
          required: true
        },
        role: {
          type: 'string',
          description: 'Message role (user, assistant, system)',
          enum: ['user', 'assistant', 'system'],
          default: 'user'
        }
      },
      handler: async ({ conversationId, message, role }) => {
        return await this.remember(conversationId, message, role);
      }
    });

    this.registerTool('recall', {
      description: 'Recall conversation history',
      category: 'memory',
      parameters: {
        conversationId: {
          type: 'string',
          description: 'Conversation ID',
          required: true
        },
        limit: {
          type: 'number',
          description: 'Number of messages to recall',
          default: 10,
          min: 1,
          max: 100
        }
      },
      handler: async ({ conversationId, limit }) => {
        return await this.recall(conversationId, limit);
      }
    });

    this.registerTool('forget', {
      description: 'Forget a conversation',
      category: 'memory',
      parameters: {
        conversationId: {
          type: 'string',
          description: 'Conversation ID',
          required: true
        }
      },
      handler: async ({ conversationId }) => {
        return await this.forget(conversationId);
      }
    });

    // Auto-save conversation history
    this.on('request_output:start', async (data) => {
      await this.remember(data.conversationId, data.prompt, 'user');
    });

    this.on('request_output:end', async (data) => {
      await this.remember(data.conversationId, data.response, 'assistant');
    });
  }

  async onStart() {
    // Load persisted memories if configured
    if (this.config.persist && this.config.storagePath) {
      await this.loadMemories();
    }

    this.emit('started');
    console.log(`[MemoryPlugin] Memory system started`);
  }

  async onStop() {
    // Persist memories if configured
    if (this.config.persist && this.config.storagePath) {
      await this.saveMemories();
    }

    this.emit('stopped');
  }

  /**
   * Remember a message
   */
  async remember(conversationId, message, role = 'user') {
    if (!this.memories.has(conversationId)) {
      this.memories.set(conversationId, []);
    }

    const memory = {
      role,
      content: message,
      timestamp: new Date().toISOString()
    };

    this.memories.get(conversationId).push(memory);

    this.emit('memory:stored', { conversationId, memory });
    return { success: true, memory };
  }

  /**
   * Recall conversation history
   */
  async recall(conversationId, limit = 10) {
    const messages = this.memories.get(conversationId) || [];
    const recent = messages.slice(-limit);

    this.emit('memory:recalled', { conversationId, count: recent.length });
    return {
      conversationId,
      messages: recent,
      total: messages.length
    };
  }

  /**
   * Forget a conversation
   */
  async forget(conversationId) {
    const deleted = this.memories.delete(conversationId);
    
    if (deleted) {
      this.emit('memory:forgotten', { conversationId });
    }

    return { success: deleted, conversationId };
  }

  /**
   * Load memories from storage (example)
   */
  async loadMemories() {
    // In a real implementation, load from file/database
    console.log('[MemoryPlugin] Loading memories from storage');
  }

  /**
   * Save memories to storage (example)
   */
  async saveMemories() {
    // In a real implementation, save to file/database
    console.log('[MemoryPlugin] Saving memories to storage');
  }

  /**
   * Get all conversations
   */
  getAllConversations() {
    return Array.from(this.memories.keys());
  }

  /**
   * Get conversation count
   */
  getConversationCount() {
    return this.memories.size;
  }
}

module.exports = MemoryPlugin;

