import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { useTheme, useApp } from '../context/AppContext';
import { useMealContext } from '../context/MealContext';
import MealEditModal from '../components/MealEditModal';
import { getTodayKey, getDateKey, computeStreak } from '../utils/nutrition';

// ─── Date helpers ─────────────────────────────────────────────────────────────
function shiftDate(dateKey, days) {
  const d = new Date(dateKey + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return getDateKey(d);
}

function formatNavDate(dateKey) {
  const today = getTodayKey();
  if (dateKey === today) return 'Today';
  const yesterday = shiftDate(today, -1);
  if (dateKey === yesterday) return 'Yesterday';
  const d = new Date(dateKey + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatSubDate(dateKey) {
  const d = new Date(dateKey + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

// ─── Animated counter hook ────────────────────────────────────────────────────
// `precision`: null = auto (integer or 1dp), number = fixed decimal places.
// Used with precision=4 for the arc ring so the SVG draws smoothly.
function useAnimatedValue(target, duration = 350, precision = null) {
  const animValue  = useRef(new Animated.Value(target)).current;
  const prevTarget = useRef(target);
  const [displayed, setDisplayed] = useState(target);

  useEffect(() => {
    if (prevTarget.current === target) return;
    prevTarget.current = target;

    const round = (v) => {
      if (precision !== null) {
        const f = Math.pow(10, precision);
        return Math.round(v * f) / f;
      }
      return Number.isInteger(target) ? Math.round(v) : Math.round(v * 10) / 10;
    };

    const anim = Animated.timing(animValue, {
      toValue:         target,
      duration,
      useNativeDriver: false,
    });

    const id = animValue.addListener(({ value }) => setDisplayed(round(value)));

    anim.start(({ finished }) => {
      animValue.removeListener(id);
      if (finished) setDisplayed(target);
    });

    return () => { anim.stop(); animValue.removeListener(id); };
  }, [target]);

  return displayed;
}

// ─── Open arc (270°, gap at the bottom) ──────────────────────────────────────
function ArcRing({ size, strokeWidth, progress, color, trackColor, children }) {
  const r      = (size - strokeWidth) / 2;
  const C      = 2 * Math.PI * r;
  const arcLen = C * 0.77;
  const p      = Math.min(Math.max(progress, 0), 1);

  return (
    <View style={{ width: size, height: size }}>
      <Svg
        width={size} height={size}
        style={{ position: 'absolute', transform: [{ rotate: '131.4deg' }] }}
      >
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${arcLen} ${C - arcLen}`}
          strokeLinecap="round"
        />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${arcLen * p} ${C}`}
          strokeLinecap="round"
        />
      </Svg>
      {children && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          justifyContent: 'center', alignItems: 'center',
        }}>
          {children}
        </View>
      )}
    </View>
  );
}

// ─── Animated horizontal macro bar ───────────────────────────────────────────
function MacroBar({ label, consumed, goal, unit, color, c }) {
  const rounded   = Math.round(consumed);
  const targetPct = Math.min(1, goal > 0 ? rounded / goal : 0);

  const displayNum = useAnimatedValue(rounded, 350);

  const barAnim = useRef(new Animated.Value(targetPct)).current;
  const prevPct = useRef(targetPct);

  useEffect(() => {
    if (prevPct.current === targetPct) return;
    prevPct.current = targetPct;
    Animated.timing(barAnim, {
      toValue:         targetPct,
      duration:        420,
      useNativeDriver: false,
    }).start();
  }, [targetPct]);

  const barWidth = barAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '100%'],
  });

  const displayRounded = Math.round(displayNum);
  const remaining      = Math.max(0, goal - displayRounded);
  const over           = displayRounded > goal;

  return (
    <View style={{ flex: 1, gap: 5 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.7 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 15, fontWeight: '800', color: c.white }}>
        {displayRounded}
        <Text style={{ fontSize: 11, fontWeight: '500', color: c.muted }}>/{goal}{unit}</Text>
      </Text>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: c.track, overflow: 'hidden' }}>
        <Animated.View style={{ height: '100%', width: barWidth, borderRadius: 2, backgroundColor: color }} />
      </View>
      <Text style={{ fontSize: 10, color: over ? c.red : c.muted }}>
        {over ? `${displayRounded - goal}${unit} over` : `${remaining}${unit} left`}
      </Text>
    </View>
  );
}

