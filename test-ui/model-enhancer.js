// model-enhancer.js — propose & apply additive Malloy model changes.
//
// Strategy:
//   - Heuristic: if a query failed with "X is not defined" / "field-not-found",
//     it's a candidate for model enhancement.
//   - Ask Claude (in a separate, JSON-mode call) to propose a snippet to add
//     to one of the source files. The snippet must be a complete Malloy
//     `dimension:` / `measure:` / `view:` block.
//   - Apply: back up the file, splice the snippet just before the source's
//     closing brace, mirror the change into publisher_data/, hit Publisher's
//     reload endpoint.
//
// Safety rails:
//   - Only the two known model files can be edited (allowlist).
//   - Backups go to backups/<file>.<timestamp>.bak.
//   - Caller must explicitly confirm before applyChange runs.
//   - Hard cap MAX_CHANGES_PER_SESSION enforced by the server.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(REPO_ROOT, 'Malloy-source-files');
const PUBLISHER_COPY_DIR = path.join(
  REPO_ROOT,
  'publisher_data',
  'mtgjson',
  'mtgjson-analytics'
);
const BACKUP_DIR = path.join(REPO_ROOT, 'backups');
const ALLOWED_FILES = new Set(['cards.malloy', 'sets.malloy']);

const PUBLISHER_BASE = 'http://localhost:4000';
const PROJECT = 'mtgjson';
const PACKAGE = 'mtgjson-analytics';

const PROPOSE_SYSTEM = `You evolve a Malloy semantic model in response to a failing user query.

You will be given:
- The user's natural-language question.
- The Malloy query Claude generated that failed.
- The error message from the Malloy compiler / Publisher.
- The full current contents of one model file (cards.malloy).

Your job: propose ONE additive change — a new dimension, measure, or view —
that will let the original query (or a near variant) succeed. Do NOT rewrite
existing fields. Do NOT remove anything. Only add.

Constraints:
- The snippet must be a SINGLE complete Malloy block, properly indented to
  sit inside a "source: cards is duckdb.table(...) extend { ... }" body.
- Use raw column names from the parquet — they are camelCase
  (manaCost, manaValue, setCode, edhrecRank, etc.). The full list of raw
  columns is enumerated in the existing model file you'll be shown.
- Comma-joined VARCHAR list-columns (colors, types, keywords, etc.) must use
  '~' substring matching, NOT Malloy's '?' array operator.
- Prefer "dimension:" for attribute exposure, "measure:" for aggregations,
  "view:" only when the question really wants a saved query shape.
- Produce a one-line "reasoning" explaining why this addition unblocks the
  query.

Return ONLY valid JSON (no prose, no markdown fences) with this exact shape:
{
  "file": "cards.malloy",
  "changeType": "add_dimension" | "add_measure" | "add_view",
  "snippet": "  dimension: artist_name is artist",
  "reasoning": "User asked about artist; raw column exists but wasn't exposed."
}`;

function isMissingFieldError(errorText) {
  if (!errorText) return false;
  return (
    /is not defined/i.test(errorText) ||
    /field-not-found/i.test(errorText) ||
    /unknown field/i.test(errorText) ||
    /No such field/i.test(errorText)
  );
}

async function proposeChange({ question, failedQuery, error, fetchFn, claudeCall }) {
  // Currently we only enhance cards.malloy — that's where the join lives and
  // where the bulk of analytics fields belong.
  const fileName = 'cards.malloy';
  const fileContent = fs.readFileSync(path.join(SOURCE_DIR, fileName), 'utf8');

  const userMsg =
    `Question: ${question}\n\n` +
    `Failed Malloy query:\n${failedQuery}\n\n` +
    `Error:\n${error}\n\n` +
    `Current ${fileName}:\n\`\`\`\n${fileContent}\n\`\`\``;

  const raw = await claudeCall({
    system: PROPOSE_SYSTEM,
    user: userMsg,
    maxTokens: 800,
  });

  // Strip any accidental fences and parse.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`proposeChange: Claude returned non-JSON: ${cleaned.slice(0, 200)}`);
  }

  if (!parsed.file || !parsed.snippet) {
    throw new Error(`proposeChange: missing fields in response: ${cleaned.slice(0, 200)}`);
  }
  if (!ALLOWED_FILES.has(parsed.file)) {
    throw new Error(`proposeChange: file "${parsed.file}" not in allowlist`);
  }
  return parsed;
}

