import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { RADIUS, SPACING } from '../theme';
import { useApp, useTheme } from '../context/AppContext';
import { getTodayKey, formatTime } from '../utils/nutrition';
import {
  parseUserInput,
  detectMissingInfo,
  generateAIResponse,
  buildInitialGreeting,
  analyzeUserTrends,
} from '../utils/aiCoach';

const SUGGESTIONS = [
  { label: '🍳 What should I eat for breakfast?', prompt: 'What should I eat for breakfast?' },
  { label: '💪 Am I hitting my protein goals?',   prompt: 'How am I doing on protein?' },
  { label: '🥑 Suggest a healthy snack',          prompt: 'Suggest a healthy snack under 200 calories' },
  { label: '📊 How am I doing today?',            prompt: 'How am I doing today?' },
  { label: '💧 How much water left?',             prompt: 'How much water do I still need today?' },
  { label: '⚖️ Calories left today?',            prompt: 'How many calories do I have left today?' },
];

const WAVE_BARS = [4, 8, 14, 20, 26, 20, 14, 8, 18, 24, 30, 24, 16, 10, 20, 28, 22, 12, 6, 16];

function makeId() {
  return Date.now() + Math.random().toString(36).slice(2);
}

export default function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useApp();
  const C = useTheme();

  const { userProfile, dailyLogs, chatMessages } = state;
  const todayKey = getTodayKey();

  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [pendingFollowUp, setPendingFollowUp] = useState(null);
  const scrollRef = useRef(null);

  // Initialise messages with greeting if empty
  useEffect(() => {
    if (chatMessages.length === 0) {
      const greetingText = buildInitialGreeting(userProfile, dailyLogs[todayKey], dailyLogs);
      const initial = {
        id: makeId(),
        from: 'ai',
        text: greetingText,
        time: formatTime(),
      };
      dispatch({ type: 'SET_CHAT_MESSAGES', payload: [initial] });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToEnd = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const addMessage = useCallback((msg) => {
    dispatch({ type: 'ADD_CHAT_MESSAGE', payload: msg });
    scrollToEnd();
  }, [dispatch, scrollToEnd]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isThinking) return;

    const userMsg = { id: makeId(), from: 'user', text, time: formatTime() };
    addMessage(userMsg);
    setInputText('');
    setIsThinking(true);

    // Slight delay to simulate processing
    setTimeout(() => {
      const todayLog = dailyLogs[todayKey];

      let parsed;
      let missing = [];

      // If we're in a follow-up flow, incorporate the context
      if (pendingFollowUp) {
        const combinedText = `${pendingFollowUp.originalText} ${text}`;
        parsed = parseUserInput(combinedText);
        // No more follow-up needed for this exchange
        setPendingFollowUp(null);
      } else {
        parsed = parseUserInput(text);
        missing = detectMissingInfo(text, parsed);
      }

      // Log food to daily log if detected and no missing info
      if (parsed.type === 'food' && parsed.foods.length > 0 && missing.length === 0) {
        const totalCals = parsed.foods.reduce((s, f) => s + f.calories, 0);
        const totalProt = parsed.foods.reduce((s, f) => s + f.protein, 0);
        const totalCarbs = parsed.foods.reduce((s, f) => s + f.carbs, 0);
        const totalFat = parsed.foods.reduce((s, f) => s + f.fat, 0);
        const mealName = parsed.foods.map((f) => f.name).join(' + ');

        dispatch({
          type: 'LOG_MEAL',
          payload: {
            date: todayKey,
            meal: {
              name: mealName,
              calories: totalCals,
              protein: totalProt,
              carbs: totalCarbs,
              fat: totalFat,
              time: formatTime(),
            },
          },
        });
      }

      // Log water if detected
      if (parsed.type === 'water') {
        dispatch({ type: 'LOG_WATER', payload: { date: todayKey, amount: parsed.amount } });
      }

      // Track pending follow-up so next message can complete it
      if (missing.length > 0) {
        setPendingFollowUp({ originalText: text });
      }

      const freshLog = dailyLogs[todayKey]; // latest snapshot
      const responseText = generateAIResponse(text, parsed, freshLog, userProfile, missing);

      const aiMsg = { id: makeId(), from: 'ai', text: responseText, time: formatTime() };
      addMessage(aiMsg);
      setIsThinking(false);
    }, 600);
  }, [inputText, isThinking, dailyLogs, todayKey, userProfile, pendingFollowUp, addMessage, dispatch]);

  const handleSuggestion = useCallback((prompt) => {
    const msg = { id: makeId(), from: 'user', text: prompt, time: formatTime() };
    addMessage(msg);
    setIsThinking(true);

    setTimeout(() => {
      const todayLog = dailyLogs[todayKey];
      const parsed = parseUserInput(prompt);
      const responseText = generateAIResponse(prompt, parsed, todayLog, userProfile, []);
      const aiMsg = { id: makeId(), from: 'ai', text: responseText, time: formatTime() };
      addMessage(aiMsg);
      setIsThinking(false);
    }, 500);
  }, [addMessage, dailyLogs, todayKey, userProfile]);

  // Today's snapshot for header
  const todayLog = dailyLogs[todayKey] || {};
  const calConsumed = Math.round(todayLog.calories || 0);
  const calTarget = userProfile.calorieTarget || 2000;
  const protConsumed = Math.round(todayLog.protein || 0);
  const protTarget = userProfile.proteinTarget || 150;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top, backgroundColor: C.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <LinearGradient
        colors={[C.purpleDim, 'transparent']}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <LinearGradient colors={[C.purple, '#6D28D9']} style={styles.aiBadge}>
            <Ionicons name="sparkles" size={18} color="#FFFFFF" />
          </LinearGradient>
          <View>
            <Text style={[styles.headerTitle, { color: C.text }]}>AI Nutrition Coach</Text>
            <View style={styles.onlineRow}>
              <View style={[styles.onlineDot, { backgroundColor: C.accent }]} />
              <Text style={[styles.onlineText, { color: C.textSub }]}>
                {calConsumed}/{calTarget} kcal · {protConsumed}/{protTarget}g protein today
              </Text>
            </View>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.headerBtn, { backgroundColor: C.surface }]}
          onPress={() => {
            // Show a trend insight as a new AI message
            const trends = analyzeUserTrends(dailyLogs, userProfile);
            const text = trends.length > 0
              ? trends.join('\n\n')
              : 'Not enough data yet to spot trends. Keep logging your meals and I will give you personalised insights!';
            addMessage({ id: makeId(), from: 'ai', text, time: formatTime() });
          }}
        >
          <Ionicons name="stats-chart" size={18} color={C.textSub} />
        </TouchableOpacity>
      </LinearGradient>

      {/* Voice button + waveform */}
      <View style={[styles.voiceSection, { borderBottomColor: C.border }]}>
        <TouchableOpacity
          style={styles.micBtnOuter}
          onPress={() => setIsListening((v) => !v)}
          activeOpacity={0.8}
        >
          {isListening && <View style={[styles.micPulse, styles.micPulse1, { borderColor: C.red }]} />}
          {isListening && <View style={[styles.micPulse, styles.micPulse2, { borderColor: C.red }]} />}
          <LinearGradient
            colors={isListening ? [C.red, '#DC2626'] : [C.purple, '#6D28D9']}
            style={styles.micBtn}
          >
            <Ionicons name={isListening ? 'stop' : 'mic'} size={28} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
        <Text style={[styles.micLabel, { color: C.textSub }]}>
          {isListening ? 'Listening... tap to stop' : 'Tap to speak (decorative for now)'}
        </Text>
        <View style={styles.waveform}>
          {WAVE_BARS.map((h, i) => (
            <View
              key={i}
              style={[
                styles.waveBar,
                {
                  height: isListening ? h : 4,
                  backgroundColor: isListening
                    ? i % 3 === 0 ? C.red : i % 3 === 1 ? C.purple : C.pink
                    : C.borderLight,
                },
              ]}
            />
          ))}
        </View>
      </View>

      {/* Suggestion chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.suggestionsScroll}
        style={[styles.suggestionsContainer, { borderBottomColor: C.border }]}
      >
        {SUGGESTIONS.map((s) => (
          <TouchableOpacity
            key={s.prompt}
            style={[styles.suggestionChip, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={() => handleSuggestion(s.prompt)}
          >
            <Text style={[styles.suggestionText, { color: C.textSub }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollToEnd}
      >
        {chatMessages.map((msg) => (
          <View
            key={msg.id}
            style={[styles.msgRow, msg.from === 'user' ? styles.msgRowUser : styles.msgRowAi]}
          >
            {msg.from === 'ai' && (
              <LinearGradient colors={[C.purple, '#6D28D9']} style={styles.msgAvatar}>
                <Ionicons name="sparkles" size={12} color="#FFFFFF" />
              </LinearGradient>
            )}
            <View
              style={[
                styles.bubble,
                msg.from === 'user'
                  ? [styles.bubbleUser, { backgroundColor: C.purple }]
                  : [styles.bubbleAi, { backgroundColor: C.surface, borderColor: C.border }],
              ]}
            >
              <Text style={[styles.bubbleText, { color: msg.from === 'user' ? '#FFFFFF' : C.text }]}>
                {msg.text}
              </Text>
              <Text style={[styles.bubbleTime, { color: msg.from === 'user' ? 'rgba(255,255,255,0.5)' : C.textMuted }]}>
                {msg.time}
              </Text>
            </View>
          </View>
        ))}

        {isThinking && (
          <View style={[styles.msgRow, styles.msgRowAi]}>
            <LinearGradient colors={[C.purple, '#6D28D9']} style={styles.msgAvatar}>
              <Ionicons name="sparkles" size={12} color="#FFFFFF" />
            </LinearGradient>
            <View style={[styles.bubble, styles.bubbleAi, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Text style={[styles.bubbleText, { color: C.textMuted }]}>Thinking...</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input bar */}
      <View style={[styles.inputBar, { backgroundColor: C.surface, borderTopColor: C.border, paddingBottom: insets.bottom + 8 }]}>
        {pendingFollowUp && (
          <View style={[styles.followUpBanner, { backgroundColor: C.purpleDim, borderColor: C.purple + '44' }]}>
            <Ionicons name="help-circle" size={14} color={C.purple} />
            <Text style={[styles.followUpText, { color: C.purple }]}>Follow-up — reply to continue logging</Text>
          </View>
        )}
        <View style={[styles.inputWrap, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
          <TextInput
            style={[styles.input, { color: C.text }]}
            placeholder={pendingFollowUp ? 'Reply to finish logging...' : 'Tell me what you ate or ask anything...'}
            placeholderTextColor={C.textMuted}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            multiline={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isThinking}
          >
            <LinearGradient
              colors={inputText.trim() ? [C.purple, '#6D28D9'] : [C.border, C.border]}
              style={styles.sendGradient}
            >
              <Ionicons name="send" size={16} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  aiBadge: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  onlineText: {
    fontSize: 11,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceSection: {
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  micBtnOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    position: 'relative',
  },
  micPulse: {
    position: 'absolute',
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
  },
  micPulse1: {
    width: 80,
    height: 80,
    opacity: 0.4,
  },
  micPulse2: {
    width: 100,
    height: 100,
    opacity: 0.2,
  },
  micBtn: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
  micLabel: {
    fontSize: 11,
    marginBottom: 10,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 32,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  suggestionsContainer: {
    maxHeight: 50,
    borderBottomWidth: 1,
  },
  suggestionsScroll: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    gap: 8,
  },
  suggestionChip: {
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  suggestionText: {
    fontSize: 12,
    fontWeight: '500',
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    padding: SPACING.md,
    gap: 12,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  msgRowAi: {
    justifyContent: 'flex-start',
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: RADIUS.lg,
    padding: 12,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
  },
  bubbleAi: {
    borderWidth: 1,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTime: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right',
  },
  inputBar: {
    borderTopWidth: 1,
    padding: SPACING.sm,
  },
  followUpBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    marginBottom: 6,
  },
  followUpText: {
    fontSize: 11,
    fontWeight: '600',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 6,
  },
  sendBtn: {
    marginLeft: 8,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendGradient: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
