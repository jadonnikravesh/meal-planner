/**
 * foodParser.js
 * Detects food-logging intent and extracts food items with estimated macros.
 *
 * All macro values are per 100 g of the food.
 * `g` is the default serving size used when no quantity is detected.
 */

import { getFoodImageUrl, getFoodColor } from './imageService';

// ─── Food database ────────────────────────────────────────────────────────────
// { cal, protein, carbs, fat } per 100 g  |  g = default serving in grams

const FOOD_DB = {
  chicken:       { cal: 165, protein: 31, carbs: 0,  fat: 3.6, g: 150 },
  turkey:        { cal: 135, protein: 30, carbs: 0,  fat: 1.0, g: 150 },
  beef:          { cal: 250, protein: 26, carbs: 0,  fat: 17,  g: 150 },
  steak:         { cal: 271, protein: 26, carbs: 0,  fat: 18,  g: 200 },
  pork:          { cal: 242, protein: 27, carbs: 0,  fat: 14,  g: 150 },
  salmon:        { cal: 208, protein: 20, carbs: 0,  fat: 13,  g: 150 },
  tuna:          { cal: 116, protein: 26, carbs: 0,  fat: 0.8, g: 100 },
  shrimp:        { cal: 99,  protein: 24, carbs: 0,  fat: 0.3, g: 120 },
  egg:           { cal: 155, protein: 13, carbs: 1.1,fat: 11,  g: 60  },
  rice:          { cal: 130, protein: 2.7,carbs: 28, fat: 0.3, g: 200 },
  pasta:         { cal: 158, protein: 5.8,carbs: 31, fat: 0.9, g: 200 },
  bread:         { cal: 265, protein: 9,  carbs: 49, fat: 3.2, g: 60  },
  oats:          { cal: 389, protein: 17, carbs: 66, fat: 7,   g: 80  },
  oatmeal:       { cal: 71,  protein: 2.5,carbs: 12, fat: 1.5, g: 240 },
  potato:        { cal: 77,  protein: 2,  carbs: 17, fat: 0.1, g: 200 },
  sweetpotato:   { cal: 86,  protein: 1.6,carbs: 20, fat: 0.1, g: 200 },
  banana:        { cal: 89,  protein: 1.1,carbs: 23, fat: 0.3, g: 120 },
  apple:         { cal: 52,  protein: 0.3,carbs: 14, fat: 0.2, g: 182 },
  salad:         { cal: 20,  protein: 1.5,carbs: 3.5,fat: 0.3, g: 200 },
  broccoli:      { cal: 34,  protein: 2.8,carbs: 7,  fat: 0.4, g: 150 },
  spinach:       { cal: 23,  protein: 2.9,carbs: 3.6,fat: 0.4, g: 100 },
  avocado:       { cal: 160, protein: 2,  carbs: 9,  fat: 15,  g: 150 },
  yogurt:        { cal: 59,  protein: 10, carbs: 3.6,fat: 0.4, g: 200 },
  cheese:        { cal: 402, protein: 25, carbs: 1.3,fat: 33,  g: 40  },
  milk:          { cal: 42,  protein: 3.4,carbs: 5,  fat: 1,   g: 244 },
  nuts:          { cal: 607, protein: 20, carbs: 21, fat: 54,  g: 30  },
  almonds:       { cal: 579, protein: 21, carbs: 22, fat: 50,  g: 30  },
  peanutbutter:  { cal: 588, protein: 25, carbs: 20, fat: 50,  g: 32  },
  soup:          { cal: 72,  protein: 4,  carbs: 9,  fat: 2,   g: 300 },
  pizza:         { cal: 266, protein: 11, carbs: 33, fat: 10,  g: 200 },
  burger:        { cal: 295, protein: 17, carbs: 24, fat: 14,  g: 200 },
  sandwich:      { cal: 250, protein: 14, carbs: 30, fat: 8,   g: 180 },
  sushi:         { cal: 150, protein: 7,  carbs: 28, fat: 0.5, g: 200 },
  tacos:         { cal: 218, protein: 11, carbs: 20, fat: 10,  g: 170 },
  coffee:        { cal: 2,   protein: 0.3,carbs: 0,  fat: 0,   g: 240 },
  smoothie:      { cal: 90,  protein: 2,  carbs: 20, fat: 0.5, g: 350 },
  protein_shake: { cal: 130, protein: 25, carbs: 5,  fat: 2,   g: 300 },
};

// ─── Aliases map ──────────────────────────────────────────────────────────────
// Maps common variations and phrases to a FOOD_DB key.