function backupFile(absPath) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(BACKUP_DIR, `${path.basename(absPath)}.${stamp}.bak`);
  fs.copyFileSync(absPath, dest);
  return dest;
}

// Splice snippet just before the LAST closing brace in the file (which is
// the closing brace of the `source: ... extend { ... }` block).
function spliceIntoSource(fileContent, snippet) {
  const lastBrace = fileContent.lastIndexOf('}');
  if (lastBrace === -1) throw new Error('no closing brace found');
  const before = fileContent.slice(0, lastBrace);
  const after = fileContent.slice(lastBrace);
  // Ensure exactly one blank line above the snippet, and one trailing newline.
  const trimmedBefore = before.replace(/\s*$/, '\n\n');
  const block = `  -- @ai-added ${new Date().toISOString()}\n${snippet.replace(/\n?$/, '\n')}\n`;
  return trimmedBefore + block + after;
}

// ---------- git helpers ----------

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    ...opts,
  }).trim();
}

function gitAvailable() {
  try {
    git(['rev-parse', '--show-toplevel']);
    return true;
  } catch {
    return false;
  }
}

function buildCommitMessage({ change, question, error }) {
  const subject = `Auto: ${change.changeType} for: "${(question || '').slice(0, 60)}"`;
  const body =
    `Reasoning: ${change.reasoning || '(none)'}\n\n` +
    `Code added:\n${change.snippet}\n\n` +
    `Error that triggered this:\n${(error || '(none)').slice(0, 1000)}`;
  return { subject, body };
}

function getModelHistory(limit = 10) {
  if (!gitAvailable()) return [];
  // Filter to commits that touched the Malloy source files.
  const out = git([
    'log',
    `-${limit}`,
    '--pretty=format:%h%x09%s%x09%aI',
    '--',
    'Malloy-source-files',
  ]);
  if (!out) return [];
  return out.split('\n').map((line) => {
    const [hash, message, ts] = line.split('\t');
    return { hash, message, ts };
  });
}

function rollbackLastChange() {
  if (!gitAvailable()) throw new Error('git not available');
  // Find the most recent commit that touched Malloy-source-files.
  const out = git([
    'log',
    '-1',
    '--pretty=format:%H',
    '--',
    'Malloy-source-files',
  ]);
  if (!out) throw new Error('no model commits to revert');
  git(['revert', '--no-edit', out]);
  return { revertedCommit: out.slice(0, 7) };
}

// ---------- apply ----------

async function applyChange(change, { fetchFn, question, error }) {
  if (!ALLOWED_FILES.has(change.file)) {
    throw new Error(`applyChange: file "${change.file}" not in allowlist`);
  }
  const sourcePath = path.join(SOURCE_DIR, change.file);
  const copyPath = path.join(PUBLISHER_COPY_DIR, change.file);

  const backup = backupFile(sourcePath);

  const original = fs.readFileSync(sourcePath, 'utf8');
  const updated = spliceIntoSource(original, change.snippet);
  fs.writeFileSync(sourcePath, updated);

  // Mirror into Publisher's working copy so reload picks it up.
  // Publisher copies on first load and never re-syncs, so we have to write
  // both locations.
  let publisherCopyUpdated = false;
  if (fs.existsSync(copyPath)) {
    fs.writeFileSync(copyPath, updated);
    publisherCopyUpdated = true;
  }

  // Trigger reload.
  let reloadStatus = 'skipped';
  try {
    const r = await fetchFn(
      `${PUBLISHER_BASE}/api/v0/projects/${PROJECT}/packages/${PACKAGE}?reload=true`
    );
    reloadStatus = r.ok ? 'ok' : `http ${r.status}`;
  } catch (e) {
    reloadStatus = `error: ${e.message}`;
  }

  // Commit the change to the source-of-truth file (not the publisher_data copy).
  let commit = null;
  if (gitAvailable()) {
    try {
      const relSource = path.relative(REPO_ROOT, sourcePath);
      git(['add', '--', relSource]);
      const { subject, body } = buildCommitMessage({ change, question, error });
      git(['commit', '-m', subject, '-m', body]);
      commit = {
        hash: git(['rev-parse', '--short', 'HEAD']),
        subject,
      };
    } catch (e) {
      commit = { error: e.message };
    }
  }

  return {
    backup,
    publisherCopyUpdated,
    reloadStatus,
    commit,
  };
}

module.exports = {
  isMissingFieldError,
  proposeChange,
  applyChange,
  getModelHistory,
  rollbackLastChange,
  gitAvailable,
  ALLOWED_FILES,
};
