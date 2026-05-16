import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from './AppContext';
import { useMealContext } from './MealContext';
import { useMealOverlay } from './OverlayContext';
import { useTts } from './TtsContext';
import { speakWithElevenLabs } from '../utils/ttsService';
import { API_BASE_URL } from '../config/api';
import { getTodayKey } from '../utils/nutrition';
import { getOrFetchFoodImage, getFoodColor } from '../utils/imageService';
import { formatTime } from '../utils/foodParser';
import { getStoredPushToken } from '../utils/pushNotifications';
import { usePantryStorage } from '../hooks/usePantryStorage';

function generateMealId() {
  return `meal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const VoiceChatContext = createContext(null);

export function VoiceChatProvider({ children }) {
  const { state, dispatch } = useApp();
  const { addMeal }         = useMealContext();
  const { items: pantryItems } = usePantryStorage();
  const showOverlay         = useMealOverlay();
  const { markSpeaking, markStopped } = useTts();

  const [voiceResponse, setVoiceResponse] = useState(null); // string | null
  const [isThinking,    setIsThinking]    = useState(false);

  // Always-fresh state ref so the callback closure never goes stale
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });

  // Guard against concurrent sends
  const sendingRef = useRef(false);

  // Dedup: track recently logged items to prevent rapid-fire double-logs
  const recentLogsRef = useRef([]); // [{ name: string, ts: number }]

  function isDuplicateLog(name) {
    const now = Date.now();
    const WINDOW = 30 * 1000; // 30 seconds
    recentLogsRef.current = recentLogsRef.current.filter((e) => now - e.ts < WINDOW);
    return recentLogsRef.current.some((e) => e.name.toLowerCase() === name.toLowerCase());
  }

  const sendVoiceMessage = useCallback(async (text) => {
    const trimmed = text?.trim();
    if (!trimmed || sendingRef.current) return;
    sendingRef.current = true;
    setIsThinking(true);

    // Add user message to shared chat history immediately (HelperScreen syncs this in)
    dispatch({ type: 'ADD_CHAT_MESSAGE', payload: { id: Date.now(), role: 'user', text: trimmed } });

    const { userProfile, dailyLogs } = stateRef.current;
    const today    = getTodayKey();
    const todayLog = dailyLogs?.[today] || {};
    const profileForAI = {
      ...userProfile,
      loggedCalories: todayLog.calories || 0,
      loggedProtein:  todayLog.protein  || 0,
      loggedCarbs:    todayLog.carbs    || 0,
      loggedFat:      todayLog.fat      || 0,
    };

    try {
      const pushToken      = await getStoredPushToken();
      const pantrySnapshot = pantryItems.map(({ name, qty, category }) => ({ name, qty, category }));
      const res = await fetch(`${API_BASE_URL}/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history: [], userProfile: profileForAI, pantryItems: pantrySnapshot, pushToken, userAIConsent: true }),
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();

      // TTS — plays globally regardless of screen
      if (stateRef.current.settings?.voiceEnabled !== false) {
        speakWithElevenLabs(data.reply, { onStart: markSpeaking, onEnd: markStopped });
      }

      const validMeal = data.mealLogged && data.meal?.logged === true
                     && data.meal?.name  && (data.meal?.calories ?? 0) > 0;

      if (validMeal && !isDuplicateLog(data.meal.name)) {
        const m = data.meal;
        recentLogsRef.current.push({ name: m.name, ts: Date.now() });

        // Use server-embedded imageUrl when available (avoids cold /food-image call).
        const { uri, confidence } = m.imageUrl
          ? { uri: m.imageUrl, confidence: 'high' }
          : await getOrFetchFoodImage(m.name);
        console.log(`[voice] image for "${m.name}": ${uri ?? 'none'} (${confidence})`);
        const imgColor = getFoodColor(m.imageKey || m.name);

        // Log the meal (single authoritative call — card and action are atomic)
        addMeal({
          id: generateMealId(), name: m.name, time: formatTime(),
          kcal: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat,
          uri, fallbackColor: imgColor,
        });
        showOverlay({
          name: m.name, calories: m.calories, protein: m.protein,
          carbs: m.carbs, fat: m.fat, imageUrl: uri, reply: data.reply,
        });

        // Dispatch AI reply WITH mealData so HelperScreen always renders the log card
        const items = [{ name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, grams: 0 }];
        const total = { calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat };
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: Date.now() + 1, role: 'ai', text: data.reply,
            mealData: { items, total, primaryUri: uri, fallbackColor: imgColor, imageConfidence: confidence ?? 'high' },
          },
        });
      } else {
        // No meal logged — dispatch plain text reply
        dispatch({ type: 'ADD_CHAT_MESSAGE', payload: { id: Date.now() + 1, role: 'ai', text: data.reply } });
      }

      setVoiceResponse(data.reply);
    } catch (err) {
      console.warn('[voice chat]', err.message);
    } finally {
      sendingRef.current = false;
      setIsThinking(false);
    }
  }, [dispatch, addMeal, showOverlay, markSpeaking, markStopped]);

  const clearVoiceResponse = useCallback(() => setVoiceResponse(null), []);

  return (
    <VoiceChatContext.Provider value={{ sendVoiceMessage, voiceResponse, clearVoiceResponse, isThinking }}>
      {children}
    </VoiceChatContext.Provider>
  );
}

export const useVoiceChat = () => useContext(VoiceChatContext);
