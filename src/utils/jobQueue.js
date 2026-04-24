import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@fitchat_jobs_v1';
export const MAX_RETRIES = 4;

// Exponential backoff: indexed by retry attempt (0-based).
// Retry 0 → wait 2 s, retry 1 → 5 s, retry 2 → 10 s, retry 3 → 20 s.
export const BACKOFF_MS = [2_000, 5_000, 10_000, 20_000];
export function getNextRetryDelay(retries) {
  return BACKOFF_MS[Math.min(retries, BACKOFF_MS.length - 1)];
}

export function generateJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

async function loadJobs() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveJobs(jobs) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(jobs));
  } catch {}
}

// id must be pre-generated with generateJobId() so callers can embed it in the
// payload for backend dedup before persisting to AsyncStorage.
// Idempotent: a double-call with the same id (e.g. double-tap) is a no-op.
export async function enqueueJob(id, payload) {
  const jobs = await loadJobs();
  if (jobs.some(j => j.id === id)) return; // already queued
  await saveJobs([...jobs, {
    id, status: 'pending', payload, retries: 0, createdAt: Date.now(),
  }]);
  console.log(`[jobs] Created — job: ${id}`);
}

export async function updateJob(id, patch) {
  const jobs = await loadJobs();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return;
  // Stamp processingStartedAt the first time a job moves into 'processing'.
  // Used later to detect orphaned jobs if the app crashes mid-flight.
  const startStamp =
    patch.status === 'processing' && !jobs[idx].processingStartedAt
      ? { processingStartedAt: Date.now() }
      : {};
  jobs[idx] = { ...jobs[idx], ...patch, ...startStamp };
  await saveJobs(jobs);
}

export async function removeJob(id) {
  const jobs = await loadJobs();
  await saveJobs(jobs.filter(j => j.id !== id));
}

// Live fetch timeout is 35 s. Keep in sync with HelperScreen, App.js, useJobProcessor.
export const LIVE_TIMEOUT_MS = 35_000;

// A 'pending' job older than this is stale — the live fetch was lost.
// Must exceed LIVE_TIMEOUT_MS so we never race an in-flight request.
const STALE_AFTER_MS = LIVE_TIMEOUT_MS + 10_000; // 45 s

// A 'processing' job whose processingStartedAt is older than this is orphaned
// (the app was killed while the retry processor's fetch was in-flight).
const ORPHANED_PROCESSING_MS = LIVE_TIMEOUT_MS + 15_000; // 50 s

// Returns jobs eligible for background retry:
//   'failed'     → previous attempt errored; respect nextRetryAt backoff window
//   'pending'    → older than STALE_AFTER_MS; live fetch was lost
//   'processing' → older than ORPHANED_PROCESSING_MS; app crashed mid-flight
export async function getPendingJobs() {
  const jobs = await loadJobs();
  const now = Date.now();

  return jobs.filter(j => {
    if (j.retries >= MAX_RETRIES) return false;

    if (j.status === 'failed') {
      // Backoff: skip if the next retry window hasn't opened yet.
      if (j.nextRetryAt && now < j.nextRetryAt) return false;
      return true;
    }

    if (j.status === 'pending') {
      return j.createdAt < now - STALE_AFTER_MS;
    }

    if (j.status === 'processing') {
      // Reclaim jobs orphaned by an app crash during a background retry.
      const startedAt = j.processingStartedAt ?? j.createdAt;
      return startedAt < now - ORPHANED_PROCESSING_MS;
    }

    return false;
  });
}
