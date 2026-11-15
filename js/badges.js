/**
 * Badges and achievements system
 */

import { getAppData } from './db.js';
import { pctOf } from './score.js';

const BADGES = [
  {
    id: 'first-goal',
    name: 'First Steps',
    description: 'Add your first goal',
    icon: '👶',
    check: (data) => Object.values(data.days).some(d => d.length > 0)
  },
  {
    id: 'first-perfect',
    name: 'Perfect Day',
    description: 'Complete all goals in a day',
    icon: '⭐',
    check: (data) => Object.values(data.days).some(d => d.length > 0 && pctOf(d) === 100)
  },
  {
    id: 'streak-3',
    name: 'Getting Started',
    description: '3-day streak (50%+)',
    icon: '🔥',
    check: (data) => getStreak(data) >= 3
  },
  {
    id: 'streak-7',
    name: 'Week Warrior',
    description: '7-day streak (50%+)',
    icon: '🔥🔥',
    check: (data) => getStreak(data) >= 7
  },
  {
    id: 'streak-30',
    name: 'Monthly Master',
    description: '30-day streak (50%+)',
    icon: '🔥🔥🔥',
    check: (data) => getStreak(data) >= 30
  },
  {
    id: 'goals-10',
    name: 'Goal Getter',
    description: 'Complete 10 goals total',
    icon: '🎯',
    check: (data) => getTotalCompleted(data) >= 10
  },
  {
    id: 'goals-50',
    name: 'Achiever',
    description: 'Complete 50 goals total',
    icon: '🏆',
    check: (data) => getTotalCompleted(data) >= 50
  },
  {
    id: 'goals-100',
    name: 'Centurion',
    description: 'Complete 100 goals total',
    icon: '💯',
    check: (data) => getTotalCompleted(data) >= 100
  },
  {
    id: 'goals-500',
    name: 'Legend',
    description: 'Complete 500 goals total',
    icon: '👑',
    check: (data) => getTotalCompleted(data) >= 500
  },
  {
    id: 'days-30',
    name: 'Month Tracker',
    description: 'Track 30 days',
    icon: '📅',
    check: (data) => Object.keys(data.days).filter(k => data.days[k].length).length >= 30
  },
  {
    id: 'days-100',
    name: 'Century Tracker',
    description: 'Track 100 days',
    icon: '📅📅',
    check: (data) => Object.keys(data.days).filter(k => data.days[k].length).length >= 100
  },
  {
    id: 'days-365',
    name: 'Year Warrior',
    description: 'Track 365 days',
    icon: '📅📅📅',
    check: (data) => Object.keys(data.days).filter(k => data.days[k].length).length >= 365
  },
  {
    id: 'early-bird',
    name: 'Early Bird',
    description: 'Complete a goal before 8 AM',
    icon: '🌅',
    check: (data) => checkEarlyBird(data)
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Complete a goal after 10 PM',
    icon: '🦉',
    check: (data) => checkNightOwl(data)
  },
  {
    id: 'weekend-warrior',
    name: 'Weekend Warrior',
    description: 'Perfect day on a weekend',
    icon: '🏖️',
    check: (data) => checkWeekendPerfect(data)
  }
];

function getStreak(data, minScore = 50) {
  let streak = 0;
  for (let i = 0;; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateISO = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    const goals = data.days[dateISO] || [];
    if (goals.length && pctOf(goals) >= minScore) {
      streak++;
    } else if (i === 0 && !goals.length) {
      continue;
    } else {
      break;
    }
  }
  return streak;
}

function getTotalCompleted(data) {
  return Object.values(data.days).reduce((sum, goals) =>
    sum + goals.filter(g => g.done).length, 0);
}

function checkEarlyBird(data) {
  for (const goals of Object.values(data.days)) {
    for (const goal of goals) {
      if (goal.done && goal.startTime) {
        const hour = parseInt(goal.startTime.split(':')[0]);
        if (hour < 8) return true;
      }
    }
  }
  return false;
}

function checkNightOwl(data) {
  for (const goals of Object.values(data.days)) {
    for (const goal of goals) {
      if (goal.done && goal.startTime) {
        const hour = parseInt(goal.startTime.split(':')[0]);
        if (hour >= 22) return true;
      }
    }
  }
  return false;
}

function checkWeekendPerfect(data) {
  for (const [date, goals] of Object.entries(data.days)) {
    const d = new Date(date);
    const day = d.getDay();
    if ((day === 0 || day === 6) && goals.length > 0 && pctOf(goals) === 100) {
      return true;
    }
  }
  return false;
}

async function checkBadges() {
  const data = await getAppData();
  const earned = data.badges || [];

  const newlyEarned = [];

  for (const badge of BADGES) {
    if (earned.includes(badge.id)) continue;
    if (badge.check(data)) {
      earned.push(badge.id);
      newlyEarned.push(badge);
    }
  }

  if (newlyEarned.length > 0) {
    data.badges = earned;
    await saveAppData(data);
  }

  return newlyEarned;
}

async function getEarnedBadges() {
  const data = await getAppData();
  return (data.badges || []).map(id => BADGES.find(b => b.id === id)).filter(Boolean);
}

async function getAllBadges() {
  const data = await getAppData();
  const earned = data.badges || [];
  return BADGES.map(badge => ({
    ...badge,
    earned: earned.includes(badge.id)
  }));
}

function renderBadges() {
  return getAllBadges().then(badges => {
    const container = $('#badgesGrid');
    if (!container) return;

    container.innerHTML = badges.map(badge => `
      <div class="badge ${badge.earned ? 'earned' : ''}" title="${escapeHtml(badge.description)}">
        <span class="badge-icon">${badge.icon}</span>
        <span class="badge-name">${escapeHtml(badge.name)}</span>
      </div>
    `).join('');
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export {
  BADGES,
  checkBadges,
  getEarnedBadges,
  getAllBadges,
  renderBadges,
  getStreak,
  getTotalCompleted
};