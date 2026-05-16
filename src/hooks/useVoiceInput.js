import { useState, useCallback } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export function useVoiceInput({ onResult } = {}) {
  const [isListening,    setIsListening]    = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error,          setError]          = useState(null);

  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    setIsTranscribing(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (event.isFinal) {
      setIsListening(false);
      setIsTranscribing(false);
      const transcript = event.results[0]?.transcript;
      if (transcript) onResult?.(transcript);
    }
  });

  useSpeechRecognitionEvent('error', () => {
    setIsListening(false);
    setIsTranscribing(false);
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
    setIsTranscribing(false);
  });

  const startListening = useCallback(async () => {
    try {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) return;
      setError(null);
      ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: false });
    } catch (e) {
      setError(e.message);
      setIsListening(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
    setIsListening(false);
    setIsTranscribing(false);
  }, []);

  return {
    recordingState: isListening ? 'recording' : 'idle',
    isListening,
    isTranscribing,
    error,
    startListening,
    stopListening,
  };
}
