/**
 * imageService.js
 *
 * All food images are served by the Pexels API.
 * An in-memory session cache prevents redundant API calls within a session.
 * User-confirmed image selections are persisted via imageCorrections.js.
 */

import { getFoodRecord } from './imageCorrections';

const PEXELS_KEY  = 'Tgj7UUSwtWrMofAC9SQiPuDGR3y7DWDmyvzTwSp43HmyTtblYv3LQuUE';
const PEXELS_BASE = 'https://api.pexels.com/v1/search';

// Per-session in-memory cache: normalised food name → Photo[]
const _cache = {};

function normKey(name) {
  return (name || '').trim().toLowerCase();
}

/**
 * Build a search query that reliably surfaces food-relevant Pexels photos.
 * Appends a context suffix so generic names ("coffee", "soup") land on food shots.
 */
function buildQuery(foodName) {
  const n = foodName.trim().toLowerCase();
  if (/shake|smoothie|juice|latte|espresso|cappuccino|americano/.test(n))
    return `${n} drink beverage`;
  if (/soup|broth|stew|chowder/.test(n))
    return `${n} bowl hot food`;
  if (/salad|greens|lettuce/.test(n))
    return `${n} fresh healthy plate`;
  if (/cake|pancake|waffle|muffin|cookie|brownie|pastry/.test(n))
    return `${n} dessert baked food`;
  if (/pizza|burger|taco|burrito|sandwich|wrap|sub/.test(n))
    return `${n} fast food plate`;
  if (/sushi|ramen|noodle|dumpling|dim sum/.test(n))
    return `${n} asian food dish`;
  return `${n} food meal`;
}

/**
 * Call the Pexels search endpoint.
 * Returns an array of { id, uri (medium ~350px), uriHd (large ~940px), alt }.
 */
async function fetchFromPexels(query, count = 8) {
  try {
    const url = `${PEXELS_BASE}?query=${encodeURIComponent(query)}&per_page=${count}&size=medium`;
    const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
    if (!res.ok) {
      console.warn('[Pexels] HTTP', res.status, '–', query);
      return [];
    }
    const json = await res.json();
    return (json.photos || []).map((p) => ({
      id:    String(p.id),
      uri:   p.src.medium,
      uriHd: p.src.large ?? p.src.medium,
      alt:   p.alt || query,
    }));
  } catch (err) {
    console.warn('[Pexels] fetch error:', err.message);
    return [];
  }
}

/**
 * Return cached photos for a food name, fetching from Pexels if the cache
 * holds fewer entries than `needed`.
 */
