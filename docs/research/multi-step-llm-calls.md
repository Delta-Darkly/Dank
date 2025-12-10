# Multi-Step and Multi-Turn LLM Calls

## Overview

This document explores approaches for enabling agents to make multiple LLM calls in sequence or parallel, similar to how other frameworks connect multiple agents with different expertise and data. This enables more sophisticated agent workflows where:

- Multiple LLM calls can be chained together
- Each call can have different expertise/prompts
- Intermediate results can be used to inform subsequent calls
- Agents can orchestrate complex multi-step reasoning

## Current Architecture

Currently, Dank agents make a single LLM call per request:

1. User sends prompt to `/prompt` endpoint
2. `request_output:start` event fires (handlers can modify prompt)
3. Single LLM call is made with system prompt + user prompt
4. `request_output` event fires with response
5. `request_output:end` event fires (handlers can modify response)
6. Response returned to user

**Limitation**: Handlers can modify prompts/responses but cannot make additional LLM calls or chain multiple reasoning steps.

## Proposed Approaches

### Option 1: Handler-Based Multi-Turn (Recommended)

**Concept**: Give handlers access to the LLM client and tools so they can make additional LLM calls programmatically.

**Implementation**:
- Expose `llmClient`, `tools`, and `conversationHistory` to all handlers
- Add a `callLLM()` helper method in the runtime for convenience
- Support conversation history tracking across multiple calls

**Example Usage**:

```javascript
createAgent('multi-turn-agent')
  .setLLM('openai', {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
    temperature: 0.7
  })
  .setPrompt('You are a helpful assistant.')
  .addHandler('request_output:start', async (data, context) => {
    // context.llmClient - Direct access to LLM client
    // context.tools - Access to all registered tools
    // context.conversationHistory - Array of previous messages
    // context.callLLM() - Helper method for making LLM calls
    
    // Step 1: Research phase
    const researchResponse = await context.callLLM({
      systemPrompt: 'You are a research expert. Provide detailed analysis.',
      userPrompt: `Research the topic: ${data.prompt}`,
      model: 'gpt-4',
      temperature: 0.3
    });
    
    // Step 2: Analysis phase
    const analysisResponse = await context.callLLM({
      systemPrompt: 'You are a strategic analyst. Provide insights.',
      userPrompt: `Based on this research: ${researchResponse.content}\n\nAnalyze the implications.`,
      model: 'gpt-4',
      temperature: 0.5
    });
    
    // Step 3: Synthesis phase
    const synthesisResponse = await context.callLLM({
      systemPrompt: 'You are a synthesizer. Create comprehensive summaries.',
      userPrompt: `Research: ${researchResponse.content}\n\nAnalysis: ${analysisResponse.content}\n\nSynthesize into a final answer.`,
      model: 'gpt-4',
      temperature: 0.7
    });
    
    // Modify the original prompt to use the synthesized result
    return {
      prompt: `Based on comprehensive research and analysis:\n\n${synthesisResponse.content}\n\nOriginal question: ${data.prompt}`
    };
  })
```

**Pros**:
- ✅ Maximum flexibility - handlers can implement any workflow
- ✅ Leverages existing handler system
- ✅ Can use tools between LLM calls
- ✅ Can conditionally branch based on intermediate results
- ✅ Minimal changes to core architecture

**Cons**:
- ❌ Requires writing code for each workflow
- ❌ Less declarative than workflow DSL
- ❌ Error handling must be done manually

**Implementation Requirements**:
1. Modify `emitEventWithResponse()` to pass context object to handlers
2. Add `callLLM()` helper method to `AgentRuntime`
3. Track conversation history in `processDirectPrompt()`
4. Update handler code generation to include context parameter

---

### Option 2: Declarative Workflow Steps

**Concept**: Define workflows declaratively with a DSL that specifies multiple steps, each with their own prompts and system messages.

**Example Usage**:

```javascript
createAgent('workflow-agent')
  .setLLM('openai', { ... })
  .addWorkflow('complex-analysis', {
    steps: [
      {
        name: 'research',
        systemPrompt: 'You are a research expert. Provide detailed analysis.',
        prompt: 'Research the topic: {{input}}',
        model: 'gpt-4',
        temperature: 0.3
      },
      {
        name: 'analysis',
        systemPrompt: 'You are a strategic analyst.',
        prompt: 'Based on this research: {{steps.research.response}}, analyze implications.',
        model: 'gpt-4',
        temperature: 0.5
      },
      {
        name: 'synthesis',
        systemPrompt: 'You are a synthesizer.',
        prompt: 'Synthesize:\nResearch: {{steps.research.response}}\nAnalysis: {{steps.analysis.response}}',
        model: 'gpt-4',
        temperature: 0.7
      }
    ],
    output: '{{steps.synthesis.response}}'
  })
  .addHandler('request_output:start', (data) => {
    // Workflow is automatically executed
    // data.workflowResult contains the final output
    return {
      prompt: data.workflowResult
    };
  })
```

