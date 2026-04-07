// NYT-inspired palette
const NYT = {
  primary: '#1a1a1a',
  secondary: '#666666',
  accent: '#d62728',
  accentBlue: '#1f77b4',
  gridline: '#e5e5e5',
};

const form = document.getElementById('ask-form');
const questionInput = document.getElementById('question');
const clearBtn = document.getElementById('clear-btn');
const threadEl = document.getElementById('thread');

const enhanceSection = document.getElementById('enhance-section');
const enhanceStatusEl = document.getElementById('enhance-status');
const enhanceBodyEl = document.getElementById('enhance-body');

const historyEl = document.getElementById('history');
const refreshHistoryBtn = document.getElementById('refresh-history');

// Conversation state — last N turns sent back to the server with each ask.
const HISTORY_TURNS = 4;
const conversation = []; // { id, question, query, rows, insight, analysis, chart, caveats, timestamp }

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = questionInput.value.trim();
  if (q) ask(q);
});
clearBtn.addEventListener('click', clearThread);
refreshHistoryBtn.addEventListener('click', loadHistory);
loadHistory();

document.querySelectorAll('#examples a[data-q]').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    questionInput.value = a.dataset.q;
    ask(a.dataset.q);
  });
});

function clearThread() {
  conversation.length = 0;
  threadEl.innerHTML = '';
  enhanceSection.hidden = true;
}

function buildHistoryPayload() {
  // Slim payload — Claude doesn't need full chart specs to resolve "them".
  return conversation.slice(-HISTORY_TURNS).map((c) => ({
    question: c.question,
    query: c.query,
    rows: c.rows,
    insight: c.insight,
  }));
}

async function ask(question) {
  enhanceSection.hidden = true;
  questionInput.value = '';
  const id = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

  // Optimistically render a loading card at the top.
  const card = createCardSkeleton(id, question);
  threadEl.prepend(card);

  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, history: buildHistoryPayload() }),
    });
    const data = await res.json();

    if (data.error) {
      fillCardWithError(card, data.error);
      return;
    }

    if (data.finalError) {
      fillCardWithError(card, data.finalError, data);
      if (data.enhancementCandidate) offerEnhancement(data, question);
      return;
    }

    const last = data.attempts[data.attempts.length - 1];
    const entry = {
      id,
      question,
      query: last.query,
      rows: data.finalRows,
      insight: data.analysis?.insight ?? '(no insight)',
      analysis: data.analysis?.analysis ?? null,
      chart: data.analysis?.chart ?? null,
      caveats: data.analysis?.caveats ?? null,
      attempts: data.attempts,
      timestamp: Date.now(),
    };
    conversation.push(entry);
    fillCard(card, entry);
  } catch (err) {
    fillCardWithError(card, err.message);
  }
}

function createCardSkeleton(id, question) {
  const card = document.createElement('div');
  card.className = 'qa-card loading';
  card.id = id;
  card.innerHTML = `
    <div class="question-bubble">
      <span class="question-text">${escapeHtml(question)}</span>
      <span class="timestamp">just now</span>
    </div>
    <div class="answer-section">
      <div class="loading-indicator">Thinking…</div>
    </div>`;
  return card;
}

function fillCard(card, entry) {
  card.classList.remove('loading');
  const chartId = `chart_${entry.id}`;
  const answer = document.createElement('div');
  answer.className = 'answer-section';
  answer.innerHTML = `
    <p class="insight">${escapeHtml(entry.insight)}</p>
    ${entry.analysis ? `<p class="analysis">${escapeHtml(entry.analysis)}</p>` : ''}
    ${entry.chart ? `<div class="chart-container"><canvas id="${chartId}"></canvas></div>` : ''}
    ${entry.chart && entry.chart.annotations && entry.chart.annotations.length
      ? `<div class="annotations">${entry.chart.annotations.map((a) => {
          const label = entry.chart.labels[a.index] ?? `#${a.index}`;
          return `<div class="annotation"><span class="marker"></span><strong>${escapeHtml(label)}:</strong> ${escapeHtml(a.text)}</div>`;
        }).join('')}</div>`
      : ''}
    ${entry.caveats ? `<p class="caveats">Caveats: ${escapeHtml(entry.caveats)}</p>` : ''}
    <details class="query-details">
      <summary>Query &amp; raw data</summary>
      <div class="attempts">${entry.attempts.map(renderAttemptHtml).join('')}</div>
      <div class="raw-rows">${renderTableHtml(entry.rows)}</div>
    </details>`;
  card.querySelector('.answer-section').replaceWith(answer);

  if (entry.chart) {
    setTimeout(() => renderChart(entry.chart, chartId), 10);
  }
}

function fillCardWithError(card, message, fullData) {
  card.classList.remove('loading');
  card.classList.add('error');
  const detailsHtml = fullData
    ? `<details class="query-details"><summary>Attempts</summary><div class="attempts">${(fullData.attempts || []).map(renderAttemptHtml).join('')}</div></details>`
    : '';
  card.querySelector('.answer-section').innerHTML =
    `<p class="error-msg">${escapeHtml(message)}</p>${detailsHtml}`;
}

function renderAttemptHtml(a) {
  const status = a.error ? 'failed' : 'succeeded';
  const cls = a.error ? 'error' : 'ok';
  return (
    `<div class="attempt ${cls}">` +
    `<div class="attempt-header">Attempt ${a.attempt} — ${status}</div>` +
    (a.query ? `<pre class="query">${escapeHtml(a.query)}</pre>` : '') +
    (a.error ? `<pre class="error-msg">${escapeHtml(a.error)}</pre>` : '') +
    `</div>`
  );
}

