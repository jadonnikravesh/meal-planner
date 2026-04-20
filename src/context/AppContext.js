import React, { createContext, useContext, useReducer, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DARK_COLORS, LIGHT_COLORS } from '../theme';
import { calculateTargets } from '../utils/nutrition';

const AppContext = createContext(null);
const STORAGE_KEY = 'mealPlannerState_v1';

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
  waterTarget: 2700,
  dietaryRestrictions: '',  // e.g. "vegetarian, gluten-free"
  allergies: '',            // e.g. "peanuts, shellfish"
};

const INITIAL_STATE = {
  isOnboarded: false,
  userProfile: DEFAULT_PROFILE,
  dailyLogs: {},      // { 'YYYY-MM-DD': { calories, protein, carbs, fat, water, meals[] } }
  chatMessages: [],   // persistent chat history
  settings: {
    darkMode: true,
    units: 'imperial',
    notifications: true,
    mealReminders: true,
    voiceEnabled: true,
  },
};

function ensureLog(existing) {
  return existing || { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0, meals: [] };
}

function reducer(state, action) {
  switch (action.type) {

    case 'LOAD_STATE':
      return { ...INITIAL_STATE, ...action.payload };

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
      const updated = {
        ...existing,
        calories: (existing.calories || 0) + meal.calories,
        protein: (existing.protein || 0) + meal.protein,
        carbs: (existing.carbs || 0) + meal.carbs,
        fat: (existing.fat || 0) + meal.fat,
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

      // String() coercion ensures numeric IDs from legacy data match string IDs from new logs
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

    case 'LOG_WATER': {
      const { date, amount } = action.payload;
      const existing = ensureLog(state.dailyLogs[date]);
      const updated = { ...existing, water: (existing.water || 0) + amount };
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

    case 'RESET_ONBOARDING':
      return { ...INITIAL_STATE };

    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch]     = useReducer(reducer, INITIAL_STATE);
  const [stateLoaded, setStateLoaded] = useState(false);
  const initialized = useRef(false);
  const saveTimeout = useRef(null);

  // Load persisted state on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            dispatch({ type: 'LOAD_STATE', payload: parsed });
          } catch (_) {}
        }
        initialized.current = true;
        setStateLoaded(true);
      })
      .catch(() => { initialized.current = true; setStateLoaded(true); });
  }, []);

  // Debounced persist on every state change
  useEffect(() => {
    if (!initialized.current) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
    }, 500);
  }, [state]);

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
  const { state } = useContext(AppContext);
  return state.settings.darkMode ? DARK_COLORS : LIGHT_COLORS;
}
