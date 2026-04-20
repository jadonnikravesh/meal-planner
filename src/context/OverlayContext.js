import { createContext, useContext } from 'react';

// Shared context so any screen can trigger the full-screen MealLogOverlay
export const MealOverlayContext = createContext(() => {});

export function useMealOverlay() {
  return useContext(MealOverlayContext);
}
