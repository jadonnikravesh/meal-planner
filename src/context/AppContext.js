import React, { createContext, useContext, useReducer, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DARK_COLORS, LIGHT_COLORS } from '../theme';
import { calculateTargets, getTodayKey } from '../utils/nutrition';
import { useAuth } from './AuthContext';

// How many days of history to keep in AsyncStorage (older entries are pruned on
// each daily reset to prevent unbounded storage growth).
const HISTORY_RETAIN_DAYS = 90;

const AppContext = createContext(null);

// Per-user key — prevents data leaking between accounts on the same device.
// Falls back to the legacy key for unauthenticated/anonymous state.
const LEGACY_KEY = 'mealPlannerState_v1';
const storageKey = (uid) => uid ? `mealPlannerState_v1_${uid}` : LEGACY_KEY;

const DEFAULT_PROFILE = {
  name: '',
  gender: 'male',
  age: '25',
  height: '67',      // inches (imperial default)
  weight: '154',     // lbs (imperial default)
  goal: 'maintain',
  activityLevel: 'moderate',
  units: 'imperial',
  calorieTarget: 2000,
  proteinTarget: 150,
  carbTarget: 225,
  fatTarget: 56,
  dietaryRestrictions: '',
  allergies: '',
};

const INITIAL_STATE = {
  isOnboarded: false,
  userProfile: DEFAULT_PROFILE,
  // History: keyed by local date 'YYYY-MM-DD'. Today's entry is the live log;
  // past entries are read-only history. Pruned to HISTORY_RETAIN_DAYS on reset.
  dailyLogs: {},
  chatMessages: [],
  lastActiveDate: null,   // 'YYYY-MM-DD' — used to detect a new calendar day on open
  settings: {
    darkMode: true,
    units: 'imperial',
    notifications: true,
    mealReminders: true,
    voiceEnabled: true,
  },
  weeklyReview: {
    lastReviewedDate: null,
    weightHistory: [],
  },
  subscription: {
    status:         'none',
    plan:           null,
    subscriptionId: null,
    customerId:     null,
    trialEnd:       null,
  },
  aiConsent: false,
};

function ensureLog(existing) {
  return existing || { calories: 0, protein: 0, carbs: 0, fat: 0, meals: [] };
}

