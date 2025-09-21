# 🧪 Dank Agent HTTP Endpoints Test

This directory contains a test configuration with HTTP-enabled agents and their endpoints.

## 🚀 Quick Start

1. **Start the agents:**
   ```bash
   cd test
   dank run
   ```

2. **Test the endpoints:**
   ```bash
   # Install axios for testing (if not already installed)
   npm install axios
   
   # Run endpoint tests
   node test-endpoints.js
   
   # Or run graceful tests (handles errors better)
   node test-endpoints.js graceful
   ```

## 🤖 Agents & Endpoints

### API Agent (Port 3000)
A full-featured API agent with various endpoints:

**Endpoints:**
- `GET /` - Welcome message and endpoint list
- `GET /hello?name=YourName` - Simple greeting
- `POST /chat` - Chat with the AI agent
- `POST /analyze` - Analyze text content
- `GET /status` - Agent status and metrics
- `GET /metrics` - Performance metrics

**Example Usage:**
```bash
# Simple greeting
curl "http://localhost:3000/hello?name=Developer"

# Chat with agent
curl -X POST "http://localhost:3000/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, how can you help me?"}'

# Analyze text with sentiment
curl -X POST "http://localhost:3000/analyze" \
  -H "Content-Type: application/json" \
  -d '{"text": "This is amazing software!", "analysisType": "sentiment"}'

# Get agent status
curl "http://localhost:3000/status"
```

### Webhook Agent (Port 3001)
Specialized agent for handling webhooks from external services:

**Endpoints:**
- `GET /webhook/test` - Test endpoint status
- `POST /webhook/github` - GitHub webhook handler
- `POST /webhook/slack` - Slack webhook handler
- `POST /webhook/generic` - Generic webhook handler

**Example Usage:**
```bash
# Test webhook status
curl "http://localhost:3001/webhook/test"

# Simulate GitHub webhook
curl -X POST "http://localhost:3001/webhook/github" \
  -H "X-GitHub-Event: push" \
  -H "Content-Type: application/json" \
  -d '{"repository": {"full_name": "user/repo"}}'

# Simulate Slack webhook
curl -X POST "http://localhost:3001/webhook/slack" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello!", "user_name": "testuser", "channel_name": "#general"}'

# Generic webhook with custom source
curl -X POST "http://localhost:3001/webhook/generic" \
  -H "X-Webhook-Source: my-service" \
  -H "Content-Type: application/json" \
  -d '{"event": "user_signup", "data": {"email": "test@example.com"}}'
```

## 🔧 Features Demonstrated

### API Agent Features:
- ✅ **CORS enabled** - Cross-origin requests allowed
- ✅ **Rate limiting** - 100 requests per 15 minutes per IP
- ✅ **Input validation** - Proper error handling for missing data
- ✅ **JSON responses** - Consistent API response format
- ✅ **Error handling** - Graceful error responses
- ✅ **Metrics & monitoring** - Status and performance endpoints

### Webhook Agent Features:
- ✅ **Multiple webhook types** - GitHub, Slack, generic webhooks
- ✅ **Header processing** - Reads webhook-specific headers
- ✅ **Event logging** - Logs incoming webhook events
- ✅ **Flexible responses** - Different response formats per webhook type

### Security & Performance:
- ✅ **Port isolation** - Different ports for different services
- ✅ **Resource limits** - CPU and memory constraints
- ✅ **Request logging** - All requests are logged
- ✅ **Graceful error handling** - No crashes on bad requests

## 🧪 Testing Scenarios

The test script (`test-endpoints.js`) covers:

1. **Basic functionality** - All endpoints return expected responses
2. **Error handling** - Invalid requests return proper error messages  
3. **Data processing** - POST endpoints process JSON payloads correctly
4. **Headers** - Webhook endpoints read custom headers
5. **Response formats** - All responses follow consistent JSON structure

## 📊 Expected Responses

### Successful API Response Format:
```json
{
  "message": "Response message",
  "agent": "agent-name", 
  "timestamp": "2024-01-01T12:00:00.000Z",
  "data": { /* response data */ }
}
```

### Error Response Format:
```json
{
  "error": "Error description",
  "message": "Detailed error message",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## 🔍 Monitoring

While agents are running, you can monitor them:

```bash
# Check agent status
dank status

# View agent logs
dank logs api-agent --follow
dank logs webhook-agent --follow

# Check container stats
docker stats $(docker ps -f name=dank- -q)
```

## 🚨 Troubleshooting

**Connection refused errors:**
- Make sure agents are running with `dank run`
- Check if ports 3000 and 3001 are available
- Verify Docker containers are running: `docker ps`

**Rate limit errors:**
- Wait 15 minutes for rate limit to reset
- Or restart the agents to reset counters

**JSON parsing errors:**
- Ensure Content-Type header is set to `application/json`
- Verify JSON payload is properly formatted

---

🔥 **Ready to test your HTTP-enabled Dank agents!** 🚀