**Pros**:
- ✅ Very declarative and easy to understand
- ✅ No code required for simple workflows
- ✅ Template variables for step chaining
- ✅ Can be serialized/deserialized easily

**Cons**:
- ❌ Less flexible than code-based approach
- ❌ Harder to implement conditional logic
- ❌ Requires new DSL and parser
- ❌ More complex to implement

**Implementation Requirements**:
1. Add `addWorkflow()` method to `DankAgent`
2. Create workflow execution engine
3. Implement template variable resolution
4. Add workflow storage in agent config
5. Integrate workflow execution into prompt processing

---

### Option 3: Agent Orchestration

**Concept**: Allow agents to call other agents via HTTP, enabling agent-to-agent communication and specialization.

**Example Usage**:

```javascript
// Research agent (specialized)
createAgent('research-agent')
  .setLLM('openai', { model: 'gpt-4' })
  .setPrompt('You are a research expert. Provide detailed analysis.')
  .setPromptingServer({ port: 3001 })

// Analysis agent (specialized)
createAgent('analysis-agent')
  .setLLM('openai', { model: 'gpt-4' })
  .setPrompt('You are a strategic analyst. Provide insights.')
  .setPromptingServer({ port: 3002 })

// Orchestrator agent
createAgent('orchestrator')
  .setLLM('openai', { model: 'gpt-4' })
  .setPrompt('You are an orchestrator.')
  .addHandler('request_output:start', async (data, context) => {
    // Call research agent
    const researchResult = await context.tools.httpRequest({
      url: 'http://research-agent:3001/prompt',
      method: 'POST',
      data: { prompt: data.prompt }
    });
    
    // Call analysis agent
    const analysisResult = await context.tools.httpRequest({
      url: 'http://analysis-agent:3002/prompt',
      method: 'POST',
      data: { prompt: researchResult.data.content }
    });
    
    // Synthesize results
    return {
      prompt: `Based on research and analysis:\n\n${analysisResult.data.content}\n\nOriginal: ${data.prompt}`
    };
  })
```

**Pros**:
- ✅ True agent specialization
- ✅ Agents can be scaled independently
- ✅ Works with existing HTTP infrastructure
- ✅ Agents can be in different containers/services

**Cons**:
- ❌ Network overhead
- ❌ Requires service discovery
- ❌ More complex deployment
- ❌ Latency from multiple HTTP calls

**Implementation Requirements**:
1. Service discovery mechanism (or static configuration)
2. Agent-to-agent authentication
3. Network configuration for agent communication
4. Error handling for agent failures

---

### Option 4: Hybrid Approach (Recommended for Future)

**Concept**: Combine Option 1 (handler access) with Option 2 (declarative workflows) for maximum flexibility.

**Implementation**:
- Handlers get LLM client access (Option 1)
- Simple workflows can be defined declaratively (Option 2)
- Complex workflows can use handler code (Option 1)
- Agents can orchestrate other agents (Option 3)

**Example**:

```javascript
// Simple workflow - declarative
agent.addWorkflow('simple-analysis', {
  steps: ['research', 'analyze', 'synthesize']
})

// Complex workflow - code-based
agent.addHandler('request_output:start', async (data, context) => {
  // Custom logic with full control
  const result = await context.callLLM({ ... });
  if (result.needsMoreInfo) {
    // Branch logic
    const moreInfo = await context.callLLM({ ... });
  }
  return { prompt: ... };
})

// Agent orchestration - network-based
agent.addHandler('request_output:start', async (data, context) => {
  const result = await context.tools.httpRequest({
    url: 'http://specialist-agent:3000/prompt',
    data: { prompt: data.prompt }
  });
  return { prompt: result.data.content };
})
```

---

## Implementation Priority

### Phase 1: Handler Access (Option 1)
**Priority**: High  
**Effort**: Medium  
**Impact**: High

This provides immediate value with minimal architectural changes. Handlers can implement any workflow pattern.

**Changes Needed**:
1. Modify `emitEventWithResponse()` to pass context object
2. Add `callLLM()` helper to `AgentRuntime`
3. Track conversation history
4. Update handler code generation

### Phase 2: Declarative Workflows (Option 2)
**Priority**: Medium  
**Effort**: High  
**Impact**: Medium

