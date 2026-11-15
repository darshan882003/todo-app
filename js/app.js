import { migrateFromLocalStorage, getAppData, saveAppData, getTodayGoals, addDayGoals, updateDayGoals, uid, dk } from './db.js';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let isInitialized = false;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('on'), 2400);
}

function niceDate(d = new Date()) { return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }); }
function pctOf(goals) { return goals.length ? Math.round(goals.filter(g => g.done).length / goals.length * 100) : 0; }

async function init() {
  if (isInitialized) return; isInitialized = true;
  await migrateFromLocalStorage();
  initUI();
  paintProfile();
  renderApp();
  window.renderApp = renderApp;
}

function initUI() {
  $('#wDate').textContent = niceDate(); $('#aDate').textContent = niceDate();
  const h = new Date().getHours();
  const greet = (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
  getAppData().then(d => {
    const name = d.profile?.name ? ', ' + d.profile.name : '';
    const pend = (d.days[dk()] || []).filter(t => !t.done).length;
    $('#wHi').textContent = greet + name + '.';
    $('#wHi').append(document.createElement('br'), d.days[dk()]?.length ? 'Keep going.' : "Let's plan your day.");
    if (d.days[dk()]?.length) {
      $('#wSub').textContent = pend ? pend + ' task' + (pend > 1 ? 's' : '') + ' still waiting for you.' : 'Everything is done. Nice work.';
      $('#startBtn').textContent = 'Continue';
    }
  });

  $('#startBtn').onclick = () => { document.body.classList.add('inapp'); go('app'); setTimeout(() => $('#oneIn').focus(), 300); };

  $$('.tabs button').forEach(b => b.onclick = () => {
    $$('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    $('#one').classList.toggle('on', b.dataset.t === 'one');
    $('#bulk').classList.toggle('on', b.dataset.t === 'bulk');
  });

  function addOne() {
    const v = $('#oneIn').value.trim(); if (!v) return toast('Type a task first');
    addGoal(v, $('#oneDefault').checked).then(() => { $('#oneIn').value = ''; $('#oneDefault').checked = false; renderApp(); $('#oneIn').focus(); });
  }
  $('#oneBtn').onclick = addOne;
  $('#oneIn').addEventListener('keydown', e => { if (e.key === 'Enter') addOne(); });

  $('#bulkBtn').onclick = () => {
    const lines = $('#bulkIn').value.split('\n').map(l => l.replace(/^\s*([-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
    if (!lines.length) return toast('Write at least one task');
    const isDefault = $('#bulkDefault').checked;
    addBulkGoals(lines, isDefault).then(goals => { $('#bulkIn').value = ''; $('#bulkDefault').checked = false; renderApp(); toast(goals.length + ' task' + (goals.length > 1 ? 's' : '') + ' added'); });
  };

  $('#clearDone').onclick = async () => {
    const n = (await getTodayGoals()).filter(t => t.done && !t.isDefault).length;
    if (!n) return toast('No completed tasks to clear');
    await clearCompletedGoals(dk()); renderApp();
  };

  $$('.menu').forEach(b => b.onclick = () => menu(true)); $('#scrim').onclick = () => menu(false);
  $$('.nav [data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  $('#meBtn').onclick = () => go('profile');

  $('#saveProf').onclick = () => { getAppData().then(data => { data.profile.name = $('#nameIn').value.trim(); data.profile.about = $('#aboutIn').value.trim(); saveAppData(data); paintProfile(); toast('Profile saved'); }); };

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

function go(page) {
  ['app', 'profile'].forEach(v => $('#' + v).classList.toggle('on', v === page));
  $('#welcome').classList.remove('on');
  $$('.nav [data-go]').forEach(b => b.classList.toggle('on', b.dataset.go === page));
  menu(false); window.scrollTo(0, 0);
  if (page === 'app') renderApp();
  else if (page === 'profile') paintProfile();
}

function menu(open) { $('#side').classList.toggle('open', open); $('#scrim').classList.toggle('on', open); }

function paintProfile() {
  getAppData().then(data => {
    const n = data.profile?.name || '', a = data.profile?.about || '', ch = (n || 'You').trim().charAt(0).toUpperCase();
    $('#pAv').textContent = ch; $('#sAv').textContent = ch;
    $('#pName').textContent = n || 'Add your name'; $('#sName').textContent = n || 'Your name';
    $('#pAbout').textContent = a || 'Add a goal or a line about you.'; $('#nameIn').value = n; $('#aboutIn').value = a;
    const days = Object.keys(data.days).filter(k => data.days[k].length);
    const added = days.reduce((a, k) => a + data.days[k].length, 0);
    const done = days.reduce((a, k) => a + data.days[k].filter(t => t.done).length, 0);
    const avg = days.length ? Math.round(days.reduce((a, k) => a + pctOf(data.days[k]), 0) / days.length) : 0;
    const best = days.reduce((m, k) => Math.max(m, pctOf(data.days[k])), 0);
    let streak = 0;
    for (let i = 0;; i++) { const d = new Date(); d.setDate(d.getDate() - i); const L = data.days[dk(d)] || []; if (L.length && pctOf(L) >= 50) streak++; else if (i === 0 && !L.length) continue; else break; }
    const st = [[days.length, 'Days tracked'], [added, 'Tasks added'], [done, 'Tasks completed'], [avg + '%', 'Average score'], [best + '%', 'Best day'], [streak, 'Day streak (50%+)']];
    $('#stats').innerHTML = st.map(x => '<div class="stat"><b>' + x[0] + '</b><span>' + x[1] + '</span></div>').join('');
  });
}

async function renderApp() {
  const L = await getTodayGoals(); const ul = $('#list'); ul.innerHTML = '';
  if (!L.length) { const e = document.createElement('li'); e.className = 'empty'; e.textContent = 'Nothing here yet. Add a task above to begin.'; ul.append(e); }
  else {
    L.forEach(t => {
      const li = document.createElement('li');
      li.className = 'item' + (t.done ? ' done' : '') + (t.isDefault ? ' default' : '');
      li.innerHTML = '<button class="chk" aria-label="Mark ' + (t.done ? 'undone' : 'done') + '"><svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg></button><span class="txt"></span>' + (t.isDefault ? '<span class="default-badge">●</span>' : '') + '<button class="del" aria-label="Delete task">×</button>';
      li.querySelector('.txt').textContent = t.t;
      const tog = () => {
        if (t.isDefault) return; // Default tasks can't be toggled off once done
        toggleGoal(dk(), t.id).then(() => { li.classList.toggle('done', !t.done); t.done = !t.done; score(); week(); if (navigator.vibrate) navigator.vibrate(15); });
      };
      li.querySelector('.chk').onclick = tog;
      li.querySelector('.txt').onclick = tog;
      li.querySelector('.del').onclick = () => {
        if (t.isDefault) return toast('Default tasks cannot be deleted');
        li.style.transition = '.25s'; li.style.opacity = 0; li.style.transform = 'translateX(40px)';
        setTimeout(async () => { await deleteGoal(dk(), t.id); renderApp(); }, 230);
      };
      ul.append(li);
    });
  }
  score(); week();
}

function score() { getTodayGoals().then(L => { const d = L.filter(t => t.done).length; const p = pctOf(L); $('#fg').style.strokeDashoffset = 327 - 327 * p / 100; $('#pct').textContent = p; $('#ring').classList.remove('full'); if (L.length && p === 100) { void $('#ring').offsetWidth; $('#ring').classList.add('full'); } let a, b; if (!L.length) { a = 'No tasks yet'; b = 'Add your first task below.'; } else { b = d + ' of ' + L.length + ' done'; a = p === 100 ? 'Perfect day!' : p >= 75 ? 'Almost there' : p >= 40 ? 'Good progress' : p > 0 ? 'Nice start' : 'Time to begin'; } $('#sTitle').textContent = a; $('#sSub').textContent = b; }); }

function week() {
  const w = $('#week'); w.innerHTML = '';
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const dateKey = dk(d); getAppData().then(data => { const L = data.days[dateKey] || []; const p = pctOf(L); const c = document.createElement('div'); c.innerHTML = '<span>' + (L.length ? p + '%' : '–') + '</span><i style="height:0"></i><span>' + d.toLocaleDateString(undefined, { weekday: 'narrow' }) + '</span>'; w.append(c); const bar = c.querySelector('i'); requestAnimationFrame(() => requestAnimationFrame(() => bar.style.height = Math.max(4, p * 0.5) + 'px')); }); }
}

/* ---- tasks ---- */
function addGoal(text, isDefault) { return addDayGoals(dk(), [{ id: uid(), t: text.slice(0,120), done: false, isDefault: !!isDefault, createdAt: Date.now() }]); }
function addBulkGoals(lines, isDefault) { const goals = lines.map(t => ({ id: uid(), t: t.slice(0,120), done: false, isDefault: !!isDefault, createdAt: Date.now() })); return addDayGoals(dk(), goals); }
function toggleGoal(dayKey, goalId) { return getAppData().then(data => { const goals = data.days[dayKey]; if (!goals) return; const goal = goals.find(g => g.id === goalId); if (!goal || goal.isDefault) return; goal.done = !goal.done; return saveAppData(data).then(() => goal); }); }
function deleteGoal(dayKey, goalId) { return getAppData().then(data => { const goals = data.days[dayKey]; if (!goals) return; const idx = goals.findIndex(g => g.id === goalId); if (idx === -1) return; if (goals[idx].isDefault) return; goals.splice(idx, 1); return saveAppData(data); }); }
function clearCompletedGoals(dayKey) { return getAppData().then(data => { const goals = data.days[dayKey]; if (!goals) return 0; const nonDefaultCompleted = goals.filter(g => g.done && !g.isDefault).length; data.days[dayKey] = goals.filter(g => !g.done || g.isDefault); return saveAppData(data).then(() => nonDefaultCompleted); }); }

/* ---- daily reset ---- */
function checkDailyReset() {
  getAppData().then(data => {
    const todayKey = dk();
    const lastReset = data.lastReset || '';
    if (lastReset === todayKey) return;
    // Reset default tasks for today
    if (data.days[todayKey]) {
      data.days[todayKey].forEach(t => {
        if (t.isDefault) { t.done = false; }
      });
    }
    data.lastReset = todayKey;
    saveAppData(data);
  });
}

// Run reset check on init and visibility change
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDailyReset(); });

document.addEventListener('DOMContentLoaded', async () => {
  await init();
  checkDailyReset();
});