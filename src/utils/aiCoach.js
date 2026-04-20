import { FOOD_DATABASE, PORTION_MULTIPLIERS, WATER_AMOUNTS } from './foodDatabase';
import { formatTime } from './nutrition';

// ─────────────────────────────────────────────────────────────────────────────
// PARSING
// ─────────────────────────────────────────────────────────────────────────────

export function parseUserInput(message) {
  const lower = message.toLowerCase();

  const waterResult = parseWaterIntake(lower);
  if (waterResult) return { type: 'water', ...waterResult };

  const foodResult = parseFoodIntake(lower);
  if (foodResult.foods.length > 0) return { type: 'food', ...foodResult };

  return { type: 'chat' };
}

function parseWaterIntake(text) {
  const waterKeywords = ['water', 'drank', 'drink', 'hydrat', 'fluid'];
  if (!waterKeywords.some((k) => text.includes(k))) return null;

  // Try specific containers first
  for (const [key, ml] of Object.entries(WATER_AMOUNTS)) {
    if (text.includes(key)) {
      const numMatch = text.match(/(\d+)\s*(glass|cup|bottle|liter|litre|sip)/);
      const multiplier = numMatch ? parseInt(numMatch[1], 10) : 1;
      return { amount: ml * multiplier, unit: key };
    }
  }

  // Generic water mention → assume one glass
  return { amount: 250, unit: 'glass', estimated: true };
}

function parseFoodIntake(text) {
  const eatKeywords = [
    'ate', 'had', 'eat', 'eaten', 'consumed', 'just had',
    'for breakfast', 'for lunch', 'for dinner', 'for snack',
    'grabbed', 'had a', 'had some', 'i ate', 'i had', 'i eat',
  ];
  const isEating = eatKeywords.some((k) => text.includes(k));
  if (!isEating) return { foods: [] };

  const foods = [];

  for (const [foodName, nutrition] of Object.entries(FOOD_DATABASE)) {
    if (text.includes(foodName)) {
      let multiplier = 1;

      // Check portion size adjectives
      for (const [word, mult] of Object.entries(PORTION_MULTIPLIERS)) {
        if (text.includes(word)) {
          multiplier = mult;
          break;
        }
      }

      // Check numeric quantities before a known unit
      const numMatch = text.match(/(\d+)\s*(piece|slice|cup|bowl|plate|scoop|serving|oz|g\b|gram)/);
      if (numMatch) multiplier = Math.min(parseInt(numMatch[1], 10), 10);

      foods.push({
        name: foodName,
        calories: Math.round(nutrition.calories * multiplier),
        protein: Math.round(nutrition.protein * multiplier * 10) / 10,
        carbs: Math.round(nutrition.carbs * multiplier * 10) / 10,
        fat: Math.round(nutrition.fat * multiplier * 10) / 10,
        serving: nutrition.serving,
        multiplier,
      });
    }
  }

  return { foods };
}

// ─────────────────────────────────────────────────────────────────────────────
// MISSING INFO DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export function detectMissingInfo(message, parsedResult) {
  if (parsedResult.type !== 'food' || parsedResult.foods.length === 0) return [];

  const lower = message.toLowerCase();
  const missing = [];

  // Check for vague proteins that need cooking method
  const vagueProteins = ['chicken', 'fish', 'meat', 'steak', 'beef', 'pork'];
  const cookingMethods = ['grilled', 'baked', 'fried', 'boiled', 'roasted', 'steamed', 'raw', 'poached'];
  for (const item of vagueProteins) {
    if (lower.includes(item) && !cookingMethods.some((m) => lower.includes(m))) {
      missing.push({ type: 'cooking_method', item });
      break;
    }
  }

  // Check for missing portion size
  const portionWords = [
    'small', 'medium', 'large', 'big', 'cup', 'bowl', 'plate',
    'oz', 'gram', 'piece', 'slice', 'scoop', '100g', '200g',
  ];
  if (!portionWords.some((p) => lower.includes(p))) {
    missing.push({ type: 'portion_size', items: parsedResult.foods.map((f) => f.name) });
  }

  return missing;
}

