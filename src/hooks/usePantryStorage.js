import { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';

// Per-user key — isolated from the main app-state blob so pantry reads/writes
// can never race with or overwrite daily-log or meal data.
export const PANTRY_STORAGE_KEY = (uid) =>
  uid ? `pantryItems_v1_${uid}` : 'pantryItems_v1_anon';

export function usePantryStorage() {
  const { user }  = useAuth();
  const uid       = user?.uid ?? null;

  const [items,  setItems]  = useState([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef(null);

  // ── Load whenever the authenticated user changes ───────────────────────────
  useEffect(() => {
    setItems([]);
    setLoaded(false);

    if (!uid) {
      // Logged-out — nothing to load; show empty state
      setLoaded(true);
      return;
    }

    AsyncStorage.getItem(PANTRY_STORAGE_KEY(uid))
      .then((raw) => {
        if (raw) {
          try { setItems(JSON.parse(raw)); } catch (_) { /* corrupted — start fresh */ }
        }
      })
      .catch(() => { /* storage unavailable — start empty */ })
      .finally(() => setLoaded(true));
  }, [uid]);

  // ── Debounced save — guarded so we never write before the load finishes ───
  // Without the `!loaded` guard, the initial setItems([]) on uid-change would
  // immediately overwrite the stored data before the read completes.
  useEffect(() => {
    if (!loaded || !uid) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(PANTRY_STORAGE_KEY(uid), JSON.stringify(items))
        .catch(() => {});
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [items, uid, loaded]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  // All use functional setItems so they always operate on the latest slice of
  // state — no stale-closure risk even when called from async image fetches.

  // Dedup by name (case-insensitive) — re-scanning the same shelf is safe.
  const addItems = useCallback((incoming) => {
    setItems((prev) => {
      const existingNames = new Set(prev.map((i) => i.name.toLowerCase()));
      const fresh = incoming.filter((i) => !existingNames.has(i.name.toLowerCase()));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, []);

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearAll = useCallback(() => setItems([]), []);

  // Streams a Pexels URI onto an already-visible item without touching any
  // other item or any other piece of app state.
  const updateItemImage = useCallback((id, imageUri) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, imageUri } : i))
    );
  }, []);

  const updateItem = useCallback((id, updates) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...updates } : i))
    );
  }, []);

  const replaceAll = useCallback((newItems) => {
    setItems(newItems);
  }, []);

  return { items, loaded, addItems, removeItem, clearAll, updateItemImage, updateItem, replaceAll };
}
