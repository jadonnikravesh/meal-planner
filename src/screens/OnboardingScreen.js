import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  Animated, Dimensions, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { ScrollView } from 'react-native';
import { useApp, useTheme } from '../context/AppContext';

const { width: W } = Dimensions.get('window');

// ─── Picker data ──────────────────────────────────────────────────────────────
const AGE_OPTIONS    = Array.from({ length: 83 }, (_, i) => `${i + 13}`);
const WEIGHT_OPTIONS = Array.from({ length: 251 }, (_, i) => `${i + 80}`);
const HEIGHT_OPTIONS = (() => {
  const opts = [];
  for (let ft = 4; ft <= 7; ft++)
    for (let inch = 0; inch <= 11; inch++)
      opts.push(`${ft}'${inch}"`);
  return opts;
})();

const GOALS = [
  { key: 'loseFat',    label: 'Lose Fat',        desc: 'Burn body fat and get leaner',       icon: 'flame',            color: '#FF6B00' },
  { key: 'maintain',   label: 'Maintain Weight',  desc: 'Stay at your current weight',        icon: 'shield-checkmark', color: '#4E9FD9' },
  { key: 'gainMuscle', label: 'Gain Muscle',      desc: 'Build strength and add size',        icon: 'barbell',          color: '#4CAF50' },
];

const ACTIVITIES = [
  { key: 'sedentary',  label: 'Inactive',          desc: 'Little or no exercise',              icon: 'bed-outline'     },
  { key: 'light',      label: 'Lightly Active',    desc: '1–2 workouts per week',              icon: 'walk-outline'    },
  { key: 'moderate',   label: 'Moderately Active', desc: '3–4 workouts per week',              icon: 'bicycle-outline' },
  { key: 'veryActive', label: 'Very Active',        desc: '5+ intense workouts per week',       icon: 'barbell-outline' },
];

const ITEM_H = 50;
const STEPS  = 4;

// ─── Inline scroll wheel ──────────────────────────────────────────────────────
function InlineWheel({ label, options, initialIndex, onChange }) {
  const c = useTheme();
  const scrollRef = useRef(null);
  const [idx, setIdx] = useState(initialIndex);

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: initialIndex * ITEM_H, animated: false });
    }, 100);
    return () => clearTimeout(t);
  }, []);

  const snapToNearest = (e) => {
    const raw     = e.nativeEvent.contentOffset.y / ITEM_H;
    const snapped = Math.max(0, Math.min(Math.round(raw), options.length - 1));
    setIdx(snapped);
    onChange(snapped);
    // Do NOT call scrollTo here — snapToInterval owns the scroll position
  };

  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 10, fontWeight: '800', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 10 }}>
        {label}
      </Text>
      <View style={{ height: ITEM_H * 3, overflow: 'hidden', width: '100%' }}>

        {/* Border-only center highlight — sits behind scroll content via zIndex -1 */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', zIndex: -1,
            top: ITEM_H, left: 6, right: 6, height: ITEM_H,
            borderRadius: 12,
            borderWidth: 1.5, borderColor: c.accent + '88',
            backgroundColor: c.accent + '18',
          }}
        />

        <ScrollView
          ref={scrollRef}
          snapToInterval={ITEM_H}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingVertical: ITEM_H }}
          onMomentumScrollEnd={snapToNearest}
          onScrollEndDrag={snapToNearest}
        >
          {options.map((opt, i) => {
            const sel = i === idx;
            return (
              <TouchableOpacity
                key={i}
                activeOpacity={0.6}
                style={{ height: ITEM_H, justifyContent: 'center', alignItems: 'center' }}
                onPress={() => {
                  setIdx(i);
                  onChange(i);
                  scrollRef.current?.scrollTo({ y: i * ITEM_H, animated: true });
                }}
              >
                <Text style={{
                  fontSize:      sel ? 22 : 13,
                  fontWeight:    sel ? '800' : '400',
                  color:         sel ? '#FFFFFF' : c.muted + '80',
                  letterSpacing: sel ? 0.3 : 0,
                }}>
                  {opt}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Top fade — only covers the outermost row, not the center */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: ITEM_H * 0.75, backgroundColor: c.card, opacity: 0.72 }}
        />
        {/* Bottom fade */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: ITEM_H * 0.75, backgroundColor: c.card, opacity: 0.72 }}
        />
      </View>
    </View>
  );
}

