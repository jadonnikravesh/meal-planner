import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { scheduleDailyNotifications, scheduleWeeklyWeightNotification } from './scheduler';
import { getTodayKey } from '../utils/nutrition';

// ─── Global foreground handler ────────────────────────────────────────────────
// Show alerts even when the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  false,
  }),
});

// ─── Android notification channel ────────────────────────────────────────────
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('fitai', {
    name:       'FoodChat AI Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound:      'default',
  });
}

// ─── Permissions ─────────────────────────────────────────────────────────────
/**
 * Request notification permissions from the OS.
 * Safe to call multiple times — resolves immediately if already granted.
 * Returns true if permissions are granted.
 */
export async function requestNotificationPermissions() {
  if (Platform.OS === 'web') return false;

  const { status: current } = await Notifications.getPermissionsAsync();
  if (current === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── Data builder ─────────────────────────────────────────────────────────────
/**
 * Extract the nutrition data the rule engine needs from AppContext state.
 *
 * To expose a new field to the rule engine (e.g. steps):
 *   1. Add it here
 *   2. Write a rule in rules.js that reads it
 */
function buildNotifData(appState) {
  const today = getTodayKey();
  const log   = appState.dailyLogs?.[today] || {};
  const p     = appState.userProfile        || {};

  return {
    mealsLogged:   (log.meals || []).length,
    calories:       log.calories      || 0,
    calorieTarget:  p.calorieTarget   || 2000,
    protein:        log.protein       || 0,
    proteinTarget:  p.proteinTarget   || 150,

    // ── Future fields — uncomment + populate when data source is ready ──────
    // steps:       log.steps         || 0,
    // stepTarget:  p.stepTarget      || 10000,
  };
}

/**
 * Extract the notification preference flags from AppContext settings.
 */
function buildNotifSettings(appState) {
  const s = appState.settings || {};
  return {
    notifications:  s.notifications  ?? true,
    mealReminders:  s.mealReminders  ?? true,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
/**
 * useNotifications — call once at the root of the authenticated app tree.
 *
 * Behaviour:
 *   • Requests permissions on first mount.
 *   • Schedules today's notifications immediately after permission is granted.
 *   • Re-evaluates (with a 2 s debounce) whenever daily log data changes —
 *     e.g. after a meal is logged the notifications update to reflect progress.
 *   • Reschedules immediately (no debounce) when the calendar date changes
 *     (midnight rollover detected via the MealContext date-change mechanism).
 *
 * @param {object} appState  The full state object from useApp()
 */
export function useNotifications(appState) {
  const permGrantedRef = useRef(false);
  const lastDateRef    = useRef(getTodayKey());
  const debounceRef    = useRef(null);

  // Request permissions once on mount, then do an initial schedule
  useEffect(() => {
    requestNotificationPermissions().then((granted) => {
      permGrantedRef.current = granted;
      if (!granted) return;
      const data     = buildNotifData(appState);
      const settings = buildNotifSettings(appState);
      scheduleDailyNotifications(data, settings).catch(() => {});
      // Schedule the weekly weight check-in (fires next Sunday 8 pm)
      scheduleWeeklyWeightNotification().catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-schedule whenever daily log, profile, or notification settings change
  useEffect(() => {
    if (!permGrantedRef.current) return;

    const today       = getTodayKey();
    const dateChanged = lastDateRef.current !== today;
    if (dateChanged) lastDateRef.current = today;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const delay = dateChanged ? 0 : 2000; // immediate on date rollover
    debounceRef.current = setTimeout(() => {
      const data     = buildNotifData(appState);
      const settings = buildNotifSettings(appState);
      scheduleDailyNotifications(data, settings).catch(() => {});
    }, delay);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // Re-run when the daily log, user profile, or notification settings change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState.dailyLogs, appState.userProfile, appState.settings]);
}
