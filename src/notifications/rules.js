/**
 * Notification Rules — pure data, no imports, no side effects.
 *
 * Each rule:
 *   id        — unique string
 *   slots     — which daily slots this rule can fire in: 'morning' | 'afternoon' | 'evening'
 *   priority  — lower number = higher priority; first matching rule wins per slot
 *   category  — used by the scheduler to respect user settings:
 *                 'meal_reminder' — nudges to log meals (controlled by mealReminders toggle)
 *                 'nutrition'     — protein / calorie guidance
 *                 'motivation'    — positive reinforcement & morning fallback
 *   condition — (data) => boolean
 *   messages  — 3–5 short strings; one is selected at random
 *
 * Data shape passed to condition():
 *   {
 *     mealsLogged   : number,
 *     calories      : number,
 *     calorieTarget : number,
 *     protein       : number,
 *     proteinTarget : number,
 *     // Reserved for future use (not yet passed by scheduler):
 *     // steps      : number,
 *     // stepTarget : number,
 *   }
 *
 * ─── How to add a new condition ──────────────────────────────────────────────
 * 1. Add the field to `buildNotifData` in NotificationManager.js
 * 2. Write a new rule object below (choose slots, priority, category, condition, messages)
 * That's it — no other files need to change.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Rules ────────────────────────────────────────────────────────────────────
export const RULES = [

  // ── No meals logged (category: meal_reminder) ────────────────────────────
  {
    id:       'no_meals_morning',
    slots:    ['morning'],
    priority: 10,
    category: 'meal_reminder',
    condition: ({ mealsLogged }) => mealsLogged === 0,
    messages: [
      "Morning! Start strong — log your breakfast and let's get going 🍳",
      "Hey! Haven't seen your first meal yet. Just say what you ate 🎤",
      "Rise and track! Log breakfast to kick off your day right 💪",
      "Your daily targets just reset — log your first meal to build momentum.",
      "Time to fuel up! Tell the AI what you had for breakfast 🎤",
    ],
  },
  {
    id:       'no_meals_afternoon',
    slots:    ['afternoon'],
    priority: 10,
    category: 'meal_reminder',
    condition: ({ mealsLogged }) => mealsLogged === 0,
    messages: [
      "Midday check-in: no meals logged yet. Just say what you've had 🎤",
      "Haven't tracked anything today — even a snack counts, log it! 🍽️",
      "Quick voice log takes 5 seconds — what have you eaten today? 🎙️",
      "No meals yet today. No judgment — just open the app and say it 🎤",
    ],
  },
  {
    id:       'no_meals_evening',
    slots:    ['evening'],
    priority: 10,
    category: 'meal_reminder',
    condition: ({ mealsLogged }) => mealsLogged === 0,
    messages: [
      "Still no meals tracked today. It's not too late — just say what you ate 🎤",
      "Evening check-in: zero meals logged. Tap and talk, takes 10 seconds 🎙️",
      "No meals today — even logging dinner keeps the streak going 💪",
    ],
  },

  // ── Low protein (category: nutrition) ────────────────────────────────────
  {
    id:       'low_protein_afternoon',
    slots:    ['afternoon'],
    priority: 20,
    category: 'nutrition',
    condition: ({ protein, proteinTarget, mealsLogged }) =>
      mealsLogged > 0 && proteinTarget > 0 && protein / proteinTarget < 0.35,
    messages: [
      "Protein check: under 35% of your target. Add something protein-packed to your next meal 🥩",
      "Low on protein so far — eggs, chicken, yogurt, or a shake can fix that fast 💪",
      "Your muscles want protein! You're behind — time to add some 🥚",
      "Heads up: protein is low today. A high-protein snack now goes a long way 🎯",
    ],
  },
  {
    id:       'low_protein_evening',
    slots:    ['evening'],
    priority: 20,
    category: 'nutrition',
    condition: ({ protein, proteinTarget, mealsLogged }) =>
      mealsLogged > 0 && proteinTarget > 0 && protein / proteinTarget < 0.70,
    messages: [
      "Protein is still low tonight — dinner is your best shot to hit your target 🥩",
      "Under 70% of your protein goal. A high-protein dinner can close the gap 💪",
      "Don't leave protein on the table — you've got time to hit it tonight 🍗",
      "Protein target not hit yet. Log a protein-rich dinner and finish strong 🎯",
    ],
  },

  // ── Behind on calories (category: nutrition) ─────────────────────────────
  {
    id:       'low_calories_afternoon',
    slots:    ['afternoon'],
    priority: 30,
    category: 'nutrition',
    condition: ({ calories, calorieTarget, mealsLogged }) =>
      mealsLogged > 0 && calorieTarget > 0 && calories / calorieTarget < 0.30,
    messages: [
      "You're under 30% of your calorie goal by midday — time to eat! 🍽️",
      "Fueling up? You're behind on calories today — your body needs energy 🔋",
      "Way under calories — eating too little can stall your progress. Time for a real meal 🍴",
      "Low energy day? You haven't eaten much yet — try a solid lunch 🥗",
    ],
  },
  {
    id:       'low_calories_evening',
    slots:    ['evening'],
    priority: 30,
    category: 'nutrition',
    condition: ({ calories, calorieTarget, mealsLogged }) =>
      mealsLogged > 0 && calorieTarget > 0 && calories / calorieTarget < 0.60,
    messages: [
      "Still under 60% of your calorie target — dinner is a great chance to catch up 🍽️",
      "Heading into the evening under-fueled. Log a solid dinner and close the gap 🔋",
      "Less than 60% of your calories tracked today. Don't skimp — fuel yourself right 🍴",
      "Behind on calories tonight. One solid dinner puts you back on track 💪",
    ],
  },

  // ── Calorie goal hit (category: motivation) ───────────────────────────────
  {
    id:       'calorie_goal_hit_evening',
    slots:    ['evening'],
    priority: 35,
    category: 'motivation',
    condition: ({ calories, calorieTarget }) =>
      calorieTarget > 0 && calories / calorieTarget >= 1.0,
    messages: [
      "You've hit your calorie goal today — amazing work! 🏆",
      "Calorie target reached! Rest easy knowing you fueled your body right today ✅",
      "Full day of fuel — calorie goal done. Nice 💪",
    ],
  },

  // ── On track / positive reinforcement (category: motivation) ─────────────
  {
    id:       'on_track_afternoon',
    slots:    ['afternoon'],
    priority: 40,
    category: 'motivation',
    condition: ({ calories, calorieTarget, protein, proteinTarget, mealsLogged }) =>
      mealsLogged > 0 &&
      calorieTarget > 0 && calories / calorieTarget >= 0.30 &&
      proteinTarget > 0 && protein / proteinTarget >= 0.35,
    messages: [
      "Crushing it today! Calories and protein are both on track 🔥",
      "Solid morning — keep logging and you'll nail your targets tonight 🎯",
      "Looking good! Halfway through the day and right on pace 💪",
      "Nice work — your macros are lining up well. Keep it up! ✅",
    ],
  },
  {
    id:       'on_track_evening',
    slots:    ['evening'],
    priority: 40,
    category: 'motivation',
    condition: ({ calories, calorieTarget, protein, proteinTarget, mealsLogged }) =>
      mealsLogged > 0 &&
      calorieTarget > 0 && calories / calorieTarget >= 0.75 &&
      proteinTarget > 0 && protein / proteinTarget >= 0.75,
    messages: [
      "Almost there — you're close to hitting all your targets today 🎯",
      "Great day of eating! Nearly at your calorie and protein goals 🏆",
      "75%+ to your targets. One more meal and you're done 🔥",
      "Looks like a win today! Finish strong tonight 💪",
    ],
  },

  // ── General morning motivation — fallback, always matches (category: motivation)
  {
    id:       'morning_motivation',
    slots:    ['morning'],
    priority: 50,
    category: 'motivation',
    condition: () => true,
    messages: [
      "New day, new start! Your targets just reset — let's go 🌅",
      "Morning! Your macro goals are waiting — make today count 💪",
      "Good morning! Log your meals and let the AI guide you today 🎤",
      "Start the day right — even just logging breakfast builds the habit 🍳",
      "Rise and grind! Open the app, log a meal, and let's go 🔥",
    ],
  },

];
