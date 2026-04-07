// server.js — proxy + retry loop + model enhancement for the Malloy test UI.
//
// Endpoints:
//   GET  /                 → index.html
//   GET  /app.js, /styles.css
//   POST /api/ask          → { question } → { sessionId, attempts, finalRows, finalError, modelChange? }
//   POST /api/propose      → { question, lastQuery, lastError } → { change }
//   POST /api/apply        → { change } → { backup, reloadStatus, retry: { rows?, error? } }
//
// Run:
//   set -a; source ../.env.local; set +a
//   node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const enhancer = require('./model-enhancer');

const PORT = 5173;
const PUBLISHER = 'http://localhost:4000';
const PROJECT = 'mtgjson';
const PACKAGE = 'mtgjson-analytics';
const MODEL_PATH = 'cards.malloy';
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const MAX_RETRIES = 2;
const MAX_CHANGES_PER_SESSION = 3; // soft cap, tracked in memory

const REPO_ROOT = path.resolve(__dirname, '..');
const LOG_DIR = path.join(REPO_ROOT, 'logs');
const SESSION_LOG = path.join(LOG_DIR, 'sessions.jsonl');

const SYSTEM_PROMPT_PATH = path.join(__dirname, 'system-prompt.txt');
const ANALYST_PROMPT_PATH = path.join(__dirname, 'analyst-prompt.md');
function loadSystemPrompt() {
  return fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf8');
}
function loadAnalystPrompt() {
  return fs.readFileSync(ANALYST_PROMPT_PATH, 'utf8');
}

const STATIC = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/app.js': 'app.js',
  '/styles.css': 'styles.css',
};
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

// In-memory change counter (per server lifetime, not per HTTP session).
let changesThisSession = 0;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function logSession(record) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(SESSION_LOG, JSON.stringify(record) + '\n');
}

// ---------- Claude ----------