// ─── AI Insight ───────────────────────────────────────────────────────────────
function getInsight(totals, goals) {
  const calPct     = goals.calories > 0 ? totals.calories / goals.calories : 0;
  const proteinPct = goals.protein  > 0 ? totals.protein  / goals.protein  : 0;

  if (calPct < 0.05) {
    return {
      icon: 'sunny-outline', iconColor: '#F59E0B', iconBg: '#2D1F00',
      label: 'Morning Tip',
      message: "Great day to hit your goals! Want a personalized meal plan to start strong?",
      buttonLabel: 'Build My Plan',
      preset: 'Give me a personalized meal plan for today based on my daily calorie and macro targets.',
    };
  }
  if (calPct >= 1.0) {
    return {
      icon: 'flame-outline', iconColor: '#FF6B00', iconBg: '#2D1100',
      label: 'Heads Up',
      message: "You've hit your calorie limit — want some lighter options if you get hungry?",
      buttonLabel: 'Get Suggestions',
      preset: "I've reached my calorie limit today. Suggest some very light, low-calorie options in case I get hungry.",
    };
  }
  if (proteinPct < 0.4 && calPct > 0.25) {
    return {
      icon: 'alert-circle-outline', iconColor: '#EF4444', iconBg: '#2D0A0A',
      label: 'AI Insight',
      message: "You're low on protein today — want suggestions to hit your target?",
      buttonLabel: 'Get Suggestions',
      preset: 'I am low on protein today. Suggest high-protein foods or meals I can add to hit my daily protein target.',
    };
  }
  return {
    icon: 'checkmark-circle-outline', iconColor: '#4CAF50', iconBg: '#0A2D0A',
    label: 'AI Insight',
    message: "You're on track today — keep it up! Want ideas for your next meal?",
    buttonLabel: 'Get Suggestions',
    preset: 'Give me food suggestions for my next meal based on my remaining macros and daily targets.',
  };
}

function AIInsightBanner({ totals, goals, c }) {
  const navigation = useNavigation();
  const insight    = getInsight(totals, goals);
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.card, borderRadius: 18, borderWidth: 1, borderColor: c.border,
      padding: 14, marginBottom: 14, gap: 12,
    }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: insight.iconBg }}>
        <Ionicons name={insight.icon} size={20} color={insight.iconColor} />
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {insight.label}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '600', color: c.white, lineHeight: 19 }}>
          {insight.message}
        </Text>
        <TouchableOpacity
          style={{ alignSelf: 'flex-start', backgroundColor: c.accentDim, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: c.accent + '55' }}
          onPress={() => navigation.navigate('Helper', { preset: insight.preset })}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: c.accent }}>{insight.buttonLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Meal card ────────────────────────────────────────────────────────────────
function MealCard({ meal, c, onPress }) {
  const kcal = meal.kcal ?? meal.calories ?? 0;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={{
        backgroundColor: c.card, borderRadius: 18, marginBottom: 12,
        borderWidth: 1, borderColor: c.border,
        overflow: 'hidden', alignSelf: 'stretch',
      }}
    >
      <View style={{ flexDirection: 'row', padding: 12, gap: 12, alignItems: 'center' }}>
        <Image
          source={{ uri: meal.uri }}
          style={{ width: 72, height: 72, borderRadius: 12, flexShrink: 0, backgroundColor: meal.fallbackColor || '#2A2A3A' }}
          resizeMode="cover"
        />
        {/* minWidth: 0 is required for flex children to shrink below their content size */}
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.white, flex: 1, minWidth: 0 }} numberOfLines={1}>
              {meal.name}
            </Text>
            <Text style={{ fontSize: 11, color: c.muted, marginLeft: 8, flexShrink: 0 }}>{meal.time}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="flame" size={13} color={c.fire} />
            <Text style={{ fontSize: 13, color: c.white, fontWeight: '600', marginLeft: 3 }}>{kcal} kcal</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              { icon: 'flash',   color: c.protein, value: Math.round(meal.protein), unit: 'g' },
              { icon: 'leaf',    color: c.carbs,   value: Math.round(meal.carbs),   unit: 'g' },
              { icon: 'ellipse', color: c.fat,      value: Math.round(meal.fat),     unit: 'g' },
            ].map((chip) => (
              <View key={chip.icon} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name={chip.icon} size={11} color={chip.color} />
                <Text style={{ fontSize: 11, color: c.muted }}>{chip.value}{chip.unit}</Text>
              </View>
            ))}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={15} color={c.muted} style={{ flexShrink: 0 }} />
      </View>
    </TouchableOpacity>
  );
}