export function generateFollowUpQuestion(missingInfo) {
  if (!missingInfo || missingInfo.length === 0) return null;
  const first = missingInfo[0];
  switch (first.type) {
    case 'cooking_method':
      return `Quick one — how was the ${first.item} prepared? (grilled, baked, fried, etc.)`;
    case 'portion_size':
      return `What portion size was that? (small, medium, large, or something like 1 cup or 200g)`;
    default:
      return 'Can you give me a bit more detail about that?';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE GENERATION
// ─────────────────────────────────────────────────────────────────────────────

export function generateAIResponse(message, parsedResult, todayLog, userProfile, missingInfo) {
  const log = todayLog || { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0, meals: [] };

  if (parsedResult.type === 'water') {
    return buildWaterResponse(parsedResult, log, userProfile);
  }

  if (parsedResult.type === 'food' && parsedResult.foods.length > 0) {
    if (missingInfo && missingInfo.length > 0) {
      return generateFollowUpQuestion(missingInfo);
    }
    return buildFoodResponse(parsedResult.foods, log, userProfile);
  }

  return buildChatResponse(message, log, userProfile);
}

function buildWaterResponse(parsed, log, profile) {
  const ml = parsed.amount;
  const totalWater = (log.water || 0) + ml;
  const goalL = (profile.waterTarget || 2700) / 1000;
  const totalL = totalWater / 1000;
  const pct = Math.round((totalWater / (profile.waterTarget || 2700)) * 100);

  let status;
  if (pct >= 100) status = 'Perfect hydration today!';
  else if (pct >= 70) status = 'Almost there — keep it up!';
  else if (pct >= 40) status = `${(goalL - totalL).toFixed(1)}L more to hit your goal.`;
  else status = 'You need to drink more — try a glass with your next meal.';

  return `Logged ${ml}ml of water. You're now at ${totalL.toFixed(1)}L / ${goalL.toFixed(1)}L (${pct}%). ${status}`;
}

function buildFoodResponse(foods, log, profile) {
  const totalCals = foods.reduce((s, f) => s + f.calories, 0);
  const totalProt = foods.reduce((s, f) => s + f.protein, 0);
  const totalCarbs = foods.reduce((s, f) => s + f.carbs, 0);
  const totalFat = foods.reduce((s, f) => s + f.fat, 0);

  const newCalTotal = (log.calories || 0) + totalCals;
  const newProtTotal = (log.protein || 0) + totalProt;
  const calTarget = profile.calorieTarget || 2000;
  const protTarget = profile.proteinTarget || 150;

  const calRemaining = calTarget - newCalTotal;
  const protRemaining = protTarget - newProtTotal;

  let advice = '';
  if (protRemaining > 40) {
    advice = `You still need ${Math.round(protRemaining)}g protein today — consider adding chicken, eggs, or a shake to your next meal.`;
  } else if (calRemaining < 0) {
    advice = `You're ${Math.abs(calRemaining)} kcal over your daily target. Stay light for the rest of the day.`;
  } else if (calRemaining < 300) {
    advice = `Only ${calRemaining} kcal left — keep it to a light snack if you get hungry.`;
  } else {
    advice = `You have ${calRemaining} kcal and ${Math.max(0, Math.round(protRemaining))}g protein left for the day. Stay consistent!`;
  }

  return (
    `Logged! ~${totalCals} kcal | ${totalProt.toFixed(0)}g protein | ${totalCarbs.toFixed(0)}g carbs | ${totalFat.toFixed(0)}g fat\n\n` +
    `Today: ${newCalTotal}/${calTarget} kcal · ${newProtTotal.toFixed(0)}/${protTarget}g protein\n\n` +
    advice
  );
}

function buildChatResponse(message, log, profile) {
  const lower = message.toLowerCase();
  const calTarget = profile.calorieTarget || 2000;
  const protTarget = profile.proteinTarget || 150;
  const waterTarget = profile.waterTarget || 2700;

  const calConsumed = log.calories || 0;
  const protConsumed = log.protein || 0;
  const waterConsumed = log.water || 0;
  const calRemaining = calTarget - calConsumed;
  const protRemaining = protTarget - protConsumed;

  if (/(how.*doing|progress|how.*going|check.*in)/i.test(lower)) {
    const calPct = Math.round((calConsumed / calTarget) * 100);
    const protPct = Math.round((protConsumed / protTarget) * 100);
    const waterPct = Math.round((waterConsumed / waterTarget) * 100);
    return (
      `Here's your snapshot:\n\n` +
      `🔥 Calories: ${calConsumed}/${calTarget} kcal (${calPct}%)\n` +
      `💪 Protein: ${protConsumed.toFixed(0)}/${protTarget}g (${protPct}%)\n` +
      `💧 Water: ${(waterConsumed / 1000).toFixed(1)}/${(waterTarget / 1000).toFixed(1)}L (${waterPct}%)\n\n` +
      (calPct >= 80 && protPct >= 80 ? 'Great work — you are crushing your goals!' : 'Still room to improve — keep logging and stay consistent.')
    );
  }

  if (/(calories left|kcal left|how many calorie)/i.test(lower)) {
    return `You have ${Math.max(0, calRemaining)} kcal left today. ${calRemaining > 500 ? 'Plenty for a solid meal.' : calRemaining > 200 ? 'Enough for a light meal or snack.' : 'Almost at your limit — be mindful.'}`;
  }

  if (/protein/i.test(lower)) {
    if (protRemaining > 0) {
      return `You need ${Math.round(protRemaining)}g more protein today. Top sources: grilled chicken (31g/100g), Greek yogurt (17g/170g), eggs (6g each), cottage cheese (25g/226g), or a protein shake (25g/scoop).`;
    }
    return `You have already hit your ${protTarget}g protein goal for today. Solid work!`;
  }

  if (/water|hydrat/i.test(lower)) {
    const waterLeft = ((waterTarget - waterConsumed) / 1000).toFixed(1);
    return waterConsumed >= waterTarget
      ? 'You have hit your water goal for today. Keep sipping to stay ahead!'
      : `You need ${waterLeft}L more water today. Try drinking a glass with every meal and keeping a bottle nearby.`;
  }

  if (/(what.*eat|suggest.*food|what.*have|what.*should)/i.test(lower)) {
    if (protRemaining > 40) {
      return `With ${Math.max(0, calRemaining)} kcal and ${Math.round(protRemaining)}g protein left, I'd suggest:\n\n🐔 Grilled chicken breast (165 kcal, 31g protein) with brown rice and vegetables — hits your protein without blowing calories.\n\nOr if you want something quick: Greek yogurt (100 kcal, 17g protein) + a handful of almonds.`;
    }
    if (calRemaining > 400) {
      return `You have ${calRemaining} kcal left. A balanced option: salmon with sweet potato and steamed broccoli — ~450 kcal, great omega-3s and micronutrients.`;
    }
    return `You are close to your calorie limit. A light option: mixed salad with a boiled egg (~200 kcal) or Greek yogurt (~100 kcal).`;
  }

  if (/(grocery|shopping list)/i.test(lower)) {
    return `Here is a simple high-protein grocery list for your goals:\n\n🥩 Proteins: Chicken breast, salmon, eggs, Greek yogurt, cottage cheese\n🌾 Carbs: Brown rice, oats, sweet potatoes, whole-grain bread\n🥦 Veggies: Broccoli, spinach, mixed greens, bell peppers\n🥑 Healthy fats: Avocado, almonds, olive oil\n💧 Drinks: Water, sparkling water`;
  }

  if (/(hi|hello|hey|sup|what's up)/i.test(lower)) {
    return `Hey! Ready to help you crush your goals. Tell me what you ate or drank, ask about your progress, what to eat next, or anything nutrition-related. What do you need?`;
  }

  return `I'm here to help you stay on track! You can:\n• Tell me what you ate: "I had grilled chicken and rice"\n• Log water: "I drank a glass of water"\n• Check progress: "How am I doing?"\n• Get food suggestions: "What should I eat for dinner?"\n\nWhat's on your mind?`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TREND ANALYSIS & COACHING
// ─────────────────────────────────────────────────────────────────────────────

export function analyzeUserTrends(dailyLogs, userProfile, daysBack = 7) {
  const suggestions = [];
  const today = new Date();
  const logs = [];

  for (let i = 1; i <= daysBack; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    if (dailyLogs[key] && dailyLogs[key].calories > 0) {
      logs.push(dailyLogs[key]);
    }
  }

  if (logs.length < 2) return suggestions;

  const avgProtein = logs.reduce((s, l) => s + (l.protein || 0), 0) / logs.length;
  const avgWater = logs.reduce((s, l) => s + (l.water || 0), 0) / logs.length;
  const avgCalories = logs.reduce((s, l) => s + (l.calories || 0), 0) / logs.length;
  const protTarget = userProfile.proteinTarget || 150;
  const calTarget = userProfile.calorieTarget || 2000;
  const waterTarget = userProfile.waterTarget || 2700;

  if (avgProtein < protTarget * 0.8) {
    suggestions.push(
      `You have averaged only ${Math.round(avgProtein)}g protein over the last ${logs.length} days (goal: ${protTarget}g). ` +
      `Try adding a protein source to breakfast — eggs or Greek yogurt are quick wins.`
    );
  }

  if (avgWater < waterTarget * 0.7) {
    suggestions.push(
      `Your hydration has been low — averaging ${(avgWater / 1000).toFixed(1)}L vs your ${(waterTarget / 1000).toFixed(1)}L goal. ` +
      `Set a reminder to drink a glass every 2 hours.`
    );
  }

  if (avgCalories > calTarget * 1.15) {
    suggestions.push(
      `You have been over your calorie target by ~${Math.round(avgCalories - calTarget)} kcal on average. ` +
      `Watch portion sizes, especially at dinner.`
    );
  } else if (avgCalories < calTarget * 0.7) {
    suggestions.push(
      `You have been significantly under-eating (avg ${Math.round(avgCalories)} kcal). ` +
      `This can slow your metabolism — try not to skip meals.`
    );
  }

  return suggestions;
}

export function generateDaySummary(log, targets) {
  if (!log || !log.calories) return 'No data logged for this day.';

  const calDiff = (log.calories || 0) - targets.calorieTarget;
  const protDiff = (log.protein || 0) - targets.proteinTarget;
  const waterOk = (log.water || 0) >= targets.waterTarget * 0.8;

  let parts = [];

  if (Math.abs(calDiff) <= 100) {
    parts.push('Calories were spot-on.');
  } else if (calDiff > 100) {
    parts.push(`Calories were ${calDiff} kcal over target.`);
  } else {
    parts.push(`Calories were ${Math.abs(calDiff)} kcal under target.`);
  }

  if (protDiff >= -15) {
    parts.push('Protein goal was met.');
  } else {
    parts.push(`Protein was ${Math.abs(Math.round(protDiff))}g short — try prioritising lean protein earlier in the day.`);
  }

  if (!waterOk) {
    parts.push(`Water intake was below goal — aim for ${(targets.waterTarget / 1000).toFixed(1)}L daily.`);
  } else {
    parts.push('Hydration was on point.');
  }

  return parts.join(' ');
}

export function buildInitialGreeting(userProfile, todayLog, dailyLogs) {
  const name = userProfile.name ? `, ${userProfile.name}` : '';
  const trends = analyzeUserTrends(dailyLogs, userProfile);

  let greeting =
    `Hey${name}! I'm your nutrition coach.\n\n` +
    `Tell me what you eat or drink and I'll log it automatically. I'll also flag if I need more info to give you accurate numbers.`;

  if (trends.length > 0) {
    greeting += `\n\n📊 Insight from your recent history:\n${trends[0]}`;
  }

  return greeting;
}
