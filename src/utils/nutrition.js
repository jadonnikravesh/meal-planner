export function calculateTargets(profile) {
  const { gender, age, height, weight, goal, activityLevel, units } = profile;

  // ── Convert to metric ──────────────────────────────────────────────────────
  let weightKg = parseFloat(weight) || 70;
  let heightCm = parseFloat(height) || 170;

  if ((units === 'imperial') || (!units)) {
    weightKg = (parseFloat(weight) || 154) * 0.453592;
    heightCm = (parseFloat(height) || 67)  * 2.54;
  }

  const ageNum = parseFloat(age) || 25;

  // ── Mifflin-St Jeor BMR ───────────────────────────────────────────────────
  let bmr;
  if (gender === 'female') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageNum - 161;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageNum + 5;
  }

  // ── TDEE via activity multiplier ──────────────────────────────────────────
  const activityMultipliers = {
    sedentary:  1.2,
    light:      1.375,
    moderate:   1.55,
    active:     1.725,
    veryActive: 1.9,
  };
  const tdee = bmr * (activityMultipliers[activityLevel] || 1.55);

  // ── Calorie target by goal ─────────────────────────────────────────────────
  let calorieTarget;
  switch (goal) {
    case 'loseFat':
      // Moderate deficit (~20%). Never below 1200.
      calorieTarget = Math.round(tdee * 0.80);
      break;
    case 'gainMuscle':
      // Lean bulk — small surplus (~12%)
      calorieTarget = Math.round(tdee * 1.12);
      break;
    default: // maintain
      calorieTarget = Math.round(tdee);
  }
  calorieTarget = Math.max(1200, calorieTarget);

  // ── Protein — goal-optimised (g/kg of bodyweight) ─────────────────────────
  // Lose fat:    higher protein to preserve muscle in a deficit (2.4 g/kg)
  // Gain muscle: high protein to maximise synthesis (2.2 g/kg)
  // Maintain:    healthy baseline (1.8 g/kg)
  const proteinPerKg = goal === 'loseFat' ? 2.4 : goal === 'gainMuscle' ? 2.2 : 1.8;
  const proteinTarget = Math.round(weightKg * proteinPerKg);

  // ── Fat — 25-30% of calories (essential for hormones) ────────────────────
  const fatPct = goal === 'loseFat' ? 0.28 : 0.25;
  const fatTarget = Math.round((calorieTarget * fatPct) / 9);

  // ── Carbs — fill remaining calories ──────────────────────────────────────
  const carbCalories = calorieTarget - proteinTarget * 4 - fatTarget * 9;
  const carbTarget   = Math.max(50, Math.round(carbCalories / 4));

  // ── Water — 35ml per kg of bodyweight (scales with size & activity) ───────
  const baseWater = Math.round(weightKg * 35);
  const activityBonus = { sedentary: 0, light: 200, moderate: 400, active: 600, veryActive: 800 };
  const waterTarget = baseWater + (activityBonus[activityLevel] || 400);

  return {
    calorieTarget,
    proteinTarget,
    carbTarget,
    fatTarget,
    waterTarget,
  };
}

export function getTodayKey() {
  const now = new Date();
  // Use local calendar date, NOT UTC. toISOString() returns UTC, which flips the
  // "day" at 7–8pm for US Eastern users — meals logged in the evening would appear
  // under tomorrow's date key.
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getAdherenceScore(log, targets) {
  if (!log || !log.calories) return 0;
  const calPct  = log.calories / targets.calorieTarget;
  const protPct = log.protein  / targets.proteinTarget;

  if (calPct >= 0.85 && calPct <= 1.15 && protPct >= 0.85) return 4;
  if (calPct >= 0.75 && calPct <= 1.25 && protPct >= 0.7)  return 3;
  if (calPct >= 0.55 && calPct <= 1.35)                     return 2;
  return 1;
}

export function getAdherenceColor(score, colors) {
  const map = {
    0: colors.surfaceAlt,
    1: colors.red,
    2: colors.orange,
    3: colors.yellow,
    4: colors.accent,
  };
  return map[score] ?? colors.surfaceAlt;
}

export function getAdherenceLabel(score) {
  const map = { 0: 'No data', 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Excellent' };
  return map[score] ?? 'No data';
}

export function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTime() {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Count consecutive days (counting back from today) where calories > 0.
 * Today counts if it has any logged calories; otherwise the streak starts
 * from yesterday (so a fresh day doesn't break yesterday's streak).
 */
export function computeStreak(dailyLogs) {
  if (!dailyLogs) return 0;
  let streak = 0;
  const today = new Date();
  // If today has no data yet, start checking from yesterday
  const todayKey = getDateKey(today);
  const todayLog = dailyLogs[todayKey];
  const startOffset = todayLog && todayLog.calories > 0 ? 0 : -1;
  const d = new Date(today);
  d.setDate(d.getDate() + startOffset);
  while (true) {
    const key = getDateKey(d);
    const log = dailyLogs[key];
    if (!log || !log.calories || log.calories === 0) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
