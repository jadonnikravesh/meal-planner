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
import { useMealContext } from '../context/MealContext';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useApp, useTheme } from '../context/AppContext';
import { useMealOverlay } from '../context/OverlayContext';
import { useTts } from '../context/TtsContext';
import { API_BASE_URL } from '../config/api';
import { getTodayKey } from '../utils/nutrition';
import { generateJobId, enqueueJob, removeJob, updateJob } from '../utils/jobQueue';
import { getStoredPushToken } from '../utils/pushNotifications';

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
    "Hi! I'm your FoodChat AI Assistant 🤖\n\n" +
    "Tap the mic button in the bottom bar to speak a meal from anywhere in the app, or just type below — I'll log everything automatically!",
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
const FAB_SIZE = 96;

const makeStyles = (c) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },

  // Header
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  title:       { fontSize: 22, fontWeight: '700', color: c.white },
  subtitle:    { fontSize: 12, color: c.muted, marginTop: 2 },
  onlineBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.greenDim, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, gap: 6 },
  onlineDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: c.green },
  onlineText:  { fontSize: 12, fontWeight: '600', color: c.green },

  // Mic FAB section
  fabSection: { alignItems: 'center', paddingVertical: 14 },
  fabWrap:    { width: FAB_SIZE, height: FAB_SIZE, alignItems: 'center', justifyContent: 'center' },
  fab: {
    width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2,
    backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: c.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 10, elevation: 8, gap: 2,
  },
  fabActive:   { backgroundColor: c.red },
  fabDisabled: { backgroundColor: c.card, opacity: 0.5 },
  fabLabel:    { fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5, textTransform: 'uppercase', opacity: 0.85 },
  fabLabelActive: { opacity: 1 },
  fabRing:      { position: 'absolute', width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, borderWidth: 2, borderColor: c.accent },
  fabRingInner: { borderColor: c.accent + 'AA' },
  voiceUnsupported: { fontSize: 10, color: c.muted, marginTop: 6 },

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

  // Recording bar
  recordingBar:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.redDim, paddingHorizontal: 18, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.red + '33' },
  recordingBarError: { backgroundColor: c.redDim },
  recordingText:     { fontSize: 13, color: c.red, flex: 1 },

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
      <View style={s.mealCardFooter}>
        <Ionicons name="checkmark-circle" size={14} color={c.green} />
        <Text style={s.mealCardFooterText}>Logged to your dashboard</Text>
      </View>
    </View>
  );
}

