/**
 * Score calculation and display logic
 */

import { getAppData } from './db.js';

function pctOf(goals) {
  if (!goals || !goals.length) return 0;
  const done = goals.filter(g => g.done).length;
  return Math.round(done / goals.length * 100);
}

function getDayScore(dateISO) {
  return getAppData().then(data => {
    const goals = data.days[dateISO] || [];
    return pctOf(goals);
  });
}

function getAllScores() {
  return getAppData().then(data => {
    const scores = {};
    for (const [date, goals] of Object.entries(data.days)) {
      scores[date] = pctOf(goals);
    }
    return scores;
  });
}

function getWeeklyAverage(weeks = 1) {
  return getAppData().then(data => {
    const today = new Date();
    let total = 0;
    let count = 0;
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateISO = d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
      const goals = data.days[dateISO];
      if (goals && goals.length) {
        total += pctOf(goals);
        count++;
      }
    }
    return count ? Math.round(total / count) : 0;
  });
}

function getMonthlyAverage(months = 1) {
  return getAppData().then(data => {
    const today = new Date();
    let total = 0;
    let count = 0;
    for (let i = 0; i < months * 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateISO = d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
      const goals = data.days[dateISO];
      if (goals && goals.length) {
        total += pctOf(goals);
        count++;
      }
    }
    return count ? Math.round(total / count) : 0;
  });
}

function getStreak(minScore = 50) {
  return getAppData().then(data => {
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
  });
}

function getLongestStreak(minScore = 50) {
  return getAppData().then(data => {
    const dates = Object.keys(data.days).sort();
    if (!dates.length) return 0;

    let maxStreak = 0;
    let currentStreak = 0;

    const today = new Date();
    const todayISO = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

    for (let i = 0;; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateISO = d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
      const goals = data.days[dateISO] || [];

      if (goals.length && pctOf(goals) >= minScore) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else if (i === 0 && !goals.length) {
        continue;
      } else {
        currentStreak = 0;
      }

      if (i > 365 * 2) break;
    }

    return maxStreak;
  });
}

function getBestDay() {
  return getAppData().then(data => {
    let best = 0;
    let bestDate = null;
    for (const [date, goals] of Object.entries(data.days)) {
      const score = pctOf(goals);
      if (score > best) {
        best = score;
        bestDate = date;
      }
    }
    return { date: bestDate, score: best };
  });
}

function getLowestDay() {
  return getAppData().then(data => {
    let lowest = 101;
    let lowestDate = null;
    for (const [date, goals] of Object.entries(data.days)) {
      if (!goals.length) continue;
      const score = pctOf(goals);
      if (score < lowest) {
        lowest = score;
        lowestDate = date;
      }
    }
    return lowest === 101 ? { date: null, score: 0 } : { date: lowestDate, score: lowest };
  });
}

function getTotalStats() {
  return getAppData().then(data => {
    const dates = Object.keys(data.days).filter(k => data.days[k].length);
    const added = dates.reduce((a, k) => a + data.days[k].length, 0);
    const done = dates.reduce((a, k) => a + data.days[k].filter(g => g.done).length, 0);
    const avg = dates.length ? Math.round(dates.reduce((a, k) => a + pctOf(data.days[k]), 0) / dates.length) : 0;
    return { daysTracked: dates.length, added, done, avg };
  });
}

function getScoreMessage(score, total) {
  if (!total) return { title: 'No tasks yet', subtitle: 'Add your first task below.' };
  const done = Math.round(total * score / 100);
  let title;
  if (score === 100) title = 'Perfect day!';
  else if (score >= 75) title = 'Almost there';
  else if (score >= 40) title = 'Good progress';
  else if (score > 0) title = 'Nice start';
  else title = 'Time to begin';
  return { title, subtitle: `${done} of ${total} done` };
}

export {
  pctOf,
  getDayScore,
  getAllScores,
  getWeeklyAverage,
  getMonthlyAverage,
  getStreak,
  getLongestStreak,
  getBestDay,
  getLowestDay,
  getTotalStats,
  getScoreMessage
};