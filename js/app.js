/**
 * Main application entry point
 * Initializes all modules and handles UI interactions
 */

console.log('app.js loading...');
alert('app.js loaded - JS is running');

import { getAppData, saveAppData, migrateFromLocalStorage, getSettings, saveSettings } from './db.js';
import { loadLockState, initLockUI, lockApp, verifyCurrentPin, updatePin, toggleLock, setAutoLockDelay, setHideNotifications, resetAutoLockTimer } from './lock.js';
import { addGoal, addBulkGoals, toggleGoal, deleteGoal, updateGoal, clearCompletedGoals, getTodayGoals, getGoalStatus, formatTime, dk, today } from './tasks.js';
import { pctOf, getDayScore, getAllScores, getWeeklyAverage, getMonthlyAverage, getStreak, getLongestStreak, getBestDay, getLowestDay, getTotalStats, getScoreMessage } from './score.js';
import { loadNotificationSettings, askPermission, scheduleGoalNotifications, checkAndSendReminders, startPeriodicCheck, handleNotificationAction, showNotification } from './notifications.js';
import { autoFillToday, getRoutineGoals, createRoutineGoal, updateRoutineGoalById, deleteRoutineGoalById, toggleRoutineGoal, skipRoutineToday, carryOverIncomplete, renderRoutineList, openEditRoutineSheet, closeEditRoutineSheet } from './routine.js';
import { initTimelineToggle, renderCurrentView, getCurrentView } from './timeline.js';
import { loadCategories, getCategories, createCategory, updateCategoryById, deleteCategoryById, renderCategoryPicker, renderCategoryManager, openCategorySheet, closeCategorySheet } from './categories.js';
import { checkBadges, getEarnedBadges, getAllBadges, renderBadges } from './badges.js';
import { exportBackup, importBackup, setupBackupUI } from './backup.js';
import { initReportUI, renderReportPreview } from './report.js';

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

let currentView = 'app';
let isInitialized = false;

function toast(msg) {
  const t = $('#toast');
  if (t) {
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast.h);
    toast.h = setTimeout(() => t.classList.remove('on'), 2400);
  }
}

