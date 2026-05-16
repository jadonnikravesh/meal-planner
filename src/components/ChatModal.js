import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TextInput,
  ScrollView, StyleSheet, Image, KeyboardAvoidingView,
  Platform, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { isFoodLog, parseFoodMessage, formatTime } from '../utils/foodParser';
import { useMealContext } from '../context/MealContext';
import { getCorrection, saveCorrection, applyCorrections } from '../utils/imageCorrections';
import { getTodayKey } from '../utils/nutrition';
import ImageFeedbackModal from './ImageFeedbackModal';

// ─── Palette (Shred AI light theme) ──────────────────────────────────────────
// To revert: restore original dark values committed in git history
const BG        = '#F6F1E8';
const CARD      = '#FFFDF9';
const CARD2     = '#EDE8DF';
const BORDER    = '#E5DDD2';
const WHITE     = '#1F2933';
const MUTED     = '#8A8278';
const ACCENT    = '#5E8C61';
const ACCENT_DIM = 'rgba(94,140,97,0.12)';
const INPUT_BG  = '#EDE8DF';
const GREEN     = '#5E8C61';
const GREEN_DIM = 'rgba(94,140,97,0.12)';
const RED       = '#C84040';
const RED_DIM   = 'rgba(200,64,64,0.10)';
const FIRE      = '#D97745';
const PROTEIN   = '#C0504A';
const CARBS     = '#B8893A';
const FAT       = '#4A80C4';

// ─── Canned AI responses ─────────────────────────────────────────────────────
const CANNED = [
  "Great question! Tell me what you've eaten today and I'll break down your macros.",
  "Aim for at least 30g of protein per meal to support muscle retention — try chicken, eggs, or Greek yogurt!",
  "For weight loss, a 300–500 kcal daily deficit is sustainable. Log your meals here and I'll track it automatically.",
  "Hydration tip: drink a glass of water before each meal to reduce appetite and improve digestion.",
  "High-protein snacks: boiled eggs, cottage cheese, edamame, Greek yogurt, or a handful of almonds.",
  "Consistency beats perfection. Even logging 80% of your meals gives you great insight into your diet!",
];
let cannedIdx = 0;
const nextCanned = () => { const r = CANNED[cannedIdx % CANNED.length]; cannedIdx++; return r; };

// ─── Sub-components ───────────────────────────────────────────────────────────

function AIAvatar() {
  return (
    <View style={s.aiAvatar}>
      <Ionicons name="sparkles" size={14} color={ACCENT} />
    </View>
  );
}

