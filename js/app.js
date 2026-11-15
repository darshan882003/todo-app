import { migrateFromLocalStorage, getAppData, saveAppData, getTodayGoals, addDayGoals, updateDayGoals, addRoutineGoal, updateRoutineGoal, deleteRoutineGoal, uid, dk, today } from './db.js';

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
  applyTheme();
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
    addGoal(v).then(() => { $('#oneIn').value = ''; renderApp(); $('#oneIn').focus(); });
  }
  $('#oneBtn').onclick = addOne;
  $('#oneIn').addEventListener('keydown', e => { if (e.key === 'Enter') addOne(); });

  $('#bulkBtn').onclick = () => {
    const lines = $('#bulkIn').value.split('\n').map(l => l.replace(/^\s*([-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
    if (!lines.length) return toast('Write at least one task');
    addBulkGoals(lines).then(goals => { $('#bulkIn').value = ''; renderApp(); toast(goals.length + ' task' + (goals.length > 1 ? 's' : '') + ' added'); });
  };

  $('#clearDone').onclick = async () => {
    const n = (await getTodayGoals()).filter(t => t.done).length;
    if (!n) return toast('No completed tasks');
    await clearCompletedGoals(dk()); renderApp();
  };

  $('#setBtn').onclick = () => { paintSettings(); $('#sheet').classList.add('on'); };
  $('#closeSheet').onclick = () => $('#sheet').classList.remove('on');
  $('#sheet').onclick = e => { if (e.target.id === 'sheet') $('#sheet').classList.remove('on'); };

  $('#tg').onclick = async () => {
    const data = await getAppData();
    if (!data.remind.on && !(await askPermission())) return;
    data.remind.on = !data.remind.on; await saveAppData(data);
    paintSettings(); toast(data.remind.on ? 'Reminder on for ' + data.remind.time : 'Reminder off');
  };
  $('#rt').onchange = e => { getAppData().then(data => { data.remind.time = e.target.value || '20:00'; data.remind.last = ''; saveAppData(data); }); };
  $('#testBtn').onclick = async () => { if (!(await askPermission())) return; const ok = await showNotification('Today', 'Test reminder'); if (!ok) toast('Could not show notification'); };

  $$('.menu').forEach(b => b.onclick = () => menu(true)); $('#scrim').onclick = () => menu(false);
  $$('.nav [data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  $('#meBtn').onclick = () => go('profile');
  $('#navRem').onclick = () => { menu(false); paintSettings(); $('#sheet').classList.add('on'); };
  $('#navRoutine').onclick = () => { menu(false); go('routine'); };

  $$('#seg button').forEach(b => b.onclick = () => { getAppData().then(data => { data.theme = b.dataset.th; saveAppData(data); applyTheme(); }); });

  $('#saveProf').onclick = () => { getAppData().then(data => { data.profile.name = $('#nameIn').value.trim(); data.profile.about = $('#aboutIn').value.trim(); saveAppData(data); paintProfile(); toast('Profile saved'); }); };

  $('#addRoutineBtn')?.addEventListener('click', () => openEditRoutineSheet());

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkAndSendReminders(); autoFillToday(); } });
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
  ['app', 'profile', 'routine'].forEach(v => $('#' + v).classList.toggle('on', v === page));
  $('#welcome').classList.remove('on');
  $$('.nav [data-go]').forEach(b => b.classList.toggle('on', b.dataset.go === page));
  menu(false); window.scrollTo(0, 0);
  if (page === 'app') renderApp();
  else if (page === 'profile') paintProfile();
  else if (page === 'routine') renderRoutineList();
}

function menu(open) { $('#side').classList.toggle('open', open); $('#scrim').classList.toggle('on', open); }

function paintSettings() { getAppData().then(data => { $('#tg').classList.toggle('on', data.remind?.on); $('#rt').value = data.remind?.time || '20:00'; }); }

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
  else { L.forEach(t => { const li = document.createElement('li'); li.className = 'item' + (t.done ? ' done' : ''); li.innerHTML = '<button class="chk" aria-label="Mark ' + (t.done ? 'undone' : 'done') + '"><svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg></button><span class="txt"></span><button class="del" aria-label="Delete task">×</button>'; li.querySelector('.txt').textContent = t.t; const tog = () => { toggleGoal(dk(), t.id).then(() => { li.classList.toggle('done', !t.done); t.done = !t.done; score(); week(); if (navigator.vibrate) navigator.vibrate(15); }); }; li.querySelector('.chk').onclick = tog; li.querySelector('.txt').onclick = tog; li.querySelector('.del').onclick = () => { li.style.transition = '.25s'; li.style.opacity = 0; li.style.transform = 'translateX(40px)'; setTimeout(async () => { await deleteGoal(dk(), t.id); renderApp(); }, 230); }; ul.append(li); }); }
  score(); week();
}