function EmptyMeals({ c, isToday }) {
  return (
    <View style={{
      alignItems: 'center', justifyContent: 'center', paddingVertical: 44, gap: 10,
      backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.border,
    }}>
      <Ionicons name="restaurant-outline" size={38} color="#9CA3AF" />
      <Text style={{ fontSize: 15, fontWeight: '600', color: c.muted }}>
        {isToday ? 'No meals recorded today.' : 'No meals logged this day.'}
      </Text>
      {isToday && (
        <Text style={{ fontSize: 12, color: c.muted, opacity: 0.6, textAlign: 'center', paddingHorizontal: 24 }}>
          Tap "Speak to AI" or use the mic to log your first meal.
        </Text>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const navigation = useNavigation();
  const { state }  = useApp();
  const c          = useTheme();

  // Live in-memory totals from MealContext — updated immediately on add/edit/remove
  const { totals: liveTotals, loggedMeals: liveMeals } = useMealContext();

  const today = getTodayKey();
  const [selectedDate, setSelectedDate] = useState(today);
  const isToday = selectedDate === today;
  const [editingMeal, setEditingMeal] = useState(null);

  const goBack    = () => setSelectedDate((d) => shiftDate(d, -1));
  const goForward = () => { if (!isToday) setSelectedDate((d) => shiftDate(d, 1)); };

  // Today → live MealContext (instant on any meal change)
  // Past  → persisted dailyLogs (read-only history)
  const rawLog = state.dailyLogs?.[selectedDate] || {};
  const dayTotals = isToday
    ? {
        calories: liveTotals.calories,
        protein:  liveTotals.protein,
        carbs:    liveTotals.carbs,
        fat:      liveTotals.fat,
      }
    : {
        calories: rawLog.calories || 0,
        protein:  rawLog.protein  || 0,
        carbs:    rawLog.carbs    || 0,
        fat:      rawLog.fat      || 0,
      };

  const dayMeals = isToday
    ? liveMeals.map((m) => ({ ...m, kcal: m.kcal ?? m.calories ?? 0 }))
    : (rawLog.meals || []).map((m) => ({ ...m, kcal: m.kcal ?? m.calories ?? 0 }));

  const streak = useMemo(() => computeStreak(state.dailyLogs), [state.dailyLogs]);

  const p = state.userProfile;
  const GOALS = {
    calories: p.calorieTarget || 2000,
    protein:  p.proteinTarget || 150,
    carbs:    p.carbTarget    || 225,
    fat:      p.fatTarget     || 56,
  };

  const caloriesConsumed = Math.round(dayTotals.calories);
  const caloriesLeft     = Math.max(0, GOALS.calories - caloriesConsumed);
  const calProgress      = Math.min(1, GOALS.calories > 0 ? caloriesConsumed / GOALS.calories : 0);

  // Animated values — drive the calorie ring and the EATEN/REMAINING labels
  const animCalEaten = useAnimatedValue(caloriesConsumed, 350);
  const animCalLeft  = useAnimatedValue(caloriesLeft,     350);
  // precision=4 so the arc SVG interpolates smoothly (not just 0.1 steps)
  const animArcProg  = useAnimatedValue(calProgress,      500, 4);

  const darkMode       = state.settings?.darkMode !== false;
  const gradientColors = darkMode
    ? [c.accent, '#3D2F9E', '#1C1640', c.bg]
    : [c.accent, '#A090E8', '#D4CEFC', c.bg];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>

        {/* ══ GRADIENT HERO SECTION ══════════════════════════════════════════ */}
        <LinearGradient
          colors={gradientColors}
          locations={[0, 0.35, 0.65, 1]}
          style={{ paddingHorizontal: 20, paddingBottom: 40 }}
        >
          {/* ── App header row ── */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, paddingBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="restaurant-outline" size={24} color="#FFFFFF" />
              <Text style={{ fontSize: 22, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2 }}>FoodChat AI</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7 }}>
              <Ionicons name="flame" size={15} color="#FFD166" />
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>{streak}</Text>
            </View>
          </View>

          {/* ── Date navigation ── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20, gap: 16 }}>
            <TouchableOpacity
              onPress={goBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>

            <View style={{ alignItems: 'center', gap: 2 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {formatNavDate(selectedDate)}
              </Text>
              {!isToday && (
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.3 }}>
                  {formatSubDate(selectedDate)}
                </Text>
              )}
            </View>

            <TouchableOpacity
              onPress={goForward}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ opacity: isToday ? 0.3 : 1 }}
              disabled={isToday}
            >
              <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          </View>

          {/* ── Calorie ring — centered hero ── */}
          {(() => {
            // Light mode needs stronger contrast against the faded lavender gradient
            const shadow = darkMode ? null : {
              textShadowColor:  'rgba(40,20,120,0.45)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 6,
            };
            return (
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <ArcRing
                  size={214}
                  strokeWidth={13}
                  progress={animArcProg}
                  color="#FFFFFF"
                  trackColor={darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(60,40,160,0.22)'}
                >
                  <View style={{ alignItems: 'center', gap: 2 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.8, ...shadow }}>
                      Remaining
                    </Text>
                    <Text style={{ fontSize: 46, fontWeight: '800', color: '#FFFFFF', letterSpacing: -1.5, lineHeight: 52, ...shadow }}>
                      {Math.round(animCalLeft).toLocaleString()}
                    </Text>
                    <Text style={{ fontSize: 12, color: darkMode ? '#FFFFFF99' : '#FFFFFFdd', ...shadow }}>
                      /{GOALS.calories.toLocaleString()} kcal
                    </Text>
                    <Text style={{ fontSize: 11, color: darkMode ? '#FFFFFF66' : '#FFFFFFbb', marginTop: 4, ...shadow }}>
                      {Math.round(animCalEaten).toLocaleString()} kcal consumed
                    </Text>
                  </View>
                </ArcRing>
              </View>
            );
          })()}

        </LinearGradient>

        {/* ══ MACRO BARS CARD — floats over bottom of gradient ══════════════ */}
        <View style={{
          flexDirection: 'row',
          backgroundColor: c.card,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: c.border,
          padding: 16,
          marginHorizontal: 16,
          marginTop: -28,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: darkMode ? 0.30 : 0.10,
          shadowRadius: 12,
          elevation: 6,
        }}>
          <MacroBar label="Protein" consumed={dayTotals.protein} goal={GOALS.protein} unit="g" color={c.protein} c={c} />
          <View style={{ width: 1, backgroundColor: c.border, marginHorizontal: 4 }} />
          <MacroBar label="Carbs"   consumed={dayTotals.carbs}   goal={GOALS.carbs}   unit="g" color={c.carbs}   c={c} />
          <View style={{ width: 1, backgroundColor: c.border, marginHorizontal: 4 }} />
          <MacroBar label="Fat"     consumed={dayTotals.fat}     goal={GOALS.fat}     unit="g" color={c.fat}     c={c} />
        </View>

        {/* ══ CONTENT BELOW GRADIENT ═════════════════════════════════════════ */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>

          {isToday && (
            <AIInsightBanner totals={dayTotals} goals={GOALS} c={c} />
          )}

          <Text style={{ fontSize: 18, fontWeight: '700', color: c.white, marginBottom: 12 }}>
            {isToday ? 'Recent Meals' : 'Meals Logged'}
          </Text>

          {dayMeals.length === 0
            ? <EmptyMeals c={c} isToday={isToday} />
            : dayMeals.map((m, i) => (
                <MealCard
                  key={m.id ?? `meal_${i}`}
                  meal={m}
                  c={c}
                  onPress={() => setEditingMeal(m)}
                />
              ))
          }
        </View>

      </ScrollView>

      <MealEditModal
        visible={!!editingMeal}
        meal={editingMeal}
        date={selectedDate}
        onClose={() => setEditingMeal(null)}
      />

    </SafeAreaView>
  );
}