/** Animated pulsing dots shown while AI is "thinking". */
function TypingBubble() {
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
      <AIAvatar />
      <View style={s.typingBubble}>
        <View style={s.typingDots}>
          {dots.map((d, i) => (
            <Animated.View key={i} style={[s.dot, { opacity: d }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * A single labeled macro stat shown inside a MealLogCard.
 * e.g.  ⚡ Protein  47g
 */
function MacroStat({ icon, color, label, value }) {
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

/** Full meal-log card shown inside an AI bubble after a food is logged. */
function MealLogCard({ items, total, primaryUri, fallbackColor, mealId, onImageTap }) {
  // Local correction state — loaded once on mount, updated optimistically on user action
  const [uriOverrides, setUriOverrides] = useState({}); // { foodKey: uri|null }

  useEffect(() => {
    let cancelled = false;
    async function loadStoredCorrections() {
      const overrides = {};
      for (const item of items) {
        if (!item.foodKey) continue;
        const corr = await getCorrection(item.foodKey);
        if (corr) {
          overrides[item.foodKey] = corr.status === 'rejected' ? null : (corr.uri ?? item.imageUrl);
        }
      }
      if (!cancelled) setUriOverrides(overrides);
    }
    loadStoredCorrections();
    return () => { cancelled = true; };
  }, []); // intentionally run once per card

  const getEffectiveUri = (item) => {
    if (item.foodKey && Object.prototype.hasOwnProperty.call(uriOverrides, item.foodKey)) {
      return uriOverrides[item.foodKey]; // may be null (rejected)
    }
    return item.imageUrl ?? null;
  };

  const getConfidence = (item) => {
    if (item.foodKey && Object.prototype.hasOwnProperty.call(uriOverrides, item.foodKey)) {
      return uriOverrides[item.foodKey] === null ? 'none' : 'high';
    }
    return item.imageConfidence ?? 'low';
  };

  const primary          = items[0];
  const primaryEffUri    = getEffectiveUri(primary);
  const primaryConfidence = getConfidence(primary);

  const mealLabel =
    items.length === 1
      ? items[0].name
      : items.slice(0, 2).map((i) => i.name).join(' & ') +
        (items.length > 2 ? ` +${items.length - 2}` : '');

  const handleImageTap = () => {
    onImageTap({
      item:       { ...primary, imageUrl: primary.imageUrl ?? null },
      mealId,
      currentUri: primaryEffUri,
      applyLocal: (foodKey, newUri) => {
        setUriOverrides((prev) => ({ ...prev, [foodKey]: newUri }));
      },
    });
  };

  return (
    <View style={s.mealCard}>

      {/* ── Image + summary ── */}
      <View style={s.mealCardTop}>

        {/* Tappable image with confidence badge */}
        <TouchableOpacity
          onPress={handleImageTap}
          activeOpacity={0.82}
          style={s.mealCardImgWrap}
        >
          {primaryEffUri ? (
            <Image
              source={{ uri: primaryEffUri }}
              style={[s.mealCardImg, { backgroundColor: fallbackColor }]}
              resizeMode="cover"
            />
          ) : (
            <View style={[s.mealCardImg, s.mealCardImgPlaceholder, { backgroundColor: fallbackColor || CARD2 }]}>
              <Ionicons name="restaurant-outline" size={26} color={MUTED} />
            </View>
          )}

          {/* Confidence badge — bottom-right corner of the image */}
          {primaryConfidence !== 'none' && (
            <View style={[s.confBadge, primaryConfidence === 'high' ? s.confBadgeGreen : s.confBadgeAmber]}>
              <Ionicons
                name={primaryConfidence === 'high' ? 'checkmark' : 'help'}
                size={8}
                color="#FFF"
              />
            </View>
          )}
        </TouchableOpacity>

        <View style={s.mealCardInfo}>
          <Text style={s.mealCardName} numberOfLines={2}>{mealLabel}</Text>
          <View style={s.mealCardCalRow}>
            <Ionicons name="flame" size={13} color={FIRE} />
            <Text style={s.mealCardCal}> {total.calories} kcal</Text>
          </View>

          {/* ── Full macros with labels ── */}
          <View style={s.macroStatsRow}>
            <MacroStat icon="flash" color={PROTEIN} label="Protein" value={total.protein} />
            <View style={s.macroStatDivider} />
            <MacroStat icon="leaf"  color={CARBS}   label="Carbs"   value={total.carbs}   />
            <View style={s.macroStatDivider} />
            <MacroStat icon="water" color={FAT}     label="Fat"     value={total.fat}     />
          </View>
        </View>
      </View>

      {/* ── Per-item breakdown (multi-food logs) ── */}
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
                <Text style={s.mealCardItemMacros}>
                  P {item.protein}g · C {item.carbs}g · F {item.fat}g
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── Confirmation footer ── */}
      <View style={s.mealCardFooter}>
        <Ionicons name="checkmark-circle" size={14} color={GREEN} />
        <Text style={s.mealCardFooterText}>Logged to your dashboard</Text>
        <Text style={s.mealCardFooterTap}>  ·  Tap image to verify</Text>
      </View>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const GREETING = {
  id: 0,
  role: 'ai',
  text:
    "Hi! I'm your Shred AI Food Assistant 🤖\n\n" +
    "Tell me what you ate — like \"I had 3 eggs and a bowl of oatmeal\" — and I'll log the full calories and macros to your dashboard automatically.\n\n" +
    "Type a meal below and I'll log it automatically!",
};

export default function ChatModal({ visible, onClose, startWithVoice = false }) {
  const { addMeal, updateMeal } = useMealContext();

  const [messages,      setMessages]      = useState([GREETING]);
  const [input,         setInput]         = useState('');
  const [typing,        setTyping]        = useState(false);
  const [feedbackState, setFeedbackState] = useState(null); // { item, mealId, currentUri }

  const scrollRef = useRef(null);
  const timerRef  = useRef(null);
  const inputRef  = useRef(null);

  // Auto-scroll to bottom when messages or typing state changes
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages, typing]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // ── Image feedback handler ────────────────────────────────────────────────
  const handleFeedback = async (selectedUri) => {
    const { item, mealId } = feedbackState;
    if (item.foodKey) {
      await saveCorrection(item.foodKey, { uri: selectedUri, status: 'replaced' });
    }
    // Update the image on the card optimistically
    feedbackState.applyLocal?.(item.foodKey, selectedUri);
    // Propagate URI change to the stored meal so HomeScreen reflects it
    if (mealId) {
      updateMeal({ id: mealId, uri: selectedUri ?? null }, getTodayKey());
    }
    setFeedbackState(null);
  };

  // ── Core send logic (accepts text directly for voice path) ───────────────
  const dispatchSend = (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed) return;
    setInput('');

    const userMsg = { id: Date.now(), role: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setTyping(true);

    timerRef.current = setTimeout(async () => {
      setTyping(false);

      if (isFoodLog(trimmed)) {
        const { items: rawItems, total } = parseFoodMessage(trimmed);

        if (rawItems.length === 0) {
          setMessages((prev) => [...prev, {
            id: Date.now() + 1, role: 'ai',
            text: "I detected a food log, but couldn't identify specific items. Try being more specific — e.g. \"I had 3 eggs and a cup of oatmeal\".",
          }]);
          return;
        }

        // Apply any stored user corrections before logging
        const items  = await applyCorrections(rawItems);
        const primary = items[0];
        const mealId  = Date.now() + 1;

        addMeal({
          id:            mealId,
          name:          items.length === 1 ? primary.name : items.map((i) => i.name).join(' & '),
          time:          formatTime(),
          kcal:          total.calories,
          protein:       total.protein,
          carbs:         total.carbs,
          fat:           total.fat,
          uri:           primary.imageUrl ?? null,
          fallbackColor: primary.color,
          ingredients:   items.map((item, idx) => ({
            id:         `${mealId}_${idx}_${item.name.toLowerCase().replace(/\s+/g, '_')}`,
            name:       item.name,
            grams:      item.grams,
            cal100:     item.cal100,
            protein100: item.protein100,
            carbs100:   item.carbs100,
            fat100:     item.fat100,
          })),
        });

        setMessages((prev) => [...prev, {
          id:       Date.now() + 1,
          role:     'ai',
          text:     "Got it! Here's what I logged:",
          mealData: { items, total, primaryUri: primary.imageUrl, fallbackColor: primary.color, mealId },
        }]);

      } else {
        setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'ai', text: nextCanned() }]);
      }
    }, 1200);
  };

  const handleSend = () => dispatchSend(input);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={s.safe}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.headerAvatar}>
              <Ionicons name="sparkles" size={16} color={ACCENT} />
            </View>
            <View>
              <Text style={s.headerTitle}>AI Food Assistant</Text>
              <View style={s.onlineRow}>
                <View style={s.onlineDot} />
                <Text style={s.onlineText}>Online · Meal logging enabled</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={20} color={MUTED} />
          </TouchableOpacity>
        </View>

        {/* ── Chat messages ── */}
        <ScrollView
          ref={scrollRef}
          style={s.chat}
          contentContainerStyle={s.chatContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <View key={msg.id} style={s.userBubbleRow}>
                  <View style={s.userBubble}>
                    <Text style={s.userBubbleText}>{msg.text}</Text>
                  </View>
                </View>
              );
            }
            return (
              <View key={msg.id} style={s.aiBubbleRow}>
                <AIAvatar />
                <View style={s.aiBubbleWrap}>
                  {msg.text ? (
                    <View style={s.aiBubble}>
                      <Text style={s.aiBubbleText}>{msg.text}</Text>
                    </View>
                  ) : null}
                  {msg.mealData && (
                    <MealLogCard
                      items={msg.mealData.items}
                      total={msg.mealData.total}
                      primaryUri={msg.mealData.primaryUri}
                      fallbackColor={msg.mealData.fallbackColor}
                      mealId={msg.mealData.mealId}
                      onImageTap={(data) => setFeedbackState(data)}
                    />
                  )}
                </View>
              </View>
            );
          })}

          {typing && <TypingBubble />}
        </ScrollView>

        {/* ── Input bar ── */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={10}
        >
          <View style={s.inputBar}>
            <TextInput
              ref={inputRef}
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder='e.g. "I had 3 eggs and a bowl of oatmeal"'
              placeholderTextColor={MUTED}
              multiline
              onSubmitEditing={handleSend}
              returnKeyType="send"
              blurOnSubmit
            />

            {/* ── Send button ── */}
            <TouchableOpacity
              style={[s.sendBtn, input.trim() && s.sendBtnActive]}
              onPress={handleSend}
              activeOpacity={0.8}
            >
              <Ionicons
                name="send"
                size={18}
                color={input.trim() ? WHITE : MUTED}
              />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

        {/* ── Image feedback modal ── */}
        {feedbackState && (
          <ImageFeedbackModal
            visible={!!feedbackState}
            item={feedbackState.item}
            currentUri={feedbackState.currentUri}
            onSelect={handleFeedback}
            onClose={() => setFeedbackState(null)}
          />
        )}

      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  // Header (unchanged)
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: ACCENT_DIM, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: ACCENT + '55' },
  headerTitle:  { fontSize: 16, fontWeight: '700', color: WHITE },
  onlineRow:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  onlineDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN },
  onlineText:   { fontSize: 11, color: GREEN, fontWeight: '500' },
  closeBtn:     { width: 34, height: 34, borderRadius: 17, backgroundColor: CARD, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: BORDER },

  // Chat (unchanged)
  chat:        { flex: 1 },
  chatContent: { paddingHorizontal: 16, paddingVertical: 14, gap: 14 },

  // AI bubble (unchanged)
  aiBubbleRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  aiAvatar:     { width: 30, height: 30, borderRadius: 15, backgroundColor: ACCENT_DIM, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: ACCENT + '44', flexShrink: 0, marginTop: 2 },
  aiBubbleWrap: { flex: 1, gap: 8 },
  aiBubble:     { backgroundColor: CARD, borderRadius: 16, borderTopLeftRadius: 4, padding: 13, borderWidth: 1, borderColor: BORDER },
  aiBubbleText: { fontSize: 14, color: WHITE, lineHeight: 21 },

  // User bubble (unchanged)
  userBubbleRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  userBubble:    { backgroundColor: ACCENT, borderRadius: 16, borderBottomRightRadius: 4, padding: 12, maxWidth: '80%' },
  userBubbleText:{ fontSize: 14, color: WHITE, lineHeight: 21 },

  // Typing (unchanged)
  typingBubble: { backgroundColor: CARD, borderRadius: 16, borderTopLeftRadius: 4, padding: 13, borderWidth: 1, borderColor: BORDER },
  typingDots:   { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot:          { width: 7, height: 7, borderRadius: 4, backgroundColor: MUTED },

  // ── Meal log card ─────────────────────────────────────────────────────────
  mealCard:         { backgroundColor: CARD2, borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  mealCardTop:      { flexDirection: 'row', gap: 12, padding: 12 },
  mealCardImg:      { width: 72, height: 72, borderRadius: 10, flexShrink: 0 },
  mealCardInfo:     { flex: 1, justifyContent: 'center', gap: 6 },
  mealCardName:     { fontSize: 14, fontWeight: '700', color: WHITE, lineHeight: 19 },
  mealCardCalRow:   { flexDirection: 'row', alignItems: 'center' },
  mealCardCal:      { fontSize: 13, fontWeight: '600', color: WHITE },

  // Full macro stats row (new)
  macroStatsRow:    { flexDirection: 'row', alignItems: 'center', gap: 0 },
  macroStat:        { flex: 1, alignItems: 'center', gap: 1 },
  macroStatHeader:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  macroStatLabel:   { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  macroStatValue:   { fontSize: 13, fontWeight: '700', color: WHITE },
  macroStatDivider: { width: 1, height: 28, backgroundColor: BORDER, marginHorizontal: 4 },

  // Per-item breakdown (improved)
  mealCardItems:       { paddingHorizontal: 12, paddingBottom: 4 },
  mealCardItem:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  mealCardItemBorder:  { borderBottomWidth: 1, borderBottomColor: BORDER },
  mealCardItemLeft:    { gap: 2 },
  mealCardItemName:    { fontSize: 13, fontWeight: '600', color: WHITE },
  mealCardItemGrams:   { fontSize: 11, color: MUTED },
  mealCardItemRight:   { alignItems: 'flex-end', gap: 2 },
  mealCardItemCal:     { fontSize: 12, fontWeight: '600', color: WHITE },
  mealCardItemMacros:  { fontSize: 10, color: MUTED },

  // Image wrap + confidence badge
  mealCardImgWrap:      { position: 'relative', flexShrink: 0 },
  mealCardImgPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  confBadge:            { position: 'absolute', bottom: 4, right: 4, width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: CARD2 },
  confBadgeGreen:       { backgroundColor: GREEN },
  confBadgeAmber:       { backgroundColor: '#F59E0B' },

  mealCardFooter:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: GREEN_DIM, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: GREEN + '22' },
  mealCardFooterText:  { fontSize: 12, color: GREEN, fontWeight: '600' },
  mealCardFooterTap:   { fontSize: 12, color: MUTED },

  // ── Input bar ────────────────────────────────────────────────────────────
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: INPUT_BG, borderTopWidth: 1, borderTopColor: BORDER,
  },
  input: {
    flex: 1, backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 16, paddingVertical: 11, fontSize: 14, color: WHITE, maxHeight: 120,
  },

  // Send button
  sendBtn:       { width: 44, height: 44, borderRadius: 22, backgroundColor: CARD, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: BORDER },
  sendBtnActive: { backgroundColor: ACCENT, borderColor: ACCENT },
});
