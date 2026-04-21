import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useApp } from './AppContext';
import { auth, db } from '../firebase/config';
import { getTodayKey } from '../utils/nutrition';

/**
 * MealContext — in-memory store for today's logged meals.
 *
 * Write-through: every ADD_MEAL also dispatches to AppContext
 * so data is persisted in dailyLogs[date] and survives app restarts.
 *
 * On mount: today's log is loaded from AppContext.dailyLogs[today] so a
 * killed+relaunched app continues where it left off.
 *
 * Midnight detection: a 30-second interval checks for date changes and
 * resets the in-memory state when the calendar day rolls over.
 */

const MealContext = createContext(null);

const INITIAL = {
  loggedMeals: [],
  totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
};

function reducer(state, action) {
  switch (action.type) {

    case 'ADD_MEAL': {
      const meal = action.payload;
      return {
        ...state,
        loggedMeals: [...state.loggedMeals, meal],
        totals: {
          ...state.totals,
          calories: state.totals.calories + (meal.kcal || meal.calories || 0),
          protein:  state.totals.protein  + (meal.protein  || 0),
          carbs:    state.totals.carbs    + (meal.carbs    || 0),
          fat:      state.totals.fat      + (meal.fat      || 0),
        },
      };
    }

    case 'REMOVE_MEAL': {
      const { mealId } = action.payload;
      // String() coercion keeps numeric legacy IDs and new string IDs comparable
      const remaining = state.loggedMeals.filter((m) => String(m.id) !== String(mealId));
      return {
        ...state,
        loggedMeals: remaining,
        totals: {
          ...state.totals,
          calories: remaining.reduce((s, m) => s + (m.kcal || m.calories || 0), 0),
          protein:  remaining.reduce((s, m) => s + (m.protein  || 0), 0),
          carbs:    remaining.reduce((s, m) => s + (m.carbs    || 0), 0),
          fat:      remaining.reduce((s, m) => s + (m.fat      || 0), 0),
        },
      };
    }

    case 'UPDATE_MEAL': {
      const meal = action.payload;
      const updated = state.loggedMeals.map((m) =>
        String(m.id) === String(meal.id) ? { ...m, ...meal, kcal: meal.kcal ?? meal.calories ?? m.kcal ?? 0 } : m
      );
      return {
        ...state,
        loggedMeals: updated,
        totals: {
          ...state.totals,
          calories: updated.reduce((s, m) => s + (m.kcal ?? m.calories ?? 0), 0),
          protein:  updated.reduce((s, m) => s + (m.protein  ?? 0), 0),
          carbs:    updated.reduce((s, m) => s + (m.carbs    ?? 0), 0),
          fat:      updated.reduce((s, m) => s + (m.fat      ?? 0), 0),
        },
      };
    }

    // Hydrate from a persisted daily log on startup
    case 'LOAD_DAY': {
      const log   = action.payload;
      const meals = (log.meals || []).map((m) => ({
        ...m,
        kcal: m.kcal ?? m.calories ?? 0,
      }));
      return {
        loggedMeals: meals,
        totals: {
          calories: log.calories || 0,
          protein:  log.protein  || 0,
          carbs:    log.carbs    || 0,
          fat:      log.fat      || 0,
        },
      };
    }

    // Midnight rollover — wipe in-memory state; persisted data stays in AppContext
    case 'RESET_DAY':
      return INITIAL;

    default:
      return state;
  }
}

export function MealContextProvider({ children }) {
  const { state: appState, dispatch: appDispatch } = useApp();
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const currentDateRef = useRef(getTodayKey());

  // ── Hydrate today's log from persisted store on first mount ─────────────────
  useEffect(() => {
    const today   = getTodayKey();
    const todayLog = appState.dailyLogs?.[today];
    if (todayLog && (todayLog.calories > 0 || (todayLog.meals || []).length > 0)) {
      dispatch({ type: 'LOAD_DAY', payload: todayLog });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  // ── Midnight detection: poll every 30 s ─────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const newDate = getTodayKey();
      if (newDate !== currentDateRef.current) {
        currentDateRef.current = newDate;
        dispatch({ type: 'RESET_DAY' });
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Public API ───────────────────────────────────────────────────────────────

  const addMeal = (meal) => {
    const today = getTodayKey();

    // 1. Update in-memory state immediately
    dispatch({ type: 'ADD_MEAL', payload: meal });

    // 2. Write-through to persisted dailyLogs (AsyncStorage via AppContext)
    const logMeal = {
      ...meal,
      calories: meal.kcal ?? meal.calories ?? 0, // AppContext reducer reads .calories
    };
    appDispatch({ type: 'LOG_MEAL', payload: { date: today, meal: logMeal } });

    // 3. Write to Firestore so the Remove button can delete by document ID.
    //    Path: users/{uid}/meals/{mealId}
    const uid = auth.currentUser?.uid;
    if (uid && meal.id) {
      setDoc(doc(db, 'users', uid, 'meals', String(meal.id)), {
        ...logMeal,
        date: today,
      }).catch((e) => console.error('[MealContext] Firestore write error:', e.message));
    }
  };

  const updateMeal = (meal, date) => {
    const targetDate = date || getTodayKey();

    // 1. Update in-memory state (MealContext)
    dispatch({ type: 'UPDATE_MEAL', payload: meal });

    // 2. Update persisted dailyLogs (AppContext)
    const logMeal = { ...meal, calories: meal.kcal ?? meal.calories ?? 0 };
    appDispatch({ type: 'UPDATE_MEAL', payload: { date: targetDate, meal: logMeal } });

    // 3. Overwrite Firestore document
    const uid = auth.currentUser?.uid;
    if (uid && meal.id) {
      setDoc(doc(db, 'users', uid, 'meals', String(meal.id)), {
        ...logMeal,
        date: targetDate,
      }).catch((e) => console.error('[MealContext] Firestore update error:', e.message));
    }
  };

  const removeMeal = (mealId, date) => {
    const targetDate = date || getTodayKey();
    console.log('[MealContext.removeMeal] mealId:', mealId, '| date:', targetDate);

    // 1. Remove from in-memory state immediately (MealContext)
    dispatch({ type: 'REMOVE_MEAL', payload: { mealId } });

    // 2. Remove from persisted dailyLogs (AppContext → auto-saves to AsyncStorage)
    appDispatch({ type: 'REMOVE_MEAL', payload: { date: targetDate, mealId } });

    // 3. Delete from Firestore
    const uid = auth.currentUser?.uid;
    if (uid && mealId) {
      deleteDoc(doc(db, 'users', uid, 'meals', String(mealId)))
        .catch((e) => console.error('[MealContext] Firestore delete error:', e.message));
    }
  };

  return (
    <MealContext.Provider value={{ ...state, addMeal, updateMeal, removeMeal }}>
      {children}
    </MealContext.Provider>
  );
}

export function useMealContext() {
  const ctx = useContext(MealContext);
  if (!ctx) throw new Error('useMealContext must be used inside MealContextProvider');
  return ctx;
}
