/**
 * Routine / Default Daily Goals management
 * Handles recurring goals with repeat rules
 */

import { getAppData, saveAppData, addRoutineGoal, updateRoutineGoal, deleteRoutineGoal, getSettings, saveSettings } from './db.js';
import { addGoal, dk, today } from './tasks.js';

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

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const REPEAT_OPTIONS = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays (Mon-Fri)' },
  { value: 'weekends', label: 'Weekends (Sat-Sun)' },
  { value: 'custom', label: 'Custom days...' }
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function matchesRepeatRule(rule, date) {
  const day = date.getDay(); // 0 = Sun
  switch (rule.type) {
    case 'daily':
      return true;
    case 'weekdays':
      return day >= 1 && day <= 5;
    case 'weekends':
      return day === 0 || day === 6;
    case 'custom':
      return rule.days?.includes(day) ?? false;
    default:
      return false;
  }
}

function getDaysSinceStart(startDate, date) {
  const start = new Date(startDate);
  const target = new Date(date);
  start.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.floor((target - start) / (1000 * 60 * 60 * 24));
}

async function autoFillToday() {
  const data = await getAppData();
  const todayKey = today();
  const todayDate = new Date();

  if (data.days[todayKey] && data.days[todayKey].length > 0) {
    return; // Already has goals for today
  }

  const routine = data.routine || [];
  const goalsToAdd = [];

  for (const routineGoal of routine) {
    if (!routineGoal.enabled) continue;
    if (!matchesRepeatRule(routineGoal.repeat, todayDate)) continue;

    const daysSinceStart = getDaysSinceStart(routineGoal.startDate, todayDate);
    if (daysSinceStart < 0) continue;

    if (routineGoal.skipDates?.includes(todayKey)) continue;

    goalsToAdd.push({
      t: routineGoal.t,
      startTime: routineGoal.startTime,
      duration: routineGoal.duration,
      deadline: routineGoal.deadline,
      priority: routineGoal.priority,
      category: routineGoal.category,
      subtasks: routineGoal.subtasks?.map(s => ({ ...s, done: false })) || [],
      note: routineGoal.note,
      routineId: routineGoal.id,
      streak: routineGoal.streak || 0
    });
  }

  if (goalsToAdd.length > 0) {
    data.days[todayKey] = goalsToAdd.map(g => ({
      ...g,
      id: uid(),
      done: false,
      status: 'pending',
      createdAt: Date.now()
    }));
    await saveAppData(data);
  }
}

async function getRoutineGoals() {
  const data = await getAppData();
  return data.routine || [];
}

async function createRoutineGoal(goalData) {
  const routineGoal = {
    id: uid(),
    t: goalData.t,
    startTime: goalData.startTime || null,
    duration: goalData.duration || null,
    deadline: goalData.deadline || null,
    priority: goalData.priority || 'medium',
    category: goalData.category || null,
    subtasks: goalData.subtasks || [],
    note: goalData.note || '',
    repeat: goalData.repeat || { type: 'daily' },
    startDate: goalData.startDate || today(),
    skipDates: [],
    enabled: true,
    streak: 0,
    createdAt: Date.now()
  };

  await addRoutineGoal(routineGoal);
  return routineGoal;
}

async function updateRoutineGoalById(id, updates) {
  const data = await getAppData();
  const index = data.routine.findIndex(g => g.id === id);
  if (index === -1) return;

  Object.assign(data.routine[index], updates);
  await saveAppData(data);
}

async function deleteRoutineGoalById(id) {
  const data = await getAppData();
  data.routine = data.routine.filter(g => g.id !== id);
  await saveAppData(data);
}

async function toggleRoutineGoal(id, enabled) {
  await updateRoutineGoalById(id, { enabled });
}

async function skipRoutineToday(id) {
  const todayKey = today();
  const data = await getAppData();
  const goal = data.routine.find(g => g.id === id);
  if (!goal) return;

  goal.skipDates = goal.skipDates || [];
  if (!goal.skipDates.includes(todayKey)) {
    goal.skipDates.push(todayKey);
    await saveAppData(data);
  }

  // Also remove from today's goals if it was auto-filled
  if (data.days[todayKey]) {
    data.days[todayKey] = data.days[todayKey].filter(g => g.routineId !== id);
    await saveAppData(data);
  }
}