function MicFAB({ isListening, isSupported, onPress, s, c }) {
  const ring1    = useRef(new Animated.Value(1)).current;
  const ring1Opa = useRef(new Animated.Value(0)).current;
  const ring2    = useRef(new Animated.Value(1)).current;
  const ring2Opa = useRef(new Animated.Value(0)).current;
  const anim1Ref = useRef(null);
  const anim2Ref = useRef(null);

  useEffect(() => {
    if (isListening) {
      anim1Ref.current = Animated.loop(Animated.parallel([
        Animated.sequence([
          Animated.timing(ring1,    { toValue: 2.0, duration: 900, useNativeDriver: true }),
          Animated.timing(ring1,    { toValue: 1,   duration: 900, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(ring1Opa, { toValue: 0.6, duration: 900, useNativeDriver: true }),
          Animated.timing(ring1Opa, { toValue: 0,   duration: 900, useNativeDriver: true }),
        ]),
      ]));
      anim2Ref.current = Animated.loop(Animated.parallel([
        Animated.sequence([
          Animated.delay(450),
          Animated.timing(ring2,    { toValue: 2.0, duration: 900, useNativeDriver: true }),
          Animated.timing(ring2,    { toValue: 1,   duration: 900, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(450),
          Animated.timing(ring2Opa, { toValue: 0.35, duration: 900, useNativeDriver: true }),
          Animated.timing(ring2Opa, { toValue: 0,    duration: 900, useNativeDriver: true }),
        ]),
      ]));
      anim1Ref.current.start();
      anim2Ref.current.start();
    } else {
      anim1Ref.current?.stop();
      anim2Ref.current?.stop();
      ring1.setValue(1); ring1Opa.setValue(0);
      ring2.setValue(1); ring2Opa.setValue(0);
    }
  }, [isListening]);

  return (
    <View style={s.fabWrap}>
      <Animated.View style={[s.fabRing, { transform: [{ scale: ring1 }], opacity: ring1Opa }]} />
      <Animated.View style={[s.fabRing, s.fabRingInner, { transform: [{ scale: ring2 }], opacity: ring2Opa }]} />
      <TouchableOpacity
        style={[s.fab, isListening && s.fabActive, !isSupported && s.fabDisabled]}
        onPress={onPress}
        activeOpacity={0.82}
        disabled={!isSupported}
      >
        <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={40} color={!isSupported ? c.muted : '#FFFFFF'} />
        <Text style={[s.fabLabel, isListening && s.fabLabelActive]}>
          {isListening ? 'Listening…' : 'Speak'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function RecordingBar({ isListening, transcript, error, s, c }) {
  if (!isListening && !error) return null;
  if (error) {
    return (
      <View style={[s.recordingBar, s.recordingBarError]}>
        <Ionicons name="alert-circle" size={13} color={c.red} />
        <Text style={[s.recordingText, { color: c.red }]} numberOfLines={1}>{error}</Text>
      </View>
    );
  }
  return (
    <View style={s.recordingBar}>
      <Ionicons name="mic" size={13} color={c.red} />
      <Text style={s.recordingText} numberOfLines={1}>
        {transcript ? `"${transcript}"` : 'Listening…'}
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HelperScreen() {
  const { addMeal } = useMealContext();
  const { state } = useApp();
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
  // Returns true if a meal with this name was already logged in the last 3 min.
  const isDuplicateLog = (mealName) => {
    const now = Date.now();
    const WINDOW = 3 * 60 * 1000; // 3 minutes
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
    setFeedbackItem(null);
  }, [feedbackItem, updateMessageImage]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages, typing]);

  useEffect(() => () => clearTimeout(timerRef.current), []);
  useEffect(() => () => clearTimeout(feedbackTimerRef.current), []);

  // Stop any ongoing speech when leaving this screen; clear the speaking flag too
  useEffect(() => () => { stopSpeech(); markStopped(); }, []);

  // ── Voice ──────────────────────────────────────────────────────────────────
  // Not memoised — useVoiceInput keeps onResult fresh via a ref anyway
  const handleVoiceResult = (finalText) => {
    setInput(finalText);
    setTimeout(() => dispatchSend(finalText), 400);
  };

  const { isSupported, isListening, transcript, error: voiceError, startListening, stopListening } =
    useVoiceInput({ onResult: handleVoiceResult });

  const handleMicPress = () => { if (isListening) stopListening(); else startListening(); };

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
    const jobPayload = {
      message: trimmed, history: historySnapshot, userProfile: profileForAI,
      foodPreferences, pushToken, jobId,
    };
    await enqueueJob(jobId, jobPayload);

    // 35 s matches Render free-tier worst-case cold-start (20–40 s).
    // The job was already enqueued above, so if THIS fetch times out the retry
    // processor picks it up next time the app comes to the foreground.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);
    console.log(`[chat] Request started — job: ${jobId}`);

    try {
      const res = await fetch(`${BACKEND_URL}/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobPayload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

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

      // Persist conversation so the AI has context on the next turn
      chatHistoryRef.current = [
        ...historySnapshot,
        { role: 'user',      content: trimmed     },
        { role: 'assistant', content: data.reply  },
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
        const { uri: finalUri, confidence: finalConfidence } =
          await getOrFetchFoodImage(m.name);
        const foodVerified = finalConfidence === 'verified';
        const imgColor     = getFoodColor(m.imageKey || m.name);

        if (!isDuplicateLog(m.name)) {
          console.log('[chat] logging meal:', m.name, m.calories, 'kcal | verified:', foodVerified);
          const msgId = Date.now() + 1;
          addMeal({
            id: generateMealId(), name: m.name, time: formatTime(),
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
            mealData: { items, total, primaryUri: finalUri, fallbackColor: imgColor, imageConfidence: finalConfidence, voteStats: {} },
          }]);
          if (!foodVerified) {
            scheduleFeedbackPrompt({
              name:            m.name,
              imageUrl:        finalUri,
              imageConfidence: finalConfidence,
              voteStats:       {},
              msgId,
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
      clearTimeout(timeout);
      setTyping(false);

      const isTimeout = err.name === 'AbortError';
      const isOffline = !isTimeout && (
        err.message.includes('Failed to fetch') || err.message.includes('Network')
      );

      // Mark the job as failed so useJobProcessor retries it on next foreground.
      // AbortError (timeout): job stays 'pending' — it may already be processing
      // on the server and the push notification will arrive when it finishes.
      if (!isTimeout) {
        updateJob(jobId, { status: 'failed' }).catch(() => {});
      }

      console.warn(`[chat] Request failed — job: ${jobId} — ${
        isTimeout ? 'timed out after 35s' : err.message
      }`);

      setMessages((prev) => [...prev, {
        id: Date.now() + 1, role: 'ai',
        text: isTimeout
          ? "Taking longer than expected. Your message is saved — you'll get a notification when it's processed."
          : isOffline
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
      const t = setTimeout(() => dispatchSend(preset), 350);
      return () => clearTimeout(t);
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
    Alert.alert('Add Food Photo', 'How would you like to add a photo?', [
      { text: 'Take Photo',          onPress: launchCamera  },
      { text: 'Choose from Library', onPress: launchLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
        headers: { 'Content-Type': 'application/json' },
        // pushToken lets the backend send a notification if a meal is logged.
        // No jobId — photo payloads are too large to store in AsyncStorage.
        body: JSON.stringify({ imageBase64: base64, mimeType, userProfile: profileForAI, pushToken }),
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
        const { uri: finalUri, confidence: finalConfidence } =
          await getOrFetchFoodImage(m.name);
        const foodVerified = finalConfidence === 'verified';
        const imgColor     = getFoodColor(m.imageKey || m.name);

        if (!isDuplicateLog(m.name)) {
          console.log('[photo] logging meal:', m.name, m.calories, 'kcal | verified:', foodVerified);
          const msgId = Date.now() + 1;
          addMeal({
            id: generateMealId(), name: m.name, time: formatTime(),
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
            mealData: { items, total, primaryUri: finalUri, fallbackColor: imgColor, imageConfidence: finalConfidence, voteStats: {} },
          }]);
          if (!foodVerified) {
            scheduleFeedbackPrompt({
              name:            m.name,
              imageUrl:        finalUri,
              imageConfidence: finalConfidence,
              voteStats:       {},
              msgId,
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
            <Text style={s.subtitle}>Powered by FoodChat AI</Text>
          </View>
          <View style={s.onlineBadge}>
            <View style={s.onlineDot} />
            <Text style={s.onlineText}>Online</Text>
          </View>
        </View>

        {/* ── Suggestion chips ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsScroll} style={s.chipsRow}>
          {SUGGESTIONS.map((sg) => (
            <TouchableOpacity key={sg.id} style={s.chip} activeOpacity={0.7} onPress={() => dispatchSend(sg.label)}>
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
                  {msg.text ? <View style={s.aiBubble}><Text style={s.aiBubbleText}>{msg.text}</Text></View> : null}
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
                        });
                      } : null}
                    />
                  )}
                </View>
              </View>
            );
          })}
          {typing && <TypingBubble s={s} />}
        </ScrollView>

        {/* ── Recording status bar ── */}
        <RecordingBar isListening={isListening} transcript={transcript} error={voiceError} s={s} c={c} />

        {/* ── Input bar ── */}
        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            value={isListening ? transcript : input}
            onChangeText={setInput}
            placeholder='e.g. "I had 3 eggs and oatmeal"'
            placeholderTextColor={c.muted}
            multiline
            editable={!isListening}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => dispatchSend(input)}
          />
          <TouchableOpacity style={[s.sendBtn, (input.trim() || transcript.trim()) && s.sendBtnActive]} onPress={() => dispatchSend(input)} activeOpacity={0.8}>
            <Ionicons name="send" size={18} color={(input.trim() || transcript.trim()) ? '#FFFFFF' : c.muted} />
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

    </SafeAreaView>
  );
}
