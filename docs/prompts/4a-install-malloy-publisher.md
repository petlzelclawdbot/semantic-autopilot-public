# Task: Install and Configure Malloy Publisher

## Context
We've successfully generated Malloy semantic models for MTGJSON data. Now I want to run Malloy Publisher locally to explore the data through its web UI before testing MCP integration with Claude.

## Malloy Source Files Location
`~/repos/Malloy Test/Malloy-source-files/`

## Your Task

### Step 1: Create Publisher Package Manifest
Malloy Publisher requires a `publisher.json` manifest in the package directory.

Create `~/repos/Malloy Test/Malloy-source-files/publisher.json`:
```json
{
  "name": "mtgjson-analytics",
  "version": "1.0.0",
  "description": "Magic: The Gathering card analytics using MTGJSON data"
}
```

### Step 2: Create Publisher Server Configuration
Create `~/repos/Malloy Test/publisher.config.json` (in the parent directory):
```json
{
  "projects": [
    {
      "name": "mtgjson",
      "path": "./Malloy-source-files"
    }
  ]
}
```

### Step 3: Start Malloy Publisher
Run the publisher server:
```bash
cd ~/repos/Malloy\ Test
npx @malloy-publisher/server --port 4000 --server_root .
```

### Step 4: Verify It's Running
- REST API should be available at: http://localhost:4000
- MCP API should be available at: http://localhost:4040
- Check status: `curl http://localhost:4000/status`

### Step 5: Document Access
Provide:
- The URLs to access the Publisher UI
- How to stop/restart the server
- Any errors encountered and how they were resolved

## Expected Outcome
Publisher running locally where I can:
- Browse the mtgjson-analytics package
- See the cards and sets sources
- Run queries through the Explorer UI
- Verify the MCP endpoint is accessible

## Notes
- If there are issues with the Malloy files, note what needed to be fixed
- The data files path in the .malloy files may need adjustment relative to where Publisher runs from
- Keep the server running — we'll need it for the next phase