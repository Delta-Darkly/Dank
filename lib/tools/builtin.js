/**
 * Built-in Tools for Dank Agents
 * 
 * A collection of commonly used tools that agents can leverage
 * for web search, HTTP requests, file operations, and more.
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

/**
 * HTTP Request Tool
 */
const httpRequest = {
  description: 'Make HTTP requests to external APIs and websites',
  category: 'web',
  parameters: {
    url: {
      type: 'string',
      description: 'The URL to make the request to',
      required: true
    },
    method: {
      type: 'string',
      description: 'HTTP method to use',
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      default: 'GET'
    },
    headers: {
      type: 'object',
      description: 'HTTP headers to include',
      default: {}
    },
    data: {
      type: 'object',
      description: 'Request body data',
      default: null
    },
    timeout: {
      type: 'number',
      description: 'Request timeout in milliseconds',
      default: 10000,
      min: 1000,
      max: 60000
    }
  },
  timeout: 15000,
  retries: 2,
  handler: async ({ url, method, headers, data, timeout }) => {
    try {
      const response = await axios({
        url,
        method,
        headers: {
          'User-Agent': 'Dank-Agent/1.0',
          ...headers
        },
        data,
        timeout,
        validateStatus: () => true // Don't throw on HTTP error status
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        success: response.status >= 200 && response.status < 300
      };
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw new Error(`HTTP request failed: ${error.message}`);
    }
  }
};

/**
 * Web Search Tool (using DuckDuckGo Instant Answer API)
 */
const webSearch = {
  description: 'Search the web for information using DuckDuckGo',
  category: 'web',
  parameters: {
    query: {
      type: 'string',
      description: 'Search query',
      required: true,
      min: 1,
      max: 500
    },
    format: {
      type: 'string',
      description: 'Response format',
      enum: ['json'],
      default: 'json'
    }
  },
  cacheable: true,
  cacheTime: 300000, // 5 minutes
  handler: async ({ query, format }) => {
    try {
      const response = await axios.get('https://api.duckduckgo.com/', {
        params: {
          q: query,
          format: format,
          no_html: 1,
          skip_disambig: 1
        },
        timeout: 10000
      });

      const data = response.data;
      
      return {
        query,
        abstract: data.Abstract || null,
        abstractText: data.AbstractText || null,
        abstractSource: data.AbstractSource || null,
        abstractURL: data.AbstractURL || null,
        relatedTopics: data.RelatedTopics || [],
        results: data.Results || [],
        type: data.Type || 'unknown',
        hasResults: !!(data.Abstract || data.Results?.length || data.RelatedTopics?.length)
      };
    } catch (error) {
      throw new Error(`Web search failed: ${error.message}`);
    }
  }
};

/**
 * File Read Tool
 */
const readFile = {
  description: 'Read contents of a file',
  category: 'file',
  parameters: {
    filePath: {
      type: 'string',
      description: 'Path to the file to read',
      required: true
    },
    encoding: {
      type: 'string',
      description: 'File encoding',
      enum: ['utf8', 'ascii', 'base64', 'binary'],
      default: 'utf8'
    },
    maxSize: {
      type: 'number',
      description: 'Maximum file size in bytes',
      default: 1048576, // 1MB
      min: 1,
      max: 10485760 // 10MB
    }
  },
  handler: async ({ filePath, encoding, maxSize }) => {
    try {
      // Security check - prevent path traversal
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(process.cwd())) {
        throw new Error('Access denied: Path outside working directory');
      }

      // Check if file exists
      if (!(await fs.pathExists(resolvedPath))) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Check file size
      const stats = await fs.stat(resolvedPath);
      if (stats.size > maxSize) {
        throw new Error(`File too large: ${stats.size} bytes (max: ${maxSize})`);
      }

      const content = await fs.readFile(resolvedPath, encoding);
      
      return {
        filePath: resolvedPath,
        size: stats.size,
        encoding,
        content,
        lastModified: stats.mtime.toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }
};

/**
 * File Write Tool
 */
const writeFile = {
  description: 'Write content to a file',
  category: 'file',
  parameters: {
    filePath: {
      type: 'string',
      description: 'Path to the file to write',
      required: true
    },
    content: {
      type: 'string',
      description: 'Content to write to the file',
      required: true
    },
    encoding: {
      type: 'string',
      description: 'File encoding',
      enum: ['utf8', 'ascii', 'base64', 'binary'],
      default: 'utf8'
    },
    createDirs: {
      type: 'boolean',
      description: 'Create parent directories if they don\'t exist',
      default: true
    }
  },
  handler: async ({ filePath, content, encoding, createDirs }) => {
    try {
      // Security check - prevent path traversal
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(process.cwd())) {
        throw new Error('Access denied: Path outside working directory');
      }

      // Create parent directories if needed
      if (createDirs) {
        await fs.ensureDir(path.dirname(resolvedPath));
      }

      await fs.writeFile(resolvedPath, content, encoding);
      const stats = await fs.stat(resolvedPath);

      return {
        filePath: resolvedPath,
        size: stats.size,
        encoding,
        created: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }
};

/**
 * JSON Parser Tool
 */
const parseJson = {
  description: 'Parse JSON string into JavaScript object',
  category: 'utility',
  parameters: {
    jsonString: {
      type: 'string',
      description: 'JSON string to parse',
      required: true
    },
    strict: {
      type: 'boolean',
      description: 'Use strict JSON parsing',
      default: true
    }
  },
  handler: ({ jsonString, strict }) => {
    try {
      const parsed = JSON.parse(jsonString);
      return {
        success: true,
        data: parsed,
        type: Array.isArray(parsed) ? 'array' : typeof parsed,
        size: JSON.stringify(parsed).length
      };
    } catch (error) {
      if (strict) {
        throw new Error(`JSON parsing failed: ${error.message}`);
      }
      
      // Try to extract JSON-like content
      try {
        const cleaned = jsonString.replace(/[\n\r\t]/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
          success: true,
          data: parsed,
          type: Array.isArray(parsed) ? 'array' : typeof parsed,
          size: JSON.stringify(parsed).length,
          cleaned: true
        };
      } catch (secondError) {
        throw new Error(`JSON parsing failed: ${error.message}`);
      }
    }
  }
};

/**
 * Text Analysis Tool
 */
const analyzeText = {
  description: 'Analyze text for various metrics and properties',
  category: 'text',
  parameters: {
    text: {
      type: 'string',
      description: 'Text to analyze',
      required: true,
      min: 1,
      max: 50000
    },
    includeStats: {
      type: 'boolean',
      description: 'Include detailed statistics',
      default: true
    },
    includeSentiment: {
      type: 'boolean',
      description: 'Include basic sentiment analysis',
      default: false
    }
  },
  handler: ({ text, includeStats, includeSentiment }) => {
    const result = {
      text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      length: text.length
    };

    if (includeStats) {
      const words = text.split(/\s+/).filter(word => word.length > 0);
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
      
      result.stats = {
        characters: text.length,
        charactersNoSpaces: text.replace(/\s/g, '').length,
        words: words.length,
        sentences: sentences.length,
        paragraphs: paragraphs.length,
        averageWordsPerSentence: sentences.length > 0 ? Math.round((words.length / sentences.length) * 10) / 10 : 0,
        readingTime: Math.ceil(words.length / 200), // Assuming 200 WPM
        complexity: words.length > 100 ? 'high' : words.length > 50 ? 'medium' : 'low'
      };
    }

    if (includeSentiment) {
      const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'awesome', 'brilliant', 'perfect', 'outstanding'];
      const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'disappointing', 'poor', 'worst', 'hate', 'dislike', 'fail'];
      
      const lowerText = text.toLowerCase();
      const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
      const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
      
      result.sentiment = {
        score: positiveCount - negativeCount,
        label: positiveCount > negativeCount ? 'positive' : 
               negativeCount > positiveCount ? 'negative' : 'neutral',
        positiveWords: positiveCount,
        negativeWords: negativeCount,
        confidence: Math.min(0.9, Math.max(0.1, Math.abs(positiveCount - negativeCount) / 10))
      };
    }

    return result;
  }
};

/**
 * Current Time Tool
 */
const getCurrentTime = {
  description: 'Get current date and time in various formats',
  category: 'utility',
  parameters: {
    timezone: {
      type: 'string',
      description: 'Timezone (e.g., "America/New_York", "UTC")',
      default: 'UTC'
    },
    format: {
      type: 'string',
      description: 'Output format',
      enum: ['iso', 'unix', 'readable', 'custom'],
      default: 'iso'
    },
    customFormat: {
      type: 'string',
      description: 'Custom date format (when format is "custom")',
      default: 'YYYY-MM-DD HH:mm:ss'
    }
  },
  handler: ({ timezone, format, customFormat }) => {
    const now = new Date();
    
    // Basic timezone handling (for production, use a proper library like moment-timezone)
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const targetTime = new Date(utcTime);

    const result = {
      timestamp: now.toISOString(),
      timezone,
      format
    };

    switch (format) {
      case 'iso':
        result.formatted = targetTime.toISOString();
        break;
      case 'unix':
        result.formatted = Math.floor(targetTime.getTime() / 1000);
        break;
      case 'readable':
        result.formatted = targetTime.toLocaleString('en-US', { 
          timeZone: timezone === 'UTC' ? 'UTC' : timezone 
        });
        break;
      case 'custom':
        // Basic custom formatting (for production, use a proper library)
        result.formatted = customFormat
          .replace('YYYY', targetTime.getFullYear())
          .replace('MM', String(targetTime.getMonth() + 1).padStart(2, '0'))
          .replace('DD', String(targetTime.getDate()).padStart(2, '0'))
          .replace('HH', String(targetTime.getHours()).padStart(2, '0'))
          .replace('mm', String(targetTime.getMinutes()).padStart(2, '0'))
          .replace('ss', String(targetTime.getSeconds()).padStart(2, '0'));
        break;
    }

    return result;
  }
};

// Export all built-in tools
module.exports = {
  httpRequest,
  webSearch,
  readFile,
  writeFile,
  parseJson,
  analyzeText,
  getCurrentTime
};
