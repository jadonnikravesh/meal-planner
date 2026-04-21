/**
 * foodPreferences.js
 *
 * Derives a ranked list of foods the user eats most often from their daily logs,
 * applying exponential time decay so recent meals carry more weight.
 *
 * Decay rate: half-weight at ~14 days  (λ = 0.05  →  e^(-0.05*14) ≈ 0.50)
 */

// Strip leading quantities ("2 cups of", "1x", "200g") and filler words so
// "3 scrambled eggs" and "scrambled eggs" map to the same key.
function normalizeKey(name) {
  return name
    .toLowerCase()
    .replace(/^\d+(\.\d+)?\s*(x|oz|g|ml|cups?|tbsp|tsp|slices?|pieces?|servings?)?\s+(of\s+)?/i, '')
    .replace(/\b(with|and|&|of|the|a|an)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

/**
 * Returns the top `limit` foods scored by recency-weighted frequency.
 *
 * @param {object} dailyLogs  AppContext dailyLogs: { 'YYYY-MM-DD': { meals[] } }
 * @param {number} limit      Max foods to return (default 12)
 * @returns {Array<{ name: string, count: number, score: number }>}
 */
export function computeFoodPreferences(dailyLogs, limit = 12) {
  if (!dailyLogs || typeof dailyLogs !== 'object') return [];

  const now    = Date.now();
  const MS_DAY = 1000 * 60 * 60 * 24;
  const LAMBDA = 0.05; // decay constant

  // key → { score, count, displayName, lastSeen }
  const acc = {};

  for (const [dateStr, log] of Object.entries(dailyLogs)) {
    if (!log?.meals?.length) continue;

    const date    = new Date(dateStr);
    if (isNaN(date.getTime())) continue;

    const daysAgo = Math.max(0, (now - date.getTime()) / MS_DAY);
    const weight  = Math.exp(-LAMBDA * daysAgo);

    for (const meal of log.meals) {
      if (!meal?.name?.trim()) continue;

      const key = normalizeKey(meal.name);
      if (!key || key.length < 2) continue;

      if (!acc[key]) {
        acc[key] = { score: 0, count: 0, displayName: meal.name, lastSeen: daysAgo };
      }

      acc[key].score += weight;
      acc[key].count += 1;

      // Prefer the most recent display name for readability
      if (daysAgo < acc[key].lastSeen) {
        acc[key].displayName = meal.name;
        acc[key].lastSeen    = daysAgo;
      }
    }
  }

  return Object.values(acc)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ displayName, count, score }) => ({
      name:  displayName,
      count,
      score: Math.round(score * 10) / 10,
    }));
}

/**
 * Formats the preference list into a compact string for the AI system prompt.
 * Returns an empty string if the list is empty.
 */
export function formatPreferencesForPrompt(preferences) {
  if (!preferences?.length) return '';

  const lines = preferences
    .map((f, i) => `${i + 1}. ${f.name} (logged ${f.count}x)`)
    .join('\n');

  return `
Foods this user eats regularly (ranked by how often and how recently — higher = more familiar):
${lines}

When suggesting meals or foods: lean toward these items and close variations first. Don't force them into every response, but give them clear preference when the suggestion is relevant. The goal is for recommendations to feel like something the user would actually eat, not generic advice.`;
}
