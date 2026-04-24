/**
 * useJobProcessor
 *
 * Runs on app mount and every time the app returns to the foreground.
 * Picks up any jobs that are:
 *   - status 'failed'      → previous attempt errored; respects nextRetryAt backoff
 *   - status 'pending'     → older than STALE_AFTER_MS (45 s); live fetch was lost
 *   - status 'processing'  → older than ORPHANED_PROCESSING_MS (50 s); app crashed
 *
 * On success: meal is written to local state (dedup guard in AppContext prevents
 * double-logging if the original live fetch also succeeded).
 * The backend sends the push notification independently — we don't need to here.
 *
 * Retry strategy: exponential backoff — 2 s → 5 s → 10 s → 20 s (MAX_RETRIES = 4).
 * The nextRetryAt timestamp is stored on the job and checked in getPendingJobs.
 *
 * Background-safe fetch notes:
 *   In React Native, fetch() uses the native networking stack and does NOT stop
 *   when the app goes to background. However, iOS suspends the JS thread after
 *   ~30 s in the background, which can orphan in-flight promises. That's why
 *   we persist jobs to AsyncStorage before the fetch and retry on foreground.
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import {
  getPendingJobs, updateJob, removeJob,
  MAX_RETRIES, LIVE_TIMEOUT_MS, getNextRetryDelay,
} from '../utils/jobQueue';
import { useMealContext } from '../context/MealContext';
import { getOrFetchFoodImage, getFoodColor } from '../utils/imageService';
import { formatTime } from '../utils/foodParser';
import { API_BASE_URL } from '../config/api';

export function useJobProcessor() {
  const { addMeal }   = useMealContext();
  const addMealRef    = useRef(addMeal);
  const processingRef = useRef(false);

  useEffect(() => { addMealRef.current = addMeal; }, [addMeal]);

  const processJobs = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      const jobs = await getPendingJobs();
      if (jobs.length > 0) {
        console.log(`[jobs] Processing ${jobs.length} eligible job(s)`);
      }
      for (const job of jobs) {
        await runJob(job, addMealRef);
      }
    } finally {
      processingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Run on mount — picks up jobs from a previous session or cold start.
    processJobs();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        console.log('[jobs] App moved to foreground — checking for pending jobs');
        processJobs();
      } else if (nextState === 'background') {
        console.log('[jobs] App moved to background');
      }
    });

    return () => sub.remove();
  }, [processJobs]);
}

async function runJob(job, addMealRef) {
  const attempt = (job.retries || 0) + 1;
  console.log(`[jobs] Started — job: ${job.id} (attempt ${attempt}/${MAX_RETRIES})`);
  await updateJob(job.id, { status: 'processing' });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);

    const res = await fetch(`${API_BASE_URL}/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(job.payload),
      signal:  controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();

    console.log(`[jobs] Succeeded — job: ${job.id}`);

    const validMeal = data.mealLogged && data.meal?.logged === true
                   && data.meal?.name && (data.meal?.calories ?? 0) > 0;

    if (validMeal) {
      const m = data.meal;
      const { uri } = await getOrFetchFoodImage(m.name).catch(() => ({ uri: null }));
      // Deterministic ID derived from jobId — AppContext dedup guard silently
      // skips it if the live fetch already logged it on the first attempt.
      addMealRef.current({
        id:            `meal_${job.id}`,
        name:          m.name,
        time:          formatTime(),
        kcal:          m.calories,
        protein:       m.protein,
        carbs:         m.carbs,
        fat:           m.fat,
        uri,
        fallbackColor: getFoodColor(m.imageKey || m.name),
      });
      console.log(`[jobs] Meal logged via retry — ${m.name} (${m.calories} kcal)`);
    }

    await removeJob(job.id);

  } catch (e) {
    const retries = (job.retries || 0) + 1;

    const isTimeout = e.name === 'AbortError';
    const isOffline = !isTimeout && (
      e.message.includes('Failed to fetch') || e.message.includes('Network')
    );

    if (isTimeout) {
      // Server may still be processing. Keep the job so we retry; the deterministic
      // meal ID prevents double-logging if the original request eventually completes.
      console.warn(`[jobs] Attempt ${retries} timed out — job: ${job.id}`);
    } else if (isOffline) {
      console.warn(`[jobs] Attempt ${retries} offline — job: ${job.id}`);
    } else {
      console.warn(`[jobs] Attempt ${retries} failed — job: ${job.id} — ${e.message}`);
    }

    if (retries >= MAX_RETRIES) {
      await removeJob(job.id);
      console.warn(`[jobs] Permanently failed after ${MAX_RETRIES} attempts — job: ${job.id}`);
    } else {
      const delay = getNextRetryDelay(retries);
      await updateJob(job.id, { status: 'failed', retries, nextRetryAt: Date.now() + delay });
      console.log(
        `[jobs] Will retry in ${delay / 1000}s ` +
        `(attempt ${retries + 1}/${MAX_RETRIES}) — job: ${job.id}`
      );
    }
  }
}
