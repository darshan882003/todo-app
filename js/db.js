const DB_NAME = 'todo-app-db';
const DB_VERSION = 1;
const STORE_NAME = 'data';

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { db = request.result; resolve(db); };
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
  });
}

function getStore(mode = 'readonly') {
  return openDB().then(database => {
    const transaction = database.transaction(STORE_NAME, mode);
    return transaction.objectStore(STORE_NAME);
  });
}

function get(key) {
  return getStore().then(store => new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

function set(key, value) {
  return getStore('readwrite').then(store => new Promise((resolve, reject) => {
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }));
}

function migrateFromLocalStorage() {
  const KEY = 'todo.v1';
  try {
    const data = localStorage.getItem(KEY);
    if (!data) return Promise.resolve(false);
    const parsed = JSON.parse(data);
    if (!parsed || !parsed.days) return Promise.resolve(false);
    return set('app-data', parsed).then(() => {
      localStorage.setItem(KEY + '.migrated', Date.now().toString());
      return true;
    });
  } catch (e) { return Promise.resolve(false); }
}

function getAppData() {
  return get('app-data').then(data => {
    if (!data) {
      return { days: {}, remind: { on: false, time: '20:00', last: '' }, profile: { name: '', about: '' }, theme: 'dark', routine: [] };
    }
    return data;
  });
}

function saveAppData(data) { return set('app-data', data); }

function getTodayGoals() {
  return getAppData().then(data => data.days[dk()] || []);
}

function addDayGoals(dateISO, goals) {
  return getAppData().then(data => {
    if (!data.days[dateISO]) data.days[dateISO] = [];
    data.days[dateISO].push(...goals);
    return saveAppData(data);
  });
}

function updateDayGoals(dateISO, goals) {
  return getAppData().then(data => { data.days[dateISO] = goals; return saveAppData(data); });
}

function addRoutineGoal(goal) {
  return getAppData().then(data => { data.routine.push(goal); return saveAppData(data); });
}

function updateRoutineGoal(index, goal) {
  return getAppData().then(data => { data.routine[index] = goal; return saveAppData(data); });
}

function deleteRoutineGoal(index) {
  return getAppData().then(data => { data.routine.splice(index, 1); return saveAppData(data); });
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function dk(date = new Date()) { return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0'); }
function today() { return dk(); }

export { migrateFromLocalStorage, getAppData, saveAppData, getTodayGoals, addDayGoals, updateDayGoals, addRoutineGoal, updateRoutineGoal, deleteRoutineGoal, uid, dk, today };