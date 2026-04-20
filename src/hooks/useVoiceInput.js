/**
 * useVoiceInput
 * Wraps the Web Speech API (SpeechRecognition) for voice-to-text input.
 *
 * Platform support:
 *   - Web  : fully functional via window.SpeechRecognition / webkitSpeechRecognition
 *   - Native: isSupported = false; mic button shows but is gracefully disabled
 *
 * Usage:
 *   const { isSupported, isListening, transcript, error,
 *           startListening, stopListening, clearTranscript } = useVoiceInput({ onResult });
 *
 *   onResult(finalText) — called once a final result is ready.
 *                         Ideal hook point to auto-send the message.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';

export function useVoiceInput({ onResult } = {}) {
  const [isListening,  setIsListening]  = useState(false);
  const [transcript,   setTranscript]   = useState('');
  const [error,        setError]        = useState(null);
  const recognitionRef = useRef(null);
  const onResultRef    = useRef(onResult);

  // Keep onResult ref current so the recognition closure never goes stale
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  // Detect support once — stable across renders
  const isSupported =
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const startListening = useCallback(() => {
    if (!isSupported) return;
    setError(null);
    setTranscript('');

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = true;   // stream partial results into the text box
    recognition.maxAlternatives = 1;
    recognition.continuous = false;      // stop automatically after a pause

    recognition.onresult = (event) => {
      let interimText = '';
      let finalText   = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText   += t;
        else                          interimText  += t;
      }

      // Show interim transcript in real-time; fire onResult for finals
      const current = finalText || interimText;
      setTranscript(current);

      if (finalText.trim() && onResultRef.current) {
        onResultRef.current(finalText.trim());
      }
    };

    recognition.onerror = (e) => {
      const msg =
        e.error === 'not-allowed'  ? 'Microphone permission denied. Click the 🔒 icon in your address bar and allow microphone access.' :
        e.error === 'no-speech'    ? 'No speech detected. Try speaking louder or closer to your mic.' :
        e.error === 'network'      ? 'Voice recognition blocked. Brave/Firefox block Google\'s speech service — try Chrome or Edge, or just type your message below.' :
        e.error === 'aborted'      ? null :   // user stopped — not an error
                                     `Voice error: ${e.error}`;
      if (msg) setError(msg);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isSupported]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const clearTranscript = useCallback(() => setTranscript(''), []);

  // Abort on unmount
  useEffect(() => () => recognitionRef.current?.abort(), []);

  return {
    isSupported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    clearTranscript,
  };
}