function reducer(state, action) {
  switch (action.type) {

    case 'LOAD_STATE': {
      const loaded = action.payload;
      return {
        ...INITIAL_STATE,
        ...loaded,
        weeklyReview: {
          ...INITIAL_STATE.weeklyReview,
          ...(loaded.weeklyReview || {}),
        },
        subscription: {
          ...INITIAL_STATE.subscription,
          ...(loaded.subscription || {}),
        },
      };
    }

    // Fired when the calendar day changes (on app open after overnight close, or
    // during a live midnight rollover). Clears chat history, prunes old daily logs
    // beyond HISTORY_RETAIN_DAYS, and stamps the new date into lastActiveDate.
    // Past meals remain safely in dailyLogs under their original date keys.
    case 'DAILY_RESET': {
      const { date } = action.payload;
      const cutoff = (() => {
        const d = new Date();
        d.setDate(d.getDate() - HISTORY_RETAIN_DAYS);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
      })();
      const prunedLogs = Object.fromEntries(
        Object.entries(state.dailyLogs).filter(([k]) => k >= cutoff),
      );
      const keptCount   = Object.keys(prunedLogs).length;
      const prunedCount = Object.keys(state.dailyLogs).length - keptCount;
      console.log(
        `[AppContext] DAILY_RESET | ${state.lastActiveDate ?? 'first-run'} → ${date}` +
        ` | history: ${keptCount} days kept, ${prunedCount} pruned (>${HISTORY_RETAIN_DAYS}d)`,
      );
      return {
        ...state,
        chatMessages:   [],
        dailyLogs:      prunedLogs,
        lastActiveDate: date,
      };
    }

    // Stamps the date on first-ever launch (no prior lastActiveDate) without
    // clearing chat or logs — nothing to reset on a brand-new install.
    case 'SET_LAST_ACTIVE_DATE':
      return { ...state, lastActiveDate: action.payload };

    case 'COMPLETE_ONBOARDING': {
      const targets = calculateTargets(action.payload);
      return {
        ...state,
        isOnboarded: true,
        userProfile: { ...action.payload, ...targets },
        settings: { ...state.settings, units: action.payload.units || 'imperial' },
      };
    }

    case 'UPDATE_PROFILE': {
      const merged = { ...state.userProfile, ...action.payload };
      const targets = calculateTargets(merged);
      return {
        ...state,
        userProfile: { ...merged, ...targets },
        settings: { ...state.settings, units: merged.units || state.settings.units },
      };
    }

    case 'LOG_MEAL': {
      const { date, meal } = action.payload;
      const existing = ensureLog(state.dailyLogs[date]);
      // Dedup: if a meal with this ID was already logged (e.g. retry / Firestore snapshot
      // arriving after optimistic local update), skip it silently.
      if (meal.id && existing.meals?.some(m => String(m.id) === String(meal.id))) {
        return state;
      }
      const updated = {
        ...existing,
        calories: (existing.calories || 0) + (meal.calories ?? meal.kcal ?? 0),
        protein:  (existing.protein  || 0) + (meal.protein  || 0),
        carbs:    (existing.carbs    || 0) + (meal.carbs    || 0),
        fat:      (existing.fat      || 0) + (meal.fat      || 0),
        meals: [...(existing.meals || []), meal],
      };
      return { ...state, dailyLogs: { ...state.dailyLogs, [date]: updated } };
    }

    case 'UPDATE_MEAL': {
      const { date, meal } = action.payload;
      const existing = state.dailyLogs[date];
      if (!existing || !existing.meals?.length) return state;
      const updatedMeals = existing.meals.map((m) =>
        String(m.id) === String(meal.id) ? { ...m, ...meal } : m
      );
      return {
        ...state,
        dailyLogs: {
          ...state.dailyLogs,
          [date]: {
            ...existing,
            meals:    updatedMeals,
            calories: updatedMeals.reduce((s, m) => s + (m.calories ?? m.kcal ?? 0), 0),
            protein:  updatedMeals.reduce((s, m) => s + (m.protein  ?? 0), 0),
            carbs:    updatedMeals.reduce((s, m) => s + (m.carbs    ?? 0), 0),
            fat:      updatedMeals.reduce((s, m) => s + (m.fat      ?? 0), 0),
          },
        },
      };
    }

    case 'REMOVE_MEAL': {
      const { date, mealId } = action.payload;
      const existing = state.dailyLogs[date];

      console.log('[AppContext REMOVE_MEAL] date:', date,
        '| mealId:', mealId,
        '| meals before:', existing?.meals?.length ?? 0);

      if (!existing || !existing.meals?.length) {
        console.warn('[AppContext REMOVE_MEAL] no log/meals for date:', date, '— skipping');
        return state;
      }

      const remaining = existing.meals.filter((m) => String(m.id) !== String(mealId));

      console.log('[AppContext REMOVE_MEAL] removed:', existing.meals.length - remaining.length,
        '| meals after:', remaining.length);

      const updated = {
        ...existing,
        meals:    remaining,
        calories: remaining.reduce((s, m) => s + (m.calories ?? m.kcal ?? 0), 0),
        protein:  remaining.reduce((s, m) => s + (m.protein  ?? 0), 0),
        carbs:    remaining.reduce((s, m) => s + (m.carbs    ?? 0), 0),
        fat:      remaining.reduce((s, m) => s + (m.fat      ?? 0), 0),
      };
      return { ...state, dailyLogs: { ...state.dailyLogs, [date]: updated } };
    }

    case 'SET_DAY_SUMMARY': {
      const { date, summary } = action.payload;
      const existing = ensureLog(state.dailyLogs[date]);
      return {
        ...state,
        dailyLogs: { ...state.dailyLogs, [date]: { ...existing, aiSummary: summary } },
      };
    }

    case 'SET_CHAT_MESSAGES':
      return { ...state, chatMessages: action.payload };

    case 'ADD_CHAT_MESSAGE':
      return { ...state, chatMessages: [...state.chatMessages, action.payload] };

    case 'TOGGLE_DARK_MODE':
      return { ...state, settings: { ...state.settings, darkMode: !state.settings.darkMode } };

    case 'SET_DARK_MODE':
      return { ...state, settings: { ...state.settings, darkMode: action.payload } };

    case 'SET_NOTIFICATIONS':
      return { ...state, settings: { ...state.settings, notifications: action.payload } };

    case 'SET_MEAL_REMINDERS':
      return { ...state, settings: { ...state.settings, mealReminders: action.payload } };

    case 'SET_VOICE_ENABLED':
      return { ...state, settings: { ...state.settings, voiceEnabled: action.payload } };

    case 'DISMISS_WEEKLY_REVIEW':
      return {
        ...state,
        weeklyReview: {
          ...(state.weeklyReview || INITIAL_STATE.weeklyReview),
          lastReviewedDate: action.payload,
        },
      };

    case 'SAVE_WEIGHT_UPDATE': {
      const { weight, date } = action.payload;
      const prev = state.weeklyReview || INITIAL_STATE.weeklyReview;
      return {
        ...state,
        userProfile: { ...state.userProfile, weight },
        weeklyReview: {
          ...prev,
          lastReviewedDate: date,
          weightHistory: [...(prev.weightHistory || []), { date, weight }],
        },
      };
    }

    case 'SET_SUBSCRIPTION':
      return {
        ...state,
        subscription: { ...state.subscription, ...action.payload },
      };

    case 'SET_AI_CONSENT':
      return { ...state, aiConsent: action.payload };

    case 'RESET_ONBOARDING':
      return { ...INITIAL_STATE };

    default:
      return state;
  }
}

