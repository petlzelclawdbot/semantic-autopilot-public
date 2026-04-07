# Task: Add Conversational Threading to Analyst Mode

## Context
The analyst mode works — it generates queries, analyzes results, and shows NYT-style charts. But each question is independent. I want follow-up questions to understand prior context:

```
User: "How many dog cards are there?"
Agent: "There are 847 dog cards in Magic..."

User: "How many of them are red?"
Agent: "Of those 847 dogs, 156 are red..."  ← understands "them" = dogs
```

## Current State
- Test UI: `~/repos/Malloy Test/test-ui/`
- Analyst mode working with two-phase flow (query generation → analysis)
- Single question/answer display

## Your Task

### Step 1: Add Conversation History State

Track the conversation in app.js:

```javascript
// Conversation state
const conversationHistory = [];

// Each entry looks like:
{
  id: 'msg_123',
  question: "How many dog cards are there?",
  malloyQuery: "run: cards -> { where: subtypes_raw ~ '%Dog%'; aggregate: card_count }",
  results: [...],
  analysis: { insight: "...", chart: {...} },
  timestamp: Date.now()
}
```

### Step 2: Include Conversation Context in Query Generation

When generating a Malloy query, include recent conversation history so the LLM understands references like "them", "those", "the same", etc.

Update the query generation prompt to include context:

```javascript
function buildQueryPrompt(question, conversationHistory) {
  let context = '';
  
  if (conversationHistory.length > 0) {
    // Include last 3 exchanges for context
    const recentHistory = conversationHistory.slice(-3);
    context = `
## Recent Conversation Context
${recentHistory.map(h => `
User asked: "${h.question}"
Query used: ${h.malloyQuery}
Result summary: ${summarizeResults(h.results)}
`).join('\n')}

The user's new question may reference the above context. 
- "them", "those", "these" likely refer to the most recent result set
- "the same" or "also" suggests building on the previous query's filters
- Incorporate relevant WHERE clauses from prior queries when the question implies continuity
`;
  }

  return `${QUERY_GENERATION_PROMPT}

${context}

User's question: "${question}"`;
}

function summarizeResults(results) {
  if (!results || results.length === 0) return "No results";
  if (results.length === 1) {
    // Single aggregate result
    return JSON.stringify(results[0]);
  }
  return `${results.length} rows, columns: ${Object.keys(results[0]).join(', ')}`;
}
```

### Step 3: Include Context in Analysis Phase

The analyst should also understand the conversation flow:

```javascript
function buildAnalysisPrompt(question, query, results, conversationHistory) {
  let context = '';
  
  if (conversationHistory.length > 0) {
    const lastExchange = conversationHistory[conversationHistory.length - 1];
    context = `
## Conversation Context
Previous question: "${lastExchange.question}"
Previous insight: "${lastExchange.analysis.insight}"

The current question is a follow-up. Frame your response accordingly:
- Use phrases like "Of those..." or "Among the..." to show continuity
- Don't repeat background context the user already knows
- Focus on what's NEW in this answer
`;
  }

  return `${ANALYST_PROMPT}

${context}

Question: "${question}"
Query: ${query}
Results: ${JSON.stringify(results, null, 2)}`;
}
```

### Step 4: Update UI for Threaded Display

Change the HTML structure to show a thread of Q/A pairs, newest on top:

```html
<div class="conversation-thread" id="thread">
  <!-- New entries prepended here -->
</div>
```

Each Q/A pair is a card:

```html
<div class="qa-card" id="msg_123">
  <div class="question-bubble">
    <span class="question-text">How many of them are red?</span>
    <span class="timestamp">just now</span>
  </div>
  
  <div class="answer-section">
    <div class="insight">Of those 847 dogs, 156 are red — about 18%.</div>
    <div class="analysis">Red is the third most common color for dogs...</div>
    <div class="chart-container">
      <canvas id="chart_msg_123"></canvas>
    </div>
    <details class="query-details">
      <summary>Query details</summary>
      <pre class="query-code">run: cards -> { ... }</pre>
    </details>
  </div>
</div>
```

### Step 5: Implement Thread Rendering

```javascript
function renderQACard(entry) {
  const card = document.createElement('div');
  card.className = 'qa-card';
  card.id = entry.id;
  
  card.innerHTML = `
    <div class="question-bubble">
      <span class="question-text">${escapeHtml(entry.question)}</span>
      <span class="timestamp">${formatTime(entry.timestamp)}</span>
    </div>
    
    <div class="answer-section">
      <div class="insight">${entry.analysis.insight}</div>
      ${entry.analysis.analysis ? `<div class="analysis">${entry.analysis.analysis}</div>` : ''}
      ${entry.analysis.chart ? `
        <div class="chart-container">
          <canvas id="chart_${entry.id}"></canvas>
        </div>
      ` : ''}
      ${entry.analysis.caveats ? `<div class="caveats">${entry.analysis.caveats}</div>` : ''}
      <details class="query-details">
        <summary>Query details</summary>
        <pre class="query-code">${escapeHtml(entry.malloyQuery)}</pre>
        <div class="raw-results">${formatResultsTable(entry.results)}</div>
      </details>
    </div>
  `;
  
  // Prepend to thread (newest on top)
  const thread = document.getElementById('thread');
  thread.prepend(card);
  
  // Render chart if present
  if (entry.analysis.chart) {
    // Small delay to ensure canvas is in DOM
    setTimeout(() => {
      renderChart(entry.analysis.chart, `chart_${entry.id}`);
    }, 10);
  }
}
```

### Step 6: Update Main Flow

```javascript
async function askQuestion(question, apiKey, callbacks) {
  const entryId = 'msg_' + Date.now();
  
  // Phase 1: Generate query WITH conversation context
  const queryPrompt = buildQueryPrompt(question, conversationHistory);
  const malloyQuery = await callClaude(QUERY_GENERATION_PROMPT, queryPrompt, apiKey);
  
  // Execute query (with retry logic)
  const result = await executeWithRetry(malloyQuery, callbacks);
  if (!result.success) {
    callbacks.onError?.(result.error);
    return;
  }
  
  // Phase 2: Analyze WITH conversation context
  const analysisPrompt = buildAnalysisPrompt(question, malloyQuery, result.data, conversationHistory);
  const analysisResponse = await callClaude(ANALYST_PROMPT, analysisPrompt, apiKey);
  const analysis = JSON.parse(analysisResponse);
  
  // Create conversation entry
  const entry = {
    id: entryId,
    question,
    malloyQuery,
    results: result.data,
    analysis,
    timestamp: Date.now()
  };
  
  // Add to history
  conversationHistory.push(entry);
  
  // Render the Q/A card
  renderQACard(entry);
  
  // Clear input
  callbacks.onComplete?.();
}
```

### Step 7: Add "Clear Conversation" Button

```html
<button id="clearBtn" class="clear-btn">Clear conversation</button>
```

```javascript
document.getElementById('clearBtn').addEventListener('click', () => {
  conversationHistory.length = 0;
  document.getElementById('thread').innerHTML = '';
});
```

### Step 8: Style the Thread

```css
.conversation-thread {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.qa-card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  overflow: hidden;
}

