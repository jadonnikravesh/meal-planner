/**
 * ttsService — ElevenLabs text-to-speech, routed through the Render backend.
 *
 * Platform split:
 *   Web    → HTML5 Audio with a data-URI
 *   Native → expo-av + FileSystem cache (data-URIs not supported by expo-av)
 *
 * iOS audio session design:
 *   playsInSilentModeIOS: false
 *     → Audio respects the iPhone ringer switch. When the device is on silent,
 *       TTS is muted — matching the expected behaviour for a nutrition assistant
 *       (no surprise audio in meetings, at the gym, etc.).
 *       Set to true only if the app needs unconditional playback like a podcast player.
 *
 *   allowsRecordingIOS: false
 *     → AVAudioSession category = Playback (not PlayAndRecord). Must be restored
 *       after every recording session or the output is routed through the earpiece.
 *
 *   interruptionModeIOS: DoNotMix
 *     → Pauses Spotify / Podcasts while TTS speaks, then hands back on finish.
 *
 * Lifecycle guards implemented here:
 *   1. Race-condition protection (_playGeneration counter) — rapid calls discard
 *      stale responses; only the most recent fetch gets to play.
 *   2. unloadAsync deferred out of the status callback — calling it inline inside
 *      setOnPlaybackStatusUpdate deadlocks AVAudioPlayer on iOS.
 *   3. createAsync status verified before playAsync — surfaces decode errors
 *      instead of silently no-op-ing on a bad file.
 *   4. Fetch has an explicit 20 s timeout — prevents Render cold-starts from
 *      hanging the app indefinitely.
 *   5. Cache file validated with getInfoAsync — catches truncated base64 writes.
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { API_BASE_URL } from '../config/api';

const BACKEND_URL    = API_BASE_URL;
const TTS_TIMEOUT_MS = 20_000;

// ── Module-level state ────────────────────────────────────────────────────────

let _slotIndex     = 0;    // rotating cache slot 0-4 (avoids write-while-playing)
let _currentSound  = null; // expo-av Sound currently playing (native)
let _currentAudio  = null; // HTML5 Audio element currently playing (web)
let _playGeneration = 0;   // increments on each speakWithElevenLabs call;
                           // stale responses check their generation before playing

function nextCacheFile() {
  _slotIndex = (_slotIndex + 1) % 5;
  return `${FileSystem.cacheDirectory}tts_slot${_slotIndex}.mp3`;
}

// ── Audio session modes ───────────────────────────────────────────────────────

/**
 * Playback mode — used before every TTS utterance and on app startup.
 *
 * playsInSilentModeIOS: false  → respects the iPhone ringer/silent switch.
 *   If the user has silenced their phone, TTS stays quiet. This is the right
 *   default for a utility app. Alarm/navigation apps use true instead.
 */
const PLAYBACK_AUDIO_MODE = {
  playsInSilentModeIOS:       false,  // ← respect the ringer switch
  allowsRecordingIOS:         false,  // AVAudioSession category → Playback
  staysActiveInBackground:    false,
  interruptionModeIOS:        InterruptionModeIOS.DoNotMix,
  shouldDuckAndroid:          true,
  interruptionModeAndroid:    InterruptionModeAndroid.DoNotMix,
  playThroughEarpieceAndroid: false,
};

// ── Session init ─────────────────────────────────────────────────────────────

/**
 * Call once at app startup (native only).
 * Warms the AVAudioSession so the first utterance is not clipped.
 */
export async function initAudioSession() {
  if (Platform.OS === 'web') return;
  try {
    await Audio.setAudioModeAsync(PLAYBACK_AUDIO_MODE);
    console.log('[audio] Playback mode enabled (app startup)');
  } catch (e) {
    console.warn('[tts] initAudioSession error:', e.message);
  }
}

// ── Stop ─────────────────────────────────────────────────────────────────────

/** Stop and unload any in-progress audio on either platform. */
export async function stopSpeech() {
  if (Platform.OS === 'web') {
    if (_currentAudio) {
      _currentAudio.pause();
      _currentAudio.src = '';
      _currentAudio = null;
    }
  } else {
    if (_currentSound) {
      const s = _currentSound;
      _currentSound = null;         // clear ref first so status callback sees null
      try { await s.stopAsync();   } catch (_) {}
      try { await s.unloadAsync(); } catch (_) {}
    }
  }
}

// ── Core playback wrapper ─────────────────────────────────────────────────────

