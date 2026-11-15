/**
 * Task management logic
 */

import { getAppData, saveAppData, updateDayGoals, getSettings } from './db.js';
import { resetAutoLockTimer } from './lock.js';

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function dk(date = new Date()) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

function today() {
  return dk();
}

function toast(msg) {
  const t = $('#toast');
  if (t) {
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast.h);
    toast.h = setTimeout(() => t.classList.remove('on'), 2400);
  }
}

function getTodayGoals() {
  return getAppData().then(data => data.days[dk()] || []);
}

function addGoal(text, options = {}) {
  resetAutoLockTimer();
  return getAppData().then(data => {
    const dayKey = dk();
    if (!data.days[dayKey]) data.days[dayKey] = [];

    const goal = {
      id: uid(),
      t: text.slice(0, 120),
      done: false,
      startTime: options.startTime || null,
      duration: options.duration || null,
      deadline: options.deadline || null,
      status: 'pending',
      priority: options.priority || 'medium',
      category: options.category || null,
      subtasks: options.subtasks || [],
      note: options.note || '',
      createdAt: Date.now()
    };

    data.days[dayKey].push(goal);
    return saveAppData(data).then(() => goal);
  });
}

function addBulkGoals(lines) {
  resetAutoLockTimer();
  return getAppData().then(data => {
    const dayKey = dk();
    if (!data.days[dayKey]) data.days[dayKey] = [];

    const goals = lines.map(line => ({
      id: uid(),
      t: line.slice(0, 120),
      done: false,
      startTime: null,
      duration: null,
      deadline: null,
      status: 'pending',
      priority: 'medium',
      category: null,
      subtasks: [],
      note: '',
      createdAt: Date.now()
    }));

    data.days[dayKey].push(...goals);
    return saveAppData(data).then(() => goals);
  });
}

function toggleGoal(dayKey, goalId) {
  resetAutoLockTimer();
  return getAppData().then(data => {
    const goals = data.days[dayKey];
    if (!goals) return;

    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    goal.done = !goal.done;
    goal.status = goal.done ? 'done' : 'pending';

    if (goal.done && goal.startTime && goal.duration) {
      const endTime = addMinutes(goal.startTime, goal.duration);
      const now = new Date();
      const [h, m] = endTime.split(':').map(Number);
      const end = new Date();
      end.setHours(h, m, 0, 0);
      if (now > end) goal.status = 'missed';
    }

    return saveAppData(data).then(() => goal);
  });
}

function deleteGoal(dayKey, goalId) {
  resetAutoLockTimer();
  return getAppData().then(data => {
    const goals = data.days[dayKey];
    if (!goals) return;

    const index = goals.findIndex(g => g.id === goalId);
    if (index === -1) return;

    goals.splice(index, 1);
    return saveAppData(data);
  });
}

function updateGoal(dayKey, goalId, updates) {
  resetAutoLockTimer();
  return getAppData().then(data => {
    const goals = data.days[dayKey];
    if (!goals) return;

    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    Object.assign(goal, updates);
    return saveAppData(data).then(() => goal);
  });
}

function clearCompletedGoals(dayKey) {
  resetAutoLockTimer();
  return getAppData().then(data => {
    const goals = data.days[dayKey];
    if (!goals) return 0;

    const completed = goals.filter(g => g.done).length;
    data.days[dayKey] = goals.filter(g => !g.done);
    return saveAppData(data).then(() => completed);
  });
}

function addMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m + minutes, 0, 0);
  return String(date.getHours()).padStart(2, '0') + ':' +
    String(date.getMinutes()).padStart(2, '0');
}

function getGoalStatus(goal) {
  if (goal.done) return 'done';
  if (!goal.startTime && !goal.deadline) return 'pending';

  const now = new Date();
  const currentTime = String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0');

  if (goal.startTime && goal.duration) {
    const endTime = addMinutes(goal.startTime, goal.duration);
    if (currentTime < goal.startTime) return 'pending';
    if (currentTime >= goal.startTime && currentTime < endTime) return 'running';
    return goal.done ? 'done' : 'missed';
  }

  if (goal.deadline) {
    if (currentTime >= goal.deadline) return goal.done ? 'done' : 'missed';
    return 'pending';
  }

  return 'pending';
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export {
  addGoal,
  addBulkGoals,
  toggleGoal,
  deleteGoal,
  updateGoal,
  clearCompletedGoals,
  getTodayGoals,
  getGoalStatus,
  formatTime,
  addMinutes,
  uid,
  dk,
  today
};