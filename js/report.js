/**
 * PDF Report generation
 * Creates printable report with summary, charts, and day-by-day details
 */

import { getAppData, getDaysInRange } from './db.js';
import { pctOf, getStreak, getTotalCompleted } from './score.js';
import { getTotalStats, getBestDay, getLowestDay } from './score.js';

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function toast(msg) {
  const t = $('#toast');
  if (t) {
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast.h);
    toast.h = setTimeout(() => t.classList.remove('on'), 2400);
  }
}

const RANGE_PRESETS = [
  { id: 'today', label: 'Today', getRange: () => [today(), today()] },
  { id: 'last7', label: 'Last 7 days', getRange: () => [addDays(today(), -6), today()] },
  { id: 'last30', label: 'Last 30 days', getRange: () => [addDays(today(), -29), today()] },
  { id: 'thisMonth', label: 'This month', getRange: () => [firstDayOfMonth(), today()] },
  { id: 'lastMonth', label: 'Last month', getRange: () => [firstDayOfLastMonth(), lastDayOfLastMonth()] },
  { id: 'thisYear', label: 'This year', getRange: () => [firstDayOfYear(), today()] },
  { id: 'all', label: 'All time', getRange: () => [getEarliestDate(), today()] }
];

function today() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function firstDayOfMonth() {
  const d = new Date();
  d.setDate(1);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function firstDayOfLastMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  d.setDate(1);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function lastDayOfLastMonth() {
  const d = new Date();
  d.setDate(0);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function firstDayOfYear() {
  const d = new Date();
  d.setMonth(0, 1);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function getEarliestDate() {
  return getAppData().then(data => {
    const dates = Object.keys(data.days).sort();
    return dates[0] || today();
  });
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function getDayName(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'narrow' });
}

async function generateReport(from, to, options = {}) {
  const daysData = await getDaysInRange(from, to);
  const profile = (await getAppData()).profile || {};

  const dates = Object.keys(daysData).sort();
  if (!dates.length) {
    return { empty: true, from, to };
  }

  let totalGoals = 0;
  let totalDone = 0;
  const dailyScores = [];

  for (const date of dates) {
    const goals = daysData[date];
    const score = pctOf(goals);
    dailyScores.push({ date, score, goals });

    if (goals.length) {
      totalGoals += goals.length;
      totalDone += goals.filter(g => g.done).length;
    }
  }

  const overallPct = totalGoals ? Math.round(totalDone / totalGoals * 100) : 0;
  const avgDaily = dailyScores.length ? Math.round(dailyScores.reduce((a, b) => a + b.score, 0) / dailyScores.length) : 0;

  const best = dailyScores.reduce((a, b) => a.score > b.score ? a : b, { score: 0 });
  const lowest = dailyScores.reduce((a, b) => a.score < b.score ? a : b, { score: 100 });

  const streak = await getStreak();
  const longestStreak = await getLongestStreak();

  const stats = await getTotalStats();
  const bestDay = await getBestDay();
  const lowestDay = await getLowestDay();

  let pendingGoals = [];
  if (options.includePending) {
    for (const { date, goals } of dailyScores) {
      for (const goal of goals) {
        if (!goal.done) {
          pendingGoals.push({ date, ...goal });
        }
      }
    }
  }

  return {
    empty: false,
    from,
    to,
    profile,
    generatedAt: new Date().toISOString(),
    summary: {
      daysTracked: dates.length,
      totalGoals,
      totalDone,
      totalPending: totalGoals - totalDone,
      overallPct,
      avgDaily,
      bestDay: best.date,
      bestScore: best.score,
      lowestDay: lowest.date,
      lowestScore: lowest.score,
      currentStreak: streak,
      longestStreak
    },
    dailyScores,
    pendingGoals,
    options
  };
}

function buildReportDOM(report) {
  if (report.empty) {
    return `
      <div class="report-preview">
        <div class="report-empty">
          <h3>No goals in this range</h3>
          <p>There are no goals tracked between ${formatDate(report.from)} and ${formatDate(report.to)}.</p>
        </div>
      </div>
    `;
  }

  const { summary, dailyScores, pendingGoals, profile, generatedAt, from, to } = report;

  const genDate = new Date(generatedAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const genTime = new Date(generatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  let html = `
    <div class="report-preview">
      <div class="report-header">
        <h1>Today — Progress Report</h1>
        <p>${profile.name || 'Your Name'} · ${formatDate(from)} to ${formatDate(to)} · Generated ${genDate} at ${genTime}</p>
      </div>

      <div class="report-summary">
        <div class="summary-card"><b>${summary.daysTracked}</b><span>Days Tracked</span></div>
        <div class="summary-card"><b>${summary.totalGoals}</b><span>Goals Listed</span></div>
        <div class="summary-card"><b>${summary.totalDone}</b><span>Goals Completed</span></div>
        <div class="summary-card"><b>${summary.totalPending}</b><span>Goals Pending</span></div>
        <div class="summary-card"><b>${summary.overallPct}%</b><span>Overall Completion</span></div>
        <div class="summary-card"><b>${summary.avgDaily}%</b><span>Average Daily Score</span></div>
        <div class="summary-card"><b>${summary.bestScore}%</b><span>Best Day</span></div>
        <div class="summary-card"><b>${summary.lowestScore}%</b><span>Lowest Day</span></div>
        <div class="summary-card"><b>${summary.currentStreak}</b><span>Current Streak</span></div>
        <div class="summary-card"><b>${summary.longestStreak}</b><span>Longest Streak</span></div>
      </div>
  `;

  if (dailyScores.length <= 60) {
    html += buildChartsSection(dailyScores);
  } else if (dailyScores.length <= 90) {
    html += buildWeeklyChartSection(dailyScores);
  } else {
    html += buildMonthlyTableSection(dailyScores);
  }

  if (report.options?.includeDetails !== false) {
    html += buildDayByDaySection(dailyScores, report.options);
  }

  if (report.options?.includePending && pendingGoals.length) {
    html += buildPendingSection(pendingGoals);
  }

  html += `
      <div class="report-footer">
        <p>Generated by Today app · Page <span class="page-number"></span></p>
      </div>
    </div>
  `;

  return html;
}

function buildChartsSection(dailyScores) {
  const maxBars = 60;
  const scores = dailyScores.slice(-maxBars);

  const svgWidth = Math.max(600, scores.length * 10);
  const barWidth = 8;
  const gap = 2;
  const chartHeight = 150;
  const maxScore = 100;

  let bars = '';
  scores.forEach((d, i) => {
    const h = (d.score / maxScore) * (chartHeight - 20);
    const x = i * (barWidth + gap);
    const y = chartHeight - h - 10;
    const color = d.score === 100 ? '#ffc86b' : d.score >= 75 ? '#5eead4' : d.score >= 50 ? '#8b7cff' : d.score > 0 ? '#ff7a9c' : '#9a9cc8';

    bars += `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="${color}" rx="2" />
      <text x="${x + barWidth/2}" y="${chartHeight + 12}" text-anchor="middle" font-size="7" fill="#62658f">${getDayName(d.date)}</text>
    `;
  });

  return `
    <div class="charts-section">
      <h2>Daily Scores</h2>
      <svg class="chart-svg" viewBox="0 0 ${svgWidth} ${chartHeight + 30}" width="100%" height="${chartHeight + 30}">
        ${bars}
      </svg>
    </div>
  `;
}

function buildWeeklyChartSection(dailyScores) {
  const weeks = {};
  dailyScores.forEach(d => {
    const date = new Date(d.date + 'T00:00:00');
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const key = weekStart.toISOString().split('T')[0];
    if (!weeks[key]) weeks[key] = { scores: [], start: key };
    weeks[key].scores.push(d.score);
  });

  const weekData = Object.values(weeks).map(w => ({
    start: w.start,
    avg: Math.round(w.scores.reduce((a, b) => a + b, 0) / w.scores.length)
  }));

  const svgWidth = Math.max(600, weekData.length * 50);
  const barWidth = 30;
  const gap = 20;
  const chartHeight = 150;

  let bars = '';
  weekData.forEach((w, i) => {
    const h = (w.avg / 100) * (chartHeight - 20);
    const x = i * (barWidth + gap);
    const y = chartHeight - h - 10;
    const color = w.avg === 100 ? '#ffc86b' : w.avg >= 75 ? '#5eead4' : w.avg >= 50 ? '#8b7cff' : '#ff7a9c';

    bars += `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="${color}" rx="4" />
      <text x="${x + barWidth/2}" y="${chartHeight + 14}" text-anchor="middle" font-size="8" fill="#62658f">${formatDateShort(w.start)}</text>
      <text x="${x + barWidth/2}" y="${y - 4}" text-anchor="middle" font-size="9" font-weight="600" fill="#1b1c3a">${w.avg}%</text>
    `;
  });

  return `
    <div class="charts-section">
      <h2>Weekly Averages</h2>
      <svg class="chart-svg" viewBox="0 0 ${svgWidth} ${chartHeight + 30}" width="100%" height="${chartHeight + 30}">
        ${bars}
      </svg>
    </div>
  `;
}

function buildMonthlyTableSection(dailyScores) {
  const months = {};
  dailyScores.forEach(d => {
    const monthKey = d.date.substring(0, 7);
    if (!months[monthKey]) months[monthKey] = { scores: [], days: 0 };
    months[monthKey].scores.push(d.score);
    months[monthKey].days++;
  });

  let rows = '';
  Object.entries(months).sort().forEach(([month, data]) => {
    const avg = Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length);
    const [year, mon] = month.split('-');
    const monthName = new Date(year, mon - 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    rows += `<tr><td>${monthName}</td><td>${data.days}</td><td>${avg}%</td></tr>`;
  });

  return `
    <div class="charts-section">
      <h2>Monthly Summary</h2>
      <table style="width:100%;border-collapse:collapse;font-size:9pt">
        <thead><tr style="border-bottom:1px solid #d9dcf0"><th style="text-align:left;padding:6px">Month</th><th style="padding:6px">Days</th><th style="padding:6px">Avg Score</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function buildDayByDaySection(dailyScores, options) {
  let html = '<div class="day-by-day"><h2>Day by Day</h2>';

  dailyScores.forEach(({ date, score, goals }) => {
    if (options.skipEmpty && !goals.length) return;

    let filteredGoals = goals;
    if (options.filter === 'done') filteredGoals = goals.filter(g => g.done);
    else if (options.filter === 'pending') filteredGoals = goals.filter(g => !g.done);

    if (options.skipEmpty && !filteredGoals.length) return;

    html += `
      <div class="day-block">
        <div class="day-header">
          <span class="day-date">${formatDate(date)}</span>
          <span class="day-score">${score}%</span>
        </div>
        <ul class="goal-list">
    `;

    filteredGoals.forEach(goal => {
      const status = goal.done ? 'done' : 'pending';
      const icon = goal.done ? '✓' : '☐';
      html += `
        <li class="goal-item ${goal.done ? 'done' : ''}">
          <span class="goal-icon ${goal.done ? 'done' : 'pending'}">${icon}</span>
          <span class="goal-text">${escapeHtml(goal.t)}</span>
        </li>
      `;
    });

    html += '</ul></div>';
  });

  html += '</div>';
  return html;
}

function buildPendingSection(pendingGoals) {
  let html = '<div class="not-completed-section"><h2>Not Completed</h2><div class="not-completed-list">';

  const byDate = {};
  pendingGoals.forEach(g => {
    if (!byDate[g.date]) byDate[g.date] = [];
    byDate[g.date].push(g);
  });

  Object.entries(byDate).sort().forEach(([date, goals]) => {
    html += `
      <div class="not-completed-item">
        <span class="not-completed-date">${formatDateShort(date)}</span>
        <span class="not-completed-text">${goals.map(g => escapeHtml(g.t)).join(', ')}</span>
      </div>
    `;
  });

  html += '</div></div>';
  return html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function renderReportPreview() {
  const rangeSelect = $('#reportRange');
  const fromInput = $('#reportFrom');
  const toInput = $('#reportTo');
  const container = $('#reportPreview');

  if (!rangeSelect || !container) return;

  let from, to;
  const rangeId = rangeSelect.value;

  if (rangeId === 'custom') {
    from = fromInput.value;
    to = toInput.value;
    if (!from || !to) {
      container.innerHTML = '<div class="report-empty"><p>Please select a date range.</p></div>';
      return;
    }
  } else {
    const preset = RANGE_PRESETS.find(p => p.id === rangeId);
    if (preset) {
      [from, to] = preset.getRange();
    }
  }

  const options = {
    includeSummary: $('#optSummary')?.checked !== false,
    includeCharts: $('#optCharts')?.checked !== false,
    includeDetails: $('#optDetails')?.checked !== false,
    filter: $('input[name="filter"]:checked')?.value || 'all',
    skipEmpty: $('#optSkipEmpty')?.checked !== false,
    includePending: $('#optPending')?.checked
  };

  container.innerHTML = '<div class="report-empty"><p>Generating report...</p></div>';

  try {
    const report = await generateReport(from, to, options);
    container.innerHTML = buildReportDOM(report);
    $('#downloadPdfBtn')?.classList.remove('hidden');
  } catch (err) {
    container.innerHTML = `<div class="report-empty"><p>Error: ${err.message}</p></div>`;
    console.error(err);
  }
}

function downloadPDF() {
  const originalTitle = document.title;
  const rangeSelect = $('#reportRange');
  let from, to;

  if (rangeSelect.value === 'custom') {
    from = $('#reportFrom').value;
    to = $('#reportTo').value;
  } else {
    const preset = RANGE_PRESETS.find(p => p.id === rangeSelect.value);
    if (preset) [from, to] = preset.getRange();
  }

  document.title = `Todo-Report_${from}_to_${to}`;
  window.print();
  document.title = originalTitle;
}

function initReportUI() {
  const rangeSelect = $('#reportRange');
  const customRange = $('#customRange');
  const fromInput = $('#reportFrom');
  const toInput = $('#reportTo');
  const previewBtn = $('#previewBtn');
  const downloadBtn = $('#downloadPdfBtn');

  if (rangeSelect) {
    rangeSelect.innerHTML = RANGE_PRESETS.map(p => `<option value="${p.id}">${p.label}</option>`).join('') +
      '<option value="custom">Custom range...</option>';

    rangeSelect.addEventListener('change', () => {
      customRange.style.display = rangeSelect.value === 'custom' ? 'block' : 'none';
    });
  }

  if (fromInput) fromInput.max = today();
  if (toInput) toInput.max = today();

  if (previewBtn) previewBtn.addEventListener('click', renderReportPreview);
  if (downloadBtn) downloadBtn.addEventListener('click', downloadPDF);

  $$('input[name="filter"]').forEach(r => r.addEventListener('change', renderReportPreview));
  $$('#reportOptions input[type=checkbox]').forEach(c => c.addEventListener('change', renderReportPreview));
}

export {
  RANGE_PRESETS,
  generateReport,
  buildReportDOM,
  renderReportPreview,
  downloadPDF,
  initReportUI,
  today,
  addDays
};