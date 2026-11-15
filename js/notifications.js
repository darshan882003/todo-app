/**
 * Notification system with action buttons
 * Handles scheduling, display, and action handling for various notification types
 */

import { getAppData, saveAppData, getSettings } from './db.js';
import { getGoalStatus, formatTime } from './tasks.js';
import { getLockState } from './lock.js';

let notificationSettings = {
  types: {
    headsUp: { enabled: true, vibration: [100, 50, 100], sticky: true },
    startNow: { enabled: true, vibration: [200, 100, 200], sticky: true },
    timesUp: { enabled: true, vibration: [300, 100, 300, 100, 300], sticky: true },
    followUp: { enabled: true, vibration: [200, 100, 200], sticky: false },
    deadlineWarning: { enabled: true, vibration: [150, 50, 150, 50, 150], sticky: true },
    morningPlan: { enabled: true, vibration: [100, 50, 100, 50, 100], sticky: false },
    eveningReview: { enabled: true, vibration: [100, 50, 100, 50, 100], sticky: false },
    streakAtRisk: { enabled: true, vibration: [200, 100, 200, 100, 200], sticky: false },
    achievement: { enabled: true, vibration: [500, 200, 500], sticky: false }
  },
  quietHours: { enabled: false, start: '22:00', end: '07:00' },
  snoozeDuration: 10 * 60 * 1000
};

let checkInterval = null;
let permissionGranted = false;

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

async function askPermission() {
  if (!('Notification' in window)) {
    toast('This browser has no notification support');
    return false;
  }
  if (Notification.permission === 'granted') {
    permissionGranted = true;
    return true;
  }
  const result = await Notification.requestPermission();
  permissionGranted = result === 'granted';
  if (!permissionGranted) {
    toast('Notifications are blocked. Allow them in Chrome site settings.');
  }
  return permissionGranted;
}

function isInQuietHours() {
  if (!notificationSettings.quietHours.enabled) return false;
  const now = new Date();
  const current = String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0');
  const { start, end } = notificationSettings.quietHours;

  if (start <= end) {
    return current >= start && current < end;
  } else {
    return current >= start || current < end;
  }
}

async function showNotification(title, body, options = {}) {
  if (!permissionGranted) return false;
  if (isInQuietHours()) return false;

  const data = await getAppData();
  const security = data.security || {};
  const lockState = getLockState();
  if (security.hideNotificationsWhenLocked && lockState.isLocked) {
    // Show generic notification without task details
    return showGenericLockedNotification();
  }

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.showNotification(title, {
        body,
        tag: options.tag || 'todo',
        vibrate: options.vibration || [100, 50, 100],
        requireInteraction: options.sticky !== false,
        actions: options.actions || [],
        data: options.data || {}
      });
      return true;
    }
  } catch (e) {
    console.warn('SW notification failed:', e);
  }

  try {
    new Notification(title, { body, tag: options.tag || 'todo' });
    return true;
  } catch (e) {
    console.warn('Notification failed:', e);
  }
  return false;
}

function showGenericLockedNotification() {
  return showNotification('Today', 'You have tasks waiting. Unlock to see details.', { tag: 'locked-generic' });
}

function getNotificationTypeSettings(type) {
  return notificationSettings.types[type] || { enabled: true, vibration: [100, 50, 100], sticky: true };
}

function buildHeadsUpActions(goalId) {
  return [
    { action: 'snooze', title: 'Snooze 10min' },
    { action: 'skip', title: 'Skip today' }
  ];
}

function buildStartNowActions(goalId) {
  return [
    { action: 'startTimer', title: 'Start timer' },
    { action: 'snooze', title: 'Snooze 10min' }
  ];
}

function buildTimesUpActions(goalId) {
  return [
    { action: 'done', title: '✅ Done' },
    { action: 'extend', title: '⏳ 15 more min' },
    { action: 'skip', title: '❌ Skip today' }
  ];
}

function buildFollowUpActions(goalId) {
  return [
    { action: 'done', title: '✅ Done' },
    { action: 'skip', title: '❌ Skip' }
  ];
}

function buildDeadlineWarningActions(goalId) {
  return [
    { action: 'done', title: '✅ Done' },
    { action: 'snooze', title: 'Snooze 10min' }
  ];
}