const ALIASES = {
  chicken:       ['chicken', 'grilled chicken', 'chicken breast', 'rotisserie', 'poultry'],
  turkey:        ['turkey', 'turkey breast'],
  beef:          ['beef', 'ground beef', 'mince', 'minced beef'],
  steak:         ['steak', 'ribeye', 'sirloin', 'filet'],
  pork:          ['pork', 'bacon', 'ham', 'pork chop'],
  salmon:        ['salmon', 'smoked salmon'],
  tuna:          ['tuna', 'tuna fish'],
  shrimp:        ['shrimp', 'prawns', 'prawn'],
  egg:           ['egg', 'eggs', 'scrambled egg', 'boiled egg', 'fried egg', 'omelette', 'omelet'],
  rice:          ['rice', 'white rice', 'brown rice', 'fried rice', 'jasmine rice', 'basmati'],
  pasta:         ['pasta', 'spaghetti', 'noodles', 'penne', 'linguine', 'fettuccine'],
  bread:         ['bread', 'toast', 'roll', 'bagel', 'baguette', 'pita'],
  oats:          ['oats', 'granola'],
  oatmeal:       ['oatmeal', 'porridge'],
  potato:        ['potato', 'potatoes', 'fries', 'chips', 'mashed potato'],
  sweetpotato:   ['sweet potato', 'sweet potatoes', 'yam'],
  banana:        ['banana', 'bananas'],
  apple:         ['apple', 'apples'],
  salad:         ['salad', 'greens', 'lettuce'],
  broccoli:      ['broccoli'],
  spinach:       ['spinach', 'kale'],
  avocado:       ['avocado', 'guacamole'],
  yogurt:        ['yogurt', 'yoghurt', 'greek yogurt'],
  cheese:        ['cheese', 'cheddar', 'mozzarella', 'parmesan'],
  milk:          ['milk', 'almond milk', 'oat milk'],
  nuts:          ['nuts', 'mixed nuts', 'cashews', 'walnuts', 'pecans'],
  almonds:       ['almonds', 'almond'],
  peanutbutter:  ['peanut butter', 'pb', 'peanut'],
  soup:          ['soup', 'broth', 'stew', 'chowder'],
  pizza:         ['pizza'],
  burger:        ['burger', 'cheeseburger', 'hamburger'],
  sandwich:      ['sandwich', 'wrap', 'sub', 'hoagie'],
  sushi:         ['sushi', 'sashimi', 'maki', 'roll'],
  tacos:         ['taco', 'tacos', 'burrito'],
  coffee:        ['coffee', 'espresso', 'latte', 'cappuccino', 'americano'],
  smoothie:      ['smoothie', 'smoothie bowl', 'acai bowl', 'juice'],
  protein_shake: ['protein shake', 'protein powder', 'whey', 'mass gainer'],
};

// Display-friendly names for keys that need it
const DISPLAY_NAMES = {
  sweetpotato:   'Sweet Potato',
  peanutbutter:  'Peanut Butter',
  protein_shake: 'Protein Shake',
};

// ─── Intent detection ─────────────────────────────────────────────────────────

