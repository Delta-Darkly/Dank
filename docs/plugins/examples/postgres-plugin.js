/**
 * Example PostgreSQL Plugin
 * 
 * This is an example of how to create a database plugin for Dank.
 * In a real implementation, you would use a proper PostgreSQL client library.
 * 
 * IMPORTANT: You must import PluginBase and PluginConfig from 'dank-ai'
 */

// Import required classes from dank-ai
const { PluginBase } = require('dank-ai');
const { PluginConfig } = require('dank-ai');

class PostgresPlugin extends PluginBase {
  constructor(config) {
    super('postgres', config);
    this.db = null;
  }

  async init() {
    // Validate configuration
    const schema = PluginConfig.schemas.database;
    this.config = PluginConfig.validate(this.name, this.config, schema);

    // Register event handlers
    this.on('request_output:end', async (data) => {
      // Optionally save responses to database
      if (this.config.autoSave) {
        await this.saveResponse(data);
      }
    });

    // Register database tools
    this.registerTool('query', {
      description: 'Execute a SQL query on the PostgreSQL database',
      category: 'database',
      parameters: {
        sql: {
          type: 'string',
          description: 'SQL query to execute',
          required: true
        },
        params: {
          type: 'array',
          description: 'Query parameters (for parameterized queries)',
          default: []
        }
      },
      handler: async ({ sql, params }) => {
        return await this.query(sql, params);
      }
    });

    this.registerTool('insert', {
      description: 'Insert data into a table',
      category: 'database',
      parameters: {
        table: {
          type: 'string',
          description: 'Table name',
          required: true
        },
        data: {
          type: 'object',
          description: 'Data to insert',
          required: true
        }
      },
      handler: async ({ table, data }) => {
        return await this.insert(table, data);
      }
    });

    this.registerTool('update', {
      description: 'Update data in a table',
      category: 'database',
      parameters: {
        table: {
          type: 'string',
          description: 'Table name',
          required: true
        },
        data: {
          type: 'object',
          description: 'Data to update',
          required: true
        },
        where: {
          type: 'object',
          description: 'WHERE conditions',
          required: true
        }
      },
      handler: async ({ table, data, where }) => {
        return await this.update(table, data, where);
      }
    });

    this.registerTool('delete', {
      description: 'Delete data from a table',
      category: 'database',
      parameters: {
        table: {
          type: 'string',
          description: 'Table name',
          required: true
        },
        where: {
          type: 'object',
          description: 'WHERE conditions',
          required: true
        }
      },
      handler: async ({ table, where }) => {
        return await this.delete(table, where);
      }
    });
  }

  async onStart() {
    // Connect to database
    // In a real implementation, use pg or similar library
    this.db = {
      connected: true,
      // Mock connection
    };

    this.emit('connected');
    console.log(`[PostgresPlugin] Connected to database`);
  }

  async onStop() {
    // Disconnect from database
    if (this.db) {
      // Close connection
      this.db = null;
      this.emit('disconnected');
      console.log(`[PostgresPlugin] Disconnected from database`);
    }
  }

  async onDestroy() {
    await this.onStop();
  }

  /**
   * Execute a SQL query
   */
  async query(sql, params = []) {
    if (!this.db || !this.db.connected) {
      throw new Error('Database not connected');
    }

    // In a real implementation, execute the query
    // const result = await this.db.query(sql, params);
    
    // Mock result
    this.emit('query:executed', { sql, params });
    return {
      rows: [],
      rowCount: 0,
      command: 'SELECT'
    };
  }

  /**
   * Insert data into a table
   */
  async insert(table, data) {
    // In a real implementation, build and execute INSERT query
    this.emit('data:inserted', { table, data });
    return { success: true, id: Date.now() };
  }

  /**
   * Update data in a table
   */
  async update(table, data, where) {
    // In a real implementation, build and execute UPDATE query
    this.emit('data:updated', { table, data, where });
    return { success: true, affectedRows: 1 };
  }

  /**
   * Delete data from a table
   */
  async delete(table, where) {
    // In a real implementation, build and execute DELETE query
    this.emit('data:deleted', { table, where });
    return { success: true, affectedRows: 1 };
  }

  /**
   * Save response to database (example)
   */
  async saveResponse(data) {
    try {
      await this.insert('agent_responses', {
        agent_id: this.getAgentContext()?.agentId,
        conversation_id: data.conversationId,
        prompt: data.prompt,
        response: data.response,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('[PostgresPlugin] Failed to save response:', error);
    }
  }
}

module.exports = PostgresPlugin;

