/**
 * PIN Lock system
 * Handles PIN creation, verification, auto-lock, lockout, and reset
 */

import { createPinRecord, verifyPin, changePin } from './crypto.js';
import { getAppData, saveAppData, getSettings, saveSettings } from './db.js';

// TEMPORARY TEST MODE - SET TO false TO RE-ENABLE PIN LOCK
const TEST_MODE = true;

let lockState = {
  isLocked: true,
  isSetup: false,
  pinLength: 6,
  enteredDigits: '',
  failedAttempts: 0,
  lockedUntil: 0,
  lockoutTimer: null,
  autoLockTimer: null,
  lastActive: Date.now(),
  visibilityHandler: null
};

const LOCKOUT_DELAYS = [30000, 60000, 300000, 900000, 900000]; // 30s, 1m, 5m, 15m, 15m...

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function showView(viewId) {
  $$('.view').forEach(v => v.classList.remove('on'));
  $('#lock').classList.remove('on');
  $(`#${viewId}`).classList.add('on');
  document.body.classList.toggle('inapp', viewId === 'app');
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

function updateLockDots() {
  const dots = $$('#lockDots .lock-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < lockState.enteredDigits.length);
    dot.classList.remove('error');
  });
}

function shakeDots() {
  const dots = $$('#lockDots .lock-dot');
  dots.forEach(dot => {
    dot.classList.remove('error');
    void dot.offsetWidth;
    dot.classList.add('error');
  });
  if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
}

function setAttemptsUI(attempts, lockedUntil) {
  const attemptsEl = $('#lockAttempts');
  const countdownEl = $('#lockCountdown');
  const forgotEl = $('#lockForgot');

  if (lockedUntil > Date.now()) {
    attemptsEl.classList.remove('show');
    countdownEl.classList.add('show');
    forgotEl.classList.remove('show');
    updateCountdown(lockedUntil);
  } else if (attempts >= 3) {
    attemptsEl.classList.add('show');
    countdownEl.classList.remove('show');
    forgotEl.classList.add('show');
    attemptsEl.textContent = `${5 - attempts} attempts remaining before lockout`;
  } else {
    attemptsEl.classList.remove('show');
    countdownEl.classList.remove('show');
    forgotEl.classList.remove('show');
  }
}

function updateCountdown(lockedUntil) {
  const countdownEl = $('#lockCountdown');
  const interval = setInterval(() => {
    const remaining = lockedUntil - Date.now();
    if (remaining <= 0) {
      clearInterval(interval);
      loadLockState();
      return;
    }
    const mins = Math.ceil(remaining / 60000);
    const secs = Math.ceil((remaining % 60000) / 1000);
    countdownEl.textContent = `Locked for ${mins}m ${secs}s`;
  }, 1000);
  countdownEl.dataset.interval = interval;
}

function clearCountdown() {
  const countdownEl = $('#lockCountdown');
  if (countdownEl.dataset.interval) {
    clearInterval(countdownEl.dataset.interval);
    delete countdownEl.dataset.interval;
  }
}

function getLockoutDelay(attempts) {
  const index = Math.min(attempts - 5, LOCKOUT_DELAYS.length - 1);
  return LOCKOUT_DELAYS[index];
}

async function loadLockState() {
  const data = await getAppData();
  const security = data.security || {};

  lockState.isSetup = !!security.pinHash;
  lockState.pinLength = security.pinLen || 6;
  lockState.failedAttempts = security.failedAttempts || 0;
  lockState.lockedUntil = security.lockedUntil || 0;

  const dotsContainer = $('#lockDots');
  if (dotsContainer) {
    dotsContainer.innerHTML = '';
    for (let i = 0; i < lockState.pinLength; i++) {
      const dot = document.createElement('div');
      dot.className = 'lock-dot';
      dotsContainer.appendChild(dot);
    }
  }

  const setupDotsContainer = $('#setupDots');
  if (setupDotsContainer) {
    setupDotsContainer.innerHTML = '';
    for (let i = 0; i < lockState.pinLength; i++) {
      const dot = document.createElement('div');
      dot.className = 'lock-dot';
      setupDotsContainer.appendChild(dot);
    }
  }

  const greet = $('#lockGreet');
  if (greet && data.profile?.name) {
    greet.textContent = `Welcome back, ${data.profile.name}`;
  }

  if (lockState.lockedUntil > Date.now()) {
    setAttemptsUI(lockState.failedAttempts, lockState.lockedUntil);
    startLockoutCountdown();
  } else {
    setAttemptsUI(lockState.failedAttempts, 0);
  }

  lockState.isLocked = true;

  if (TEST_MODE) {
    // Skip PIN lock for testing - show welcome screen directly
    lockState.isLocked = false;
    hideLockScreen();
    showView('welcome');
    return;
  }

  if (!lockState.isSetup) {
    showPinSetupScreen();
  } else {
    showLockScreen();
  }
}

