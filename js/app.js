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
  renderDefaults();
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

  $('#addDefaultBtn')?.addEventListener('click', () => openDefaultEditor());

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

function go(page) {
  ['app', 'profile', 'defaults'].forEach(v => $('#' + v).classList.toggle('on', v === page));
  $('#welcome').classList.remove('on');
  $$('.nav [data-go]').forEach(b => b.classList.toggle('on', b.dataset.go === page));
  menu(false); window.scrollTo(0, 0);
  if (page === 'app') renderApp();
  else if (page === 'profile') paintProfile();
  else if (page === 'defaults') renderDefaults();
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
        toggleGoal(dk(), t.id).then(() => { li.classList.toggle('done', !t.done); t.done = !t.done; score(); week(); if (navigator.vibrate) navigator.vibrate(15); });
      };
      li.querySelector('.chk').onclick = tog;
      li.querySelector('.txt').onclick = tog;
      li.querySelector('.del').onclick = () => {
        li.style.transition = '.25s'; li.style.opacity = 0; li.style.transform = 'translateX(40px)';
        setTimeout(async () => { await deleteGoal(dk(), t.id); renderApp(); }, 230);
      };
      ul.append(li);
    });
  }
  score(); week();
}

async function renderDefaults() {
  const data = await getAppData();
  const container = $('#defaultList');
  if (!data.defaultGoals?.length) {
    container.innerHTML = '<p class="empty">No default goals yet. Add one above.</p>';
    return;
  }
  container.innerHTML = data.defaultGoals.map(g => `
    <div class="default-item" data-id="${g.id}">
      <div class="default-info">
        <input type="checkbox" class="default-toggle" ${g.enabled ? 'checked' : ''} data-id="${g.id}">
        <span class="default-text">${escapeHtml(g.t)}</span>
      </div>
      <button class="default-del" data-id="${g.id}" aria-label="Delete">×</button>
    </div>
  `).join('');

  $$('#defaultList .default-toggle').forEach(t => t.onchange = async () => {
    const d = await getAppData();
    const g = d.defaultGoals.find(x => x.id === t.dataset.id);
    if (g) { g.enabled = t.checked; await saveAppData(d); toast(t.checked ? 'Enabled' : 'Disabled'); }
  });

  $$('#defaultList .default-del').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this default goal?')) return;
    const d = await getAppData();
    d.defaultGoals = d.defaultGoals.filter(x => x.id !== b.dataset.id);
    await saveAppData(d);
    // Also remove from today if present
    const todayKey = dk();
    if (d.days[todayKey]) {
      d.days[todayKey] = d.days[todayKey].filter(t => t.defaultId !== b.dataset.id);
    }
    await saveAppData(d);
    renderDefaults();
    renderApp();
    toast('Deleted');
  });
}

async function openDefaultEditor(id = null) {
  const isNew = !id;
  const sheet = $('#editSheet') || createEditSheet();
  const panel = $('#editPanel');
  if (!sheet || !panel) return;

  panel.innerHTML = `
    <h3>${isNew ? 'Add' : 'Edit'} Default Goal</h3>
    <div class="edit-field"><label>Goal name</label><input type="text" id="dName" maxlength="120" placeholder="e.g. Morning walk"></div>
    <div class="edit-field"><label><input type="checkbox" id="dEnabled" checked> Enabled</label></div>
    <div class="edit-actions"><button class="btn" id="cancelD">Cancel</button><button class="btn" id="saveD">${isNew ? 'Add' : 'Save'}</button></div>
  `;

  if (!isNew) {
    const d = await getAppData();
    const g = d.defaultGoals.find(x => x.id === id);
    if (g) { $('#dName').value = g.t; $('#dEnabled').checked = g.enabled; }
  }

  $('#cancelD').onclick = () => sheet.classList.remove('on');
  $('#saveD').onclick = async () => {
    const name = $('#dName').value.trim();
    if (!name) return toast('Enter a name');
    const d = await getAppData();
    if (!d.defaultGoals) d.defaultGoals = [];

    if (isNew) {
      d.defaultGoals.push({ id: uid(), t: name, enabled: $('#dEnabled').checked });
    } else {
      const g = d.defaultGoals.find(x => x.id === id);
      if (g) { g.t = name; g.enabled = $('#dEnabled').checked; }
    }
    await saveAppData(d);
    toast(isNew ? 'Added' : 'Saved');
    sheet.classList.remove('on');
    renderDefaults();
  };

  sheet.classList.add('on');
}