Makes common patterns easier but requires new DSL and execution engine.

**Changes Needed**:
1. Workflow DSL design
2. Workflow execution engine
3. Template variable system
4. Integration with prompt processing

### Phase 3: Agent Orchestration (Option 3)
**Priority**: Low  
**Effort**: Medium  
**Impact**: High (for distributed systems)

Enables true multi-agent systems but requires infrastructure.

**Changes Needed**:
1. Service discovery
2. Agent networking
3. Authentication/authorization
4. Error handling

---

## Design Considerations

### Conversation History

Multi-turn conversations require maintaining context:

```javascript
// In processDirectPrompt()
const conversationHistory = context.conversationHistory || [];

// Add to history
conversationHistory.push({
  role: 'user',
  content: finalPrompt,
  timestamp: new Date().toISOString()
});

// Include in LLM call
messages: [
  { role: 'system', content: this.agentPrompt },
  ...conversationHistory,
  { role: 'user', content: finalPrompt }
]

// After response
conversationHistory.push({
  role: 'assistant',
  content: response.content,
  timestamp: new Date().toISOString()
});
```

### Error Handling

Multi-step workflows need robust error handling:

```javascript
try {
  const step1 = await context.callLLM({ ... });
  const step2 = await context.callLLM({ ... });
} catch (error) {
  // Should we:
  // 1. Fail the entire workflow?
  // 2. Retry the failed step?
  // 3. Continue with partial results?
  // 4. Fall back to single-step?
}
```

### Token Usage Tracking

Multiple LLM calls increase token usage:

```javascript
const totalUsage = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0
};

// Accumulate across all calls
steps.forEach(step => {
  totalUsage.prompt_tokens += step.usage.prompt_tokens;
  totalUsage.completion_tokens += step.usage.completion_tokens;
  totalUsage.total_tokens += step.usage.total_tokens;
});
```

### Parallel vs Sequential

Some steps can run in parallel:

```javascript
// Sequential (default)
const step1 = await context.callLLM({ ... });
const step2 = await context.callLLM({ ... });

// Parallel (when steps are independent)
const [step1, step2] = await Promise.all([
  context.callLLM({ ... }),
  context.callLLM({ ... })
]);
```

---

## Example Use Cases

### 1. Research → Analysis → Synthesis

```javascript
// Research phase
const research = await context.callLLM({
  systemPrompt: 'You are a research expert.',
  userPrompt: `Research: ${data.prompt}`
});

// Analysis phase
const analysis = await context.callLLM({
  systemPrompt: 'You are an analyst.',
  userPrompt: `Analyze: ${research.content}`
});

// Synthesis phase
const synthesis = await context.callLLM({
  systemPrompt: 'You are a synthesizer.',
  userPrompt: `Synthesize research and analysis into final answer.`
});
```

### 2. Code Generation with Testing

```javascript
// Generate code
const code = await context.callLLM({
  systemPrompt: 'You are a code generator.',
  userPrompt: `Generate code: ${data.prompt}`
});

// Generate tests
const tests = await context.callLLM({
  systemPrompt: 'You are a test generator.',
  userPrompt: `Generate tests for: ${code.content}`
});

// Validate
const validation = await context.callLLM({
  systemPrompt: 'You are a code reviewer.',
  userPrompt: `Review code and tests:\nCode: ${code.content}\nTests: ${tests.content}`
});
```

### 3. Multi-Agent Collaboration

```javascript
// Call specialist agents
const [research, analysis, design] = await Promise.all([
  context.tools.httpRequest({ url: 'http://research-agent:3001/prompt', ... }),
  context.tools.httpRequest({ url: 'http://analysis-agent:3002/prompt', ... }),
  context.tools.httpRequest({ url: 'http://design-agent:3003/prompt', ... })
]);

// Synthesize
const final = await context.callLLM({
  userPrompt: `Combine:\nResearch: ${research.data.content}\nAnalysis: ${analysis.data.content}\nDesign: ${design.data.content}`
});
```

---

## Next Steps

1. **Implement Option 1 (Handler Access)** - Start with exposing `llmClient` and `callLLM()` to handlers
2. **Add conversation history tracking** - Enable multi-turn conversations
3. **Document patterns** - Create examples for common multi-step patterns
4. **Consider Option 2** - If declarative workflows are highly requested
5. **Consider Option 3** - If distributed agent systems are needed

---

## References

- LangChain: Multi-step reasoning chains
- AutoGPT: Agent orchestration patterns
- CrewAI: Multi-agent collaboration
- ReAct: Reasoning and acting in language models

