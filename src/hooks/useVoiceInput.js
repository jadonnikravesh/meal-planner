/**
 * useVoiceInput
 *
 * Platform behaviour:
 *   Web    — Web Speech API (SpeechRecognition / webkitSpeechRecognition)
 *   Native — expo-av Recording with RMS metering → silence detection → auto-stop
 *            → backend /transcribe (Whisper)
 *
 * Silence detection (native only):
 *   - Polls metering every 100ms via getStatusAsync()
 *   - SILENCE_THRESHOLD_DB (-35 dBFS): below this = silence
 *   - Auto-stops after SILENCE_DURATION_MS (1500ms) of consecutive silence,
 *     but only after the user has spoken at least once (or SPEECH_GRACE_MS elapsed)
 *   - Hard cap: MAX_RECORD_DURATION_MS (30s)
 *
 * Why the original broke:
 *   - isMeteringEnabled was never set → status.metering was always null
 *   - No poll loop existed → silence was never detected → recording ran forever
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { API_BASE_URL } from '../config/api';

// ─── Native-only imports (dynamic so the web bundle never touches them) ───────
let Audio       = null;
let FileSystem  = null;
if (Platform.OS !== 'web') {
  Audio      = require('expo-av').Audio;
  FileSystem = require('expo-file-system');
}

// ─── Silence detection tuning ─────────────────────────────────────────────────
const SILENCE_THRESHOLD_DB    = -35;    // dBFS — below = silence, above = speech
const SILENCE_DURATION_MS     = 1500;  // auto-stop after 1.5 s of consecutive silence
const POLL_INTERVAL_MS        = 100;   // metering poll rate (ms)
const MAX_RECORD_DURATION_MS  = 30_000; // hard cap: stop after 30 s regardless
const SPEECH_GRACE_MS         = 2_000; // wait up to 2 s before silence gate activates

export function useVoiceInput({ onResult } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript,  setTranscript]  = useState('');
  const [error,       setError]       = useState(null);

  const onResultRef        = useRef(onResult);
  const recognitionRef     = useRef(null);  // web SpeechRecognition
  const recordingRef       = useRef(null);  // native Audio.Recording
  const stoppingRef        = useRef(false); // guard against double-stop
  const meterIntervalRef   = useRef(null);  // silence-detection setInterval id
  const maxTimeoutRef      = useRef(null);  // max-duration setTimeout id
  const lastSpeechTimeRef  = useRef(null);  // Date.now() of last speech sample
  const hasSpeechRef       = useRef(false); // has the user spoken yet?
  const recordStartRef     = useRef(null);  // Date.now() when recording started

  // Keep a stable ref to stopNativeListening so the interval callback never
  // captures a stale closure (avoids the need to put it in startNativeListening's deps).
  const stopNativeRef = useRef(null);

  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  const isWeb = Platform.OS === 'web';

  const webSpeechSupported =
    isWeb &&
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const isSupported = isWeb ? webSpeechSupported : true;

  // ── Shared: clear all native timers ──────────────────────────────────────────
  const clearNativeTimers = useCallback(() => {
    if (meterIntervalRef.current) {
      clearInterval(meterIntervalRef.current);
      meterIntervalRef.current = null;
    }
    if (maxTimeoutRef.current) {
      clearTimeout(maxTimeoutRef.current);
      maxTimeoutRef.current = null;
    }
  }, []);

  // ── Web: SpeechRecognition ───────────────────────────────────────────────────
  const startWebListening = useCallback(() => {
    if (!webSpeechSupported) return;
    setError(null);
    setTranscript('');

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      let interim = '';
      let final   = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final  += t;
        else                          interim += t;
      }
      const current = final || interim;
      setTranscript(current);
      if (final.trim()) onResultRef.current?.(final.trim());
    };

    recognition.onerror = (e) => {
      const msg =
        e.error === 'not-allowed' ? 'Microphone permission denied. Click the 🔒 icon and allow microphone access.' :
        e.error === 'no-speech'   ? 'No speech detected. Try speaking louder.' :
        e.error === 'network'     ? 'Voice recognition unavailable in this browser. Try Chrome or type your message.' :
        e.error === 'aborted'     ? null :
                                    `Voice error: ${e.error}`;
      if (msg) setError(msg);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [webSpeechSupported]);

  const stopWebListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // ── Native: stop → transcribe ────────────────────────────────────────────────
  const stopNativeListening = useCallback(async (reason = 'manual') => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    clearNativeTimers();

    const recording = recordingRef.current;
    if (!recording) {
      setIsListening(false);
      stoppingRef.current = false;
      return;
    }
    recordingRef.current = null;

    console.log(`[voice] stopping — reason: ${reason}`);
    setTranscript('Transcribing…');

    try {
      await recording.stopAndUnloadAsync();

      // Switch AVAudioSession back to Playback category immediately after the
      // recording file is closed. This MUST happen before the /transcribe fetch
      // so that if TTS fires while transcription is in-flight, the session is
      // already in the right state. speakWithElevenLabs also re-asserts this
      // mode as a safety net, but doing it here eliminates the race.
      // playsInSilentModeIOS: false → TTS respects the ringer switch (same as ttsService).
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false });
      console.log('[audio] Playback mode enabled (recording stopped)');

      const uri = recording.getURI();
      if (!uri) throw new Error('No recording file produced');
      console.log('[voice] recording URI:', uri);

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      console.log('[voice] audio size:', Math.round(base64.length * 0.75 / 1024), 'KB');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const res = await fetch(`${API_BASE_URL}/transcribe`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ audioBase64: base64, mimeType: 'audio/m4a' }),
        signal:  controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Transcription failed (${res.status})`);
      }

      const data = await res.json();
      const text = (data.transcript ?? '').trim();
      console.log('[voice] transcript:', JSON.stringify(text));

      setTranscript(text);
      if (text) onResultRef.current?.(text);
      else      setError('No speech detected. Please try again.');

    } catch (e) {
      const isTimeout = e.name === 'AbortError';
      setError(isTimeout ? 'Transcription timed out. Please try again.' : `Voice error: ${e.message}`);
      setTranscript('');
      console.warn('[voice] transcription error:', e.message);
    } finally {
      setIsListening(false);
      stoppingRef.current = false;
    }
  }, [clearNativeTimers]);

  // Keep stable ref current so the interval callback always calls the live version
  useEffect(() => { stopNativeRef.current = stopNativeListening; }, [stopNativeListening]);

  // ── Native: start recording + silence-detection loop ─────────────────────────
  const startNativeListening = useCallback(async () => {
    if (!Audio) return;
    if (stoppingRef.current) return; // don't start during a stop

    setError(null);
    setTranscript('');
    stoppingRef.current  = false;
    hasSpeechRef.current = false;
    lastSpeechTimeRef.current  = null;
    recordStartRef.current     = null;

    try {
      // ── 1. Permissions ──────────────────────────────────────────────────────
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setError('Microphone permission denied. Go to Settings → FoodChat AI → Microphone to enable it.');
        return;
      }

      // ── 2. Switch iOS audio session to recording mode ───────────────────────
      // Must happen before prepareToRecordAsync — without this iOS routes the
      // microphone through the wrong AVAudioSession category and records silence.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:   true,
        playsInSilentModeIOS: true,
      });
      console.log('[audio] Recording mode enabled');

      // ── 3. Prepare recording with metering ENABLED ──────────────────────────
      //    Without isMeteringEnabled: true, status.metering is always null
      //    and silence detection cannot work.
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      await recording.startAsync();

      recordingRef.current   = recording;
      recordStartRef.current = Date.now();
      setIsListening(true);
      console.log('[voice] recording started — metering enabled, polling every', POLL_INTERVAL_MS, 'ms');

      // ── 4. Silence-detection poll loop ──────────────────────────────────────
      meterIntervalRef.current = setInterval(async () => {
        const rec = recordingRef.current;
        if (!rec) return; // already stopped

        try {
          const status = await rec.getStatusAsync();

          if (!status.isRecording) {
            console.log('[voice] status.isRecording=false — clearing interval');
            clearInterval(meterIntervalRef.current);
            meterIntervalRef.current = null;
            return;
          }

          const db      = status.metering ?? -160; // dBFS; null if metering disabled
          const now     = Date.now();
          const elapsed = now - (recordStartRef.current ?? now);
          const isSpeech = db > SILENCE_THRESHOLD_DB;

          // Log every 5 polls (~500ms) to avoid flooding the console
          if (Math.round(elapsed / POLL_INTERVAL_MS) % 5 === 0) {
            console.log(
              `[voice] metering: ${db.toFixed(1)} dB | ` +
              `speech: ${isSpeech} | ` +
              `hasSpeech: ${hasSpeechRef.current} | ` +
              `elapsed: ${elapsed}ms`
            );
          }

          if (isSpeech) {
            if (!hasSpeechRef.current) {
              console.log('[voice] speech detected for the first time');
            }
            hasSpeechRef.current   = true;
            lastSpeechTimeRef.current = now;
          }

          // Silence gate: only activate after first speech OR grace period
          const gracePassed     = elapsed >= SPEECH_GRACE_MS;
          const gateActive      = hasSpeechRef.current || gracePassed;
          if (!gateActive) return;

          // If no speech was ever detected, use the start of the grace period
          // as the "last speech" reference so we don't spin forever.
          const lastSpeech      = lastSpeechTimeRef.current
            ?? (recordStartRef.current + SPEECH_GRACE_MS);
          const silenceDuration = now - lastSpeech;

          if (silenceDuration >= SILENCE_DURATION_MS) {
            console.log(`[voice] auto-stopping — ${silenceDuration}ms silence detected`);
            clearInterval(meterIntervalRef.current);
            meterIntervalRef.current = null;
            stopNativeRef.current?.('silence');
          }

        } catch (err) {
          // getStatusAsync() can throw if the recording was already unloaded;
          // clear the interval silently.
          console.warn('[voice] getStatusAsync error:', err.message);
          clearInterval(meterIntervalRef.current);
          meterIntervalRef.current = null;
        }
      }, POLL_INTERVAL_MS);

      // ── 5. Hard max-duration cap ────────────────────────────────────────────
      maxTimeoutRef.current = setTimeout(() => {
        console.log('[voice] max duration reached — forcing stop');
        stopNativeRef.current?.('max_duration');
      }, MAX_RECORD_DURATION_MS);

    } catch (e) {
      console.error('[voice] startNativeListening error:', e.message);
      setError(`Could not start recording: ${e.message}`);
      clearNativeTimers();
      stoppingRef.current = false;
      // If the error occurred after setAudioModeAsync(allowsRecordingIOS: true),
      // the session is stuck in record mode. Restore playback mode unconditionally
      // so subsequent TTS calls are not silenced.
      Audio?.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false })
        .then(() => console.log('[audio] Playback mode enabled (recording setup failed)'))
        .catch(() => {});
    }
  }, [clearNativeTimers]);

  // ── Unified API ──────────────────────────────────────────────────────────────
  const startListening  = isWeb ? startWebListening  : startNativeListening;
  const stopListening   = isWeb ? stopWebListening   : stopNativeListening;
  const clearTranscript = useCallback(() => setTranscript(''), []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isWeb) {
        recognitionRef.current?.abort();
      } else {
        clearNativeTimers();
        if (recordingRef.current) {
          // Component unmounted while recording was active (e.g. user navigated away).
          // Stop the recording AND restore the audio mode — without this the session
          // stays in record mode (allowsRecordingIOS: true) permanently, silencing
          // all subsequent TTS playback until the app is restarted.
          recordingRef.current.stopAndUnloadAsync().catch(() => {});
          recordingRef.current = null;
          Audio?.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false })
            .then(() => console.log('[audio] Playback mode enabled (unmount cleanup)'))
            .catch(() => {});
        }
      }
    };
  }, [isWeb, clearNativeTimers]);

  return { isSupported, isListening, transcript, error, startListening, stopListening, clearTranscript };
}
