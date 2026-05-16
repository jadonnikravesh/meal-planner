import * as Notifications from 'expo-notifications';
import { RULES, pickRandom } from './rules';
import { getNextSundayAt8pm } from '../utils/weightEstimation';

/**
 * Time slots for the three daily notifications.
 * All times are local device time.
 *
 * To add or remove a slot: edit this object — no other file needs to change.
 */
const SLOTS = {
  morning:   { hour: 8,  minute: 0  },
  afternoon: { hour: 13, minute: 0  },
  evening:   { hour: 19, minute: 30 },
};

/**
 * Evaluate all rules for a given slot against the current daily data.
 * Rules are sorted by priority (lowest number = highest priority).
 * The first rule whose condition returns true wins.
 *
 * @param {string} slotName
 * @param {object} data             Daily nutrition data
 * @param {object} [settings]       { mealReminders: boolean }
 * @returns {{ ruleId, message } | null}
 */
export function evaluateSlot(slotName, data, settings = {}) {
  const { mealReminders = true } = settings;

  const candidates = RULES
    .filter((r) => r.slots.includes(slotName))
    // Respect the Meal Reminders toggle — skip nudge-to-log rules when off
    .filter((r) => mealReminders || r.category !== 'meal_reminder')
    .sort((a, b) => a.priority - b.priority);

  for (const rule of candidates) {
    try {
      if (rule.condition(data)) {
        return { ruleId: rule.id, message: pickRandom(rule.messages) };
      }
    } catch (_) {
      // Guard against bad data — skip the rule
    }
  }
  return null;
}

/**
 * Schedule a single notification to fire at a specific local time today.
 * If that time has already passed, the notification is skipped (the next
 * full reschedule — on app open tomorrow or midnight rollover — will catch it).
 *
 * Returns the Expo notification identifier, or null if skipped.
 */
async function scheduleAt(hour, minute, title, body, identifier) {
  const now  = new Date();
  const fire = new Date();
  fire.setHours(hour, minute, 0, 0);

  if (fire <= now) return null; // time already passed today

  return Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title,
      body,
      sound: true,
      // Android channel — defined in NotificationManager.js
      ...(require('react-native').Platform.OS === 'android'
        ? { categoryIdentifier: 'fitai' }
        : {}),
    },
    trigger: { date: fire },
  });
}

/**
 * Cancel all previously scheduled Shred AI notifications and reschedule fresh
 * ones based on the current daily data snapshot and user settings.
 *
 * @param {object} data      Shape: { mealsLogged, calories, calorieTarget, protein, proteinTarget }
 * @param {object} settings  Shape: { notifications: boolean, mealReminders: boolean }
 * @returns {Array}          Array of { slot, ruleId } for scheduled notifications.
 */
export async function scheduleDailyNotifications(data, settings = {}) {
  const { notifications = true, mealReminders = true } = settings;

  // Always cancel existing notifications first
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Master switch — if notifications are off, stop here
  if (!notifications) return [];

  const scheduled = [];

  for (const [slotName, time] of Object.entries(SLOTS)) {
    const result = evaluateSlot(slotName, data, { mealReminders });
    if (!result) continue;

    try {
      const id = await scheduleAt(
        time.hour,
        time.minute,
        'Shred AI',
        result.message,
        `fitai_${slotName}`,
      );
      if (id) scheduled.push({ slot: slotName, ruleId: result.ruleId });
    } catch (err) {
      console.warn('[Notifications] Failed to schedule slot:', slotName, err.message);
    }
  }

  return scheduled;
}

/**
 * Schedule (or re-schedule) the weekly weight check-in notification.
 * Fires the next Sunday at 20:00 local time with identifier 'fitai_weekly_weight'.
 * Safe to call multiple times — cancels any existing instance first.
 */
export async function scheduleWeeklyWeightNotification() {
  try {
    await Notifications.cancelScheduledNotificationAsync('fitai_weekly_weight');
  } catch (_) {
    // Notification may not exist yet — that's fine
  }

  const fire = getNextSundayAt8pm();

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: 'fitai_weekly_weight',
      content: {
        title: 'Shred AI',
        body:  'Your weekly weight estimate is ready 📊 Tap to review your progress.',
        sound: true,
      },
      trigger: { date: fire },
    });
  } catch (err) {
    console.warn('[Notifications] Failed to schedule weekly weight notification:', err.message);
  }
}
