# MTG Analytics Test UI

Minimal natural-language → Malloy → DuckDB demo. You type a question, Claude
turns it into a Malloy query, and the query is executed against the
`mtgjson-analytics` package running on a local Malloy Publisher.

## Architecture

```
[Browser]
   │  POST /api/ask { question }
   ▼
[test-ui/server.js  (port 5173)]
   │
   ├── 1. POST https://api.anthropic.com/v1/messages
   │        system = system-prompt.txt
   │        → returns a Malloy query
   │
   └── 2. POST http://localhost:4000/api/v0/projects/mtgjson
                 /packages/mtgjson-analytics/models/cards.malloy/query
        → returns rows
```

The proxy server exists only so (a) the Claude API key stays server-side and
(b) we avoid browser CORS on the Publisher endpoint.

## Prerequisites

1. Node 18+ (uses native `fetch`).
2. Malloy Publisher running on `localhost:4000` with the `mtgjson`
   project and `mtgjson-analytics` package loaded. Start it from the repo
   root:
   ```bash
   cd "~/repos/Malloy Test"
   nohup npx -y @malloy-publisher/server@latest --port 4000 --server_root . \
     > /tmp/publisher.log 2>&1 &
   ```
3. An Anthropic API key in `ANTHROPIC_API_KEY`.

## Run

```bash
cd "~/repos/Malloy Test/test-ui"
ANTHROPIC_API_KEY=sk-ant-... node server.js
# then open http://localhost:5173
```

## Files

- `index.html` — page shell
- `app.js` — fetches `/api/ask`, renders query + result table
- `styles.css` — dark-mode styling
- `server.js` — Node proxy: serves static files, handles `/api/ask`
- `system-prompt.txt` — the Malloy schema + rules fed to Claude
- `README.md` — this file

## Configuration (hardcoded in `server.js`)

| Constant      | Value                                     |
|---------------|-------------------------------------------|
| `PORT`        | 5173                                      |
| `PUBLISHER`   | http://localhost:4000                     |
| `PROJECT`     | mtgjson                                   |
| `PACKAGE`     | mtgjson-analytics                         |
| `MODEL_PATH`  | cards.malloy                              |
| `CLAUDE_MODEL`| claude-sonnet-4-6                         |

## Known limitations

- Single-turn only; no conversation history.
- No schema-error repair — if Claude produces an invalid query, the error
  is shown verbatim and you have to rephrase.
- The model sometimes picks `colors_raw` when you want the prebuilt
  `color_distribution` view; rephrasing as "per-color totals" helps.
- `avg_mana_value` over rarity=rare looks inflated (~51) because MTGJSON
  stores some legacy/X-cost cards with very high mana values; this is a
  data quality artifact, not a query bug.
