# Task: Create a Simple Conversational Analytics Test Interface

## Context
Malloy Publisher is running locally with:
- REST API at http://localhost:4000
- MCP API at http://localhost:4040

I want to create a minimal test page that lets me type natural language questions and have Claude generate and execute Malloy queries via the Publisher MCP API.

## Architecture
[User] -> [Test Page] -> [Claude API] -> [Malloy Publisher MCP] -> [DuckDB] -> [Results]

## Your Task

### Step 1: Understand Publisher's MCP Capabilities
First, explore what the MCP endpoint exposes:
```bash
# List available MCP tools/prompts
curl http://localhost:4040/mcp/tools
# or inspect the MCP endpoint documentation
```

Document what tools are available (likely: execute query, list models, get schema, etc.)

### Step 2: Create a Simple Test Interface
Create a single-page app in `~/repos/Malloy Test/test-ui/`:

**`index.html`** — A minimal interface with:
- A text input for natural language questions
- A "Ask" button
- A results display area showing:
  - The generated Malloy query
  - The query results (as a table)
  - Any errors

**`app.js`** — JavaScript that:
1. Takes the user's question
2. Calls Claude API with:
   - The question
   - Context about available Malloy sources (cards, sets)
   - Instructions to generate a Malloy query
3. Sends the generated query to Publisher's MCP/REST API
4. Displays the results

### Step 3: Create a System Prompt for Claude
Create `~/repos/Malloy Test/test-ui/system-prompt.txt`:
You are an analytics assistant that translates natural language questions into Malloy queries.
Available sources:

cards: Magic: The Gathering card data with dimensions like name, manaValue, colors, rarity, types and measures like card_count, avg_mana_value
sets: Set information with dimensions like code, name, releaseDate, setType

The cards source is joined to sets via setCode.
When given a question:

Determine which source to query
Generate a valid Malloy query using the -> syntax
Return ONLY the Malloy query, no explanation

Example:
Question: "How many cards are there by rarity?"
Query: run: cards -> { group_by: rarity; aggregate: card_count }
Question: "What's the average mana value for each color?"
Query: run: cards -> { group_by: colors; aggregate: avg_mana_value, card_count }

### Step 4: Handle the API Flow
The flow should be:
1. User enters question
2. Frontend sends question + system prompt to Claude API (claude-sonnet-4-20250514)
3. Claude returns a Malloy query
4. Frontend sends query to Publisher's REST API: 
   `POST http://localhost:4000/api/v1/projects/mtgjson/packages/mtgjson-analytics/query`
   (verify exact endpoint from Publisher docs)
5. Display results

### Step 5: Create a Simple Server (if needed for CORS)
If CORS is an issue, create a minimal proxy server:
```javascript
// server.js - simple Express proxy
```

Or document how to run with CORS disabled for local testing.

### Step 6: Test with Sample Questions
Test these queries and document results:
1. "How many cards are there?"
2. "Show me card count by rarity"
3. "What's the average mana value of mythic rarity cards?"
4. "Which sets have the most cards?"
5. "How many multicolor cards are in each set?"

## Output Structure
~/repos/Malloy Test/test-ui/
├── index.html
├── app.js
├── styles.css (minimal)
├── system-prompt.txt
├── server.js (if needed)
└── README.md (how to run)

## Notes
- This is a feasibility test, not production code — keep it simple
- Use vanilla JS or minimal dependencies
- The Claude API key should be entered in the UI or loaded from environment (don't hardcode)
- Focus on proving the concept works, not on polish
- Document any limitations or issues encountered

## Success Criteria
I should be able to:
1. Open the test page in a browser
2. Type "How many cards by rarity?"
3. See the generated Malloy query
4. See the results displayed as a table