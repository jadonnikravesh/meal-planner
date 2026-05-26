import React, { createContext, useContext, useState, useCallback } from 'react';

const PremiumContext = createContext(null);

export function PremiumProvider({ children }) {
  const [premiumVisible, setPremiumVisible] = useState(false);

  const showPremium = useCallback(() => setPremiumVisible(true), []);
  const hidePremium = useCallback(() => setPremiumVisible(false), []);

  return (
    <PremiumContext.Provider value={{ premiumVisible, showPremium, hidePremium }}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium() {
  const ctx = useContext(PremiumContext);
  if (!ctx) throw new Error('usePremium must be used inside PremiumProvider');
  return ctx;
}
