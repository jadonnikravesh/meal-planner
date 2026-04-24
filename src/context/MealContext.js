/**
 * MealContext — in-memory store for today's logged meals.
 *
 * Write-through: every ADD_MEAL also dispatches to AppContext (AsyncStorage)
 * and writes to Firestore (users/{uid}/meals/{mealId}).
 *
 * Source of truth: Firestore.
 *   On login, an onSnapshot listener fetches today's meals and merges them
 *   into local state. The dedup guard in ADD_MEAL (and in AppContext.LOG_MEAL)
 *   prevents double-adds when both AsyncStorage and Firestore deliver the
 *   same meal.
 *
 * On logout: in-memory state is cleared so the next user starts clean.
 *
 * Midnight detection: a 30-second interval clears the in-memory state when
 * the calendar day rolls over (persisted data in AppContext is kept).
 */

import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { doc, setDoc, deleteDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { useApp } from './AppContext';
import { useAuth } from './AuthContext';
import { auth, db } from '../firebase/config';
import { getTodayKey } from '../utils/nutrition';

const MealContext = createContext(null);

const INITIAL = {
  loggedMeals: [],
  totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
};

function reducer(state, action) {
  switch (action.type) {

    case 'ADD_MEAL': {
      const meal = action.payload;
      // Dedup: Firestore snapshots and optimistic local updates can both arrive
      // for the same meal. Skip silently if the ID already exists.
      if (meal.id && state.loggedMeals.some(m => String(m.id) === String(meal.id))) {
        return state;
      }
      return {
        ...state,
        loggedMeals: [...state.loggedMeals, meal],
        totals: {
          calories: state.totals.calories + (meal.kcal || meal.calories || 0),
          protein:  state.totals.protein  + (meal.protein  || 0),
          carbs:    state.totals.carbs    + (meal.carbs    || 0),
          fat:      state.totals.fat      + (meal.fat      || 0),
        },
      };
    }

    case 'REMOVE_MEAL': {
      const { mealId } = action.payload;
      const remaining = state.loggedMeals.filter((m) => String(m.id) !== String(mealId));
      return {
        ...state,
        loggedMeals: remaining,
        totals: {
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
        String(m.id) === String(meal.id)
          ? { ...m, ...meal, kcal: meal.kcal ?? meal.calories ?? m.kcal ?? 0 }
          : m
      );
      return {
        ...state,
        loggedMeals: updated,
        totals: {
          calories: updated.reduce((s, m) => s + (m.kcal ?? m.calories ?? 0), 0),
          protein:  updated.reduce((s, m) => s + (m.protein  ?? 0), 0),
          carbs:    updated.reduce((s, m) => s + (m.carbs    ?? 0), 0),
          fat:      updated.reduce((s, m) => s + (m.fat      ?? 0), 0),
        },
      };
    }

    // Hydrate from a persisted daily log (AsyncStorage → AppContext) on startup
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

    // Midnight rollover or logout — wipe in-memory state
    case 'RESET_DAY':
      return INITIAL;

    default:
      return state;
  }
}

export function MealContextProvider({ children }) {
  const { state: appState, dispatch: appDispatch } = useApp();
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const currentDateRef  = useRef(getTodayKey());
  const snapshotUnsubRef = useRef(null); // Firestore onSnapshot unsubscribe fn

  // ── Hydrate today's log from AsyncStorage (fast, offline-safe) ──────────────
  // Runs once on mount. Firestore snapshot (below) fills in anything missing.
  useEffect(() => {
    const today    = getTodayKey();
    const todayLog = appState.dailyLogs?.[today];
    if (todayLog && (todayLog.calories > 0 || (todayLog.meals || []).length > 0)) {
      dispatch({ type: 'LOAD_DAY', payload: todayLog });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once

  // ── Firestore real-time listener — source of truth for today's meals ────────
  // Re-runs when the user changes (login / logout / account switch).
  // Skips the test account since it has no real Firebase UID.
  useEffect(() => {
    // Tear down any existing snapshot subscription
    if (snapshotUnsubRef.current) {
      snapshotUnsubRef.current();
      snapshotUnsubRef.current = null;
    }

    const uid = user?.uid;
    if (!uid || user?.isTestAccount) {
      // Logged out or test account — reset in-memory state
      dispatch({ type: 'RESET_DAY' });
      return;
    }

    const today = getTodayKey();
    const q = query(
      collection(db, 'users', uid, 'meals'),
      where('date', '==', today),
    );

    console.log('[MealContext] subscribing to Firestore — uid:', uid, 'date:', today);

    snapshotUnsubRef.current = onSnapshot(
      q,
      (snapshot) => {
        console.log('[MealContext] Firestore snapshot:', snapshot.size, 'doc(s)');
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const d = change.doc.data();
            const meal = {
              id:            change.doc.id,
              name:          d.name          || '',
              kcal:          d.kcal          ?? d.calories ?? 0,
              calories:      d.calories      ?? d.kcal     ?? 0,
              protein:       d.protein       ?? 0,
              carbs:         d.carbs         ?? 0,
              fat:           d.fat           ?? 0,
              time:          d.time          || '',
              uri:           d.uri           ?? null,
              fallbackColor: d.fallbackColor ?? null,
            };
            console.log('[MealContext] Firestore +meal:', meal.id, meal.name, meal.kcal, 'kcal');
            // Both reducers have dedup guards — safe even if already loaded from AsyncStorage
            dispatch({ type: 'ADD_MEAL', payload: meal });
            appDispatch({ type: 'LOG_MEAL', payload: { date: today, meal } });
          }
          // 'removed' / 'modified' are driven by explicit removeMeal / updateMeal calls
          // which already update local state before touching Firestore
        });
      },
      (err) => {
        console.error('[MealContext] Firestore snapshot error:', err.message);
      },
    );

    return () => {
      if (snapshotUnsubRef.current) {
        snapshotUnsubRef.current();
        snapshotUnsubRef.current = null;
      }
    };
  }, [user?.uid, user?.isTestAccount, appDispatch]);

  // ── Midnight detection: poll every 30 s ─────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const newDate = getTodayKey();
      if (newDate !== currentDateRef.current) {
        currentDateRef.current = newDate;
        dispatch({ type: 'RESET_DAY' });
        // The snapshot subscription stays active but queries for the old date —
        // new meals on the new day are added via addMeal's local dispatch and
        // will be fetched correctly on the next app open / user re-login.
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Public API ───────────────────────────────────────────────────────────────

  const addMeal = (meal) => {
    const today = getTodayKey();

    // 1. Optimistic local update (instant UI feedback)
    dispatch({ type: 'ADD_MEAL', payload: meal });

    // 2. Write-through to AppContext → AsyncStorage
    const logMeal = {
      ...meal,
      calories: meal.kcal ?? meal.calories ?? 0,
    };
    appDispatch({ type: 'LOG_MEAL', payload: { date: today, meal: logMeal } });

    // 3. Write to Firestore (source of truth; survives logout/reinstall)
    const uid = auth.currentUser?.uid;
    if (uid && meal.id) {
      setDoc(doc(db, 'users', uid, 'meals', String(meal.id)), {
        ...logMeal,
        date: today,
        userId: uid,
        timestamp: Date.now(),
      }).then(() => {
        console.log('[MealContext] Firestore write OK:', meal.id, meal.name);
      }).catch((e) => {
        console.error('[MealContext] Firestore write error:', e.message);
      });
    }
  };

  const updateMeal = (meal, date) => {
    const targetDate = date || getTodayKey();

    dispatch({ type: 'UPDATE_MEAL', payload: meal });

    const logMeal = { ...meal, calories: meal.kcal ?? meal.calories ?? 0 };
    appDispatch({ type: 'UPDATE_MEAL', payload: { date: targetDate, meal: logMeal } });

    const uid = auth.currentUser?.uid;
    if (uid && meal.id) {
      setDoc(doc(db, 'users', uid, 'meals', String(meal.id)), {
        ...logMeal,
        date: targetDate,
        userId: uid,
        timestamp: Date.now(),
      }).catch((e) => console.error('[MealContext] Firestore update error:', e.message));
    }
  };

  const removeMeal = (mealId, date) => {
    const targetDate = date || getTodayKey();
    console.log('[MealContext.removeMeal] mealId:', mealId, '| date:', targetDate);

    dispatch({ type: 'REMOVE_MEAL', payload: { mealId } });
    appDispatch({ type: 'REMOVE_MEAL', payload: { date: targetDate, mealId } });

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
