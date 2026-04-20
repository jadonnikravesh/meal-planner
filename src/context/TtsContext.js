/**
 * TtsContext — lightweight speaking-state bridge.
 *
 * HelperScreen calls markSpeaking() / markStopped() around TTS playback.
 * FloatingTabBar reads isSpeaking to show/hide the stop button.
 * stop() halts audio and resets the flag in one call.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { stopSpeech } from '../utils/ttsService';

const TtsContext = createContext(null);

export function TtsProvider({ children }) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const markSpeaking = useCallback(() => setIsSpeaking(true),  []);
  const markStopped  = useCallback(() => setIsSpeaking(false), []);

  const stop = useCallback(async () => {
    await stopSpeech();
    setIsSpeaking(false);
  }, []);

  return (
    <TtsContext.Provider value={{ isSpeaking, markSpeaking, markStopped, stop }}>
      {children}
    </TtsContext.Provider>
  );
}

export function useTts() {
  const ctx = useContext(TtsContext);
  if (!ctx) throw new Error('useTts must be used inside TtsProvider');
  return ctx;
}