async function ensureCached(foodName, needed = 8) {
  const k = normKey(foodName);
  if ((_cache[k]?.length ?? 0) >= needed) return _cache[k];
  const photos = await fetchFromPexels(buildQuery(foodName), needed);
  if (photos.length) _cache[k] = photos;
  return photos;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Get or fetch the primary image for a food name.
 *
 * Priority:
 *   1. Verified user-confirmed image (imageCorrections store, ≥5 yes votes)
 *   2. Previously stored user selection (imageCorrections store)
 *   3. First Pexels result for the food name (session-cached)
 *
 * @returns {{ uri: string|null, confidence: 'verified'|'high'|'low' }}
 */
export async function getOrFetchFoodImage(foodName) {
  const record = await getFoodRecord(foodName);
  if (record?.uri) {
    return { uri: record.uri, confidence: record.verified ? 'verified' : 'high' };
  }
  const photos = await ensureCached(foodName, 8);
  const uri    = photos[0]?.uri ?? null;
  return { uri, confidence: uri ? 'high' : 'low' };
}

/**
 * Returns 2–4 Pexels candidate images for the alternatives grid.
 * The currently-shown image (excludeUri) is filtered out so every
 * alternative is genuinely different.
 *
 * @returns {Array<{ key, label, uri, uriHd }>}
 */
export async function getCandidateImages(foodName, excludeUri = null, maxCount = 4) {
  const photos = await ensureCached(foodName, maxCount + 2);
  return photos
    .filter((p) => p.uri !== excludeUri && p.uriHd !== excludeUri)
    .slice(0, maxCount)
    .map((p) => ({
      key:   p.id,
      label: foodName,
      uri:   p.uri,
      uriHd: p.uriHd,
    }));
}

/**
 * Live Pexels search — used by the browse screen when the user types a query.
 * Automatically appends "food" context so arbitrary terms return food photos.
 *
 * @returns {Array<{ key, label, uri, uriHd }>}
 */
export async function searchFoodImages(query, count = 12) {
  const photos = await fetchFromPexels(`${query.trim()} food`, count);
  return photos.map((p) => ({
    key:   p.id,
    label: query,
    uri:   p.uri,
    uriHd: p.uriHd,
  }));
}

// ─── Browse screen curated list ───────────────────────────────────────────────

const CURATED_FOODS = [
  'chicken breast', 'grilled beef', 'salmon fillet', 'scrambled eggs',
  'white rice', 'pasta bowl', 'bread loaf', 'oatmeal breakfast',
  'potato dish', 'sweet potato', 'banana', 'apple',
  'garden salad', 'broccoli', 'avocado toast', 'greek yogurt',
  'cheese plate', 'mixed nuts', 'pizza slice', 'burger',
  'sandwich', 'sushi platter', 'tacos', 'coffee cup',
  'smoothie bowl', 'protein shake',
];

let _browseCache = null; // module-level cache — survives screen navigations

/**
 * Load the curated browse grid.
 * Each food fetches 1 Pexels thumbnail; results are module-cached so
 * re-opening the browse screen is instant.
 *
 * @returns {Array<{ key, label, uri, uriHd }>}
 */
export async function loadBrowseImages() {
  if (_browseCache) return _browseCache;

  const results = await Promise.all(
    CURATED_FOODS.map(async (name) => {
      const photos = await ensureCached(name, 2);
      if (!photos.length) return null;
      return {
        key:   name.toLowerCase().replace(/\s+/g, '_'),
        label: name.charAt(0).toUpperCase() + name.slice(1),
        uri:   photos[0].uri,
        uriHd: photos[0].uriHd,
      };
    }),
  );

  _browseCache = results.filter(Boolean);
  return _browseCache;
}

// ─── Color helpers ─────────────────────────────────────────────────────────────
// Background colors for meal cards while images load (no Pexels needed).

const FOOD_COLORS = {
  chicken: '#3A2A10', turkey: '#3A2A10',
  beef: '#2A1010', steak: '#2A1010', pork: '#2A1818',
  salmon: '#3A1A1A', tuna: '#1A2A3A', shrimp: '#3A1A1A',
  egg: '#3A3010', eggs: '#3A3010',
  rice: '#2A2A1A', pasta: '#3A2A10', bread: '#3A2A10',
  oats: '#2A2010', oatmeal: '#2A2010',
  potato: '#2A2A10', sweetpotato: '#2A2A10',
  banana: '#3A3010', apple: '#2A1A1A',
  salad: '#0A2A0A', broccoli: '#0A2A0A', spinach: '#0A2A0A', avocado: '#1A2A0A',
  yogurt: '#2A2A3A', cheese: '#3A3010', milk: '#2A2A3A',
  nuts: '#2A2010', almonds: '#2A2010', peanutbutter: '#2A2010',
  soup: '#2A1A0A', pizza: '#3A1A0A', burger: '#2A1A0A', sandwich: '#2A1A0A',
  tacos: '#2A1A0A', sushi: '#1A2A2A',
  coffee: '#1A1000', smoothie: '#1A2A1A', protein_shake: '#1A1A2A',
  default: '#1A2A1A',
};

export function getFoodColor(foodName) {
  const key = (foodName || '').toLowerCase().replace(/[\s_-]+/g, '');
  return FOOD_COLORS[key] || FOOD_COLORS.default;
}

/**
 * Synchronous stub kept for backward compatibility with foodParser.js.
 * Returns null URI — HelperScreen resolves the real image via getOrFetchFoodImage.
 */
export function getFoodImageData(foodName) {
  return {
    uri:        null,
    confidence: 'low',
    foodKey:    null,
    color:      getFoodColor(foodName),
  };
}
