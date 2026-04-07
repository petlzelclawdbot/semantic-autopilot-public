const form = document.getElementById('ask-form');
const questionInput = document.getElementById('question');
const statusEl = document.getElementById('status');
const attemptsSection = document.getElementById('attempts-section');
const attemptsEl = document.getElementById('attempts');
const resultsSection = document.getElementById('results-section');
const resultsEl = document.getElementById('results');
const enhanceSection = document.getElementById('enhance-section');
const enhanceStatusEl = document.getElementById('enhance-status');
const enhanceBodyEl = document.getElementById('enhance-body');

const historyEl = document.getElementById('history');
const refreshHistoryBtn = document.getElementById('refresh-history');
let lastAsk = null; // { question, attempts, finalError, ... }

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = questionInput.value.trim();
  if (q) ask(q);
});
refreshHistoryBtn.addEventListener('click', loadHistory);
loadHistory();

document.querySelectorAll('#examples a[data-q]').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    questionInput.value = a.dataset.q;
    ask(a.dataset.q);
  });
});

function resetUi() {
  attemptsSection.hidden = true;
  attemptsEl.innerHTML = '';
  resultsSection.hidden = true;
  resultsEl.innerHTML = '';
  enhanceSection.hidden = true;
  enhanceBodyEl.innerHTML = '';
  enhanceStatusEl.textContent = '';
}

async function ask(question) {
  resetUi();
  statusEl.textContent = 'Thinking…';
  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    statusEl.textContent = '';
    if (data.error) {
      attemptsSection.hidden = false;
      attemptsEl.innerHTML = `<div class="attempt error"><pre>${escapeHtml(data.error)}</pre></div>`;
      return;
    }
    lastAsk = data;
    renderAttempts(data.attempts);
    if (data.finalRows) {
      renderResults(data.finalRows);
    }
    if (data.finalError) {
      // Offer model enhancement if it looks like a missing-field problem.
      if (data.enhancementCandidate) {
        offerEnhancement(data);
      }
    }
  } catch (err) {
    statusEl.textContent = '';
    attemptsSection.hidden = false;
    attemptsEl.innerHTML = `<div class="attempt error"><pre>${escapeHtml(err.message)}</pre></div>`;
  }
}

function renderAttempts(attempts) {
  attemptsSection.hidden = false;
  attemptsEl.innerHTML = '';
  attempts.forEach((a) => {
    const div = document.createElement('div');
    div.className = 'attempt ' + (a.error ? 'error' : 'ok');
    const status = a.error ? `failed` : `succeeded`;
    div.innerHTML =
      `<div class="attempt-header">Attempt ${a.attempt} — ${status}</div>` +
      (a.query ? `<pre class="query">${escapeHtml(a.query)}</pre>` : '') +
      (a.error ? `<pre class="error-msg">${escapeHtml(a.error)}</pre>` : '');
    attemptsEl.appendChild(div);
  });
}

function renderResults(rows) {
  resultsSection.hidden = false;
  resultsEl.innerHTML = '';
  if (!Array.isArray(rows) || rows.length === 0) {
    resultsEl.textContent = '(no rows)';
    return;
  }
  const cols = Object.keys(rows[0]);
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  cols.forEach((c) => {
    const th = document.createElement('th');
    th.textContent = c;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    cols.forEach((c) => {
      const td = document.createElement('td');
      const v = row[c];
      td.textContent =
        typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : v ?? '';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  resultsEl.appendChild(table);
}

async function offerEnhancement(askData) {
  enhanceSection.hidden = false;
  enhanceStatusEl.textContent =
    'Looks like a field is missing from the model. Asking Claude for a fix proposal…';
  const lastAttempt = askData.attempts[askData.attempts.length - 1];
  try {
    const res = await fetch('/api/propose', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question: askData.question,
        lastQuery: lastAttempt.query,
        lastError: lastAttempt.error,
      }),
    });
    const data = await res.json();
    if (data.error) {
      enhanceStatusEl.textContent = `Could not propose change: ${data.error}`;
      return;
    }
    renderProposedChange(data.change, askData.question);
  } catch (e) {
    enhanceStatusEl.textContent = `Error: ${e.message}`;
  }
}

function renderProposedChange(change, question) {
  enhanceStatusEl.textContent = `Claude proposes a ${change.changeType} in ${change.file}:`;
  enhanceBodyEl.innerHTML =
    `<pre class="snippet">${escapeHtml(change.snippet)}</pre>` +
    `<p class="hint"><strong>Reasoning:</strong> ${escapeHtml(change.reasoning || '(none)')}</p>` +
    `<div class="actions">` +
    `<button id="apply-btn">Apply &amp; retry</button>` +
    `<button id="skip-btn" class="secondary">Skip</button>` +
    `</div>`;
  document.getElementById('skip-btn').addEventListener('click', () => {
    enhanceSection.hidden = true;
  });
  document.getElementById('apply-btn').addEventListener('click', async () => {
    enhanceStatusEl.textContent = 'Applying change & re-running…';
    try {
      const lastAttempt = lastAsk?.attempts?.[lastAsk.attempts.length - 1];
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          change,
          retryQuestion: question,
          triggeringError: lastAttempt?.error,
        }),
      });
      const data = await res.json();
      if (data.error) {
        enhanceStatusEl.textContent = `Apply failed: ${data.error}`;
        return;
      }
      const commitInfo = data.apply.commit?.hash
        ? ` Commit: ${data.apply.commit.hash} — "${data.apply.commit.subject}".`
        : data.apply.commit?.error
          ? ` (git: ${data.apply.commit.error})`
          : '';
      enhanceStatusEl.textContent =
        `Applied. Backup: ${data.apply.backup.split('/').pop()}.` +
        ` Reload: ${data.apply.reloadStatus}.` +
        commitInfo +
        ` Changes this session: ${data.changesThisSession}.`;
      if (data.retry) {
        renderAttempts(data.retry.attempts);
        if (data.retry.finalRows) renderResults(data.retry.finalRows);
      }
      loadHistory();
    } catch (e) {
      enhanceStatusEl.textContent = `Apply error: ${e.message}`;
    }
  });
}

async function loadHistory() {
  try {
    const r = await fetch('/api/history?limit=10');
    const data = await r.json();
    if (!data.history || data.history.length === 0) {
      historyEl.textContent = '(no model commits yet)';
      return;
    }
    historyEl.innerHTML =
      '<ul class="history-list">' +
      data.history
        .map(
          (h) =>
            `<li><code>${escapeHtml(h.hash)}</code> ${escapeHtml(h.message)}</li>`
        )
        .join('') +
      '</ul>' +
      '<button id="undo-btn" class="secondary">Undo last model change</button>';
    const undo = document.getElementById('undo-btn');
    if (undo) undo.addEventListener('click', undoLast);
  } catch (e) {
    historyEl.textContent = `Error loading history: ${e.message}`;
  }
}

async function undoLast() {
  if (!confirm('Revert the most recent model change with `git revert`?')) return;
  try {
    const r = await fetch('/api/rollback', { method: 'POST' });
    const data = await r.json();
    if (data.error) {
      alert(`Rollback failed: ${data.error}`);
      return;
    }
    alert(
      `Reverted commit ${data.revertedCommit}. Publisher reload: ${data.reloadStatus}.`
    );
    loadHistory();
  } catch (e) {
    alert(`Rollback error: ${e.message}`);
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