function renderTableHtml(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '<p class="hint">(no rows)</p>';
  const cols = Object.keys(rows[0]);
  const head = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const body = rows
    .map(
      (r) =>
        '<tr>' +
        cols
          .map((c) => {
            const v = r[c];
            const text =
              typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : v ?? '';
            return `<td>${escapeHtml(text)}</td>`;
          })
          .join('') +
        '</tr>'
    )
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderChart(spec, canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const horizontal = spec.type === 'horizontalBar';
  const type = spec.type === 'line' ? 'line' : 'bar';
  const annotated = new Set((spec.annotations || []).map((a) => a.index));
  const bg = spec.data.map((_, i) => (annotated.has(i) ? NYT.accent : NYT.primary));

  new Chart(canvas, {
    type,
    data: {
      labels: spec.labels,
      datasets: [
        {
          data: spec.data,
          backgroundColor: type === 'line' ? 'transparent' : bg,
          borderColor: type === 'line' ? NYT.primary : undefined,
          borderWidth: type === 'line' ? 2 : 0,
          pointBackgroundColor: NYT.primary,
          pointRadius: type === 'line' ? 3 : 0,
          tension: 0.1,
          fill: false,
        },
      ],
    },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: !!spec.title,
          text: spec.title,
          font: { size: 17, weight: 'bold', family: 'Georgia, "Times New Roman", serif' },
          color: NYT.primary,
          align: 'start',
          padding: { top: 4, bottom: 14 },
        },
        tooltip: { backgroundColor: NYT.primary },
      },
      scales: {
        x: {
          grid: { display: horizontal, color: NYT.gridline, drawBorder: false },
          ticks: { font: { size: 11 }, color: NYT.secondary },
          title: spec.xLabel ? { display: true, text: spec.xLabel, color: NYT.secondary, font: { size: 11 } } : undefined,
        },
        y: {
          grid: { display: !horizontal, color: NYT.gridline, drawBorder: false },
          ticks: { font: { size: 11 }, color: NYT.secondary },
          title: spec.yLabel ? { display: true, text: spec.yLabel, color: NYT.secondary, font: { size: 11 } } : undefined,
          beginAtZero: true,
        },
      },
    },
  });
}

// ---------- model enhancement (shared panel) ----------

function offerEnhancement(askData, question) {
  enhanceSection.hidden = false;
  enhanceStatusEl.textContent =
    'Looks like a field is missing from the model. Asking Claude for a fix proposal…';
  const lastAttempt = askData.attempts[askData.attempts.length - 1];
  fetch('/api/propose', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question,
      lastQuery: lastAttempt.query,
      lastError: lastAttempt.error,
    }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.error) {
        enhanceStatusEl.textContent = `Could not propose change: ${data.error}`;
        return;
      }
      renderProposedChange(data.change, question, lastAttempt.error);
    })
    .catch((e) => (enhanceStatusEl.textContent = `Error: ${e.message}`));
}

function renderProposedChange(change, question, triggeringError) {
  enhanceStatusEl.textContent = `Claude proposes a ${change.changeType} in ${change.file}:`;
  enhanceBodyEl.innerHTML =
    `<pre class="snippet">${escapeHtml(change.snippet)}</pre>` +
    `<p class="hint"><strong>Reasoning:</strong> ${escapeHtml(change.reasoning || '(none)')}</p>` +
    `<div class="actions"><button id="apply-btn">Apply &amp; retry</button><button id="skip-btn" class="secondary">Skip</button></div>`;
  document.getElementById('skip-btn').addEventListener('click', () => (enhanceSection.hidden = true));
  document.getElementById('apply-btn').addEventListener('click', async () => {
    enhanceStatusEl.textContent = 'Applying change & re-running…';
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          change,
          retryQuestion: question,
          triggeringError,
          history: buildHistoryPayload(),
        }),
      });
      const data = await res.json();
      if (data.error) { enhanceStatusEl.textContent = `Apply failed: ${data.error}`; return; }
      const commitInfo = data.apply.commit?.hash
        ? ` Commit: ${data.apply.commit.hash} — "${data.apply.commit.subject}".`
        : data.apply.commit?.error ? ` (git: ${data.apply.commit.error})` : '';
      enhanceStatusEl.textContent =
        `Applied. Backup: ${data.apply.backup.split('/').pop()}.` +
        ` Reload: ${data.apply.reloadStatus}.` +
        commitInfo +
        ` Changes this session: ${data.changesThisSession}.`;

      // Inject the retry result as a fresh card at the top of the thread.
      if (data.retry && data.retry.finalRows && data.retry.analysis) {
        const id = 'msg_' + Date.now();
        const card = createCardSkeleton(id, question);
        threadEl.prepend(card);
        const last = data.retry.attempts[data.retry.attempts.length - 1];
        const entry = {
          id,
          question,
          query: last.query,
          rows: data.retry.finalRows,
          insight: data.retry.analysis.insight,
          analysis: data.retry.analysis.analysis,
          chart: data.retry.analysis.chart,
          caveats: data.retry.analysis.caveats,
          attempts: data.retry.attempts,
          timestamp: Date.now(),
        };
        conversation.push(entry);
        fillCard(card, entry);
      }
      loadHistory();
    } catch (e) {
      enhanceStatusEl.textContent = `Apply error: ${e.message}`;
    }
  });
}

// ---------- model history (commits) ----------

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
      data.history.map((h) => `<li><code>${escapeHtml(h.hash)}</code> ${escapeHtml(h.message)}</li>`).join('') +
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
    if (data.error) { alert(`Rollback failed: ${data.error}`); return; }
    alert(`Reverted commit ${data.revertedCommit}. Publisher reload: ${data.reloadStatus}.`);
    loadHistory();
  } catch (e) {
    alert(`Rollback error: ${e.message}`);
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