function score() { getTodayGoals().then(L => { const d = L.filter(t => t.done).length; const p = pctOf(L); $('#fg').style.strokeDashoffset = 327 - 327 * p / 100; $('#pct').textContent = p; $('#ring').classList.remove('full'); if (L.length && p === 100) { void $('#ring').offsetWidth; $('#ring').classList.add('full'); } let a, b; if (!L.length) { a = 'No tasks yet'; b = 'Add your first task below.'; } else { b = d + ' of ' + L.length + ' done'; a = p === 100 ? 'Perfect day!' : p >= 75 ? 'Almost there' : p >= 40 ? 'Good progress' : p > 0 ? 'Nice start' : 'Time to begin'; } $('#sTitle').textContent = a; $('#sSub').textContent = b; }); }

function week() {
  const w = $('#week'); w.innerHTML = '';
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const dateKey = dk(d); getAppData().then(data => { const L = data.days[dateKey] || []; const p = pctOf(L); const c = document.createElement('div'); c.innerHTML = '<span>' + (L.length ? p + '%' : '–') + '</span><i style="height:0"></i><span>' + d.toLocaleDateString(undefined, { weekday: 'narrow' }) + '</span>'; w.append(c); const bar = c.querySelector('i'); requestAnimationFrame(() => requestAnimationFrame(() => bar.style.height = Math.max(4, p * 0.5) + 'px')); }); }
}

/* ---- tasks ---- */
function addGoal(text) { return addDayGoals(dk(), [{ id: uid(), t: text.slice(0,120), done: false, createdAt: Date.now() }]); }
function addBulkGoals(lines) { const goals = lines.map(t => ({ id: uid(), t: t.slice(0,120), done: false, createdAt: Date.now() })); return addDayGoals(dk(), goals); }
function toggleGoal(dayKey, goalId) { return getAppData().then(data => { const goals = data.days[dayKey]; if (!goals) return; const goal = goals.find(g => g.id === goalId); if (!goal) return; goal.done = !goal.done; return saveAppData(data).then(() => goal); }); }
function deleteGoal(dayKey, goalId) { return getAppData().then(data => { const goals = data.days[dayKey]; if (!goals) return; const idx = goals.findIndex(g => g.id === goalId); if (idx === -1) return; goals.splice(idx, 1); return saveAppData(data); }); }
function clearCompletedGoals(dayKey) { return getAppData().then(data => { const goals = data.days[dayKey]; if (!goals) return 0; data.days[dayKey] = goals.filter(g => !g.done); return saveAppData(data).then(() => goals.filter(g => g.done).length); }); }