async function carryOverIncomplete() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = dk(yesterday);

  const data = await getAppData();
  const yesterdayGoals = data.days[yesterdayKey] || [];
  const incomplete = yesterdayGoals.filter(g => !g.done && g.routineId);

  if (incomplete.length === 0) {
    toast('No incomplete routine goals from yesterday');
    return;
  }

  const todayKey = today();
  if (!data.days[todayKey]) data.days[todayKey] = [];

  for (const goal of incomplete) {
    const exists = data.days[todayKey].some(g => g.routineId === goal.routineId);
    if (!exists) {
      data.days[todayKey].push({
        ...goal,
        id: uid(),
        done: false,
        status: 'pending',
        createdAt: Date.now()
      });
    }
  }

  await saveAppData(data);
  toast(`${incomplete.length} goal${incomplete.length > 1 ? 's' : ''} carried over`);
}

async function updateRoutineStreak(routineId, completed) {
  const data = await getAppData();
  const goal = data.routine.find(g => g.id === routineId);
  if (!goal) return;

  if (completed) {
    goal.streak = (goal.streak || 0) + 1;
  } else {
    goal.streak = 0;
  }
  await saveAppData(data);
}

function renderRoutineList() {
  return getRoutineGoals().then(goals => {
    const container = $('#routineList');
    if (!container) return;

    if (!goals.length) {
      container.innerHTML = '<p class="empty">No routine goals yet. Add one to get started.</p>';
      return;
    }

    container.innerHTML = goals.map((goal, index) => `
      <div class="routine-item" data-id="${goal.id}">
        <div class="routine-info">
          <div class="routine-name">${escapeHtml(goal.t)}</div>
          <div class="routine-meta">
            ${goal.startTime ? `<span class="routine-time">${formatTime(goal.startTime)}${goal.duration ? ` · ${goal.duration}min` : ''}</span>` : ''}
            ${goal.deadline ? `<span class="routine-time">Due by ${formatTime(goal.deadline)}</span>` : ''}
            <span class="routine-days">${getRepeatLabel(goal.repeat)}</span>
            ${goal.streak ? `<span class="routine-streak">🔥 ${goal.streak}</span>` : ''}
          </div>
        </div>
        <div class="routine-toggle ${goal.enabled ? 'on' : ''}" data-id="${goal.id}"></div>
        <button class="routine-edit" data-id="${goal.id}" aria-label="Edit">✎</button>
      </div>
    `).join('');

    $$('#routineList .routine-toggle').forEach(toggle => {
      toggle.addEventListener('click', async () => {
        const id = toggle.dataset.id;
        const enabled = !toggle.classList.contains('on');
        await toggleRoutineGoal(id, enabled);
        toggle.classList.toggle('on', enabled);
        toast(enabled ? 'Routine goal enabled' : 'Routine goal disabled');
      });
    });

    $$('#routineList .routine-edit').forEach(btn => {
      btn.addEventListener('click', () => openEditRoutineSheet(btn.dataset.id));
    });
  });
}

