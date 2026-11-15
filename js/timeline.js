/**
 * Timeline view - vertical day schedule with "now" line
 */

import { getAppData, getSettings } from './db.js';
import { getGoalStatus, formatTime, addMinutes } from './tasks.js';

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

let currentView = 'list'; // 'list' or 'timeline'

function initTimelineToggle() {
  const toggle = $('#viewToggle');
  if (!toggle) return;

  toggle.addEventListener('click', () => {
    currentView = currentView === 'list' ? 'timeline' : 'list';
    toggle.textContent = currentView === 'list' ? '📋 List' : '📅 Timeline';
    toggle.classList.toggle('on', currentView === 'timeline');
    renderCurrentView();
  });
}

function renderCurrentView() {
  const listContainer = $('#list');
  const timelineContainer = $('#timeline');

  if (currentView === 'list') {
    listContainer.style.display = 'grid';
    if (timelineContainer) timelineContainer.style.display = 'none';
    if (window.renderApp) window.renderApp();
  } else {
    listContainer.style.display = 'none';
    if (!timelineContainer) {
      const timeline = document.createElement('div');
      timeline.id = 'timeline';
      timeline.className = 'timeline';
      listContainer.parentNode.insertBefore(timeline, listContainer.nextSibling);
    }
    renderTimeline();
  }
}

async function renderTimeline() {
  const container = $('#timeline');
  if (!container) return;

  const data = await getAppData();
  const goals = data.days[dk()] || [];

  if (!goals.length) {
    container.innerHTML = '<div class="empty">No tasks for today. Add one above to begin.</div>';
    return;
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const timedGoals = goals.filter(g => g.startTime || g.deadline);
  const untimedGoals = goals.filter(g => !g.startTime && !g.deadline);

  timedGoals.sort((a, b) => {
    const aTime = a.startTime ? timeToMinutes(a.startTime) : timeToMinutes(a.deadline);
    const bTime = b.startTime ? timeToMinutes(b.startTime) : timeToMinutes(b.deadline);
    return aTime - bTime;
  });

  let html = '';

  if (timedGoals.length) {
    timedGoals.forEach((goal, index) => {
      const status = getGoalStatus(goal);
      let startMin, endMin;

      if (goal.startTime) {
        startMin = timeToMinutes(goal.startTime);
        endMin = goal.duration ? startMin + goal.duration : startMin + 60;
      } else {
        startMin = timeToMinutes(goal.deadline) - 60;
        endMin = timeToMinutes(goal.deadline);
      }

      const height = endMin - startMin;
      const top = (startMin / (24 * 60)) * 100;
      const h = (height / (24 * 60)) * 100;

      html += `
        <div class="timeline-item" style="--item-top: ${top}%; --item-height: ${h}%;">
          <div class="timeline-dot ${status}"></div>
          <div class="timeline-content">
            <div class="timeline-time">${formatTime(goal.startTime || goal.deadline)}${goal.duration ? ` · ${goal.duration}min` : goal.deadline ? ' (deadline)' : ''}</div>
            <div class="timeline-name">${escapeHtml(goal.t)}</div>
            ${goal.category ? `<span class="category-tag" style="--cat-color: ${goal.category.color}"><span class="category-dot" style="background: ${goal.category.color}"></span>${escapeHtml(goal.category.name)}</span>` : ''}
          </div>
        </div>
      `;
    });
  }

  if (untimedGoals.length) {
    html += '<div class="timeline-untimed">';
    untimedGoals.forEach(goal => {
      const status = getGoalStatus(goal);
      html += `
        <div class="timeline-item untimed">
          <div class="timeline-dot ${status}"></div>
          <div class="timeline-content">
            <div class="timeline-name">${escapeHtml(goal.t)}</div>
            ${goal.category ? `<span class="category-tag" style="--cat-color: ${goal.category.color}"><span class="category-dot" style="background: ${goal.category.color}"></span>${escapeHtml(goal.category.name)}</span>` : ''}
          </div>
        </div>
      `;
    });
    html += '</div>';
  }

  container.innerHTML = html;

  // Add "now" line
  const nowPercent = (currentMinutes / (24 * 60)) * 100;
  const nowLine = document.createElement('div');
  nowLine.className = 'timeline-now';
  nowLine.style.top = `${nowPercent}%`;
  container.appendChild(nowLine);

  // Update now line every minute
  if (window.timelineNowInterval) clearInterval(window.timelineNowInterval);
  window.timelineNowInterval = setInterval(() => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const nowPercent = (currentMinutes / (24 * 60)) * 100;
    const nowLine = $('#timeline .timeline-now');
    if (nowLine) nowLine.style.top = `${nowPercent}%`;
  }, 60000);
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function dk(date = new Date()) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getCurrentView() {
  return currentView;
}

function setCurrentView(view) {
  currentView = view;
}

export {
  initTimelineToggle,
  renderCurrentView,
  renderTimeline,
  getCurrentView,
  setCurrentView
};