function niceDate(d = new Date()) {
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

async function init() {
  if (isInitialized) return;
  isInitialized = true;

  await migrateFromLocalStorage();
  await loadLockState();
  initLockUI();
  await loadNotificationSettings();
  await loadCategories();
  await autoFillToday();
  await checkBadges();

  initUI();
  initTimelineToggle();
  initReportUI();
  setupBackupUI();
  startPeriodicCheck();

  applyTheme();
  paintProfile();
  renderApp();

  window.renderApp = renderApp;
}

function initUI() {
  $('#wDate').textContent = niceDate();
  $('#aDate').textContent = niceDate();

  const h = new Date().getHours();
  const greet = (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
  const data = getAppData().then(d => d);
  data.then(d => {
    const name = d.profile?.name ? ', ' + d.profile.name : '';
    const pend = (d.days[dk()] || []).filter(t => !t.done).length;
    $('#wHi').textContent = greet + name + '.';
    $('#wHi').append(document.createElement('br'), d.days[dk()]?.length ? 'Keep going.' : "Let's plan your day.");
    if (d.days[dk()]?.length) {
      $('#wSub').textContent = pend ? pend + ' task' + (pend > 1 ? 's' : '') + ' still waiting for you.' : 'Everything is done. Nice work.';
      $('#startBtn').textContent = 'Continue';
    }
  });

  $('#startBtn').onclick = () => {
    document.body.classList.add('inapp');
    go('app');
    setTimeout(() => $('#oneIn').focus(), 300);
  };

  $$('.tabs button').forEach(b => b.onclick = () => {
    $$('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    $('#one').classList.toggle('on', b.dataset.t === 'one');
    $('#bulk').classList.toggle('on', b.dataset.t === 'bulk');
  });

  function addOne() {
    const v = $('#oneIn').value.trim();
    if (!v) return toast('Type a task first');
    addGoal(v).then(() => {
      $('#oneIn').value = '';
      renderApp();
      $('#oneIn').focus();
    });
  }
  $('#oneBtn').onclick = addOne;
  $('#oneIn').addEventListener('keydown', e => { if (e.key === 'Enter') addOne(); });

  $('#bulkBtn').onclick = () => {
    const lines = $('#bulkIn').value.split('\n')
      .map(l => l.replace(/^\s*([-*•]|\d+[.)])\s*/, '').trim())
      .filter(Boolean);
    if (!lines.length) return toast('Write at least one task');
    addBulkGoals(lines).then(goals => {
      $('#bulkIn').value = '';
      renderApp();
      toast(goals.length + ' task' + (goals.length > 1 ? 's' : '') + ' added');
    });
  };

  $('#clearDone').onclick = async () => {
    const n = (await getTodayGoals()).filter(t => t.done).length;
    if (!n) return toast('No completed tasks');
    await clearCompletedGoals(dk());
    renderApp();
  };

  $('#setBtn').onclick = () => {
    paintSettings();
    $('#sheet').classList.add('on');
  };
  $('#closeSheet').onclick = () => $('#sheet').classList.remove('on');
  $('#sheet').onclick = e => { if (e.target.id === 'sheet') $('#sheet').classList.remove('on'); };

  $('#tg').onclick = async () => {
    const data = await getAppData();
    if (!data.remind.on && !(await askPermission())) return;
    data.remind.on = !data.remind.on;
    await saveAppData(data);
    paintSettings();
    toast(data.remind.on ? 'Reminder on for ' + data.remind.time : 'Reminder off');
  };
  $('#rt').onchange = e => {
    getAppData().then(data => {
      data.remind.time = e.target.value || '20:00';
      data.remind.last = '';
      saveAppData(data);
    });
  };
  $('#testBtn').onclick = async () => {
    if (!(await askPermission())) return;
    const ok = await showNotification('Today', 'This is a test reminder. It works!');
    if (!ok) toast('Could not show the notification');
  };

  $$('.menu').forEach(b => b.onclick = () => menu(true));
  $('#scrim').onclick = () => menu(false);

  $$('.nav [data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  $('#meBtn').onclick = () => go('profile');
  $('#navRem').onclick = () => { menu(false); paintSettings(); $('#sheet').classList.add('on'); };
  $('#navRoutine').onclick = () => { menu(false); go('routine'); };
  $('#navReport').onclick = () => { menu(false); go('report'); };
  $('#navSecurity').onclick = () => { menu(false); go('security'); };
  $('#navCategories').onclick = () => { menu(false); go('categories'); };
  $('#navBadges').onclick = () => { menu(false); go('badges'); };
  $('#navBackup').onclick = () => { menu(false); go('backup'); };

  $$('#seg button').forEach(b => b.onclick = () => {
    getAppData().then(data => {
      data.theme = b.dataset.th;
      saveAppData(data);
      applyTheme();
    });
  });

  $('#saveProf').onclick = () => {
    getAppData().then(data => {
      data.profile.name = $('#nameIn').value.trim();
      data.profile.about = $('#aboutIn').value.trim();
      saveAppData(data);
      paintProfile();
      toast('Profile saved');
    });
  };

  $('#addRoutineBtn')?.addEventListener('click', () => openEditRoutineSheet());
  $('#carryOverBtn')?.addEventListener('click', carryOverIncomplete);

  $('#lockNowBtn')?.addEventListener('click', lockApp);

  $('#changePinBtn')?.addEventListener('click', async () => {
    const current = prompt('Enter current PIN:');
    if (!current) return;
    const valid = await verifyCurrentPin(current);
    if (!valid) return toast('Incorrect PIN');
    const newPin = prompt('Enter new 6-digit PIN:');
    if (!newPin || newPin.length !== 6 || !/^\d+$/.test(newPin)) return toast('Invalid PIN');
    const confirm = prompt('Confirm new PIN:');
    if (newPin !== confirm) return toast('PINs do not match');
    await updatePin(newPin);
    toast('PIN changed');
  });

  $('#toggleLock')?.addEventListener('change', async (e) => {
    await toggleLock(e.target.checked);
  });

  $('#autoLockDelay')?.addEventListener('change', async (e) => {
    await setAutoLockDelay(parseInt(e.target.value) * 1000);
  });

  $('#hideNotifLocked')?.addEventListener('change', async (e) => {
    await setHideNotifications(e.target.checked);
  });

  $('#addCategoryBtn')?.addEventListener('click', () => openCategorySheet());

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});

    navigator.serviceWorker.addEventListener('message', async (event) => {
      if (event.data?.type === 'notification-action') {
        const { action, goalId, dayKey } = event.data;
        await handleNotificationAction(action, goalId, dayKey);
        renderApp();
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkAndSendReminders();
      autoFillToday();
      checkBadges();
      resetAutoLockTimer();
    }
  });
}

function applyTheme() {
  getAppData().then(data => {
    const t = data.theme || 'dark';
    const d = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = d ? 'dark' : 'light';
    $('meta[name=theme-color]').content = d ? '#0e0f23' : '#f4f5fc';
    $$('#seg button').forEach(b => b.classList.toggle('on', b.dataset.th === t));
  });
}

function go(page) {
  ['app', 'profile', 'routine', 'report', 'security', 'categories', 'badges', 'backup'].forEach(v => {
    const el = $('#' + v);
    if (el) el.classList.toggle('on', v === page);
  });
  $('#welcome').classList.remove('on');
  $$('.nav [data-go]').forEach(b => b.classList.toggle('on', b.dataset.go === page));
  menu(false);
  window.scrollTo(0, 0);

  if (page === 'app') renderApp();
  else if (page === 'profile') paintProfile();
  else if (page === 'routine') renderRoutineList();
  else if (page === 'report') renderReportPreview();
  else if (page === 'categories') renderCategoryManager();
  else if (page === 'badges') renderBadges();
}

function menu(open) {
  $('#side').classList.toggle('open', open);
  $('#scrim').classList.toggle('on', open);
}

function paintSettings() {
  getAppData().then(data => {
    $('#tg').classList.toggle('on', data.remind?.on);
    $('#rt').value = data.remind?.time || '20:00';
  });
}

function paintProfile() {
  getAppData().then(data => {
    const n = data.profile?.name || '';
    const a = data.profile?.about || '';
    const ch = (n || 'You').trim().charAt(0).toUpperCase();
    $('#pAv').textContent = ch;
    $('#sAv').textContent = ch;
    $('#pName').textContent = n || 'Add your name';
    $('#sName').textContent = n || 'Your name';
    $('#pAbout').textContent = a || 'Add a goal or a line about you.';
    $('#nameIn').value = n;
    $('#aboutIn').value = a;

    const days = Object.keys(data.days).filter(k => data.days[k].length);
    const added = days.reduce((a, k) => a + data.days[k].length, 0);
    const done = days.reduce((a, k) => a + data.days[k].filter(t => t.done).length, 0);
    const avg = days.length ? Math.round(days.reduce((a, k) => a + pctOf(data.days[k]), 0) / days.length) : 0;
    const best = days.reduce((m, k) => Math.max(m, pctOf(data.days[k])), 0);
    let streak = 0;
    for (let i = 0;; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const L = data.days[dk(d)] || [];
      if (L.length && pctOf(L) >= 50) streak++;
      else if (i === 0 && !L.length) continue;
      else break;
    }

    const st = [
      [days.length, 'Days tracked'],
      [added, 'Tasks added'],
      [done, 'Tasks completed'],
      [avg + '%', 'Average score'],
      [best + '%', 'Best day'],
      [streak, 'Day streak (50%+)']
    ];
    $('#stats').innerHTML = st.map(x => '<div class="stat"><b>' + x[0] + '</b><span>' + x[1] + '</span></div>').join('');
  });
}

async function renderApp() {
  const L = await getTodayGoals();
  const ul = $('#list');
  ul.innerHTML = '';

  if (!L.length) {
    const e = document.createElement('li');
    e.className = 'empty';
    e.textContent = 'Nothing here yet. Add a task above to begin.';
    ul.append(e);
  } else {
    L.forEach(t => {
      const li = document.createElement('li');
      li.className = 'item' + (t.done ? ' done' : '');
      li.innerHTML = `
        <button class="chk" aria-label="Mark ${t.done ? 'undone' : 'done'}">
          <svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg>
        </button>
        <span class="txt"></span>
        <button class="del" aria-label="Delete task">×</button>
      `;
      li.querySelector('.txt').textContent = t.t;

      const tog = () => {
        toggleGoal(dk(), t.id).then(() => {
          li.classList.toggle('done', !t.done);
          t.done = !t.done;
          score();
          week();
          if (navigator.vibrate) navigator.vibrate(15);
        });
      };
      li.querySelector('.chk').onclick = tog;
      li.querySelector('.txt').onclick = tog;

      li.querySelector('.del').onclick = () => {
        li.style.transition = '.25s';
        li.style.opacity = 0;
        li.style.transform = 'translateX(40px)';
        setTimeout(async () => {
          await deleteGoal(dk(), t.id);
          renderApp();
        }, 230);
      };
      ul.append(li);
    });
  }
  score();
  week();
}

function score() {
  getTodayGoals().then(L => {
    const d = L.filter(t => t.done).length;
    const p = pctOf(L);
    $('#fg').style.strokeDashoffset = 327 - 327 * p / 100;
    $('#pct').textContent = p;
    $('#ring').classList.remove('full');
    if (L.length && p === 100) {
      void $('#ring').offsetWidth;
      $('#ring').classList.add('full');
    }
    const msg = getScoreMessage(p, L.length);
    $('#sTitle').textContent = msg.title;
    $('#sSub').textContent = msg.subtitle;
  });
}

function week() {
  const w = $('#week');
  w.innerHTML = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateKey = dk(d);
    getAppData().then(data => {
      const L = data.days[dateKey] || [];
      const p = pctOf(L);
      const c = document.createElement('div');
      c.innerHTML = '<span>' + (L.length ? p + '%' : '–') + '</span><i style="height:0"></i><span>' + d.toLocaleDateString(undefined, { weekday: 'narrow' }) + '</span>';
      w.append(c);
      const bar = c.querySelector('i');
      requestAnimationFrame(() => requestAnimationFrame(() => bar.style.height = Math.max(4, p * 0.5) + 'px'));
    });
  }
}

document.addEventListener('DOMContentLoaded', init);