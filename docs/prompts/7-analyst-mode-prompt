# Task: Add Analyst Mode with NYT-Style Data Visualization

## Context
The conversational analytics test page works — it generates Malloy queries and displays results. Now I want to evolve it from a "query executor" to an "analyst assistant" that:
1. Interprets results and responds with insight, not just data
2. Generates charts when (and only when) they add understanding
3. Follows the New York Times data visualization philosophy

## Current State
- Test UI: `~/repos/Malloy Test/test-ui/`
- Malloy models: `~/repos/Malloy Test/Malloy-source-files/`
- Publisher running at: http://localhost:4000 (REST), http://localhost:4040 (MCP)

## Architecture Change

**Current flow:**
```
User question → LLM generates Malloy → Execute → Return raw results
```

**New flow:**
```
User question → LLM generates Malloy → Execute → LLM analyzes results → Returns narrative + optional chart
```

## Your Task

### Step 1: Create the Analyst System Prompt

Create `~/repos/Malloy Test/test-ui/analyst-prompt.md` with these principles:

#### Response Philosophy
- **Lead with insight**: Don't say "there are 1,916 cards." Say "Nearly 2,000 cards were printed in 2026 — a notably high release volume."
- **Surface the story**: What pattern matters? What's surprising?
- **Be direct**: Lead with the finding. Details follow.
- **Acknowledge uncertainty**: If data is incomplete or ambiguous, say so.

#### NYT Data Visualization Philosophy

These are the core principles from Amanda Cox and the NYT Graphics team:

1. **Annotation is the point**
   - "The words in a graphic should highlight the relevant pattern, or an expert's interpretation, and not merely say 'Here is some data.'"
   - Every chart needs text explaining what to see
   - Call out the key pattern, the outlier, the turning point

2. **Clarity over decoration**
   - "Typography and design are really about hierarchy and clarity, and not just about making things cute."
   - Remove everything that doesn't serve understanding
   - No gratuitous gradients, shadows, or 3D effects

3. **Direct labeling**
   - Labels on the data itself (end of lines, on bars)
   - Never make readers match colors to legends
   - If you must use a legend, the chart is probably too complex

4. **Simplify ruthlessly**
   - "There's a lot of data that should be left out."
   - A chart with 3 annotated points beats 30 unlabeled ones
   - If everything is highlighted, nothing is

5. **Empathy over aesthetics**
   - "The design wasn't ultimately about typography and whitespace, but about empathy—about creating visualizations that readers can both understand and engage with emotionally."

#### When to Include a Chart

Only create a chart when it genuinely adds understanding beyond words. Many questions are better answered with a sentence.

**Include a chart when:**
- Comparing 4+ categories
- Showing trends over time
- Revealing patterns not obvious from numbers alone

**Do NOT chart:**
- Single numbers ("how many total cards?")
- Two-item comparisons (just state them)
- When prose already tells the story

#### Chart Style Guide

```
Colors:
- Primary data: #1a1a1a (near black)
- Secondary/comparison: #666666
- Accent/highlight: #d62728 (muted red) or #1f77b4 (muted blue)
- Background: transparent or #ffffff
- Gridlines: #e5e5e5 (barely visible)
- Annotation text: #333333

Typography:
- Chart title: 16-18px, bold, sentence case
- Axis labels: 11-12px, regular
- Annotations: 12-14px, can be italic for emphasis
- Data labels: 11px

Spacing:
- Generous margins
- No clutter at edges
- Let the data breathe
```

#### Response Format

The analyst should return JSON:
```json
{
  "insight": "1-2 sentence lead answering the question directly",
  "analysis": "Supporting context if needed (2-3 sentences max). Null if insight is sufficient.",
  "chart": null OR {
    "type": "bar|line|horizontalBar",
    "title": "Title as a finding, not a label",
    "labels": ["label1", "label2"],
    "data": [value1, value2],
    "annotations": [{"index": 0, "text": "What this point means"}]
  },
  "caveats": "Any data limitations. Null if none."
}
```

#### Examples

**Bad response:**
"Here are the card counts by rarity: Common: 12,456, Uncommon: 8,234..."

**Good response:**
"Commons dominate the card pool at nearly half of all prints — which makes sense, since they're designed to appear most frequently in draft."

**Bad chart title:** "Card Count by Rarity"
**Good chart title:** "Commons make up nearly half of all Magic cards"

### Step 2: Modify app.js for Two-Phase Flow

Update the main flow to:

1. **Phase 1: Query Generation** (existing, with retry)
   - Generate Malloy query from question
   - Execute against Publisher
   - Retry with error context if needed

2. **Phase 2: Analysis** (new)
   - Take successful query results
   - Send to Claude with analyst prompt + results
   - Parse JSON response
   - Render insight, analysis, chart (if any), caveats

