import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Animated, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRoute } from '@react-navigation/native';
import { speakWithElevenLabs, stopSpeech } from '../utils/ttsService';
import { formatTime } from '../utils/foodParser';
import { getOrFetchFoodImage, getFoodColor } from '../utils/imageService';
import { replaceImage } from '../utils/imageCorrections';
import { computeFoodPreferences } from '../utils/foodPreferences';
import ImageFeedbackModal from '../components/ImageFeedbackModal';
import AIConsentModal from '../components/AIConsentModal';
import SourcesButton from '../components/SourcesButton';
import { useMealContext } from '../context/MealContext';
import { useApp, useTheme } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useVoiceChat } from '../context/VoiceChatContext';
import { getAuthHeaders } from '../utils/getAuthHeaders';
import { useMealOverlay } from '../context/OverlayContext';
import { useTts } from '../context/TtsContext';
import { API_BASE_URL } from '../config/api';
import { getTodayKey } from '../utils/nutrition';
import { generateJobId, enqueueJob, removeJob, updateJob } from '../utils/jobQueue';
import { getStoredPushToken } from '../utils/pushNotifications';
import { usePantryStorage } from '../hooks/usePantryStorage';

const BACKEND_URL = API_BASE_URL;

// ─── Unique meal ID ───────────────────────────────────────────────────────────
// Combines timestamp + random suffix so two meals logged in the same millisecond
// still get different IDs. Result is always a string so JSON round-trips are safe.
function generateMealId() {
  return `meal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const GREETING = {
  id: 0,
  role: 'ai',
  text:
    "Hi! I'm your Shred AI Assistant 🤖\n\n" +
    "Type a meal below and I'll log it automatically, or ask me anything about nutrition!",
};

const SUGGESTIONS = [
  { id: 1, icon: 'calendar-outline',    label: 'Plan my week' },
  { id: 2, icon: 'flame-outline',       label: 'High-protein meals' },
  { id: 3, icon: 'leaf-outline',        label: 'Low-calorie snacks' },
  { id: 4, icon: 'barbell-outline',     label: 'Post-workout food' },
  { id: 5, icon: 'heart-outline',       label: 'Heart-healthy options' },
  { id: 6, icon: 'stats-chart-outline', label: 'Analyse my diet' },
];

// ─── Styles factory ───────────────────────────────────────────────────────────
const makeStyles = (c) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },

  // Header
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  title:       { fontSize: 22, fontWeight: '700', color: c.white },
  subtitle:    { fontSize: 12, color: c.muted, marginTop: 2 },
  onlineBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.greenDim, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, gap: 6 },
  onlineDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: c.green },
  onlineText:  { fontSize: 12, fontWeight: '600', color: c.green },

  // Suggestion chips
  chipsRow:    { flexGrow: 0, marginBottom: 6 },
  chipsScroll: { paddingHorizontal: 16, gap: 8 },
  chip:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.accentDim, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: c.accent + '44' },
  chipText:    { fontSize: 13, fontWeight: '600', color: c.accent },

  // Chat
  chat:        { flex: 1 },
  chatContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 14 },

  // AI bubble
  aiBubbleRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  aiAvatar:     { width: 30, height: 30, borderRadius: 15, backgroundColor: c.accentDim, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: c.accent + '44', flexShrink: 0, marginTop: 2 },
  aiBubbleWrap: { flex: 1, gap: 8 },
  aiBubble:     { backgroundColor: c.card, borderRadius: 16, borderTopLeftRadius: 4, padding: 13, borderWidth: 1, borderColor: c.border },
  aiBubbleText: { fontSize: 14, color: c.white, lineHeight: 21 },

  // User bubble
  userBubbleRow:  { flexDirection: 'row', justifyContent: 'flex-end' },
  userBubble:     { backgroundColor: c.accent, borderRadius: 16, borderBottomRightRadius: 4, maxWidth: '80%', overflow: 'hidden' },
  userBubbleText: { fontSize: 14, color: '#FFFFFF', lineHeight: 21, padding: 12 },
  chatPhoto:      { width: 200, height: 150, borderRadius: 12 },

  // Typing
  typingBubble: { backgroundColor: c.card, borderRadius: 16, borderTopLeftRadius: 4, padding: 13, borderWidth: 1, borderColor: c.border },
  typingDots:   { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot:          { width: 7, height: 7, borderRadius: 4, backgroundColor: c.muted },

  // Meal log card
  mealCard:          { backgroundColor: c.card2, borderRadius: 14, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  mealCardTop:       { flexDirection: 'row', gap: 12, padding: 12 },
  mealCardImg:       { width: 72, height: 72, borderRadius: 10, flexShrink: 0, overflow: 'hidden' },
  mealCardImgEmpty:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  imgEditBadge:      { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, padding: 3 },
  imgLowConfBadge:   { position: 'absolute', top: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, padding: 2 },
  mealCardInfo:      { flex: 1, justifyContent: 'center', gap: 6 },
  mealCardName:      { fontSize: 14, fontWeight: '700', color: c.white, lineHeight: 19 },
  mealCardCalRow:    { flexDirection: 'row', alignItems: 'center' },
  mealCardCal:       { fontSize: 13, fontWeight: '600', color: c.white },
  macroStatsRow:     { flexDirection: 'row', alignItems: 'center' },
  macroStat:         { flex: 1, alignItems: 'center', gap: 1 },
  macroStatHeader:   { flexDirection: 'row', alignItems: 'center', gap: 3 },
  macroStatLabel:    { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  macroStatValue:    { fontSize: 13, fontWeight: '700', color: c.white },
  macroStatDivider:  { width: 1, height: 28, backgroundColor: c.border, marginHorizontal: 4 },
  mealCardItems:     { paddingHorizontal: 12, paddingBottom: 4 },
  mealCardItem:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  mealCardItemBorder:{ borderBottomWidth: 1, borderBottomColor: c.border },
  mealCardItemLeft:  { gap: 2 },
  mealCardItemName:  { fontSize: 13, fontWeight: '600', color: c.white },
  mealCardItemGrams: { fontSize: 11, color: c.muted },
  mealCardItemRight: { alignItems: 'flex-end', gap: 2 },
  mealCardItemCal:   { fontSize: 12, fontWeight: '600', color: c.white },
  mealCardItemMacros:{ fontSize: 10, color: c.muted },
  mealCardFooter:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.greenDim, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.green + '22' },
  mealCardFooterText:{ fontSize: 12, color: c.green, fontWeight: '600' },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: c.inputBg, borderTopWidth: 1, borderTopColor: c.border,
  },
  input: {
    flex: 1, backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border,
    paddingHorizontal: 16, paddingVertical: 11, fontSize: 14, color: c.white, maxHeight: 120,
  },
  cameraBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: c.border },
  sendBtn:       { width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: c.border },
  sendBtnActive: { backgroundColor: c.accent, borderColor: c.accent },
});

// ─── Sub-components ───────────────────────────────────────────────────────────

function AIAvatar({ s }) {
  const c = useTheme();
  return (
    <View style={s.aiAvatar}>
      <Ionicons name="sparkles" size={14} color={c.accent} />
    </View>
  );
}

function TypingBubble({ s }) {
  const dots = [
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
  ];
  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(d, { toValue: 1,   duration: 300, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.delay(600 - i * 200),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, []);
  return (
    <View style={s.aiBubbleRow}>
      <AIAvatar s={s} />
      <View style={s.typingBubble}>
        <View style={s.typingDots}>
          {dots.map((d, i) => <Animated.View key={i} style={[s.dot, { opacity: d }]} />)}
        </View>
      </View>
    </View>
  );
}

function MacroStat({ icon, color, label, value, s }) {
  return (
    <View style={s.macroStat}>
      <View style={s.macroStatHeader}>
        <Ionicons name={icon} size={11} color={color} />
        <Text style={[s.macroStatLabel, { color }]}>{label}</Text>
      </View>
      <Text style={s.macroStatValue}>{value}g</Text>
    </View>
  );
}

function MealLogCard({ items, total, primaryUri, fallbackColor, imageConfidence, onImagePress, s, c }) {
  const mealLabel =
    items.length === 1
      ? items[0].name
      : items.slice(0, 2).map((i) => i.name).join(' & ') +
        (items.length > 2 ? ` +${items.length - 2}` : '');
  const isLowConf = imageConfidence !== 'high';
  return (
    <View style={s.mealCard}>
      <View style={s.mealCardTop}>
        {/* Image — tappable for user correction */}
        <TouchableOpacity
          style={[s.mealCardImg, { backgroundColor: fallbackColor }]}
          onPress={onImagePress}
          activeOpacity={onImagePress ? 0.8 : 1}
          disabled={!onImagePress}
        >
          {primaryUri ? (
            <Image source={{ uri: primaryUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          ) : (
            <View style={s.mealCardImgEmpty}>
              <Ionicons name="restaurant-outline" size={26} color="rgba(255,255,255,0.35)" />
            </View>
          )}
          {/* Low-confidence warning */}
          {isLowConf && primaryUri && (
            <View style={s.imgLowConfBadge}>
              <Ionicons name="help-circle" size={11} color="#F59E0B" />
            </View>
          )}
          {/* Edit hint */}
          {onImagePress && (
            <View style={s.imgEditBadge}>
              <Ionicons name="pencil" size={8} color="#FFF" />
            </View>
          )}
        </TouchableOpacity>
        <View style={s.mealCardInfo}>
          <Text style={s.mealCardName} numberOfLines={2}>{mealLabel}</Text>
          <View style={s.mealCardCalRow}>
            <Ionicons name="flame" size={13} color={c.fire} />
            <Text style={s.mealCardCal}> {total.calories} kcal</Text>
          </View>
          <View style={s.macroStatsRow}>
            <MacroStat s={s} icon="flash" color={c.protein} label="Protein" value={total.protein} />
            <View style={s.macroStatDivider} />
            <MacroStat s={s} icon="leaf"  color={c.carbs}   label="Carbs"   value={total.carbs}   />
            <View style={s.macroStatDivider} />
            <MacroStat s={s} icon="water" color={c.fat}     label="Fat"     value={total.fat}     />
          </View>
        </View>
      </View>
      {items.length > 1 && (
        <View style={s.mealCardItems}>
          {items.map((item, idx) => (
            <View key={idx} style={[s.mealCardItem, idx < items.length - 1 && s.mealCardItemBorder]}>
              <View style={s.mealCardItemLeft}>
                <Text style={s.mealCardItemName}>{item.name}</Text>
                <Text style={s.mealCardItemGrams}>{item.grams}g</Text>
              </View>
              <View style={s.mealCardItemRight}>
                <Text style={s.mealCardItemCal}>{item.calories} kcal</Text>
                <Text style={s.mealCardItemMacros}>P {item.protein}g · C {item.carbs}g · F {item.fat}g</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      <View style={[s.mealCardFooter, { justifyContent: 'space-between' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="checkmark-circle" size={14} color={c.green} />
          <Text style={s.mealCardFooterText}>Logged to your dashboard</Text>
        </View>
        <SourcesButton />
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HelperScreen() {
  const { addMeal, updateMeal } = useMealContext();
  const { state, dispatch } = useApp();
  const { user }  = useAuth();
  const { isThinking } = useVoiceChat();
  const { items: pantryItems } = usePantryStorage();
  const { markSpeaking, markStopped } = useTts();
  const c = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const route = useRoute();
  const showOverlay = useMealOverlay();

  // Initialize with GREETING + any messages already logged via the tab mic
  const [messages, setMessages] = useState(() => {
    const stored = state.chatMessages;
    if (!stored?.length) return [GREETING];
    return [
      GREETING,
      ...stored.map((m) => ({ id: m.id, role: m.role, text: m.text, mealData: m.mealData })),
    ];
  });
  const [input,        setInput]        = useState('');
  const [typing,       setTyping]       = useState(false);
  const [feedbackItem, setFeedbackItem] = useState(null); // { name, imageUrl, imageConfidence, voteStats, msgId }
  const [showConsent,  setShowConsent]  = useState(false);
  const pendingActionRef = useRef(null);

  // Gate every AI action behind a one-time consent check.
  // If already consented, runs immediately. Otherwise shows the modal and
  // defers the action until the user accepts.
  const withConsent = useCallback((action) => {
    if (state.aiConsent) { action(); return; }
    pendingActionRef.current = action;
    setShowConsent(true);
  }, [state.aiConsent]);

  const handleConsentAccept = useCallback(() => {
    dispatch({ type: 'SET_AI_CONSENT', payload: true });
    setShowConsent(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    action?.();
  }, [dispatch]);

  const handleConsentDecline = useCallback(() => {
    setShowConsent(false);
    pendingActionRef.current = null;
  }, []);

  const scrollRef         = useRef(null);
  const timerRef          = useRef(null);
  const chatHistoryRef    = useRef([]); // API-format history [{ role, content }]
  const presetSentRef     = useRef(null); // track which preset we've already auto-sent
  const recentlyLoggedRef = useRef([]);  // [{ name: string, ts: number }]
  // Track how many chatMessages we've already merged so we only append new ones
  const syncedCountRef    = useRef(state.chatMessages.length);

  // Sync messages added externally by the tab mic (ADD_CHAT_MESSAGE from App.js)
  useEffect(() => {
    const newCount = state.chatMessages.length;
    if (newCount <= syncedCountRef.current) return;
    const incoming = state.chatMessages.slice(syncedCountRef.current);
    syncedCountRef.current = newCount;
    setMessages((prev) => [
      ...prev,
      ...incoming.map((m) => ({ id: m.id, role: m.role, text: m.text, mealData: m.mealData })),
    ]);
  }, [state.chatMessages.length]);

  // ── Duplicate-log guard ──────────────────────────────────────────────────────
  // Returns true if a meal with this name was already logged in the last 30 s.
  // Tight window: only catches accidental rapid double-taps/retries.
  const isDuplicateLog = (mealName) => {
    const now = Date.now();
    const WINDOW = 30 * 1000; // 30 seconds
    // Evict old entries
    recentlyLoggedRef.current = recentlyLoggedRef.current.filter(
      (e) => now - e.ts < WINDOW,
    );
    return recentlyLoggedRef.current.some(
      (e) => e.name.toLowerCase() === mealName.toLowerCase(),
    );
  };

  const markLogged = (mealName) => {
    recentlyLoggedRef.current.push({ name: mealName, ts: Date.now() });
  };

  // ── Image validation helpers ──────────────────────────────────────────────────
  const feedbackTimerRef = useRef(null);

  // Update the image + confidence stored on a specific chat message
  const updateMessageImage = useCallback((msgId, newUri, newConfidence) => {
    setMessages((prev) => prev.map((msg) =>
      msg.id === msgId && msg.mealData
        ? { ...msg, mealData: { ...msg.mealData, primaryUri: newUri, imageConfidence: newConfidence ?? (newUri ? 'high' : 'low') } }
        : msg
    ));
  }, []);

  /**
   * Schedule auto-prompt after the meal overlay finishes (~5 s).
   * Cancelled if user taps the image card first.
   */
  const scheduleFeedbackPrompt = useCallback((item) => {
    clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedbackItem(item), 5000);
  }, []);

  const handleImageSelect = useCallback(async (uri) => {
    const fi = feedbackItem;
    if (!fi) return;
    await replaceImage(fi.name, uri);
    updateMessageImage(fi.msgId, uri, 'high');
    if (fi.mealId) updateMeal({ id: fi.mealId, uri });
    setFeedbackItem(null);
  }, [feedbackItem, updateMessageImage, updateMeal]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages, typing]);

  useEffect(() => () => clearTimeout(timerRef.current), []);
  useEffect(() => () => clearTimeout(feedbackTimerRef.current), []);

  // Stop any ongoing speech when leaving this screen; clear the speaking flag too
  useEffect(() => () => { stopSpeech(); markStopped(); }, []);

  // Recency-weighted food preferences — recomputed only when dailyLogs changes
  const foodPreferences = useMemo(
    () => computeFoodPreferences(state.dailyLogs),
    [state.dailyLogs],
  );

  // ── Core send logic — calls backend → real Anthropic API ──────────────────
  const dispatchSend = async (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed) return;
    setInput('');
    setMessages((prev) => [...prev, { id: Date.now(), role: 'user', text: trimmed }]);
    setTyping(true);

    const historySnapshot = chatHistoryRef.current;

    // Build a profile snapshot with today's logged totals for context
    const { userProfile, dailyLogs } = state;
    const today = getTodayKey();
    const todayLog = dailyLogs?.[today] || {};
    const profileForAI = {
      ...userProfile,
      loggedCalories: todayLog.calories || 0,
      loggedProtein:  todayLog.protein  || 0,
      loggedCarbs:    todayLog.carbs    || 0,
      loggedFat:      todayLog.fat      || 0,
    };

    // Persist the request as a job BEFORE the fetch. If the app closes mid-flight
    // the job stays in AsyncStorage and useJobProcessor retries it on next open.
    const pushToken  = await getStoredPushToken();
    const jobId      = generateJobId();
    const pantrySnapshot = pantryItems.map(({ name, qty, category }) => ({ name, qty, category }));

    // Derive expiring-soon items using the same age-sort logic as PantryScreen
    let expiringNames = [];
    if (pantryItems.length >= 3) {
      const byAge = [...pantryItems].sort((a, b) =>
        new Date(a.dateAdded || a.timestamp || 0).getTime() -
        new Date(b.dateAdded || b.timestamp || 0).getTime()
      );
      const count = Math.min(4, Math.max(2, Math.floor(byAge.length * 0.3)));
      expiringNames = byAge.slice(0, count).map((i) => i.name);
    }

    const pantryPrefix = pantryItems.length ? [
      expiringNames.length
        ? `Expiring soon items (prioritize these in suggestions): ${expiringNames.join(', ')}.`
        : null,
      `Available pantry items: ${pantryItems.map((i) => i.name).join(', ')}.`,
    ].filter(Boolean).join('\n') + '\n\n' : '';

    const messageForAI = pantryPrefix + trimmed;
    const jobPayload = {
      message: messageForAI, history: historySnapshot, userProfile: profileForAI,
      foodPreferences, pantryItems: pantrySnapshot, pushToken, jobId,
    };
    await enqueueJob(jobId, jobPayload);

    console.log(`[chat] Request started — job: ${jobId}`);

    try {
      const res = await fetch(`${BACKEND_URL}/chat`, {
        method:  'POST',
        headers: await getAuthHeaders(user),
        body: JSON.stringify({ ...jobPayload, userAIConsent: true }),
      });

      // Non-2xx: mark job as 'failed' so the retry processor picks it up,
      // then surface the error. Do NOT removeJob here — the server may retry OK.
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await updateJob(jobId, { status: 'failed' });
        throw new Error(body.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      // Only remove the job after fully successful processing
      await removeJob(jobId);
      console.log(`[chat] Request completed — job: ${jobId}`);

      // Persist conversation so the AI has context on the next turn.
      // Store messageForAI so subsequent turns retain pantry context.
      chatHistoryRef.current = [
        ...historySnapshot,
        { role: 'user',      content: messageForAI },
        { role: 'assistant', content: data.reply   },
      ];

      setTyping(false);
      if (state.settings.voiceEnabled !== false) {
        speakWithElevenLabs(data.reply, { onStart: markSpeaking, onEnd: markStopped });
      }

      console.log('[chat] mealLogged:', data.mealLogged, '| meal:', data.meal?.name ?? 'none');

      // Require: backend confirmed shouldLog=true, meal has a name and calories > 0
      const validMeal = data.mealLogged && data.meal?.logged === true
                     && data.meal?.name && (data.meal?.calories ?? 0) > 0;

      if (validMeal) {
        const m = data.meal;
        // Prefer the imageUrl embedded in the response (fetched server-side while
        // the connection was already warm). Fall back to a client-side /food-image
        // fetch only when the backend didn't supply one.
        const { uri: finalUri, confidence: finalConfidence } = m.imageUrl
          ? { uri: m.imageUrl, confidence: 'high' }
          : await getOrFetchFoodImage(m.name);
        console.log(`[chat] image for "${m.name}": ${finalUri ?? 'none'} (${finalConfidence})`);
        const foodVerified = finalConfidence === 'verified';
        const imgColor     = getFoodColor(m.imageKey || m.name);

        if (!isDuplicateLog(m.name)) {
          console.log('[chat] logging meal:', m.name, m.calories, 'kcal | verified:', foodVerified);
          const mealId = generateMealId();
          const msgId  = Date.now() + 1;
          addMeal({
            id: mealId, name: m.name, time: formatTime(),
            kcal: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat,
            uri: finalUri, fallbackColor: imgColor,
          });
          markLogged(m.name);
          showOverlay({
            name: m.name, calories: m.calories, protein: m.protein,
            carbs: m.carbs, fat: m.fat, imageUrl: finalUri, reply: data.reply,
          });
          const items = [{ name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, grams: 0 }];
          const total = { calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat };
          setMessages((prev) => [...prev, {
            id: msgId, role: 'ai',
            text: data.reply || 'Logged!',
            mealData: { items, total, primaryUri: finalUri, fallbackColor: imgColor, imageConfidence: finalConfidence, voteStats: {}, mealId },
          }]);
          if (!foodVerified) {
            scheduleFeedbackPrompt({
              name:            m.name,
              imageUrl:        finalUri,
              imageConfidence: finalConfidence,
              voteStats:       {},
              msgId,
              mealId,
            });
          }
        } else {
          console.log('[chat] duplicate log skipped for:', m.name);
          setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'ai', text: data.reply }]);
        }
      } else {
        setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'ai', text: data.reply }]);
      }
    } catch (err) {
      setTyping(false);

      const isOffline = err.message.includes('Failed to fetch') || err.message.includes('Network');

      updateJob(jobId, { status: 'failed' }).catch(() => {});

      console.warn(`[chat] Request failed — job: ${jobId} — ${err.message}`);

      setMessages((prev) => [...prev, {
        id: Date.now() + 1, role: 'ai',
        text: isOffline
          ? "No connection right now. Your message is saved and will be sent automatically when you're back online."
          : `⚠️ Server error: ${err.message}`,
      }]);
    }
  };

  // ── Auto-send preset from navigation params (AI Insight banner etc.) ────────
  useEffect(() => {
    const preset    = route.params?.preset;
    const presetKey = route.params?.presetKey ?? preset;
    if (preset && presetKey !== presetSentRef.current) {
      presetSentRef.current = presetKey;
      setInput(preset);
      withConsent(() => dispatchSend(preset));
    }
  }, [route.params?.presetKey, route.params?.preset]);

  // ── Camera / Photo ─────────────────────────────────────────────────────────
  const launchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Camera access is required to snap food photos.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, allowsEditing: true, aspect: [4, 3], base64: true });
    if (!result.canceled && result.assets?.[0]) handlePhotoSelected(result.assets[0]);
  };

  const launchLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Photo library access is required.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, allowsEditing: true, aspect: [4, 3], base64: true });
    if (!result.canceled && result.assets?.[0]) handlePhotoSelected(result.assets[0]);
  };

  const handleCameraPress = () => {
    withConsent(() => Alert.alert('Add Food Photo', 'How would you like to add a photo?', [
      { text: 'Take Photo',          onPress: launchCamera  },
      { text: 'Choose from Library', onPress: launchLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]));
  };

  const handlePhotoSelected = async (asset) => {
    const { uri, base64, mimeType = 'image/jpeg' } = asset;

    // Show photo in chat immediately
    setMessages((prev) => [...prev, { id: Date.now(), role: 'user', image: uri }]);
    setTyping(true);

    if (!base64) {
      setTyping(false);
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'ai', text: '⚠️ Could not read the photo data. Please try again.' }]);
      return;
    }

    const { userProfile, dailyLogs } = state;
    const today    = getTodayKey();
    const todayLog = dailyLogs?.[today] || {};
    const profileForAI = {
      ...userProfile,
      loggedCalories: todayLog.calories || 0,
      loggedProtein:  todayLog.protein  || 0,
      loggedCarbs:    todayLog.carbs    || 0,
      loggedFat:      todayLog.fat      || 0,
    };

    const pushToken = await getStoredPushToken();

    const photoController = new AbortController();
    const photoTimeout = setTimeout(() => photoController.abort(), 30000);

    try {
      const res = await fetch(`${BACKEND_URL}/analyze-photo`, {
        method:  'POST',
        headers: await getAuthHeaders(user),
        // pushToken lets the backend send a notification if a meal is logged.
        // No jobId — photo payloads are too large to store in AsyncStorage.
        body: JSON.stringify({ imageBase64: base64, mimeType, userProfile: profileForAI, pushToken, userAIConsent: true }),
        signal: photoController.signal,
      });
      clearTimeout(photoTimeout);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      setTyping(false);
      if (state.settings.voiceEnabled !== false) {
        speakWithElevenLabs(data.reply, { onStart: markSpeaking, onEnd: markStopped });
      }

      console.log('[photo] mealLogged:', data.mealLogged, '| meal:', data.meal?.name ?? 'none');

      const validMeal = data.mealLogged && data.meal?.logged === true
                     && data.meal?.name && (data.meal?.calories ?? 0) > 0;

      if (validMeal) {
        const m = data.meal;
        const { uri: finalUri, confidence: finalConfidence } = m.imageUrl
          ? { uri: m.imageUrl, confidence: 'high' }
          : await getOrFetchFoodImage(m.name);
        console.log(`[photo] image for "${m.name}": ${finalUri ?? 'none'} (${finalConfidence})`);
        const foodVerified = finalConfidence === 'verified';
        const imgColor     = getFoodColor(m.imageKey || m.name);

        if (!isDuplicateLog(m.name)) {
          console.log('[photo] logging meal:', m.name, m.calories, 'kcal | verified:', foodVerified);
          const mealId = generateMealId();
          const msgId  = Date.now() + 1;
          addMeal({
            id: mealId, name: m.name, time: formatTime(),
            kcal: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat,
            uri: finalUri, fallbackColor: imgColor,
          });
          markLogged(m.name);
          showOverlay({
            name: m.name, calories: m.calories, protein: m.protein,
            carbs: m.carbs, fat: m.fat, imageUrl: finalUri, reply: data.reply,
          });
          const items = [{ name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, grams: 0 }];
          const total = { calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat };
          setMessages((prev) => [...prev, {
            id: msgId, role: 'ai',
            text: data.reply || 'Logged!',
            mealData: { items, total, primaryUri: finalUri, fallbackColor: imgColor, imageConfidence: finalConfidence, voteStats: {}, mealId },
          }]);
          if (!foodVerified) {
            scheduleFeedbackPrompt({
              name:            m.name,
              imageUrl:        finalUri,
              imageConfidence: finalConfidence,
              voteStats:       {},
              msgId,
              mealId,
            });
          }
        } else {
          setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'ai', text: data.reply }]);
        }
      } else {
        setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'ai', text: data.reply }]);
      }
    } catch (err) {
      clearTimeout(photoTimeout);
      console.error('[photo error]', err.message);
      setTyping(false);
      const isTimeout = err.name === 'AbortError';
      const isOffline = !isTimeout && (err.message.includes('Failed to fetch') || err.message.includes('Network'));
      setMessages((prev) => [...prev, {
        id: Date.now() + 1, role: 'ai',
        text: isTimeout
          ? "⚠️ Photo analysis timed out. The server may be starting up — please try again."
          : isOffline
            ? "⚠️ Unable to reach the server. Check your internet connection and try again."
            : `⚠️ Photo analysis failed: ${err.message}`,
      }]);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1, marginBottom: 88 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>AI Helper</Text>
            <Text style={s.subtitle}>Powered by Shred AI</Text>
          </View>
          <View style={s.onlineBadge}>
            <View style={s.onlineDot} />
            <Text style={s.onlineText}>Online</Text>
          </View>
        </View>

        {/* ── Suggestion chips ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsScroll} style={s.chipsRow}>
          {SUGGESTIONS.map((sg) => (
            <TouchableOpacity key={sg.id} style={s.chip} activeOpacity={0.7} onPress={() => withConsent(() => dispatchSend(sg.label))}>
              <Ionicons name={sg.icon} size={14} color={c.accent} />
              <Text style={s.chipText}>{sg.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Chat messages ── */}
        <ScrollView ref={scrollRef} style={s.chat} contentContainerStyle={s.chatContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <View key={msg.id} style={s.userBubbleRow}>
                  <View style={s.userBubble}>
                    {msg.image
                      ? <Image source={{ uri: msg.image }} style={s.chatPhoto} resizeMode="cover" />
                      : <Text style={s.userBubbleText}>{msg.text}</Text>
                    }
                  </View>
                </View>
              );
            }
            return (
              <View key={msg.id} style={s.aiBubbleRow}>
                <AIAvatar s={s} />
                <View style={s.aiBubbleWrap}>
                  {msg.text ? (
                    <View style={s.aiBubble}>
                      <Text style={s.aiBubbleText}>{msg.text}</Text>
                      {msg.id !== 0 && (
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 }}>
                          <SourcesButton />
                        </View>
                      )}
                    </View>
                  ) : null}
                  {msg.mealData && (
                    <MealLogCard
                      s={s} c={c}
                      items={msg.mealData.items}
                      total={msg.mealData.total}
                      primaryUri={msg.mealData.primaryUri}
                      fallbackColor={msg.mealData.fallbackColor}
                      imageConfidence={msg.mealData.imageConfidence}
                      onImagePress={msg.mealData.imageConfidence !== 'verified' ? () => {
                        clearTimeout(feedbackTimerRef.current);
                        setFeedbackItem({
                          name:            msg.mealData.items[0]?.name ?? 'Meal',
                          imageUrl:        msg.mealData.primaryUri,
                          imageConfidence: msg.mealData.imageConfidence,
                          voteStats:       msg.mealData.voteStats,
                          msgId:           msg.id,
                          mealId:          msg.mealData.mealId,
                        });
                      } : null}
                    />
                  )}
                </View>
              </View>
            );
          })}
          {(typing || isThinking) && <TypingBubble s={s} />}
        </ScrollView>

        {/* ── Input bar ── */}
        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder='e.g. "I had 3 eggs and oatmeal"'
            placeholderTextColor={c.muted}
            multiline
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => withConsent(() => dispatchSend(input))}
          />
          <TouchableOpacity style={[s.sendBtn, input.trim() && s.sendBtnActive]} onPress={() => withConsent(() => dispatchSend(input))} activeOpacity={0.8}>
            <Ionicons name="send" size={18} color={input.trim() ? '#FFFFFF' : c.muted} />
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>

      {/* ── Image feedback modal ── */}
      <ImageFeedbackModal
        visible={!!feedbackItem}
        item={feedbackItem}
        currentUri={feedbackItem?.imageUrl}
        onSelect={handleImageSelect}
        onClose={() => setFeedbackItem(null)}
      />

      {/* ── AI consent modal (shown once before first AI use) ── */}
      <AIConsentModal
        visible={showConsent}
        onAccept={handleConsentAccept}
        onDecline={handleConsentDecline}
      />

    </SafeAreaView>
  );
}