const LOG_TRIGGERS = [
  /\b(ate|eating|eat|had|have|consumed|drank|drink|drinking)\b/i,
  /\b(just (had|ate|finished|eaten))\b/i,
  /\b(for (breakfast|lunch|dinner|snack|brunch|supper|dessert))\b/i,
  /\b(my (breakfast|lunch|dinner|snack|meal))\b/i,
  /\bi('m| am) (having|eating)\b/i,
  /\b(log|logged|track|tracked)\b/i,
  /\b(i made|i cooked|i ordered|i bought)\b/i,
];

/** Returns true if the message looks like a food log. */
export function isFoodLog(text) {
  const lower = text.toLowerCase();
  const hasTrigger = LOG_TRIGGERS.some((re) => re.test(lower));
  if (!hasTrigger) return false;

  // Confirm at least one known food keyword exists in the message
  return Object.values(ALIASES).some((list) =>
    list.some((alias) => lower.includes(alias))
  );
}

// ─── Quantity extraction ──────────────────────────────────────────────────────

/**
 * Weight/volume units → grams conversion factor.
 * e.g. "200g chicken" → 200, "2 cups rice" → 480
 */
const WEIGHT_CONV = {
  g: 1, gram: 1, grams: 1,
  kg: 1000,
  oz: 28.35, ounce: 28.35, ounces: 28.35,
  cup: 240, cups: 240,
  tbsp: 15, tsp: 5,
  ml: 1,
};

/**
 * Count/portion units — multiply the food's default gram serving by the count.
 * e.g. "3 slices of bread" → 3 × 60g = 180g
 */
const COUNT_UNITS = new Set([
  'piece', 'pieces', 'slice', 'slices',
  'bowl',  'bowls',  'plate', 'plates',
  'serving', 'servings', 'portion', 'portions',
]);

/**
 * Extract how many grams of a food the user is describing.
 *
 * Priority order:
 *  1. Explicit weight unit  → e.g. "200g chicken",  "2 cups rice"
 *  2. Explicit count unit   → e.g. "3 slices bread", "2 bowls oatmeal"
 *  3. Bare integer count    → e.g. "3 eggs", "2 bananas"  (count ≤ 20 → × defaultG)
 *  4. Bare large number     → e.g. "150 chicken"           (20 < n < 2000 → treat as g)
 *  5. null                  → caller uses defaultG
 */
function extractQuantity(text, aliases, defaultG) {
  const lower = text.toLowerCase();

  for (const alias of aliases) {
    const idx = lower.indexOf(alias);
    if (idx === -1) continue;

    // Windows around the matched alias
    const before = lower.slice(Math.max(0, idx - 28), idx);
    const after  = lower.slice(idx + alias.length, Math.min(lower.length, idx + alias.length + 18));

    // ── 1. Weight/volume unit anywhere in the window ──────────────────────
    const weightRe = /(\d+\.?\d*)\s*(g|gram|grams|kg|oz|ounce|ounces|cup|cups|tbsp|tsp|ml)\b/i;
    for (const chunk of [before, after]) {
      const m = weightRe.exec(chunk);
      if (m) {
        const conv = WEIGHT_CONV[m[2].toLowerCase()];
        if (conv) return Math.round(parseFloat(m[1]) * conv);
      }
    }

    // ── 2. Count unit in the window before alias ──────────────────────────
    // e.g. "3 slices of bread", "a bowl of rice"
    const countRe = /(\d+\.?\d*)\s*(piece|pieces|slice|slices|bowl|bowls|plate|plates|serving|servings|portion|portions)\b/i;
    const cMatch  = countRe.exec(before);
    if (cMatch) {
      const count = parseFloat(cMatch[1]);
      if (count > 0 && count <= 30) return Math.round(count * defaultG);
    }

    // ── 3 & 4. Bare number immediately preceding the alias ───────────────
    // Use the last number found in `before` (closest to the food word).
    // Skip adjectives like "large", "medium", "small" between number and food.
    const bareRe = /(?:^|\s)(\d+\.?\d*)(?:\s+(?:large|medium|small|whole|extra|big|little))?\s*$/i;
    const bMatch = before.match(bareRe);
    if (bMatch) {
      const num = parseFloat(bMatch[1]);
      if (num >= 1 && num <= 20)   return Math.round(num * defaultG); // treat as count
      if (num > 20 && num < 2000) return Math.round(num);             // treat as grams
    }
  }

  return null; // no quantity found → caller will use defaultG
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parses a food-log message and returns extracted items + combined totals.
 *
 * @returns {{
 *   items: Array<{name,grams,calories,protein,carbs,fat,imageUrl,color}>,
 *   total: {calories,protein,carbs,fat}
 * }}
 */
export function parseFoodMessage(text) {
  const lower = text.toLowerCase();
  const seen  = new Set(); // avoid double-counting if two aliases match the same key
  const items = [];

  for (const [key, data] of Object.entries(FOOD_DB)) {
    if (seen.has(key)) continue;
    const aliases = ALIASES[key] || [key];
    const matched = aliases.some((alias) => lower.includes(alias));
    if (!matched) continue;

    seen.add(key);
    const grams   = extractQuantity(text, aliases, data.g) ?? data.g;
    const scale   = grams / 100;
    const display = DISPLAY_NAMES[key] || key.charAt(0).toUpperCase() + key.slice(1);

    items.push({
      name:     display,
      grams,
      calories: Math.round(data.cal     * scale),
      protein:  Math.round(data.protein * scale),
      carbs:    Math.round(data.carbs   * scale),
      fat:      Math.round(data.fat     * scale),
      imageUrl: getFoodImageUrl(key),
      color:    getFoodColor(key),
    });
  }

  const total = items.reduce(
    (acc, i) => ({
      calories: acc.calories + i.calories,
      protein:  acc.protein  + i.protein,
      carbs:    acc.carbs    + i.carbs,
      fat:      acc.fat      + i.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return { items, total };
}

/** Formats a Date as "3:45pm" */
export function formatTime(date = new Date()) {
  let h    = date.getHours();
  const m  = date.getMinutes().toString().padStart(2, '0');
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m}${ap}`;
}
