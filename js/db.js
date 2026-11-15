/**
 * IndexedDB wrapper with localStorage migration
 * Provides a clean API for the app to use without knowing the storage backend
 */

const DB_NAME = 'todo-app-db';
const DB_VERSION = 1;
const STORE_NAME = 'data';

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

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
  return getStore().then(store => {
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

function set(key, value) {
  return getStore('readwrite').then(store => {
    return new Promise((resolve, reject) => {
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

function del(key) {
  return getStore('readwrite').then(store => {
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

function clear() {
  return getStore('readwrite').then(store => {
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
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
  } catch (e) {
    console.warn('Migration failed:', e);
    return Promise.resolve(false);
  }
}

function getAppData() {
  return get('app-data').then(data => {
    if (!data) {
      return {
        days: {},
        remind: { on: false, time: '20:00', last: '' },
        profile: { name: '', about: '' },
        theme: 'dark',
        security: {
          pinHash: null,
          pinLen: 6,
          pinSalt: null,
          pinIter: 600000,
          lockEnabled: false,
          autoLockDelay: 60000,
          hideNotificationsWhenLocked: true,
          failedAttempts: 0,
          lockedUntil: 0
        },
        routine: [],
        categories: []
      };
    }
    return data;
  });
}

function saveAppData(data) {
  return set('app-data', data);
}

function getDaysInRange(fromISO, toISO) {
  return getAppData().then(data => {
    const result = {};
    const from = fromISO;
    const to = toISO;
    for (const [date, goals] of Object.entries(data.days)) {
      if (date >= from && date <= to) {
        result[date] = goals;
      }
    }
    return result;
  });
}

function getSettings() {
  return getAppData().then(data => ({
    remind: data.remind,
    theme: data.theme,
    profile: data.profile,
    security: data.security,
    routine: data.routine,
    categories: data.categories
  }));
}

function saveSettings(settings) {
  return getAppData().then(data => {
    Object.assign(data, settings);
    return saveAppData(data);
  });
}

function addDayGoals(dateISO, goals) {
  return getAppData().then(data => {
    if (!data.days[dateISO]) data.days[dateISO] = [];
    data.days[dateISO].push(...goals);
    return saveAppData(data);
  });
}

function updateDayGoals(dateISO, goals) {
  return getAppData().then(data => {
    data.days[dateISO] = goals;
    return saveAppData(data);
  });
}

function deleteDayGoals(dateISO) {
  return getAppData().then(data => {
    delete data.days[dateISO];
    return saveAppData(data);
  });
}

function addRoutineGoal(goal) {
  return getAppData().then(data => {
    data.routine.push(goal);
    return saveAppData(data);
  });
}

function updateRoutineGoal(index, goal) {
  return getAppData().then(data => {
    data.routine[index] = goal;
    return saveAppData(data);
  });
}

function deleteRoutineGoal(index) {
  return getAppData().then(data => {
    data.routine.splice(index, 1);
    return saveAppData(data);
  });
}

function addCategory(category) {
  return getAppData().then(data => {
    data.categories.push(category);
    return saveAppData(data);
  });
}

function updateCategory(index, category) {
  return getAppData().then(data => {
    data.categories[index] = category;
    return saveAppData(data);
  });
}

function deleteCategory(index) {
  return getAppData().then(data => {
    data.categories.splice(index, 1);
    return saveAppData(data);
  });
}

export {
  openDB,
  getAppData,
  saveAppData,
  getDaysInRange,
  getSettings,
  saveSettings,
  addDayGoals,
  updateDayGoals,
  deleteDayGoals,
  addRoutineGoal,
  updateRoutineGoal,
  deleteRoutineGoal,
  addCategory,
  updateCategory,
  deleteCategory,
  migrateFromLocalStorage
};