function createEditSheet() {
  const s = document.createElement('div');
  s.className = 'sheet edit-sheet';
  s.id = 'editSheet';
  s.innerHTML = '<div class="panel edit-panel" id="editPanel"></div>';
  document.body.appendChild(s);
  return s;
}

function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

function score() { getTodayGoals().then(L => { const d = L.filter(t => t.done).length; const p = pctOf(L); $('#fg').style.strokeDashoffset = 327 - 327 * p / 100; $('#pct').textContent = p; $('#ring').classList.remove('full'); if (L.length && p === 100) { void $('#ring').offsetWidth; $('#ring').classList.add('full'); } let a, b; if (!L.length) { a = 'No tasks yet'; b = 'Add your first task below.'; } else { b = d + ' of ' + L.length + ' done'; a = p === 100 ? 'Perfect day!' : p >= 75 ? 'Almost there' : p >= 40 ? 'Good progress' : p > 0 ? 'Nice start' : 'Time to begin'; } $('#sTitle').textContent = a; $('#sSub').textContent = b; }); }

function week() {
  const w = $('#week'); w.innerHTML = '';
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const dateKey = dk(d); getAppData().then(data => { const L = data.days[dateKey] || []; const p = pctOf(L); const c = document.createElement('div'); c.innerHTML = '<span>' + (L.length ? p + '%' : '–') + '</span><i style="height:0"></i><span>' + d.toLocaleDateString(undefined, { weekday: 'narrow' }) + '</span>'; w.append(c); const bar = c.querySelector('i'); requestAnimationFrame(() => requestAnimationFrame(() => bar.style.height = Math.max(4, p * 0.5) + 'px')); }); }
}

/* ---- tasks ---- */
function addGoal(text, isDefault) { return addDayGoals(dk(), [{ id: uid(), t: text.slice(0,120), done: false, isDefault: !!isDefault, defaultId: isDefault ? uid() : null, createdAt: Date.now() }]); }
function addBulkGoals(lines, isDefault) { const goals = lines.map(t => ({ id: uid(), t: t.slice(0,120), done: false, isDefault: !!isDefault, defaultId: isDefault ? uid() : null, createdAt: Date.now() })); return addDayGoals(dk(), goals); }
function toggleGoal(dayKey, goalId) { return getAppData().then(data => { const goals = data.days[dayKey]; if (!goals) return; const goal = goals.find(g => g.id === goalId); if (!goal) return; goal.done = !goal.done; return saveAppData(data).then(() => goal); }); }
function deleteGoal(dayKey, goalId) { return getAppData().then(data => { const goals = data.days[dayKey]; if (!goals) return; const idx = goals.findIndex(g => g.id === goalId); if (idx === -1) return; goals.splice(idx, 1); return saveAppData(data); }); }
function clearCompletedGoals(dayKey) { return getAppData().then(data => { const goals = data.days[dayKey]; if (!goals) return 0; const nonDefaultCompleted = goals.filter(g => g.done && !g.isDefault).length; data.days[dayKey] = goals.filter(g => !g.done || g.isDefault); return saveAppData(data).then(() => nonDefaultCompleted); }); }

/* ---- daily reset ---- */
function checkDailyReset() {
  getAppData().then(data => {
    const todayKey = dk();
    const lastReset = data.lastReset || '';
    if (lastReset === todayKey) return;

    // Add enabled default goals to today
    const todayGoals = data.days[todayKey] || [];
    const existingDefaultIds = new Set(todayGoals.filter(t => t.isDefault).map(t => t.defaultId));

    for (const dg of (data.defaultGoals || [])) {
      if (!dg.enabled) continue;
      if (existingDefaultIds.has(dg.id)) continue;
      todayGoals.push({ id: uid(), t: dg.t, done: false, isDefault: true, defaultId: dg.id, createdAt: Date.now() });
    }

    data.days[todayKey] = todayGoals;
    data.lastReset = todayKey;
    saveAppData(data);
  });
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDailyReset(); });

document.addEventListener('DOMContentLoaded', async () => {
  await init();
  checkDailyReset();
});