.question-bubble {
  background: #1a1a1a;
  color: white;
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.question-text {
  font-family: Georgia, serif;
  font-size: 16px;
}

.timestamp {
  font-family: system-ui, sans-serif;
  font-size: 12px;
  color: #999;
}

.answer-section {
  padding: 24px;
}

.insight {
  font-family: Georgia, serif;
  font-size: 20px;
  font-weight: bold;
  line-height: 1.4;
  color: #1a1a1a;
  margin-bottom: 12px;
}

.analysis {
  font-size: 16px;
  color: #333;
  margin-bottom: 16px;
}

.chart-container {
  height: 300px;
  margin: 20px 0;
}

.query-details {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #eee;
}

.query-details summary {
  font-size: 13px;
  color: #666;
  cursor: pointer;
}

/* Loading state for current question */
.qa-card.loading .answer-section {
  opacity: 0.5;
}

.qa-card.loading .answer-section::after {
  content: 'Thinking...';
  display: block;
  font-style: italic;
  color: #666;
}
```

### Step 9: Handle Loading State

Show the question immediately, then fill in the answer:

```javascript
async function askQuestion(question, apiKey) {
  const entryId = 'msg_' + Date.now();
  
  // Immediately show the question with loading state
  const loadingCard = document.createElement('div');
  loadingCard.className = 'qa-card loading';
  loadingCard.id = entryId;
  loadingCard.innerHTML = `
    <div class="question-bubble">
      <span class="question-text">${escapeHtml(question)}</span>
      <span class="timestamp">just now</span>
    </div>
    <div class="answer-section">
      <div class="loading-indicator">Analyzing...</div>
    </div>
  `;
  document.getElementById('thread').prepend(loadingCard);
  
  try {
    // ... do the actual work ...
    
    // Replace loading card with full response
    loadingCard.outerHTML = renderQACardHTML(entry);
    
    // Render chart if needed
    if (entry.analysis.chart) {
      setTimeout(() => renderChart(entry.analysis.chart, `chart_${entryId}`), 10);
    }
  } catch (error) {
    loadingCard.querySelector('.answer-section').innerHTML = `
      <div class="error">${escapeHtml(error.message)}</div>
    `;
    loadingCard.classList.remove('loading');
  }
}
```

### Step 10: Test Conversational Context

Test these conversation flows:

**Flow 1: Filtering down**
1. "How many dog cards are there?" → Should return count of dogs
2. "How many of them are red?" → Should filter dogs by red
3. "What's the average mana value?" → Should be avg mana of red dogs

**Flow 2: Comparison**
1. "How many cards are in Bloomburrow?" → Set-specific count
2. "How does that compare to the previous set?" → Should compare to prior set

**Flow 3: Clarification**
1. "Show me the top 10 artists" → Top artists by card count
2. "Sort by most recent instead" → Same artists, different sort

**Flow 4: Context switch (should NOT carry over)**
1. "How many dog cards are there?"
2. "What's the total number of sets?" → New topic, shouldn't filter by dogs

For flow 4, the LLM should recognize this is a new topic and not apply dog filters.

## Output Structure
```
~/repos/Malloy Test/test-ui/
├── index.html (thread-based UI)
├── app.js (conversation history + context injection)
├── styles.css (thread styling)
├── analyst-prompt.md (unchanged)
├── query-prompt.md (updated with context handling instructions)
└── README.md (updated)
```

## Success Criteria

1. Follow-up questions understand context ("them", "those", "the same")
2. Prior Q/A pairs stay visible below the new one
3. Each Q/A card shows question, insight, chart (if any), collapsible details
4. "Clear conversation" resets the thread
5. Loading state shows question immediately while answer generates
6. Context switches (new topics) are handled gracefully

## Notes
- Keep conversation history limited (last 3-5 exchanges) to avoid token bloat
- The query generation prompt needs the most context — it must understand what "them" refers to
- The analysis prompt needs less context — mainly to frame the response appropriately
- Each chart needs a unique canvas ID since multiple charts can be on screen
- Commit with message: "feat: add conversational threading with context"