# Task: Add Error Recovery and Model Evolution to Test Interface

## Context
The conversational analytics test page works, but when Malloy queries fail, the system just shows an error. I want to add:
1. Automatic query retry with error context
2. (Experimental) Automatic model enhancement when fields are missing

## Current Files
- Test UI: `~/repos/Malloy Test/test-ui/`
- Malloy models: `~/repos/Malloy Test/Malloy-source-files/`
- Publisher running at: http://localhost:4000 (REST), http://localhost:4040 (MCP)

## Your Task

### Step 1: Implement Query-Level Error Recovery

Modify `app.js` to implement this flow:
```javascript
async function askQuestion(question, retryCount = 0, previousError = null) {
  const MAX_RETRIES = 2;
  
  // 1. Generate Malloy query (include error context if retrying)
  const query = await generateMalloyQuery(question, previousError);
  
  // 2. Execute query
  const result = await executeQuery(query);
  
  // 3. Handle errors
  if (result.error && retryCount < MAX_RETRIES) {
    console.log(`Retry ${retryCount + 1}: ${result.error}`);
    return askQuestion(question, retryCount + 1, {
      failedQuery: query,
      errorMessage: result.error
    });
  }
  
  return result;
}
```

Update the system prompt to handle error context:
// Add to system-prompt.txt
If a previous query failed, you will receive the failed query and error message.
Analyze the error and generate a corrected query.
Common fixes:

Column name typos: check the exact column names from the schema
Missing aggregation: ensure measures are used with aggregate:
Array filtering: use ? operator for array contains (e.g., colors ? 'W')
Join issues: reference joined table fields correctly (e.g., sets.name not setName)

Previous error context (if any):
{error_context}

### Step 2: Display the Retry Process in UI

Update the UI to show:
- "Attempt 1 failed: [error message]"
- "Retrying with error context..."
- "Attempt 2: [new query]"
- Final result or failure

This helps me understand what's happening and debug the prompts.

### Step 3: Implement Model Enhancement (Experimental)

Create a new module `model-enhancer.js` that:

1. **Detects model gaps**: Parse errors like "unknown field 'artist'" to identify missing fields

2. **Proposes model changes**: 
```javascript
async function proposeModelChange(error, question) {
  // Call Claude with:
  // - The error
  // - The current model file content
  // - The user's question
  // Ask it to propose a dimension/measure/view addition
  
  return {
    file: 'cards.malloy',
    changeType: 'add_dimension', // or add_measure, add_view
    code: "dimension: artist is artist",
    reasoning: "User asked about artist, which exists in the data but wasn't exposed"
  };
}
```

3. **Applies changes with confirmation**:
```javascript
async function applyModelChange(change, requireConfirmation = true) {
  if (requireConfirmation) {
    // Show proposed change in UI
    // Wait for user approval
  }
  
  // Read current file
  // Insert new code in appropriate section
  // Write file
  // Trigger Publisher reload (may need to restart or call reload endpoint)
}
```

4. **Validates changes**: After applying, re-run the original query to confirm it works

### Step 4: Add UI for Model Changes

Add a section to the UI that shows:
- "This question requires a model change"
- The proposed change (show the Malloy code)
- "Apply Change" / "Skip" buttons
- Status of change application

### Step 5: Handle Publisher Reload

Research how to reload Malloy models in Publisher without full restart:
- Check if there's a reload endpoint
- Or implement file watching
- Or document manual restart requirement

If no hot reload, show: "Model updated. Click to reload Publisher." with instructions.

### Step 6: Add Logging

Create a log of all interactions in `~/repos/Malloy Test/logs/`:
- Timestamp
- Original question
- Generated queries (all attempts)
- Errors encountered
- Model changes made
- Final result

This will be valuable for analyzing what works and what doesn't.

## Output
Updated files:
- `app.js` — with retry logic
- `model-enhancer.js` — new module for model changes
- `system-prompt.txt` — updated with error handling instructions
- `index.html` — UI updates for retry display and model change approval
- `README.md` — updated with new capabilities

## Safety Considerations
- Always show proposed model changes before applying
- Keep backups of .malloy files before modification
- Set a limit on auto-changes per session
- Log everything for review

## Success Criteria
1. A query that fails due to typo/syntax should auto-recover
2. A query that fails due to missing field should propose a model change
3. I can approve/reject model changes from the UI
4. All changes are logged for analysis

## Notes
- This is still experimental — focus on learning what works
- The model enhancement is the more interesting/risky part
- Start with query retry, then layer on model enhancement
- Document any patterns you notice in errors