// ─── Main onboarding screen ───────────────────────────────────────────────────
export default function OnboardingScreen({ onComplete } = {}) {
  const { dispatch } = useApp();
  const c = useTheme();

  const [step,     setStep]    = useState(0);
  const slideAnim              = useRef(new Animated.Value(0)).current;
  const nameInputRef           = useRef(null);

  // Field state — defaults to sane middle values
  const [name,     setName]    = useState('');
  const [ageIdx,   setAgeIdx]  = useState(15);                              // 28 yrs
  const [htIdx,    setHtIdx]   = useState(HEIGHT_OPTIONS.indexOf("5'10\"")); // 5'10"
  const [wtIdx,    setWtIdx]   = useState(95);                              // 175 lbs
  const [goal,     setGoal]    = useState(null);
  const [activity, setActivity] = useState(null);

  const canContinue = () => {
    if (step === 0) return name.trim().length > 0;
    if (step === 2) return goal !== null;
    if (step === 3) return activity !== null;
    return true;
  };

  // Slide left = forward, slide right = back
  const slideTo = (nextStep, dir = 1) => {
    Animated.timing(slideAnim, { toValue: -W * dir, duration: 210, useNativeDriver: true }).start(() => {
      setStep(nextStep);
      slideAnim.setValue(W * dir);
      Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    });
  };

  const goNext = () => {
    if (!canContinue()) return;
    if (step < STEPS - 1) slideTo(step + 1, 1);
    else handleSubmit();
  };

  const goBack = () => {
    if (step > 0) slideTo(step - 1, -1);
  };

  // Auto-focus name input on step 0
  useEffect(() => {
    if (step === 0) {
      const t = setTimeout(() => nameInputRef.current?.focus(), 320);
      return () => clearTimeout(t);
    }
  }, [step]);

  const handleSubmit = () => {
    const htStr   = HEIGHT_OPTIONS[htIdx];
    const [ftPart, inPart] = htStr.replace('"', '').split("'");
    const totalInches = parseInt(ftPart) * 12 + parseInt(inPart || '0');

    dispatch({
      type: 'COMPLETE_ONBOARDING',
      payload: {
        name:          name.trim(),
        gender:        'male',
        age:           String(ageIdx + 13),
        height:        String(totalInches),
        weight:        String(wtIdx + 80),
        goal,
        activityLevel: activity,
        units:         'imperial',
      },
    });
    onComplete?.();
  };

  // ── Step renderers ──────────────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {

      // Step 0 — Value message + Name
      case 0:
        return (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={20}
          >
            <View style={{ flex: 1, justifyContent: 'center', gap: 24 }}>
              {/* Value message */}
              <View style={{
                backgroundColor: c.accentDim,
                borderRadius: 20, borderWidth: 1, borderColor: c.accent + '44',
                padding: 20,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <View style={{
                    width: 30, height: 30, borderRadius: 9,
                    backgroundColor: c.accent,
                    justifyContent: 'center', alignItems: 'center',
                  }}>
                    <Ionicons name="sparkles" size={16} color="#FFF" />
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: c.accent, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                    Why FoodChat AI
                  </Text>
                </View>
                <Text style={{ fontSize: 15, color: c.white, lineHeight: 24 }}>
                  FoodChat AI handles the thinking for you. Just tell it what you eat using the voice chat. No typing or photos. Get real-time guidance tailored to your goals.
                </Text>
              </View>

              {/* Name input */}
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 30, fontWeight: '800', color: c.white, lineHeight: 36 }}>
                  What's your name?
                </Text>
                <Text style={{ fontSize: 14, color: c.muted, lineHeight: 20 }}>
                  The AI will use this to personalize your experience
                </Text>
                <TextInput
                  ref={nameInputRef}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor={c.muted}
                  selectionColor={c.accent}
                  returnKeyType="done"
                  onSubmitEditing={goNext}
                  style={{
                    fontSize: 20, fontWeight: '600', color: c.white,
                    backgroundColor: c.card,
                    borderWidth: 1.5,
                    borderColor: name.trim() ? c.accent : c.border,
                    borderRadius: 16,
                    paddingHorizontal: 18, paddingVertical: 16,
                    marginTop: 6,
                    outlineStyle: 'none',
                  }}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        );

      // Step 1 — Physical stats (3 inline wheels)
      case 1:
        return (
          <View style={{ flex: 1, justifyContent: 'center', gap: 28 }}>
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 30, fontWeight: '800', color: c.white, lineHeight: 36 }}>
                Your stats
              </Text>
              <Text style={{ fontSize: 14, color: c.muted, lineHeight: 20 }}>
                Used to calculate your personalized calorie and macro targets
              </Text>
            </View>
            <View style={{
              backgroundColor: c.card, borderRadius: 22,
              borderWidth: 1, borderColor: c.border,
              padding: 20, flexDirection: 'row',
            }}>
              <InlineWheel
                label="Age (yrs)"
                options={AGE_OPTIONS}
                initialIndex={ageIdx}
                onChange={setAgeIdx}
              />
              <View style={{ width: 1, backgroundColor: c.border, alignSelf: 'stretch', marginVertical: 4, marginHorizontal: 4 }} />
              <InlineWheel
                label="Height"
                options={HEIGHT_OPTIONS}
                initialIndex={htIdx}
                onChange={setHtIdx}
              />
              <View style={{ width: 1, backgroundColor: c.border, alignSelf: 'stretch', marginVertical: 4, marginHorizontal: 4 }} />
              <InlineWheel
                label="Weight (lbs)"
                options={WEIGHT_OPTIONS}
                initialIndex={wtIdx}
                onChange={setWtIdx}
              />
            </View>
          </View>
        );

      // Step 2 — Goal
      case 2:
        return (
          <View style={{ flex: 1, justifyContent: 'center', gap: 24 }}>
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 30, fontWeight: '800', color: c.white, lineHeight: 36 }}>
                What's your goal?
              </Text>
              <Text style={{ fontSize: 14, color: c.muted, lineHeight: 20 }}>
                This shapes your daily targets and every AI recommendation
              </Text>
            </View>
            <View style={{ gap: 12 }}>
              {GOALS.map((g) => {
                const sel = goal === g.key;
                return (
                  <TouchableOpacity
                    key={g.key}
                    activeOpacity={0.8}
                    onPress={() => setGoal(g.key)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 16,
                      backgroundColor: sel ? c.accentDim : c.card,
                      borderRadius: 20, padding: 18,
                      borderWidth: sel ? 1.5 : 1,
                      borderColor: sel ? c.accent : c.border,
                    }}
                  >
                    <View style={{
                      width: 52, height: 52, borderRadius: 16,
                      backgroundColor: sel ? c.accent : c.card2,
                      justifyContent: 'center', alignItems: 'center',
                    }}>
                      <Ionicons name={g.icon} size={24} color={sel ? '#FFF' : g.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: c.white }}>{g.label}</Text>
                      <Text style={{ fontSize: 12, color: c.muted, marginTop: 3 }}>{g.desc}</Text>
                    </View>
                    {sel
                      ? <Ionicons name="checkmark-circle" size={24} color={c.accent} />
                      : <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: c.border }} />
                    }
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      // Step 3 — Activity level
      case 3:
        return (
          <View style={{ flex: 1, justifyContent: 'center', gap: 20 }}>
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 30, fontWeight: '800', color: c.white, lineHeight: 36 }}>
                How active are you?
              </Text>
              <Text style={{ fontSize: 14, color: c.muted, lineHeight: 20 }}>
                Be honest — this directly affects your calorie targets
              </Text>
            </View>
            <View style={{ gap: 10 }}>
              {ACTIVITIES.map((a) => {
                const sel = activity === a.key;
                return (
                  <TouchableOpacity
                    key={a.key}
                    activeOpacity={0.8}
                    onPress={() => setActivity(a.key)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 16,
                      backgroundColor: sel ? c.accentDim : c.card,
                      borderRadius: 18, padding: 16,
                      borderWidth: sel ? 1.5 : 1,
                      borderColor: sel ? c.accent : c.border,
                    }}
                  >
                    <View style={{
                      width: 46, height: 46, borderRadius: 14,
                      backgroundColor: sel ? c.accent : c.card2,
                      justifyContent: 'center', alignItems: 'center',
                    }}>
                      <Ionicons name={a.icon} size={21} color={sel ? '#FFF' : c.muted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: c.white }}>{a.label}</Text>
                      <Text style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{a.desc}</Text>
                    </View>
                    {sel
                      ? <Ionicons name="checkmark-circle" size={22} color={c.accent} />
                      : <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.border }} />
                    }
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  const ready = canContinue();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={c.statusBar} />

      {/* Subtle accent glows in the background */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <View style={{ position: 'absolute', top: -100, right: -80,  width: 320, height: 320, borderRadius: 160, backgroundColor: c.accent, opacity: 0.07 }} />
        <View style={{ position: 'absolute', bottom: 60,  left: -160, width: 400, height: 400, borderRadius: 200, backgroundColor: c.accent, opacity: 0.04 }} />
      </View>

      {/* ── Top bar: back + animated progress dots ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 }}>
        {step > 0
          ? (
            <TouchableOpacity onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="arrow-back" size={22} color={c.white} />
            </TouchableOpacity>
          )
          : <View style={{ width: 22 }} />
        }
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
          {Array.from({ length: STEPS }).map((_, i) => (
            <View
              key={i}
              style={{
                height: 7,
                width:  i === step ? 24 : 7,
                borderRadius: 4,
                backgroundColor: i === step ? c.accent : i < step ? c.accent + '66' : c.border,
              }}
            />
          ))}
        </View>
        <View style={{ width: 22 }} />
      </View>

      {/* ── Animated step content ── */}
      <Animated.View style={{ flex: 1, paddingHorizontal: 22, paddingBottom: 8, transform: [{ translateX: slideAnim }] }}>
        {renderStep()}
      </Animated.View>

      {/* ── Continue / Get Started button ── */}
      <View style={{ paddingHorizontal: 22, paddingBottom: 24 }}>
        <TouchableOpacity
          onPress={goNext}
          activeOpacity={ready ? 0.85 : 1}
          style={{
            backgroundColor: ready ? c.accent : c.card,
            borderRadius: 18,
            paddingVertical: 18,
            alignItems: 'center',
            borderWidth: 1,
            borderColor:    ready ? c.accent : c.border,
            shadowColor:    ready ? c.accent : 'transparent',
            shadowOffset:   { width: 0, height: 6 },
            shadowOpacity:  0.45,
            shadowRadius:   14,
            elevation:      ready ? 10 : 0,
          }}
        >
          <Text style={{
            fontSize: 16, fontWeight: '800', letterSpacing: 0.4,
            color: ready ? '#FFFFFF' : c.muted,
          }}>
            {step === STEPS - 1 ? 'Get Started' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