/* ---- notifications ---- */
let permissionGranted = false;
async function askPermission() { if (!('Notification' in window)) { toast('No notification support'); return false; } if (Notification.permission === 'granted') { permissionGranted = true; return true; } const r = await Notification.requestPermission(); permissionGranted = r === 'granted'; if (!permissionGranted) toast('Notifications blocked'); return permissionGranted; }
async function showNotification(title, body) { if (!permissionGranted) return false; try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) { await reg.showNotification(title, { body, tag: 'todo', vibrate: [120,60,120] }); return true; } } catch(e) {} try { new Notification(title, { body }); return true; } catch(e) {} return false; }
function checkAndSendReminders() { getAppData().then(data => { if (!data.remind?.on || !permissionGranted) return; const now = new Date(), hm = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0'); if (hm < data.remind.time || data.remind.last === dk()) return; const left = (data.days[dk()] || []).filter(t => !t.done).length; if (!left) return; data.remind.last = dk(); saveAppData(data); const score = pctOf(data.days[dk()]); showNotification('Tasks waiting', left + ' task' + (left > 1 ? 's' : '') + ' not done. Score: ' + score + '%'); }); }
setInterval(checkAndSendReminders, 20000);

/* ---- routine ---- */
const REPEAT_OPTS = [ {v:'daily',l:'Every day'}, {v:'weekdays',l:'Weekdays'}, {v:'weekends',l:'Weekends'}, {v:'custom',l:'Custom days...'} ];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function matchesRepeat(rule, date) { const day = date.getDay(); switch(rule.type) { case 'daily': return true; case 'weekdays': return day>=1&&day<=5; case 'weekends': return day===0||day===6; case 'custom': return rule.days?.includes(day)??false; } }
function getRepeatLabel(r) { const o = REPEAT_OPTS.find(x=>x.v===r.type); if(!o)return'Custom'; if(r.type==='custom'&&r.days)return r.days.map(d=>DAYS[d]).join(', '); return o.l; }
async function autoFillToday() { const data = await getAppData(); const todayKey = today(); if (data.days[todayKey]?.length) return; const goals = []; for (const rg of data.routine||[]) { if (!rg.enabled) continue; if (!matchesRepeat(rg.repeat, new Date())) continue; if (rg.skipDates?.includes(todayKey)) continue; goals.push({ t: rg.t, startTime: rg.startTime, duration: rg.duration, deadline: rg.deadline, priority: rg.priority, category: rg.category, routineId: rg.id, streak: rg.streak||0 }); } if (goals.length) { data.days[todayKey] = goals.map(g=>({...g,id:uid(),done:false,createdAt:Date.now()})); await saveAppData(data); } }
async function renderRoutineList() { const data = await getAppData(); const container = $('#routineList'); if(!data.routine?.length) { container.innerHTML = '<p class="empty">No routine goals yet.</p>'; return; } container.innerHTML = data.routine.map((g,i)=>'<div class="routine-item" data-id="'+g.id+'"><div class="routine-info"><div class="routine-name">'+escapeHtml(g.t)+'</div><div class="routine-meta">'+(g.startTime?'<span class="routine-time">'+formatTime(g.startTime)+(g.duration?' · '+g.duration+'min':'')+'</span>':'')+(g.deadline?'<span class="routine-time">Due by '+formatTime(g.deadline)+'</span>':'')+'<span class="routine-days">'+getRepeatLabel(g.repeat)+'</span>'+(g.streak?'<span class="routine-streak">🔥 '+g.streak+'</span>':'')+'</div></div><div class="routine-toggle '+(g.enabled?'on':'')+'" data-id="'+g.id+'"></div><button class="routine-edit" data-id="'+g.id+'">✎</button></div>').join(''); $$('#routineList .routine-toggle').forEach(t=>t.onclick=async()=>{const id=t.dataset.id;const e=!t.classList.contains('on');const d=await getAppData();const rg=d.routine.find(x=>x.id===id);if(rg){rg.enabled=e;await saveAppData(d);t.classList.toggle('on',e);toast(e?'Enabled':'Disabled');}}); $$('#routineList .routine-edit').forEach(b=>b.onclick=()=>openEditRoutineSheet(b.dataset.id)); }
async function openEditRoutineSheet(id=null) { const isNew=!id; const sheet=$('#editSheet')||createEditSheet(); const panel=$('#editPanel'); if(!panel)return; panel.innerHTML='<h3>'+(isNew?'Add':'Edit')+' Routine Goal</h3><div class="edit-field"><label>Goal name</label><input type="text" id="rName" maxlength="120" placeholder="e.g. Morning walk"></div><div class="edit-field"><label>Start time</label><input type="time" id="rTime"></div><div class="edit-field"><label>Duration (min)</label><input type="number" id="rDur" min="1" max="1440" placeholder="30"></div><div class="edit-field"><label>Deadline</label><input type="time" id="rDeadline"></div><div class="edit-field"><label>Priority</label><select id="rPri"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></div><div class="edit-field"><label>Repeat</label><select id="rRep">'+REPEAT_OPTS.map(o=>'<option value="'+o.v+'">'+o.l+'</option>').join('')+'</select></div><div class="edit-field custom-days" style="display:none"><label>Custom days</label><div class="day-picker">'+DAYS.map((d,i)=>'<button type="button" class="day-btn" data-day="'+i+'">'+d+'</button>').join('')+'</div></div><div class="edit-field"><label>Start from</label><input type="date" id="rStart" value="'+today()+'"></div><div class="edit-actions"><button class="btn" id="cancelR">Cancel</button><button class="btn" id="saveR">'+(isNew?'Add':'Save')+'</button></div>'; $('#rRep').onchange=e=>$('.custom-days').style.display=e.target.value==='custom'?'block':'none'; $$('.day-btn').forEach(b=>b.onclick=()=>b.classList.toggle('on')); if(!isNew){const d=await getAppData();const g=d.routine.find(x=>x.id===id);if(g){$('#rName').value=g.t;$('#rTime').value=g.startTime||'';$('#rDur').value=g.duration||'';$('#rDeadline').value=g.deadline||'';$('#rPri').value=g.priority;$('#rRep').value=g.repeat.type;$('#rStart').value=g.startDate;if(g.repeat.type==='custom'){$('.custom-days').style.display='block';g.repeat.days?.forEach(d=>$('.day-btn[data-day="'+d+'"')?.classList.add('on'));}}} $('#cancelR').onclick=()=>sheet.classList.remove('on'); $('#saveR').onclick=async()=>{const name=$('#rName').value.trim();if(!name)return toast('Enter name'); const rt=$('#rRep').value;const repeat={type:rt};if(rt==='custom'){const days=$$('.day-btn.on').map(b=>+b.dataset.day);if(!days.length)return toast('Select days');repeat.days=days;} const rd={t:name,startTime:$('#rTime').value||null,duration:+$('#rDur').value||null,deadline:$('#rDeadline').value||null,priority:$('#rPri').value,category:null,repeat,startDate:$('#rStart').value,skipDates:[],enabled:true,streak:0}; if(isNew)await addRoutineGoal(rd);else{const d=await getAppData();const idx=d.routine.findIndex(x=>x.id===id);if(idx>=0){d.routine[idx]=rd;await saveAppData(d);}} toast(isNew?'Added':'Saved');sheet.classList.remove('on');renderRoutineList();}; sheet.classList.add('on'); }
function createEditSheet(){const s=document.createElement('div');s.className='sheet edit-sheet';s.id='editSheet';s.innerHTML='<div class="panel edit-panel" id="editPanel"></div>';document.body.appendChild(s);return s;}
function escapeHtml(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}
function formatTime(ts){if(!ts)return'';const[h,m]=ts.split(':').map(Number);return(h%12||12)+':'+String(m).padStart(2,'0')+' '+(h>=12?'PM':'AM');}

document.addEventListener('DOMContentLoaded', init);