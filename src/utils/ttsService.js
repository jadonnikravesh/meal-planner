/**
 * ttsService — ElevenLabs text-to-speech, routed through the local backend.
 *
 * Platform split (root cause of previous silence on web):
 *   Web    → HTML5 Audio with a data-URI  (expo-av FileSystem doesn't work on web)
 *   Native → expo-av + FileSystem cache   (data-URIs not supported by expo-av on device)
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';

const BACKEND_URL = 'http://localhost:3001';

let _slotIndex    = 0;          // rotating cache slot index (native)
let _currentSound = null;       // expo-av Sound object (native)
let _currentAudio = null;       // HTML5 Audio element (web)

/** Advance the cache slot so we never overwrite a file that is still playing */
function nextCacheFile() {
  _slotIndex = (_slotIndex + 1) % 5;
  return `${FileSystem.cacheDirectory}tts_slot${_slotIndex}.mp3`;
}

/** Stop any in-progress playback on either platform */
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
      _currentSound = null;           // clear ref first; prevents double-stop
      try { await s.stopAsync();   } catch (_) {}
      try { await s.unloadAsync(); } catch (_) {}
    }
  }
}

/**
 * Speak `text` via ElevenLabs (backend handles API key and emoji stripping).
 * Skips ⚠️ error messages. Logs every step so failures are visible in console.
 *
 * @param {string} text - Text to speak
 * @param {{ onStart?: () => void, onEnd?: () => void }} callbacks
 *   onStart fires just before playback begins.
 *   onEnd   fires when audio finishes naturally OR is stopped externally.
 */
export async function speakWithElevenLabs(text, { onStart, onEnd } = {}) {
  if (!text || text.startsWith('⚠️')) {
    console.log('[tts] skipping — empty or error message');
    return;
  }

  await stopSpeech();

  try {
    console.log('[tts] → POST /tts, text length:', text.length, 'platform:', Platform.OS);

    const res = await fetch(`${BACKEND_URL}/tts`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text }),
    });

    console.log('[tts] ← /tts status:', res.status);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[tts] backend error:', res.status, errText);
      return;
    }

    const json = await res.json().catch(() => null);
    const audioBase64 = json?.audioBase64;

    if (!audioBase64) {
      console.warn('[tts] audioBase64 missing from response. Full response:', JSON.stringify(json));
      return;
    }

    console.log('[tts] audio received — base64 chars:', audioBase64.length,
                '≈', Math.round(audioBase64.length * 0.75 / 1024), 'KB');

    // ── Web playback ─────────────────────────────────────────────────────────
    if (Platform.OS === 'web') {
      // Browsers can play a base64 MP3 directly via a data URI.
      // expo-av's FileSystem.writeAsStringAsync does NOT work reliably on web.
      const dataUri = `data:audio/mpeg;base64,${audioBase64}`;
      const audio   = new window.Audio(dataUri);
      _currentAudio = audio;

      audio.onerror = (e) => {
        console.warn('[tts] web Audio error event:', e.type, audio.error?.message);
        onEnd?.();
      };
      audio.onended = () => {
        console.log('[tts] web playback finished');
        if (_currentAudio === audio) _currentAudio = null;
        onEnd?.();
      };

      const playPromise = audio.play();
      if (playPromise instanceof Promise) {
        await playPromise.catch((e) =>
          console.warn('[tts] audio.play() rejected (autoplay policy?):', e.message)
        );
      }
      onStart?.();
      console.log('[tts] web playback started');

    // ── Native playback ──────────────────────────────────────────────────────
    } else {
      const cacheFile = nextCacheFile();
      console.log('[tts] native: writing to', cacheFile);

      await FileSystem.writeAsStringAsync(cacheFile, audioBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      console.log('[tts] native: file written successfully');

      // Set audio mode BEFORE createAsync — must not be in recording mode
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS:   false,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: cacheFile },
        { shouldPlay: true, volume: 1.0 },
      );
      _currentSound = sound;
      onStart?.();
      console.log('[tts] native: Sound created, playback started');

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          console.log('[tts] native: playback finished, unloading');
          sound.unloadAsync().catch(() => {});
          if (_currentSound === sound) _currentSound = null;
          onEnd?.();
        }
        if (!status.isLoaded && status.error) {
          console.warn('[tts] native: Sound load error:', status.error);
          onEnd?.();
        }
      });
    }

  } catch (err) {
    // Never let a TTS failure crash the UI
    console.warn('[tts] caught error:', err.message);
    console.warn('[tts] stack:', err.stack?.slice(0, 400));
  }
}