function showPinSetupScreen() {
  showView('pinSetup');
  lockState.enteredDigits = '';
  updateSetupDots();
  $('#setupPin').value = '';
  $('#setupConfirm').value = '';
  $('#setupPin').focus();
}

function updateSetupDots() {
  const dots = $$('#setupDots .lock-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < lockState.enteredDigits.length);
    dot.classList.remove('error');
  });
}

function showLockScreen() {
  showView('lock');
  lockState.enteredDigits = '';
  updateLockDots();
  $('#lockPinInput').value = '';
  $('#lockPinInput').focus();
}

function hideLockScreen() {
  lockState.isLocked = false;
  lockState.enteredDigits = '';
  lockState.failedAttempts = 0;
  lockState.lockedUntil = 0;
  clearCountdown();
  startAutoLockTimer();
  setupVisibilityHandler();
}

async function handlePinEntry(digit) {
  if (lockState.lockedUntil > Date.now()) return;
  if (lockState.enteredDigits.length >= lockState.pinLength) return;

  lockState.enteredDigits += digit;
  updateLockDots();

  if (lockState.enteredDigits.length === lockState.pinLength) {
    await verifyPinAttempt();
  }
}

async function handleBackspace() {
  if (lockState.enteredDigits.length > 0) {
    lockState.enteredDigits = lockState.enteredDigits.slice(0, -1);
    updateLockDots();
  }
}

async function verifyPinAttempt() {
  const data = await getAppData();
  const security = data.security || {};

  const valid = await verifyPin(lockState.enteredDigits, security);

  if (valid) {
    await onUnlockSuccess();
  } else {
    await onUnlockFailure();
  }
}

async function onUnlockSuccess() {
  const data = await getAppData();
  data.security.failedAttempts = 0;
  data.security.lockedUntil = 0;
  await saveAppData(data);

  lockState.failedAttempts = 0;
  lockState.lockedUntil = 0;
  clearCountdown();

  $('#lock').classList.add('fade-out');
  setTimeout(() => {
    $('#lock').classList.remove('fade-out');
    hideLockScreen();
    showView('app');
    if (window.renderApp) window.renderApp();
  }, 200);
}

async function onUnlockFailure() {
  shakeDots();
  lockState.enteredDigits = '';
  updateLockDots();

  const data = await getAppData();
  const security = data.security || {};
  security.failedAttempts = (security.failedAttempts || 0) + 1;
  lockState.failedAttempts = security.failedAttempts;

  if (lockState.failedAttempts >= 5) {
    const delay = getLockoutDelay(lockState.failedAttempts);
    security.lockedUntil = Date.now() + delay;
    lockState.lockedUntil = security.lockedUntil;
    await saveAppData(data);
    setAttemptsUI(lockState.failedAttempts, lockState.lockedUntil);
    startLockoutCountdown();
  } else {
    await saveAppData(data);
    setAttemptsUI(lockState.failedAttempts, 0);
  }
}

function startLockoutCountdown() {
  clearCountdown();
  if (lockState.lockoutTimer) clearTimeout(lockState.lockoutTimer);

  const checkLockout = () => {
    if (lockState.lockedUntil <= Date.now()) {
      loadLockState();
    } else {
      lockState.lockoutTimer = setTimeout(checkLockout, 1000);
    }
  };
  checkLockout();
}

function startAutoLockTimer() {
  if (lockState.autoLockTimer) clearTimeout(lockState.autoLockTimer);

  const data = getAppData().then(d => d.security || {});
  data.then(security => {
    if (!security.lockEnabled) return;
    const delay = security.autoLockDelay || 60000;
    lockState.autoLockTimer = setTimeout(() => {
      if (!lockState.isLocked) {
        lockApp();
      }
    }, delay);
  });
}

function resetAutoLockTimer() {
  lockState.lastActive = Date.now();
  startAutoLockTimer();
}

function setupVisibilityHandler() {
  if (lockState.visibilityHandler) {
    document.removeEventListener('visibilitychange', lockState.visibilityHandler);
  }

  lockState.visibilityHandler = () => {
    if (document.hidden) {
      lockState.lastActive = Date.now();
    } else {
      const data = getAppData().then(d => d.security || {});
      data.then(security => {
        if (security.lockEnabled && !lockState.isLocked) {
          const elapsed = Date.now() - lockState.lastActive;
          const delay = security.autoLockDelay || 60000;
          if (elapsed >= delay) {
            lockApp();
          } else {
            startAutoLockTimer();
          }
        }
      });
    }
  };

  document.addEventListener('visibilitychange', lockState.visibilityHandler);
}