/**
 * playTTSAudio — reusable native audio player.
 *
 * Plays a local file URI through expo-av with all iOS safety measures applied.
 * Exported so it can be called independently of speakWithElevenLabs (e.g. for
 * cached audio, testing, or a future offline mode).
 *
 * @param {string} uri         - Local file URI (from FileSystem.cacheDirectory)
 * @param {object} [opts]
 * @param {Function} [opts.onStart]    - Called just before playAsync()
 * @param {Function} [opts.onEnd]      - Called on finish, error, or discard
 * @param {number}  [opts.generation]  - If provided, discards stale calls
 *                                       (generation !== _playGeneration → abort)
 */
export async function playTTSAudio(uri, { onStart, onEnd, generation } = {}) {
  // ── 1. Stop any audio that's currently playing ──────────────────────────
  await stopSpeech();

  // ── 2. Race-condition check (post-stop) ─────────────────────────────────
  // A newer speakWithElevenLabs call may have started while we were fetching.
  // If so, our response is stale — discard it silently.
  if (generation !== undefined && generation !== _playGeneration) {
    console.log('[tts] Stale TTS response discarded — newer call is active');
    onEnd?.();
    return;
  }

  // ── 3. Set playback audio mode ──────────────────────────────────────────
  // Critical after any recording session (which sets allowsRecordingIOS: true).
  // Without this, output is routed through the earpiece instead of the speaker.
  try {
    await Audio.setAudioModeAsync(PLAYBACK_AUDIO_MODE);
    console.log('[audio] Playback mode enabled');
  } catch (modeErr) {
    console.warn('[tts] setAudioMode error:', modeErr.message);
    // Continue — better to attempt playback than fail silently
  }

  // ── 4. Validate the file ────────────────────────────────────────────────
  let fileInfo;
  try {
    fileInfo = await FileSystem.getInfoAsync(uri);
  } catch (infoErr) {
    console.warn('[tts] Playback error: getInfoAsync failed:', infoErr.message);
    onEnd?.();
    return;
  }

  console.log(`[tts] Audio file size: ${fileInfo.size ?? 'unknown'} bytes`);

  if (!fileInfo.exists || (fileInfo.size ?? 0) === 0) {
    console.warn('[tts] Playback error: file missing or empty');
    onEnd?.();
    return;
  }

  // ── 5. Load the sound ───────────────────────────────────────────────────
  let sound, loadStatus;
  try {
    ({ sound, status: loadStatus } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: false, volume: 1.0 },
    ));
  } catch (createErr) {
    console.warn('[tts] Playback error: createAsync threw:', createErr.message);
    onEnd?.();
    return;
  }

  if (!loadStatus.isLoaded) {
    console.warn('[tts] Playback error: sound not loaded —', loadStatus.error);
    try { await sound.unloadAsync(); } catch (_) {}
    onEnd?.();
    return;
  }

  console.log(`[tts] Sound loaded: ${loadStatus.durationMillis ?? '?'} ms`);

  // ── 6. Second race-condition check (after the async load) ───────────────
  if (generation !== undefined && generation !== _playGeneration) {
    console.log('[tts] Stale TTS response discarded after load');
    setTimeout(() => sound.unloadAsync().catch(() => {}), 0);
    onEnd?.();
    return;
  }

  _currentSound = sound;

  // ── 7. Playback status callback ─────────────────────────────────────────
  // unloadAsync is deferred via setTimeout — calling it synchronously inside
  // setOnPlaybackStatusUpdate deadlocks AVAudioPlayer on iOS (the player is
  // still executing the callback when you try to destroy it).
  sound.setOnPlaybackStatusUpdate((status) => {
    if (!status.isLoaded) {
      if (status.error) {
        console.warn('[tts] Playback error:', status.error);
        if (_currentSound === sound) _currentSound = null;
        onEnd?.();
      }
      // If no error: externally stopped via stopSpeech() — onEnd handled by caller
      return;
    }

    if (status.didJustFinish) {
      const secs = status.durationMillis
        ? `${(status.durationMillis / 1000).toFixed(1)}s`
        : '?s';
      console.log(`[tts] Playback finished (${secs})`);
      setTimeout(() => sound.unloadAsync().catch(() => {}), 0); // deferred ← key fix
      if (_currentSound === sound) _currentSound = null;
      onEnd?.();
    }
  });

  // ── 8. Play ─────────────────────────────────────────────────────────────
  onStart?.();
  try {
    await sound.playAsync();
    console.log('[tts] Playback started');
  } catch (playErr) {
    console.warn('[tts] Playback error: playAsync threw:', playErr.message);
    if (_currentSound === sound) _currentSound = null;
    setTimeout(() => sound.unloadAsync().catch(() => {}), 0);
    onEnd?.();
  }
}

