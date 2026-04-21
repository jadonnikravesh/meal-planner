/**
 * imageCorrections.js
 *
 * Vote-based image validation store, keyed by normalised food name.
 *
 * Each record:
 *   {
 *     uri:      string | null,   // current candidate image
 *     yes:      number,          // cumulative yes votes for this URI
 *     no:       number,          // cumulative no votes for this URI
 *     verified: boolean,         // true once YES_THRESHOLD + APPROVAL_RATE met
 *     savedAt:  number,          // timestamp of last write
 *   }
 *
 * Locking rules (evaluated after every vote):
 *   verified = yes >= YES_THRESHOLD && yes / (yes + no) >= APPROVAL_RATE
 *
 * Once verified, the image is reused without prompting.
 * Replacing the image resets the vote counts for the new URI.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY   = '@fitchat_image_votes_v1';
const YES_THRESHOLD = 5;
const APPROVAL_RATE = 0.80;

// In-memory cache — avoids repeated AsyncStorage reads on every render
let _cache = null;

async function _load() {
  if (_cache !== null) return _cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    _cache = raw ? JSON.parse(raw) : {};
  } catch {
    _cache = {};
  }
  return _cache;
}

async function _persist(data) {
  _cache = data;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('[imageVotes] persist failed:', e.message);
  }
}

/** Normalise food name to a stable storage key. */
export function normalizeFoodName(name) {
  return (name ?? '').trim().toLowerCase();
}

/** Compute whether a record meets the verification threshold. */
function _isVerifiedRecord(record) {
  if (!record || record.yes < YES_THRESHOLD) return false;
  const total = record.yes + record.no;
  return total > 0 && record.yes / total >= APPROVAL_RATE;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return the full stored record for a food name, or null.
 */
export async function getFoodRecord(foodName) {
  const data = await _load();
  return data[normalizeFoodName(foodName)] ?? null;
}

/**
 * True if the food has a verified image (meets threshold — no prompt needed).
 */
export async function isVerified(foodName) {
  const record = await getFoodRecord(foodName);
  return _isVerifiedRecord(record);
}

/**
 * Returns the verified URI for a food name, or null if not yet verified.
 */
export async function getVerifiedUri(foodName) {
  const record = await getFoodRecord(foodName);
  if (!_isVerifiedRecord(record)) return null;
  return record.uri;
}

/**
 * Record a yes/no vote for a (foodName, uri) pair.
 * If the URI differs from the stored one the counters reset (new image = fresh slate).
 * Returns the updated record.
 */
export async function recordVote(foodName, uri, vote) {
  const key  = normalizeFoodName(foodName);
  const data = await _load();
  const prev = data[key];

  let record;
  if (prev && prev.uri === uri) {
    // Same image — accumulate
    record = {
      uri,
      yes:     prev.yes + (vote === 'yes' ? 1 : 0),
      no:      prev.no  + (vote === 'no'  ? 1 : 0),
      savedAt: Date.now(),
    };
  } else {
    // New or changed URI — start fresh
    record = {
      uri,
      yes:     vote === 'yes' ? 1 : 0,
      no:      vote === 'no'  ? 1 : 0,
      savedAt: Date.now(),
    };
  }
  record.verified = _isVerifiedRecord(record);

  data[key] = record;
  await _persist(data);
  console.log(`[imageVotes] ${key} → yes:${record.yes} no:${record.no} verified:${record.verified}`);
  return record;
}

/**
 * User selected a replacement image.
 * Resets vote counts for the new URI; counts the selection as 1 implicit yes.
 * Returns the updated record.
 */
export async function replaceImage(foodName, newUri) {
  const key  = normalizeFoodName(foodName);
  const data = await _load();
  const record = {
    uri:      newUri,
    yes:      1,      // choosing an image is itself a vote of confidence
    no:       0,
    verified: false,  // 1 vote never meets the 5-vote threshold
    savedAt:  Date.now(),
  };
  data[key] = record;
  await _persist(data);
  console.log(`[imageVotes] ${key} replaced → yes:1 no:0 verified:false`);
  return record;
}

// ─── Compatibility helpers (used by ChatModal's MealLogCard) ─────────────────
// These wrap the vote-based API above so older code keeps working without changes.

/**
 * Returns a { uri, status } correction for a food key, or null if none stored.
 * status: 'confirmed' | 'replaced' | 'rejected'
 */
export async function getCorrection(foodKey) {
  const record = await getFoodRecord(foodKey);
  if (!record) return null;
  if (!record.uri) return { uri: null, status: 'rejected' };
  return { uri: record.uri, status: record.verified ? 'confirmed' : 'replaced' };
}

/**
 * Persist a user correction for a food key.
 */
export async function saveCorrection(foodKey, { uri, status }) {
  if (!uri || status === 'rejected') return rejectImage(foodKey);
  return replaceImage(foodKey, uri);
}

/**
 * Apply any stored corrections to a list of food items before they are logged.
 * Checks by food name first, then by foodKey.
 */
export async function applyCorrections(items) {
  return Promise.all((items || []).map(async (item) => {
    const nameKey = item.name || '';
    if (nameKey) {
      const rec = await getFoodRecord(nameKey);
      if (rec?.uri) return { ...item, imageUrl: rec.uri };
    }
    // Fallback: check by the category key (e.g. 'chicken')
    if (item.foodKey && item.foodKey !== nameKey) {
      const rec = await getFoodRecord(item.foodKey);
      if (rec?.uri) return { ...item, imageUrl: rec.uri };
    }
    return item;
  }));
}

/**
 * User rejected the image — clear URI, increment no count.
 * Returns the updated record.
 */
export async function rejectImage(foodName) {
  const key  = normalizeFoodName(foodName);
  const data = await _load();
  const prev = data[key];
  const record = {
    uri:      null,
    yes:      0,
    no:       (prev?.no ?? 0) + 1,
    verified: false,
    savedAt:  Date.now(),
  };
  data[key] = record;
  await _persist(data);
  console.log(`[imageVotes] ${key} rejected → no:${record.no}`);
  return record;
}