export function AppProvider({ children }) {
  // useAuth() works here because AppProvider renders inside AuthProvider.
  const { user, loading: authLoading } = useAuth();
  const uid = user?.uid ?? null;

  const [state, dispatch]         = useReducer(reducer, INITIAL_STATE);
  const [stateLoaded, setStateLoaded] = useState(false);
  const initialized    = useRef(false);
  const saveTimeout    = useRef(null);
  const prevUidRef     = useRef(undefined); // undefined = "never set" sentinel
  const currentDateRef = useRef(getTodayKey()); // for midnight rollover detection

  // ── Load per-user state whenever the authenticated user changes ───────────
  // Waits for Firebase auth to resolve (authLoading = false) before reading
  // AsyncStorage, so we never load the wrong user's data.
  useEffect(() => {
    if (authLoading) return; // wait for Firebase auth cache to resolve

    // uid unchanged — nothing to do (guards against spurious re-renders)
    if (uid === prevUidRef.current) return;
    prevUidRef.current = uid;

    // Block saves until the new user's state is fully loaded
    initialized.current = false;
    setStateLoaded(false);

    if (!uid) {
      // Logged out — wipe in-memory state so the next user starts clean
      dispatch({ type: 'RESET_ONBOARDING' });
      initialized.current = true;
      setStateLoaded(true);
      return;
    }

    // Load this user's persisted state
    const key = storageKey(uid);
    AsyncStorage.getItem(key)
      .then(async (raw) => {
        let parsed = null;
        if (raw) {
          try { parsed = JSON.parse(raw); }
          catch (_) { /* corrupted — start fresh */ }
        } else {
          // First login on this device: try migrating from the legacy shared key
          const legacy = await AsyncStorage.getItem(LEGACY_KEY).catch(() => null);
          if (legacy) {
            try { parsed = JSON.parse(legacy); }
            catch (_) {}
          }
        }

        if (parsed) {
          dispatch({ type: 'LOAD_STATE', payload: parsed });

          // ── Daily-reset check ───────────────────────────────────────────────
          // Compare the date the app was last used to today's local date.
          // If they differ, the user is opening the app on a new calendar day:
          // clear yesterday's chat messages and prune old history.
          // (Yesterday's meals are already safely stored in dailyLogs under
          //  their date key — they are NOT deleted, only the in-memory chat is cleared.)
          const today = getTodayKey();
          if (parsed.lastActiveDate && parsed.lastActiveDate !== today) {
            console.log(
              '[AppContext] new day on open | was:', parsed.lastActiveDate,
              '→ now:', today, '| clearing chat, pruning old logs',
            );
            dispatch({ type: 'DAILY_RESET', payload: { date: today } });
          } else if (!parsed.lastActiveDate) {
            // Brand-new install — just stamp today's date; nothing to reset.
            console.log('[AppContext] first launch — stamping date:', today);
            dispatch({ type: 'SET_LAST_ACTIVE_DATE', payload: today });
          } else {
            console.log('[AppContext] same day resume | date:', today,
              '| logs:', Object.keys(parsed.dailyLogs || {}).length, 'days');
          }
        } else {
          // Nothing in storage yet — stamp today so the next day we know to reset.
          const today = getTodayKey();
          dispatch({ type: 'SET_LAST_ACTIVE_DATE', payload: today });
          console.log('[AppContext] no stored state — fresh start for uid:', uid);
        }
      })
      .catch(() => { /* storage unavailable — start with defaults */ })
      .finally(() => {
        initialized.current = true;
        setStateLoaded(true);
      });
  }, [uid, authLoading]);

  // ── Debounced persist to the current user's scoped key ───────────────────
  useEffect(() => {
    if (!initialized.current || !uid) return; // never save for logged-out state
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      AsyncStorage.setItem(storageKey(uid), JSON.stringify(state)).catch(() => {});
      console.log('[AppContext] persisted state | uid:', uid,
        '| logs:', Object.keys(state.dailyLogs).length, 'days',
        '| chat msgs:', state.chatMessages.length);
    }, 500);
  }, [state, uid]);

  // ── Midnight rollover: poll every 30 s while app is open ─────────────────
  // Handles the case where the user leaves the app open past midnight.
  // MealContext has its own 30-s interval for in-memory meals; this one handles
  // AppContext-owned state: chatMessages reset and history pruning.
  useEffect(() => {
    const id = setInterval(() => {
      const today = getTodayKey();
      if (today !== currentDateRef.current) {
        currentDateRef.current = today;
        console.log('[AppContext] midnight rollover detected → DAILY_RESET for:', today);
        dispatch({ type: 'DAILY_RESET', payload: { date: today } });
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch, stateLoaded }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export function useTheme() {
  // Permanently light — to revert, restore: state.settings.darkMode ? DARK_COLORS : LIGHT_COLORS
  return LIGHT_COLORS;
}

/**
 * useHistory — access past daily logs.
 *
 * Returns helpers for reading history from dailyLogs:
 *   getDay(dateKey)     — log for a specific 'YYYY-MM-DD' date
 *   getRecent(n)        — array of the last n days that have data, newest first
 *   allDates            — sorted array of all date keys with logged data
 *
 * Example:
 *   const { getDay, getRecent } = useHistory();
 *   const yesterday = getDay('2024-01-14');   // { calories, protein, meals, … }
 *   const week      = getRecent(7);           // [{ date, calories, meals, … }, …]
 */
export function useHistory() {
  const { state } = useContext(AppContext);
  const { dailyLogs } = state;

  const allDates = Object.keys(dailyLogs)
    .filter((k) => (dailyLogs[k]?.calories ?? 0) > 0 || (dailyLogs[k]?.meals?.length ?? 0) > 0)
    .sort()
    .reverse(); // newest first

  const getDay = (dateKey) => dailyLogs[dateKey] ?? null;

  const getRecent = (n = 7) =>
    allDates.slice(0, n).map((date) => ({ date, ...dailyLogs[date] }));

  return { getDay, getRecent, allDates };
}
