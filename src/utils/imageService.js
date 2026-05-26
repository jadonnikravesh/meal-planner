import { getFoodRecord } from './imageCorrections';
import { API_BASE_URL } from '../config/api';

// Per-session in-memory cache: normalised food name → Photo[]
const _cache = {};

function normKey(name) {
  return (name || '').trim().toLowerCase();
}

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

async function fetchFromBackend(query, count = 8) {
  const url = `${API_BASE_URL}/food-image?q=${encodeURIComponent(query)}&count=${count}`;
  console.log(`[imageService] /food-image request: "${query}" (count=${count})`);

  // 28 s timeout — long enough to survive a Render cold-start (~20-25 s to wake).
  // 3 attempts total: first may hit the cold-start, second usually gets a live server.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 28000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      console.log(`[imageService] /food-image response: HTTP ${res.status} for "${query}" attempt ${attempt}`);

      let json;
      try {
        json = await res.json();
      } catch {
        console.warn(`[imageService] non-JSON body (HTTP ${res.status}) for "${query}" attempt ${attempt}`);
        if (attempt < 3) { await new Promise((r) => setTimeout(r, 2000)); continue; }
        return [];
      }

      if (!res.ok) {
        console.warn(`[imageService] backend error ${res.status} for "${query}":`, json.error ?? '(no message)');
        if (attempt < 3 && res.status >= 500) { await new Promise((r) => setTimeout(r, 2000)); continue; }
        return [];
      }

      const photos = json.photos || [];
      const firstUri = photos[0]?.uri ?? null;
      console.log(`[imageService] ${photos.length} photos for "${query}" | first: ${firstUri ?? 'none'}`);
      return photos;
    } catch (err) {
      clearTimeout(timer);
      const label = err.name === 'AbortError' ? 'timeout (28s)' : `network error: ${err.message}`;
      console.warn(`[imageService] ${label} for "${query}" attempt ${attempt}`);
      if (attempt < 3) { await new Promise((r) => setTimeout(r, 2000)); continue; }
      return [];
    }
  }
  return [];
}

async function ensureCached(foodName, needed = 8) {
  const k = normKey(foodName);
  if ((_cache[k]?.length ?? 0) >= needed) return _cache[k];
  const photos = await fetchFromBackend(buildQuery(foodName), needed);
  if (photos.length) _cache[k] = photos;
  return photos;
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function getOrFetchFoodImage(foodName) {
  const record = await getFoodRecord(foodName);
  if (record?.uri) {
    console.log(`[imageService] "${foodName}" → corrections cache (${record.verified ? 'verified' : 'stored'}): ${record.uri}`);
    return { uri: record.uri, confidence: record.verified ? 'verified' : 'high' };
  }
  const photos = await ensureCached(foodName, 8);
  const uri    = photos[0]?.uri ?? null;
  if (uri) {
    console.log(`[imageService] "${foodName}" → Pexels: ${uri}`);
  } else {
    console.warn(`[imageService] "${foodName}" → NO IMAGE (Pexels returned empty — check PEXELS_API_KEY on Render)`);
  }
  return { uri, confidence: uri ? 'high' : 'low' };
}

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

export async function searchFoodImages(query, count = 12) {
  const photos = await fetchFromBackend(`${query.trim()} food`, count);
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

let _browseCache = null;

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

export function getFoodImageData(foodName) {
  return {
    uri:        null,
    confidence: 'low',
    foodKey:    null,
    color:      getFoodColor(foodName),
  };
}