function lockApp() {
  lockState.isLocked = true;
  if (lockState.autoLockTimer) clearTimeout(lockState.autoLockTimer);
  showLockScreen();
}

async function createPin(pin, confirmPin) {
  if (pin !== confirmPin) throw new Error('PINs do not match');
  if (pin.length !== lockState.pinLength) throw new Error(`PIN must be ${lockState.pinLength} digits`);
  if (!/^\d+$/.test(pin)) throw new Error('PIN must be numeric');

  const record = await createPinRecord(pin, lockState.pinLength);
  const data = await getAppData();
  data.security = {
    ...data.security,
    pinHash: record.hash,
    pinLen: record.len,
    pinSalt: record.salt,
    pinIter: record.iter,
    lockEnabled: true,
    autoLockDelay: 60000,
    hideNotificationsWhenLocked: true,
    failedAttempts: 0,
    lockedUntil: 0
  };
  await saveAppData(data);

  lockState.isSetup = true;
  lockState.pinLength = record.len;
  await onUnlockSuccess();
}

async function verifyCurrentPin(pin) {
  const data = await getAppData();
  return verifyPin(pin, data.security);
}

async function updatePin(newPin, confirmPin) {
  if (newPin !== confirmPin) throw new Error('PINs do not match');
  if (newPin.length !== lockState.pinLength) throw new Error(`PIN must be ${lockState.pinLength} digits`);

  const data = await getAppData();
  const newRecord = await changePin(data.security.pinHash ? '' : newPin, newPin, data.security);
  data.security = {
    ...data.security,
    pinHash: newRecord.hash,
    pinSalt: newRecord.salt,
    pinIter: newRecord.iter,
    failedAttempts: 0,
    lockedUntil: 0
  };
  await saveAppData(data);
  toast('PIN changed successfully');
}

async function toggleLock(enabled) {
  const data = await getAppData();
  data.security.lockEnabled = enabled;
  await saveAppData(data);
  toast(enabled ? 'PIN lock enabled' : 'PIN lock disabled');
}

async function setAutoLockDelay(delay) {
  const data = await getAppData();
  data.security.autoLockDelay = delay;
  await saveAppData(data);
  if (!lockState.isLocked) startAutoLockTimer();
  toast(`Auto-lock set to ${delay / 1000} seconds`);
}

async function setHideNotifications(hide) {
  const data = await getAppData();
  data.security.hideNotificationsWhenLocked = hide;
  await saveAppData(data);
  toast(hide ? 'Notifications hidden when locked' : 'Notifications shown when locked');
}

async function resetAllData() {
  await clear();
  localStorage.clear();
  location.reload();
}

function initLockUI() {
  $('#lockPinInput').addEventListener('input', (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, lockState.pinLength);
    e.target.value = val;
    lockState.enteredDigits = val;
    updateLockDots();
    if (val.length === lockState.pinLength) {
      verifyPinAttempt();
    }
  });

  $('#lockPinInput').addEventListener('keydown', (e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      handleBackspace();
      e.target.value = lockState.enteredDigits;
    }
  });

  $$('#lockKeypad .lock-key:not(.empty)').forEach(key => {
    key.addEventListener('click', () => {
      if (key.classList.contains('back')) {
        handleBackspace();
        $('#lockPinInput').value = lockState.enteredDigits;
      } else if (!key.classList.contains('empty')) {
        handlePinEntry(key.dataset.digit);
        $('#lockPinInput').value = lockState.enteredDigits;
      }
    });
  });

  $('#lockForgot').addEventListener('click', () => {
    const confirm = prompt('This will erase ALL your data. Type RESET to confirm:');
    if (confirm === 'RESET') {
      resetAllData();
    }
  });

  $('#setupPinBtn').addEventListener('click', async () => {
    const pin = $('#setupPin').value;
    const confirm = $('#setupConfirm').value;
    try {
      await createPin(pin, confirm);
    } catch (err) {
      toast(err.message);
      shakeSetupDots();
    }
  });

  $('#setupConfirm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#setupPinBtn').click();
  });

  $('#setupPin').addEventListener('input', (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, lockState.pinLength);
    e.target.value = val;
    lockState.enteredDigits = val;
    updateSetupDots();
  });

  $('#setupConfirm').addEventListener('input', (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, lockState.pinLength);
    e.target.value = val;
  });
}

function shakeSetupDots() {
  const dots = $$('#setupDots .lock-dot');
  dots.forEach(dot => {
    dot.classList.remove('error');
    void dot.offsetWidth;
    dot.classList.add('error');
  });
  if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
}

export {
  loadLockState,
  initLockUI,
  lockApp,
  verifyCurrentPin,
  updatePin,
  toggleLock,
  setAutoLockDelay,
  setHideNotifications,
  resetAllData,
  resetAutoLockTimer,
  getLockState
};

function getLockState() {
  return lockState;
}