function getRepeatLabel(repeat) {
  const option = REPEAT_OPTIONS.find(o => o.value === repeat.type);
  if (!option) return 'Custom';
  if (repeat.type === 'custom' && repeat.days) {
    return repeat.days.map(d => DAYS[d]).join(', ');
  }
  return option.label;
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function openEditRoutineSheet(routineId = null) {
  const sheet = $('#editSheet');
  const panel = $('#editPanel');
  if (!sheet || !panel) return;

  const isNew = !routineId;
  panel.innerHTML = `
    <h3>${isNew ? 'Add Routine Goal' : 'Edit Routine Goal'}</h3>
    <div class="edit-field">
      <label for="routineName">Goal name</label>
      <input type="text" id="routineName" maxlength="120" placeholder="e.g. Morning walk" autocomplete="off">
    </div>
    <div class="edit-field">
      <label for="routineTime">Start time (optional)</label>
      <input type="time" id="routineTime">
    </div>
    <div class="edit-field">
      <label for="routineDuration">Duration in minutes (optional)</label>
      <input type="number" id="routineDuration" min="1" max="1440" placeholder="30">
    </div>
    <div class="edit-field">
      <label for="routineDeadline">Deadline (optional)</label>
      <input type="time" id="routineDeadline">
    </div>
    <div class="edit-field">
      <label for="routinePriority">Priority</label>
      <select id="routinePriority">
        <option value="low">Low</option>
        <option value="medium" selected>Medium</option>
        <option value="high">High</option>
      </select>
    </div>
    <div class="edit-field">
      <label for="routineRepeat">Repeat</label>
      <select id="routineRepeat">
        ${REPEAT_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
      </select>
    </div>
    <div class="edit-field custom-days" style="display:none">
      <label>Custom days</label>
      <div class="day-picker">
        ${DAYS.map((d, i) => `<button type="button" class="day-btn" data-day="${i}">${d}</button>`).join('')}
      </div>
    </div>
    <div class="edit-field">
      <label for="routineStartDate">Start from</label>
      <input type="date" id="routineStartDate" value="${today()}">
    </div>
    <div class="edit-field">
      <label for="routineNote">Note (optional)</label>
      <input type="text" id="routineNote" maxlength="200" placeholder="e.g. Around the park">
    </div>
    <div class="edit-actions">
      <button class="btn" id="cancelRoutine">Cancel</button>
      <button class="btn" id="saveRoutine">${isNew ? 'Add' : 'Save'}</button>
    </div>
  `;

  if (!isNew) {
    getRoutineGoals().then(goals => {
      const goal = goals.find(g => g.id === routineId);
      if (!goal) return;
      $('#routineName').value = goal.t;
      $('#routineTime').value = goal.startTime || '';
      $('#routineDuration').value = goal.duration || '';
      $('#routineDeadline').value = goal.deadline || '';
      $('#routinePriority').value = goal.priority;
      $('#routineRepeat').value = goal.repeat.type;
      $('#routineStartDate').value = goal.startDate;
      $('#routineNote').value = goal.note || '';
      if (goal.repeat.type === 'custom') {
        $('.custom-days').style.display = 'block';
        goal.repeat.days?.forEach(d => {
          $(`.day-btn[data-day="${d}"]`)?.classList.add('on');
        });
      }
    });
  }

  $('#routineRepeat').addEventListener('change', (e) => {
    $('.custom-days').style.display = e.target.value === 'custom' ? 'block' : 'none';
  });

  $$('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('on'));
  });

  $('#cancelRoutine').addEventListener('click', () => closeEditRoutineSheet());
  $('#saveRoutine').addEventListener('click', async () => {
    const name = $('#routineName').value.trim();
    if (!name) return toast('Enter a goal name');

    const repeatType = $('#routineRepeat').value;
    const repeat = { type: repeatType };
    if (repeatType === 'custom') {
      const days = $$('.day-btn.on').map(b => parseInt(b.dataset.day));
      if (!days.length) return toast('Select at least one day');
      repeat.days = days;
    }

    const goalData = {
      t: name,
      startTime: $('#routineTime').value || null,
      duration: parseInt($('#routineDuration').value) || null,
      deadline: $('#routineDeadline').value || null,
      priority: $('#routinePriority').value,
      category: null,
      subtasks: [],
      note: $('#routineNote').value.trim() || '',
      repeat,
      startDate: $('#routineStartDate').value
    };

    if (isNew) {
      await createRoutineGoal(goalData);
      toast('Routine goal added');
    } else {
      await updateRoutineGoalById(routineId, goalData);
      toast('Routine goal updated');
    }

    closeEditRoutineSheet();
    renderRoutineList();
  });

  sheet.classList.add('on');
}

function closeEditRoutineSheet() {
  $('#editSheet')?.classList.remove('on');
}

export {
  autoFillToday,
  getRoutineGoals,
  createRoutineGoal,
  updateRoutineGoalById,
  deleteRoutineGoalById,
  toggleRoutineGoal,
  skipRoutineToday,
  carryOverIncomplete,
  updateRoutineStreak,
  renderRoutineList,
  openEditRoutineSheet,
  closeEditRoutineSheet,
  REPEAT_OPTIONS,
  DAYS
};