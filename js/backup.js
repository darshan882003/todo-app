/**
 * Backup and restore functionality
 * Export/import JSON data to/from Downloads folder
 */

import { getAppData, saveAppData } from './db.js';

function $(sel) { return document.querySelector(sel); }

function toast(msg) {
  const t = $('#toast');
  if (t) {
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast.h);
    toast.h = setTimeout(() => t.classList.remove('on'), 2400);
  }
}

function generateFilename() {
  const now = new Date();
  const date = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
  const time = String(now.getHours()).padStart(2, '0') + '-' +
    String(now.getMinutes()).padStart(2, '0');
  return `todo-backup-${date}-${time}.json`;
}

async function exportBackup() {
  const data = await getAppData();

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = generateFilename();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast('Backup downloaded to Downloads folder');
}

async function importBackup(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const backup = JSON.parse(e.target.result);

        if (!backup.version || !backup.data) {
          throw new Error('Invalid backup file format');
        }

        if (backup.version !== 1) {
          throw new Error(`Unsupported backup version: ${backup.version}`);
        }

        const currentData = await getAppData();

        // Merge strategy: keep newer data for overlapping days
        const mergedDays = { ...currentData.days };
        for (const [date, goals] of Object.entries(backup.data.days)) {
          if (!mergedDays[date]) {
            mergedDays[date] = goals;
          } else {
            // Merge by ID, keeping newer versions
            const existingIds = new Set(mergedDays[date].map(g => g.id));
            for (const goal of goals) {
              if (!existingIds.has(goal.id)) {
                mergedDays[date].push(goal);
              }
            }
          }
        }

        currentData.days = mergedDays;
        currentData.remind = backup.data.remind || currentData.remind;
        currentData.profile = backup.data.profile || currentData.profile;
        currentData.theme = backup.data.theme || currentData.theme;
        currentData.security = backup.data.security || currentData.security;
        currentData.routine = backup.data.routine || currentData.routine;
        currentData.categories = backup.data.categories || currentData.categories;
        currentData.badges = backup.data.badges || currentData.badges;

        await saveAppData(currentData);

        toast(`Backup imported: ${Object.keys(backup.data.days).length} days merged`);
        resolve();
      } catch (err) {
        toast('Import failed: ' + err.message);
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

function setupBackupUI() {
  const exportBtn = $('#exportBtn');
  const importBtn = $('#importBtn');
  const importInput = $('#importFile');

  if (exportBtn) {
    exportBtn.addEventListener('click', exportBackup);
  }

  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await importBackup(file);
        importInput.value = '';
        if (window.renderApp) window.renderApp();
      }
    });
  }
}

export {
  exportBackup,
  importBackup,
  setupBackupUI,
  generateFilename
};