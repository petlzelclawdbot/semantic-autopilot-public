// NYT-inspired palette — muted, mostly achromatic, one accent.
const NYT = {
  primary: '#1a1a1a',
  secondary: '#666666',
  accent: '#d62728',
  accentBlue: '#1f77b4',
  gridline: '#e5e5e5',
  annotation: '#333333',
};

const form = document.getElementById('ask-form');
const questionInput = document.getElementById('question');
const statusEl = document.getElementById('status');

const insightSection = document.getElementById('insight-section');
const insightEl = document.getElementById('insight');
const analysisEl = document.getElementById('analysis');
const chartWrap = document.getElementById('chart-wrap');
const chartCanvas = document.getElementById('chart');
const annotationsEl = document.getElementById('annotations');
const caveatsEl = document.getElementById('caveats');

const detailsEl = document.getElementById('details');
const attemptsEl = document.getElementById('attempts');
const resultsSection = document.getElementById('results-section');
const resultsEl = document.getElementById('results');

const enhanceSection = document.getElementById('enhance-section');
const enhanceStatusEl = document.getElementById('enhance-status');
const enhanceBodyEl = document.getElementById('enhance-body');

const historyEl = document.getElementById('history');
const refreshHistoryBtn = document.getElementById('refresh-history');

let lastAsk = null;
let currentChart = null;

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
  insightSection.hidden = true;
  insightEl.textContent = '';
  analysisEl.hidden = true;
  analysisEl.textContent = '';
  chartWrap.hidden = true;
  annotationsEl.hidden = true;
  annotationsEl.innerHTML = '';
  caveatsEl.hidden = true;
  caveatsEl.textContent = '';
  if (currentChart) { currentChart.destroy(); currentChart = null; }

  detailsEl.hidden = true;
  detailsEl.open = false;
  attemptsEl.innerHTML = '';
  resultsSection.hidden = true;
  resultsEl.innerHTML = '';

  enhanceSection.hidden = true;
  enhanceBodyEl.innerHTML = '';
  enhanceStatusEl.textContent = '';
}

async function ask(question) {
  resetUi();
  statusEl.textContent = 'Generating Malloy…';
  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    statusEl.textContent = '';

    if (data.error) {
      showError(data.error);
      return;
    }
    lastAsk = data;

    // Always populate the collapsible details.
    detailsEl.hidden = false;
    renderAttempts(data.attempts);
    if (data.finalRows) {
      renderResults(data.finalRows);
      resultsSection.hidden = false;
    }

    // Analyst output — the headline.
    if (data.analysis) {
      renderAnalysis(data.analysis);
    } else if (data.finalError) {
      showError(data.finalError);
      if (data.enhancementCandidate) offerEnhancement(data);
    } else if (data.analysisError) {
      showError(`Analyst failed: ${data.analysisError}`);
    }
  } catch (err) {
    statusEl.textContent = '';
    showError(err.message);
  }
}

function renderAnalysis(a) {
  insightSection.hidden = false;
  insightEl.textContent = a.insight || '(no insight returned)';
  if (a.analysis) {
    analysisEl.textContent = a.analysis;
    analysisEl.hidden = false;
  }
  if (a.chart) {
    renderChart(a.chart);
  }
  if (a.caveats) {
    caveatsEl.textContent = `Caveats: ${a.caveats}`;
    caveatsEl.hidden = false;
  }
}

function renderChart(spec) {
  chartWrap.hidden = false;
  if (currentChart) currentChart.destroy();

  const horizontal = spec.type === 'horizontalBar';
  const type = spec.type === 'line' ? 'line' : 'bar';

  // Highlight annotated bars with the accent color.
  const annotatedIndices = new Set((spec.annotations || []).map((a) => a.index));
  const bgColors = spec.data.map((_, i) =>
    annotatedIndices.has(i) ? NYT.accent : NYT.primary
  );

  currentChart = new Chart(chartCanvas, {
    type,
    data: {
      labels: spec.labels,
      datasets: [
        {
          data: spec.data,
          backgroundColor: type === 'line' ? 'transparent' : bgColors,
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
          font: { size: 18, weight: 'bold', family: 'Georgia, "Times New Roman", serif' },
          color: NYT.primary,
          align: 'start',
          padding: { top: 4, bottom: 16 },
        },
        tooltip: {
          backgroundColor: NYT.primary,
          titleFont: { family: 'Georgia, serif' },
          bodyFont: { family: 'Georgia, serif' },
        },
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

  // Render annotations as direct labels below the chart (simpler and more
  // reliable than Chart.js annotation plugin for this demo).
  if (spec.annotations && spec.annotations.length) {
    annotationsEl.hidden = false;
    annotationsEl.innerHTML = spec.annotations
      .map((a) => {
        const label = spec.labels[a.index] ?? `#${a.index}`;
        return `<div class="annotation"><span class="marker"></span><strong>${escapeHtml(label)}:</strong> ${escapeHtml(a.text)}</div>`;
      })
      .join('');
  }
}

function showError(msg) {
  detailsEl.hidden = false;
  detailsEl.open = true;
  const div = document.createElement('div');
  div.className = 'attempt error';
  div.innerHTML = `<div class="attempt-header">Error</div><pre class="error-msg">${escapeHtml(msg)}</pre>`;
  attemptsEl.appendChild(div);
}

function renderAttempts(attempts) {
  attemptsEl.innerHTML = '';
  attempts.forEach((a) => {
    const div = document.createElement('div');
    div.className = 'attempt ' + (a.error ? 'error' : 'ok');
    const status = a.error ? 'failed' : 'succeeded';
    div.innerHTML =
      `<div class="attempt-header">Attempt ${a.attempt} — ${status}</div>` +
      (a.query ? `<pre class="query">${escapeHtml(a.query)}</pre>` : '') +
      (a.error ? `<pre class="error-msg">${escapeHtml(a.error)}</pre>` : '');
    attemptsEl.appendChild(div);
  });
}

function renderResults(rows) {
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

// ---------- model enhancement ----------

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
    if (data.error) { enhanceStatusEl.textContent = `Could not propose change: ${data.error}`; return; }
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
      if (data.error) { enhanceStatusEl.textContent = `Apply failed: ${data.error}`; return; }
      const commitInfo = data.apply.commit?.hash
        ? ` Commit: ${data.apply.commit.hash} — "${data.apply.commit.subject}".`
        : data.apply.commit?.error ? ` (git: ${data.apply.commit.error})` : '';
      enhanceStatusEl.textContent =
        `Applied. Backup: ${data.apply.backup.split('/').pop()}.` +
        ` Reload: ${data.apply.reloadStatus}.` +
        commitInfo +
        ` Changes this session: ${data.changesThisSession}.`;
      if (data.retry) {
        renderAttempts(data.retry.attempts);
        if (data.retry.finalRows) {
          renderResults(data.retry.finalRows);
          resultsSection.hidden = false;
        }
        if (data.retry.analysis) renderAnalysis(data.retry.analysis);
      }
      loadHistory();
    } catch (e) {
      enhanceStatusEl.textContent = `Apply error: ${e.message}`;
    }
  });
}

// ---------- history ----------

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
