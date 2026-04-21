/**
 * weightEstimation.js
 *
 * Pure functions for the weekly weight check-in feature.
 *
 * Algorithm:
 *   1. Pull last 7 days of calorie logs.
 *   2. Average the logged days (skip untracked days — no data = no signal).
 *   3. Compare average to TDEE to get a daily energy balance.
 *   4. Project over a full 7-day week (assuming untracked days = maintenance),
 *      giving a conservative but realistic weekly balance.
 *   5. Divide by 3 500 kcal/lb (or 7 700 kcal/kg) to estimate weight change.
 */

import { getDateKey } from './nutrition';

// ─── TDEE (mirrors calculateTargets in nutrition.js) ─────────────────────────
function computeTDEE(profile) {
  const { gender, age, height, weight, activityLevel, units } = profile || {};

  let weightKg = parseFloat(weight) || 70;
  let heightCm = parseFloat(height) || 170;

  if (!units || units === 'imperial') {
    weightKg = (parseFloat(weight) || 154) * 0.453592;
    heightCm = (parseFloat(height) || 67)  * 2.54;
  }

  const ageNum = parseFloat(age) || 25;
  const gConst = gender === 'female' ? -161 : 5;
  const bmr    = 10 * weightKg + 6.25 * heightCm - 5 * ageNum + gConst;

  const mult = {
    sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, veryActive: 1.9,
  };
  return bmr * (mult[activityLevel] || 1.55);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Estimate weekly weight change from the last 7 days of calorie logs.
 * Returns null when fewer than 3 days were tracked (not enough signal).
 *
 * Returned shape:
 *   { daysTracked, avgCalories, tdee, weeklyBalance,
 *     weightChange, suggestedWeight, currentWeight, unit }
 */
export function estimateWeeklyWeightChange(dailyLogs, profile) {
  if (!dailyLogs || !profile) return null;

  const isImperial  = !profile.units || profile.units === 'imperial';
  const tdee        = computeTDEE(profile);
  const today       = new Date();

  let totalCal   = 0;
  let daysTracked = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const log = dailyLogs[getDateKey(d)];
    if (log && log.calories > 0) {
      totalCal += log.calories;
      daysTracked++;
    }
  }

  if (daysTracked < 3) return null;

  const avgCalories   = Math.round(totalCal / daysTracked);
  // Project over full 7-day week — untracked days assumed at maintenance (zero balance)
  const weeklyBalance = Math.round((avgCalories - tdee) * 7);

  const kcalPerUnit   = isImperial ? 3500 : 7700;
  const weightChange  = weeklyBalance / kcalPerUnit;

  const currentWeight   = parseFloat(profile.weight) || 0;
  const suggestedWeight = Math.round((currentWeight + weightChange) * 10) / 10;
  const minWeight       = isImperial ? 50 : 25;

  return {
    daysTracked,
    avgCalories,
    tdee:            Math.round(tdee),
    weeklyBalance,
    weightChange:    Math.round(weightChange * 10) / 10,
    suggestedWeight: Math.max(minWeight, suggestedWeight),
    currentWeight,
    unit:            isImperial ? 'lbs' : 'kg',
  };
}

/**
 * Returns the Date for the next upcoming Sunday at 20:00 local time.
 * If today is Sunday and it is before 20:00, returns tonight.
 */
export function getNextSundayAt8pm() {
  const now    = new Date();
  const day    = now.getDay(); // 0 = Sunday
  const target = new Date(now);

  const daysToSunday = day === 0 ? 0 : 7 - day;

  if (daysToSunday > 0 || now.getHours() >= 20) {
    // Not Sunday yet this week, or Sunday but past 8 pm → advance to next Sunday
    target.setDate(target.getDate() + (daysToSunday === 0 ? 7 : daysToSunday));
  }

  target.setHours(20, 0, 0, 0);
  return target;
}

/**
 * A weekly review is due when:
 *   • lastReviewedDate is null/undefined (first time ever), OR
 *   • at least 7 days have elapsed since the last review
 */
export function isWeeklyReviewDue(lastReviewedDate) {
  if (!lastReviewedDate) return true;
  const last     = new Date(lastReviewedDate + 'T12:00:00');
  const daysDiff = (Date.now() - last.getTime()) / 86_400_000;
  return daysDiff >= 7;
}