// ── Main API ──────────────────────────────────────────────────────────────────

/**
 * Fetch audio from the backend (ElevenLabs via Render) and play it.
 *
 * Race condition protection:
 *   Each call claims a generation slot. If a newer call arrives while this one
 *   is still fetching, the older response is discarded without playing. Only the
 *   latest call's audio ever reaches the speaker.
 *
 * @param {string} text - AI response text to speak
 * @param {{ onStart?: Function, onEnd?: Function }} callbacks
 */
export async function speakWithElevenLabs(text, { onStart, onEnd } = {}) {
  // Claim a generation slot — any call still in-flight with an older generation
  // will see the mismatch and discard itself.
  const generation = ++_playGeneration;
  const t0 = Date.now();

  if (!text?.trim() || text.startsWith('⚠️')) {
    console.log('[tts] Skipped — empty or error text');
    return;
  }

  // ── Web: SpeechRecognition handles its own audio — use HTML5 Audio ───────
  if (Platform.OS === 'web') {
    try {
      console.log(`[tts] TTS request started (web) | chars: ${text.length}`);

      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

      const res = await fetch(`${BACKEND_URL}/tts`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text }),
        signal:  controller.signal,
      }).catch((e) => { clearTimeout(fetchTimeout); throw e; });
      clearTimeout(fetchTimeout);

      console.log(`[tts] Response: ${res.status} (${Date.now() - t0}ms)`);
      if (!res.ok) { console.warn('[tts] Backend error:', res.status); onEnd?.(); return; }

      const { audioBase64 } = await res.json();
      if (!audioBase64) { console.warn('[tts] No audio in response'); onEnd?.(); return; }

      // Stop previous web audio
      if (_currentAudio) { _currentAudio.pause(); _currentAudio.src = ''; _currentAudio = null; }

      const audio = new window.Audio(`data:audio/mpeg;base64,${audioBase64}`);
      _currentAudio = audio;
      audio.onerror  = () => { if (_currentAudio === audio) _currentAudio = null; onEnd?.(); };
      audio.onended  = () => {
        console.log('[tts] Playback finished');
        if (_currentAudio === audio) _currentAudio = null;
        onEnd?.();
      };
      onStart?.();
      const p = audio.play();
      if (p instanceof Promise) await p.catch((e) => console.warn('[tts] play() rejected:', e.message));
      console.log('[tts] Playback started');
    } catch (err) {
      const isTimeout = err.name === 'AbortError';
      console.warn(`[tts] ${isTimeout ? 'Request timed out after 20s' : `Error: ${err.message}`}`);
      onEnd?.();
    }
    return;
  }

  // ── Native (iOS / Android) ───────────────────────────────────────────────
  try {
    console.log(`[tts] TTS request started | chars: ${text.length} | gen: ${generation}`);

    // Fetch with timeout
    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(`${BACKEND_URL}/tts`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text }),
        signal:  controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(fetchTimeout);
      const isTimeout = fetchErr.name === 'AbortError';
      console.warn(`[tts] ${isTimeout ? 'Request timed out after 20s' : `Fetch failed: ${fetchErr.message}`}`);
      onEnd?.();
      return;
    }
    clearTimeout(fetchTimeout);

    console.log(`[tts] Response: ${res.status} (${Date.now() - t0}ms)`);

    if (!res.ok) {
      console.warn('[tts] Backend error:', res.status, await res.text().catch(() => ''));
      onEnd?.();
      return;
    }

    // Parse JSON
    let json;
    try { json = await res.json(); }
    catch (e) { console.warn('[tts] JSON parse error:', e.message); onEnd?.(); return; }

    const audioBase64 = json?.audioBase64;
    if (!audioBase64 || audioBase64.length < 100) {
      console.warn('[tts] Playback error: audioBase64 missing or too short');
      onEnd?.();
      return;
    }

    // Race-condition check: did a newer call arrive while we were fetching?
    if (generation !== _playGeneration) {
      console.log('[tts] Stale TTS response discarded — newer call is active');
      onEnd?.();
      return;
    }

    // Write base64 to rotating cache file
    const cacheFile = nextCacheFile();
    try {
      await FileSystem.writeAsStringAsync(cacheFile, audioBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (writeErr) {
      console.warn('[tts] Playback error: file write failed:', writeErr.message);
      onEnd?.();
      return;
    }

    // Delegate all playback logic to the reusable wrapper
    await playTTSAudio(cacheFile, { onStart, onEnd, generation });

  } catch (err) {
    console.warn('[tts] Unexpected error:', err.message);
    onEnd?.();
  }
}