```javascript
async function askQuestion(question, apiKey, callbacks) {
  // Phase 1: Generate and execute query (existing logic)
  const queryResult = await executeWithRetry(question, apiKey, callbacks);
  
  if (!queryResult.success) return queryResult;
  
  // Phase 2: Analyze results
  callbacks.onStatus?.('Analyzing results...');
  
  const analysisContext = `
Question: "${question}"

Query executed:
${queryResult.query}

Results:
${JSON.stringify(queryResult.data, null, 2)}

Analyze these results and respond as a data analyst would.`;

  const analysisResponse = await callClaude(ANALYST_PROMPT, analysisContext, apiKey);
  const analysis = JSON.parse(analysisResponse);
  
  callbacks.onAnalysis?.(analysis);
  
  if (analysis.chart) {
    callbacks.onChart?.(analysis.chart);
  }
  
  return { success: true, data: queryResult.data, analysis };
}
```

### Step 3: Add Chart Rendering with Chart.js

Add NYT-style chart rendering:

```javascript
const NYT_COLORS = {
  primary: '#1a1a1a',
  secondary: '#666666',
  accent: '#d62728',
  accentBlue: '#1f77b4',
  gridline: '#e5e5e5',
  annotation: '#333333'
};

function renderChart(chartSpec, canvasId) {
  const config = {
    type: chartSpec.type === 'horizontalBar' ? 'bar' : chartSpec.type,
    data: {
      labels: chartSpec.labels,
      datasets: [{
        data: chartSpec.data,
        backgroundColor: NYT_COLORS.primary,
        borderWidth: 0
      }]
    },
    options: {
      indexAxis: chartSpec.type === 'horizontalBar' ? 'y' : 'x',
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: chartSpec.title,
          font: { size: 16, weight: 'bold', family: 'Georgia, serif' },
          color: NYT_COLORS.primary,
          align: 'start'
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 }, color: NYT_COLORS.secondary }
        },
        y: {
          grid: { color: NYT_COLORS.gridline },
          ticks: { font: { size: 11 }, color: NYT_COLORS.secondary }
        }
      }
    }
  };
  
  new Chart(document.getElementById(canvasId), config);
}
```

### Step 4: Update the HTML Interface

Update `index.html` to display:

1. **Insight card** — Large, bold text with the main finding
2. **Analysis** — Supporting context (if provided)
3. **Chart** — NYT-style visualization (if provided)
4. **Caveats** — Data limitations (if any)
5. **Query details** — Collapsible section with raw query and data

Style the insight prominently:
```css
.insight {
  font-family: Georgia, serif;
  font-size: 22px;
  font-weight: bold;
  line-height: 1.4;
  color: #1a1a1a;
}

.chart-container {
  position: relative;
  height: 350px;
  margin: 24px 0;
}
```

### Step 5: Add Chart.js Dependency

Include Chart.js in the HTML:
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

### Step 6: Test with These Questions

Test the analyst mode with questions that should trigger different behaviors:

1. **Should NOT chart** (single number):
   - "How many total cards are there?"
   - Expected: Just an insight sentence

2. **Should chart** (comparison):
   - "Show me cards by rarity"
   - Expected: Bar chart with insight like "Commons dominate at nearly half"

3. **Should chart** (trend):
   - "How has the number of cards per year changed?"
   - Expected: Line chart with annotation on notable years

4. **Should NOT chart** (two items):
   - "Are there more red or blue cards?"
   - Expected: Prose comparison, no chart

5. **Complex question**:
   - "What's the relationship between mana value and rarity?"
   - Expected: Insight about the pattern, possibly a chart

Document whether the agent correctly decides when to chart and when not to.

## Output Structure
```
~/repos/Malloy Test/test-ui/
├── index.html (updated with insight display + chart container)
├── app.js (updated with two-phase flow)
├── analyst-prompt.md (new - the full analyst system prompt)
├── styles.css (updated with NYT-inspired styling)
└── README.md (updated with analyst mode documentation)
```

## Success Criteria

1. Questions get answered with insight, not just data
2. Charts appear only when they add understanding
3. Charts follow NYT style: direct labels, minimal gridlines, finding-as-title
4. The UI clearly shows the analyst's interpretation prominently
5. Raw query and data are still accessible but secondary

## Notes
- The key insight is that the LLM makes TWO calls: one for query generation, one for analysis
- The analyst prompt is the most important piece — spend time getting it right
- Chart.js is sufficient for bar/line charts; we don't need D3 complexity
- The agent should err on the side of NOT charting — prose is often clearer
- Commit to git with message: "feat: add analyst mode with NYT-style visualization"