async function scheduleGoalNotifications(goal, dayKey) {
  if (!goal.startTime && !goal.deadline) return;

  const now = new Date();
  const currentTime = String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0');

  const settings = await getSettings();
  const goalSettings = settings.notifications?.perGoal?.[goal.id] || { style: 'normal' };
  if (goalSettings.style === 'silent') return;

  const baseOptions = {
    tag: `goal-${goal.id}`,
    data: { goalId: goal.id, dayKey, type: '' }
  };

  if (goal.startTime) {
    const startMinutes = timeToMinutes(goal.startTime);
    const currentMinutes = timeToMinutes(currentTime);

    const headsUpMinutes = startMinutes - 10;
    if (headsUpMinutes > currentMinutes && headsUpMinutes - currentMinutes <= 60) {
      const delay = (headsUpMinutes - currentMinutes) * 60 * 1000;
      setTimeout(() => {
        const typeSettings = getNotificationTypeSettings('headsUp');
        showNotification(
          `Starting soon: ${goal.t}`,
          `At ${formatTime(goal.startTime)}`,
          { ...baseOptions, type: 'headsUp', vibration: typeSettings.vibration, sticky: typeSettings.sticky, actions: buildHeadsUpActions(goal.id) }
        );
      }, delay);
    }

    if (currentMinutes === startMinutes) {
      const typeSettings = getNotificationTypeSettings('startNow');
      showNotification(
        `Starting now: ${goal.t}`,
        goal.duration ? `Duration: ${goal.duration}min` : 'Tap to start timer',
        { ...baseOptions, type: 'startNow', vibration: typeSettings.vibration, sticky: typeSettings.sticky, actions: buildStartNowActions(goal.id) }
      );
    }

    if (goal.duration) {
      const endTime = addMinutes(goal.startTime, goal.duration);
      const endMinutes = timeToMinutes(endTime);
      if (endMinutes > currentMinutes) {
        const delay = (endMinutes - currentMinutes) * 60 * 1000;
        setTimeout(() => {
          const typeSettings = getNotificationTypeSettings('timesUp');
          showNotification(
            `Time's up: ${goal.t}`,
            'Did you finish?',
            { ...baseOptions, type: 'timesUp', vibration: typeSettings.vibration, sticky: typeSettings.sticky, actions: buildTimesUpActions(goal.id) }
          );
        }, delay);
      }
    }
  }

  if (goal.deadline) {
    const deadlineMinutes = timeToMinutes(goal.deadline);
    const currentMinutes = timeToMinutes(currentTime);
    const warningMinutes = deadlineMinutes - 30;

    if (warningMinutes > currentMinutes && warningMinutes - currentMinutes <= 60) {
      const delay = (warningMinutes - currentMinutes) * 60 * 1000;
      setTimeout(() => {
        const typeSettings = getNotificationTypeSettings('deadlineWarning');
        showNotification(
          `Deadline approaching: ${goal.t}`,
          `Due by ${formatTime(goal.deadline)}`,
          { ...baseOptions, type: 'deadlineWarning', vibration: typeSettings.vibration, sticky: typeSettings.sticky, actions: buildDeadlineWarningActions(goal.id) }
        );
      }, delay);
    }
  }
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function addMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m + minutes, 0, 0);
  return String(date.getHours()).padStart(2, '0') + ':' +
    String(date.getMinutes()).padStart(2, '0');
}

async function checkAndSendReminders() {
  const data = await getAppData();
  if (!data.remind?.on) return;
  if (!permissionGranted) return;

  const now = new Date();
  const currentTime = String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0');
  const todayKey = dk(now);

  if (currentTime < data.remind.time) return;
  if (data.remind.last === todayKey) return;

  const goals = data.days[todayKey] || [];
  const pending = goals.filter(g => !g.done).length;
  if (!pending) return;

  data.remind.last = todayKey;
  await saveAppData(data);

  const score = Math.round(goals.filter(g => g.done).length / goals.length * 100) || 0;
  await showNotification(
    'Tasks waiting',
    `${pending} task${pending > 1 ? 's' : ''} still not done today. Score so far: ${score}%`,
    { tag: 'daily-remind', vibration: [120, 60, 120] }
  );
}

function dk(date = new Date()) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

async function loadNotificationSettings() {
  const settings = await getSettings();
  if (settings.notifications) {
    Object.assign(notificationSettings, settings.notifications);
  }
  await askPermission();
}

async function saveNotificationSettings() {
  const settings = await getSettings();
  settings.notifications = notificationSettings;
  await saveSettings(settings);
}

async function toggleNotificationType(type, enabled) {
  if (notificationSettings.types[type]) {
    notificationSettings.types[type].enabled = enabled;
    await saveNotificationSettings();
  }
}

async function setQuietHours(enabled, start, end) {
  notificationSettings.quietHours = { enabled, start, end };
  await saveNotificationSettings();
}

async function setSnoozeDuration(minutes) {
  notificationSettings.snoozeDuration = minutes * 60 * 1000;
  await saveNotificationSettings();
}

async function setPerGoalStyle(goalId, style) {
  const settings = await getSettings();
  if (!settings.notifications) settings.notifications = {};
  if (!settings.notifications.perGoal) settings.notifications.perGoal = {};
  settings.notifications.perGoal[goalId] = { style };
  await saveAppData(settings);
}

function startPeriodicCheck() {
  if (checkInterval) clearInterval(checkInterval);
  checkInterval = setInterval(checkAndSendReminders, 20000);
  document.addEventListener('visibilitychange', checkAndSendReminders);
}

function stopPeriodicCheck() {
  if (checkInterval) clearInterval(checkInterval);
  checkInterval = null;
  document.removeEventListener('visibilitychange', checkAndSendReminders);
}

async function handleNotificationAction(action, goalId, dayKey) {
  const data = await getAppData();
  const goals = data.days[dayKey] || [];
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return;

  switch (action) {
    case 'done':
      goal.done = true;
      goal.status = 'done';
      break;
    case 'skip':
      goal.status = 'skipped';
      break;
    case 'extend':
      if (goal.startTime && goal.duration) {
        goal.duration += 15;
      }
      break;
    case 'snooze':
      setTimeout(() => {
        scheduleGoalNotifications(goal, dayKey);
      }, notificationSettings.snoozeDuration);
      return;
    case 'startTimer':
      break;
  }

  await saveAppData(data);
}

export {
  askPermission,
  showNotification,
  scheduleGoalNotifications,
  checkAndSendReminders,
  loadNotificationSettings,
  saveNotificationSettings,
  toggleNotificationType,
  setQuietHours,
  setSnoozeDuration,
  setPerGoalStyle,
  startPeriodicCheck,
  stopPeriodicCheck,
  handleNotificationAction,
  notificationSettings
};