async function callClaude({ system, user, maxTokens = 1024 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY env var not set');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return (j.content?.[0]?.text ?? '').trim();
}

function stripFences(text) {
  return text
    .replace(/^```(?:malloy)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

async function generateMalloyQuery(question, errorContext) {
  const system = loadSystemPrompt();
  let user = question;
  if (errorContext) {
    user =
      `Question: ${question}\n\n` +
      `Your previous attempt failed.\n` +
      `Failed query:\n${errorContext.failedQuery}\n\n` +
      `Error from Malloy Publisher:\n${errorContext.errorMessage}\n\n` +
      `Generate a corrected query. Return ONLY the Malloy query.`;
  }
  const raw = await callClaude({ system, user, maxTokens: 1024 });
  return stripFences(raw);
}

// ---------- Publisher ----------

async function executeQuery(query) {
  const url = `${PUBLISHER}/api/v0/projects/${PROJECT}/packages/${PACKAGE}/models/${MODEL_PATH}/query`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, compactJson: true }),
  });
  const body = await r.text();
  if (!r.ok) return { rows: null, error: extractError(body) };
  try {
    const parsed = JSON.parse(body);
    const rows = parsed.result ? JSON.parse(parsed.result) : [];
    return { rows, error: null };
  } catch (e) {
    return { rows: null, error: `parse error: ${e.message}` };
  }
}

// Publisher returns errors as JSON like {"code":"...","message":"..."} or
// sometimes a multi-line dump. Pull out the most useful piece.
function extractError(body) {
  try {
    const j = JSON.parse(body);
    if (j.message) return j.message;
    if (j.error) return typeof j.error === 'string' ? j.error : JSON.stringify(j.error);
    return JSON.stringify(j);
  } catch {
    return body.slice(0, 1000);
  }
}

// ---------- Retry loop ----------

async function runAskLoop(question) {
  const sessionId = crypto.randomBytes(4).toString('hex');
  const attempts = [];
  let errorContext = null;

  for (let i = 0; i <= MAX_RETRIES; i++) {
    let query;
    try {
      query = await generateMalloyQuery(question, errorContext);
    } catch (e) {
      attempts.push({ attempt: i + 1, query: null, error: `claude: ${e.message}`, rows: null });
      break;
    }

    const result = await executeQuery(query);
    attempts.push({ attempt: i + 1, query, error: result.error, rows: result.rows });

    if (!result.error) break;
    errorContext = { failedQuery: query, errorMessage: result.error };
  }

  const last = attempts[attempts.length - 1];
  const out = {
    sessionId,
    question,
    attempts,
    finalRows: last?.rows ?? null,
    finalError: last?.error ?? null,
    enhancementCandidate: last?.error ? enhancer.isMissingFieldError(last.error) : false,
    analysis: null,
  };

  // Phase 2: analyst pass. Only run if the query succeeded.
  if (out.finalRows && !out.finalError) {
    try {
      out.analysis = await analyzeResults({
        question,
        query: last.query,
        rows: out.finalRows,
      });
    } catch (e) {
      out.analysisError = e.message;
    }
  }

  logSession({ ts: new Date().toISOString(), kind: 'ask', ...out });
  return out;
}

// ---------- Analyst ----------

// Rows can be large (e.g. 100 artists). Cap what we send to Claude so we
// stay well under the token budget.
const MAX_ROWS_TO_ANALYST = 50;

async function analyzeResults({ question, query, rows }) {
  const truncated = rows.length > MAX_ROWS_TO_ANALYST;
  const shown = truncated ? rows.slice(0, MAX_ROWS_TO_ANALYST) : rows;

  const user =
    `Question: ${question}\n\n` +
    `Malloy query that ran:\n${query}\n\n` +
    `Result rows (${rows.length} total${truncated ? `, showing first ${MAX_ROWS_TO_ANALYST}` : ''}):\n` +
    JSON.stringify(shown, null, 2) +
    `\n\nRespond with the JSON object described in the system prompt. JSON only.`;

  const raw = await callClaude({
    system: loadAnalystPrompt(),
    user,
    maxTokens: 1500,
  });

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`analyst returned non-JSON: ${cleaned.slice(0, 300)}`);
  }

  // Validate chart shape defensively.
  if (parsed.chart) {
    const c = parsed.chart;
    if (
      !c.type ||
      !Array.isArray(c.labels) ||
      !Array.isArray(c.data) ||
      c.labels.length !== c.data.length
    ) {
      parsed.chart = null;
      parsed.caveats =
        (parsed.caveats ? parsed.caveats + ' ' : '') +
        '(Chart was dropped — invalid shape from analyst.)';
    }
  }
  return parsed;
}

// ---------- HTTP server ----------

const server = http.createServer(async (req, res) => {
  // Static
  if (req.method === 'GET' && STATIC[req.url]) {
    const file = path.join(__dirname, STATIC[req.url]);
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'text/plain' });
      res.end(buf);
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/ask') {
    try {
      const { question } = await readJsonBody(req);
      if (!question) throw new Error('missing question');
      const result = await runAskLoop(question);
      sendJson(res, 200, result);
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/propose') {
    try {
      const { question, lastQuery, lastError } = await readJsonBody(req);
      if (!question || !lastError) throw new Error('missing question or lastError');
      const change = await enhancer.proposeChange({
        question,
        failedQuery: lastQuery,
        error: lastError,
        claudeCall: callClaude,
        fetchFn: fetch,
      });
      logSession({ ts: new Date().toISOString(), kind: 'propose', question, change });
      sendJson(res, 200, { change });
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/apply') {
    try {
      const { change, retryQuestion, triggeringError } = await readJsonBody(req);
      if (!change) throw new Error('missing change');
      if (changesThisSession >= MAX_CHANGES_PER_SESSION) {
        throw new Error(`change cap reached (${MAX_CHANGES_PER_SESSION}) — restart server to reset`);
      }
      const apply = await enhancer.applyChange(change, {
        fetchFn: fetch,
        question: retryQuestion,
        error: triggeringError,
      });
      changesThisSession += 1;

      // Re-run the original question to validate.
      let retry = null;
      if (retryQuestion) {
        retry = await runAskLoop(retryQuestion);
      }

      logSession({
        ts: new Date().toISOString(),
        kind: 'apply',
        change,
        apply,
        changesThisSession,
        retry,
      });
      sendJson(res, 200, { apply, retry, changesThisSession });
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/history')) {
    try {
      const url = new URL(req.url, 'http://x');
      const limit = parseInt(url.searchParams.get('limit') || '10', 10);
      sendJson(res, 200, { history: enhancer.getModelHistory(limit) });
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/rollback') {
    try {
      const result = enhancer.rollbackLastChange();
      // Re-sync publisher_data from the now-reverted source files and reload.
      for (const f of enhancer.ALLOWED_FILES) {
        const src = path.join(REPO_ROOT, 'Malloy-source-files', f);
        const dst = path.join(REPO_ROOT, 'publisher_data', 'mtgjson', 'mtgjson-analytics', f);
        if (fs.existsSync(src) && fs.existsSync(dst)) {
          fs.copyFileSync(src, dst);
        }
      }
      let reloadStatus = 'skipped';
      try {
        const r = await fetch(
          `${PUBLISHER}/api/v0/projects/${PROJECT}/packages/${PACKAGE}?reload=true`
        );
        reloadStatus = r.ok ? 'ok' : `http ${r.status}`;
      } catch (e) {
        reloadStatus = `error: ${e.message}`;
      }
      logSession({ ts: new Date().toISOString(), kind: 'rollback', result, reloadStatus });
      sendJson(res, 200, { ...result, reloadStatus });
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

server.listen(PORT, () => {
  console.log(`test-ui listening at http://localhost:${PORT}`);
  console.log(`  proxies to publisher at ${PUBLISHER}`);
  console.log(`  max retries: ${MAX_RETRIES}, max model changes per session: ${MAX_CHANGES_PER_SESSION}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('  WARNING: ANTHROPIC_API_KEY is not set');
  }
});
