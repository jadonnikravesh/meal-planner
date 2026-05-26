import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Modal, ScrollView,
  Animated, Dimensions, KeyboardAvoidingView, Platform, StyleSheet, LayoutAnimation,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useApp, useTheme } from '../context/AppContext';
import { DEV_MODE } from '../config/testMode';

const { width: W, height: SCREEN_H } = Dimensions.get('window');
const FULL_H = Dimensions.get('screen').height;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function getCalData(gender, ageText, htFt, htIn, wtText, weightUnit, activity, goal, speed) {
  const ageNum = parseInt(ageText) || 25;
  const totalIn = (parseInt(htFt) || 5) * 12 + (parseInt(htIn) || 8);
  const htCm    = totalIn * 2.54;
  const wVal    = parseFloat(wtText) || 70;
  const wKg     = weightUnit === 'imperial' ? wVal * 0.453592 : wVal;
  const bmr     = gender === 'female'
    ? 10 * wKg + 6.25 * htCm - 5 * ageNum - 161
    : 10 * wKg + 6.25 * htCm - 5 * ageNum + 5;
  const am = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, veryActive: 1.9 };
  const tdee = bmr * (am[activity] || 1.375);
  let target = goal === 'loseFat'
    ? tdee - ({ recommended: 500, fast: 750, slow: 250 }[speed] || 500)
    : goal === 'gainMuscle'
    ? tdee + ({ recommended: 300, fast: 500, slow: 150 }[speed] || 300)
    : tdee;
  target      = Math.max(1200, Math.round(target));
  const minCal = Math.max(1200, Math.round(target * 0.9));
  const maxCal = Math.round(target * 1.1);
  const prot   = Math.round((target * 0.30) / 4);
  const carbs  = Math.round((target * 0.40) / 4);
  const fat    = Math.round((target * 0.30) / 9);
  // Fixed visual layout: target=50%, min=35%, max=65% on the track
  // Derived from: trackStart + 0.35*range = minCal, trackStart + 0.5*range = target
  // → trackStart = (minCal - 0.70*target) / 0.30
  const trackStart = Math.round((minCal - 0.70 * target) / 0.30);
  return { target, minCal, maxCal, prot, carbs, fat, trackStart };
}

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

const STEPS = 11;

const SPEEDS = [
  {
    key: 'recommended', label: 'Recommended',
    pros: ['Significant fat loss without reducing muscle mass', 'Visible results in the short term', 'Sustainable diet'],
    cons: [],
  },
  {
    key: 'fast', label: 'Fast',
    pros: ['Visible results in less time'],
    cons: ['Possible slight loss of lean body mass due to a larger calorie deficit', 'More restrictive diet'],
  },
  {
    key: 'slow', label: 'Slow',
    pros: ['Flexible and less restrictive diet', 'Possible muscle mass growth (if strength training is performed)'],
    cons: ['Results may take a little longer to be visible'],
  },
];

const DIETS = [
  { key: 'recommended', label: 'Recommended',  desc: 'Best match for you. Optimal mix of protein, carbs, and fats', icon: 'sparkles'          },
  { key: 'highProtein', label: 'High Protein',  desc: 'More protein, less carbs and fats',                          icon: 'nutrition-outline'  },
  { key: 'lowCarb',     label: 'Low-Carb',      desc: 'Fewer carbs, higher fats and moderate protein',              icon: 'leaf-outline'       },
  { key: 'keto',        label: 'Keto',          desc: 'Very low in carbs, high fat and moderate protein',           icon: 'flame-outline'      },
  { key: 'lowFat',      label: 'Low-Fat',       desc: 'Fewer fats, higher carbs and moderate protein',              icon: 'restaurant-outline' },
];

const LIFESTYLES = [
  { key: 'sedentary',  label: 'Mostly Sitting',       desc: 'Desk job or home-based',                icon: 'desktop-outline'   },
  { key: 'light',      label: 'On My Feet Sometimes', desc: 'Mix of sitting and moving',             icon: 'walk-outline'      },
  { key: 'moderate',   label: 'Mostly on My Feet',    desc: 'Standing or walking regularly',         icon: 'body-outline'      },
  { key: 'active',     label: 'Moving All Day',       desc: 'Physical work or frequent walking',     icon: 'bicycle-outline'   },
  { key: 'veryActive', label: 'Hard Physical Work',   desc: 'Heavy labor',                           icon: 'construct-outline' },
];

const APPROACHES = [
  { key: 'mealPlan',    label: 'I need a meal plan',       desc: "I don't know what to eat. I need personalized meal suggestions.",  icon: 'restaurant-outline' },
  { key: 'trackFoods',  label: 'I need to track my foods', desc: 'I know what to eat. I need to track my calories and macronutrients.', icon: 'bar-chart-outline'  },
];

// ─── Stats row ────────────────────────────────────────────────────────────────
function StatRow({ icon, label, value, onPress }) {
  const c = useTheme();
  const rowStyle = {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: c.card, borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: value ? c.accent + '55' : c.border,
  };
  const inner = (
    <>
      <View style={{
        width: 48, height: 48, borderRadius: 14,
        backgroundColor: value ? c.accentDim : c.card2,
        justifyContent: 'center', alignItems: 'center',
      }}>
        <Ionicons name={icon} size={22} color={c.accent} />
      </View>
      <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: c.white }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: '600', color: value ? c.white : c.accent }}>
        {value || 'Select'}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={c.accent} />
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={rowStyle}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={rowStyle}>{inner}</View>;
}

// ─── Stats centered modal card ────────────────────────────────────────────────
function StatsModal({ visible, onClose, title, children }) {
  const c = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Backdrop */}
      <TouchableOpacity
        style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
        activeOpacity={1}
        onPress={onClose}
      />
      {/* Card container — pinned to physical screen height so keyboard resize can't shift it */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute', top: 0, left: 0,
          width: W, height: FULL_H,
          justifyContent: 'center', alignItems: 'center',
          padding: 28,
        }}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ width: '100%', maxWidth: 420 }}>
          <View style={{
            backgroundColor: c.card,
            borderRadius: 24,
            paddingHorizontal: 24,
            paddingVertical: 28,
            width: '100%',
          }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: c.white, textAlign: 'center', marginBottom: 22 }}>
              {title}
            </Text>
            {children}
          </View>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Main onboarding screen ───────────────────────────────────────────────────
export default function OnboardingScreen({ onComplete, onGoBack, initialStep = 0 } = {}) {
  const { dispatch } = useApp();
  const c = useTheme();

  const [step,     setStep]    = useState(initialStep);
  const slideAnim              = useRef(new Animated.Value(0)).current;
  const nameInputRef           = useRef(null);
  const goalScales             = useRef(GOALS.map(() => new Animated.Value(1))).current;
  const approachScales         = useRef(APPROACHES.map(() => new Animated.Value(1))).current;
  const activityScales         = useRef(ACTIVITIES.map(() => new Animated.Value(1))).current;
  const strengthScales         = useRef([new Animated.Value(1), new Animated.Value(1)]).current;
  const lifestyleScales        = useRef(LIFESTYLES.map(() => new Animated.Value(1))).current;
  const dietScales             = useRef(DIETS.map(() => new Animated.Value(1))).current;

  // Transition page animation values
  const transScale       = useRef(new Animated.Value(0)).current;
  const transFireFade    = useRef(new Animated.Value(0)).current;
  // Ring opacity (fades in once, stays fixed)
  const transRing1Op     = useRef(new Animated.Value(0)).current;
  const transRing2Op     = useRef(new Animated.Value(0)).current;
  const transRing3Op     = useRef(new Animated.Value(0)).current;
  // Ring scale (breathes independently)
  const transRing1Scale  = useRef(new Animated.Value(1)).current;
  const transRing2Scale  = useRef(new Animated.Value(1)).current;
  const transRing3Scale  = useRef(new Animated.Value(1)).current;
  const transFade        = useRef(new Animated.Value(0)).current;
  const transButtonFade  = useRef(new Animated.Value(0)).current;

  // Calorie reveal page (step 10)
  const sliderAnim   = useRef(new Animated.Value(0)).current;
  const calLabelFade = useRef(new Animated.Value(0)).current;

  // Check animation page (step 9)
  const chkArcDash   = useRef(new Animated.Value(1)).current;  // 1=empty arc, 0=full
  const chkMarkFade  = useRef(new Animated.Value(0)).current;
  const chkMarkScale = useRef(new Animated.Value(0.5)).current;
  const chkScale     = useRef(new Animated.Value(1)).current;  // container scale (pulse → shrink)
  const chkMoveY       = useRef(new Animated.Value(0)).current;
  const calContentFade = useRef(new Animated.Value(0)).current;

  // Background glob drift — starts on mount, runs forever
  const glob1X = useRef(new Animated.Value(0)).current;
  const glob1Y = useRef(new Animated.Value(0)).current;
  const glob2X = useRef(new Animated.Value(0)).current;
  const glob2Y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let rafId;
    let start = null;
    const tick = (ts) => {
      if (!start) start = ts;
      const t = ts - start;
      glob1X.setValue(75 * Math.sin(t / 4200));
      glob1Y.setValue(85 * Math.sin(t / 5800));
      glob2X.setValue(80 * Math.sin(t / 6100 + 2.0));
      glob2Y.setValue(70 * Math.sin(t / 4700 + 1.3));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Field state
  const [name,       setName]       = useState('');
  const [gender,     setGender]     = useState(null);
  const [ageText,    setAgeText]    = useState('');
  const [htFt,       setHtFt]       = useState('');
  const [htIn,       setHtIn]       = useState('');
  const [wtText,     setWtText]     = useState('');
  const [weightUnit, setWeightUnit] = useState('imperial');
  const [goal,       setGoal]       = useState(null);
  const [approach,   setApproach]   = useState(null);
  const [activity,          setActivity]          = useState(null);
  const [strengthTraining,  setStrengthTraining]  = useState(null);
  const [lifestyle,         setLifestyle]         = useState(null);
  const [diet,              setDiet]              = useState(null);
  const [goalWtText,        setGoalWtText]        = useState('');
  const [speed,             setSpeed]             = useState(null);
  const [openModal,         setOpenModal]         = useState(null);
  const [displayCal,        setDisplayCal]        = useState(0);
  const [trackW,            setTrackW]            = useState(W - 96);

  const canContinue = () => {
    if (step === 0) return goal !== null;
    if (step === 1) return approach !== null;
    if (step === 3) return gender !== null && ageText.trim() !== '' && htFt !== '' && htIn !== '' && wtText.trim() !== '';
    if (step === 4) return activity !== null;
    if (step === 8) return goalWtText.trim() !== '' && speed !== null;
    return true;
  };

  // Slide left = forward, slide right = back
  const slideTo = (nextStep, dir = 1) => {
    Animated.timing(slideAnim, { toValue: -W * dir, duration: 210, useNativeDriver: false }).start(() => {
      setStep(nextStep);
      slideAnim.setValue(W * dir);
      Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start();
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

  // Auto-focus name input on step 10
  useEffect(() => {
    if (step === 10) {
      const t = setTimeout(() => nameInputRef.current?.focus(), 320);
      return () => clearTimeout(t);
    }
  }, [step]);

  // Transition page animation (step 3)
  useEffect(() => {
    if (step !== 2) return;
    transScale.setValue(0);
    transFireFade.setValue(0);
    transFade.setValue(0);
    transButtonFade.setValue(0);
    [transRing1Op, transRing2Op, transRing3Op].forEach(r => r.setValue(0));
    [transRing1Scale, transRing2Scale, transRing3Scale].forEach(r => r.setValue(1));

    // Opacity fades in once to a fixed value; scale breathes independently
    const startRing = (opAnim, scaleAnim, delay) => {
      setTimeout(() => {
        Animated.timing(opAnim, { toValue: 0.18, duration: 220, useNativeDriver: false }).start();
        Animated.loop(
          Animated.sequence([
            Animated.timing(scaleAnim, { toValue: 1.05, duration: 1800, useNativeDriver: false }),
            Animated.timing(scaleAnim, { toValue: 0.97, duration: 1800, useNativeDriver: false }),
          ])
        ).start();
      }, delay);
    };

    // 150ms blank → fire fades+springs in → rings appear one by one →
    // text fades in → button fades in after
    const t0 = setTimeout(() => {
      Animated.parallel([
        Animated.spring(transScale, { toValue: 1, tension: 28, friction: 8, useNativeDriver: false }),
        Animated.timing(transFireFade, { toValue: 1, duration: 400, useNativeDriver: false }),
      ]).start(() => {
        startRing(transRing3Op, transRing3Scale, 0);
        startRing(transRing2Op, transRing2Scale, 80);
        startRing(transRing1Op, transRing1Scale, 160);
        setTimeout(() => {
          Animated.timing(transFade, { toValue: 1, duration: 350, useNativeDriver: false }).start(() => {
            Animated.timing(transButtonFade, { toValue: 1, duration: 350, useNativeDriver: false }).start();
          });
        }, 1200);
      });
    }, 150);
    return () => clearTimeout(t0);
  }, [step]);

  // Check animation page (step 9)
  useEffect(() => {
    if (step !== 9) return;
    // Reset check animation
    chkArcDash.setValue(1);
    chkMarkFade.setValue(0);
    chkMarkScale.setValue(0.5);
    chkScale.setValue(1);
    chkMoveY.setValue(0);
    // Reset calorie animation
    calContentFade.setValue(0);
    sliderAnim.setValue(0);
    calLabelFade.setValue(0);
    const cd = getCalData(gender, ageText, htFt, htIn, wtText, weightUnit, activity, goal, speed);
    setDisplayCal(cd.trackStart);
    const listenerId = sliderAnim.addListener(({ value }) => {
      setDisplayCal(Math.round(cd.trackStart + value * (cd.target - cd.trackStart)));
    });

    const t = setTimeout(() => {
      // Phase 1: arc sweeps (1100ms)
      Animated.timing(chkArcDash, { toValue: 0, duration: 1100, useNativeDriver: false }).start(() => {
        // Phase 2: checkmark springs in
        Animated.parallel([
          Animated.spring(chkMarkScale, { toValue: 1, tension: 35, friction: 7, useNativeDriver: false }),
          Animated.timing(chkMarkFade,  { toValue: 1, duration: 300, useNativeDriver: false }),
        ]).start(() => {
          // Phase 3: single pulsate
          Animated.sequence([
            Animated.timing(chkScale, { toValue: 1.12, duration: 170, useNativeDriver: false }),
            Animated.timing(chkScale, { toValue: 1.0,  duration: 170, useNativeDriver: false }),
          ]).start(() => {
            // Phase 4: shrink + fly to top
            Animated.parallel([
              Animated.timing(chkScale,  { toValue: 0.33,             duration: 520, useNativeDriver: false }),
              Animated.timing(chkMoveY,  { toValue: -(FULL_H * 0.40), duration: 520, useNativeDriver: false }),
            ]).start(() => {
              // Phase 5: calorie content fades in
              Animated.timing(calContentFade, { toValue: 1, duration: 350, useNativeDriver: false }).start(() => {
                // Phase 6: slider counts up calories
                Animated.timing(sliderAnim, { toValue: 1, duration: 2200, useNativeDriver: false }).start(() => {
                  // Phase 7: labels + macros + Next button
                  Animated.timing(calLabelFade, { toValue: 1, duration: 400, useNativeDriver: false }).start();
                });
              });
            });
          });
        });
      });
    }, 200);
    return () => {
      clearTimeout(t);
      sliderAnim.removeListener(listenerId);
    };
  }, [step]);

  const handleSubmit = () => {
    const totalInches = (parseInt(htFt) || 0) * 12 + (parseInt(htIn) || 0);
    const weightVal   = parseFloat(wtText) || 0;
    const weightLbs   = weightUnit === 'imperial' ? weightVal : weightVal * 2.20462;

    dispatch({
      type: 'COMPLETE_ONBOARDING',
      payload: {
        name:          name.trim(),
        gender:        gender || 'male',
        age:           ageText.trim(),
        height:        String(totalInches),
        weight:        weightLbs.toFixed(1),
        goal,
        activityLevel:    activity,
        strengthTraining: strengthTraining === 'yes',
        lifestyle,
        diet,
        goalWeight: goalWtText ? (weightUnit === 'imperial' ? parseFloat(goalWtText) : parseFloat(goalWtText) * 2.20462).toFixed(1) : null,
        weightLossSpeed: speed,
        units:            'imperial',
      },
    });
    onComplete?.();
  };

  // ── Step renderers ──────────────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {

      // Step 9 — Check animation → calorie reveal (single page)
      case 9: {
        const CIRCLE_R    = 84;
        const STROKE_W    = 11;
        const CIRCLE_SIZE = (CIRCLE_R + STROKE_W) * 2;
        const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_R;
        const arcOffset = chkArcDash.interpolate({
          inputRange: [0, 1], outputRange: [0, CIRCUMFERENCE],
        });
        const cd = getCalData(gender, ageText, htFt, htIn, wtText, weightUnit, activity, goal, speed);
        // Fixed symmetric positions: thumb ends at 50%, min tick at 35%, max tick at 65%
        const targetPos   = 0.50;
        const minPos      = 0.35;
        const maxPos      = 0.65;
        const colorChange = 0.70; // sliderAnim value when thumb crosses minPos
        const filledW   = sliderAnim.interpolate({ inputRange: [0,1], outputRange: [0, targetPos * trackW], extrapolate: 'clamp' });
        const thumbLeft = sliderAnim.interpolate({ inputRange: [0,1], outputRange: [-12, targetPos * trackW - 12], extrapolate: 'clamp' });
        const barColor  = sliderAnim.interpolate({
          inputRange:  [0, 0.68, 0.70, 1],
          outputRange: [c.carbs, c.carbs, c.green, c.green],
          extrapolate: 'clamp',
        });
        // Check fades out as calorie content fades in
        const checkOpacity = calContentFade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

        return (
          <View style={{ flex: 1 }}>
            {/* ── Animated check — centered → shrinks to top, then fades out ── */}
            <Animated.View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', opacity: checkOpacity }]}>
              <Animated.View style={{ alignItems: 'center', transform: [{ scale: chkScale }, { translateY: chkMoveY }] }}>
                <View style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE, justifyContent: 'center', alignItems: 'center' }}>
                  <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE} style={{ position: 'absolute' }}>
                    <Circle cx={CIRCLE_SIZE/2} cy={CIRCLE_SIZE/2} r={CIRCLE_R} stroke={c.green + '28'} strokeWidth={STROKE_W} fill="none" />
                    <AnimatedCircle cx={CIRCLE_SIZE/2} cy={CIRCLE_SIZE/2} r={CIRCLE_R} stroke={c.green} strokeWidth={STROKE_W} fill="none" strokeLinecap="round" strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`} strokeDashoffset={arcOffset} transform={`rotate(-90, ${CIRCLE_SIZE/2}, ${CIRCLE_SIZE/2})`} />
                  </Svg>
                  <Animated.View style={{ width: CIRCLE_R*1.6, height: CIRCLE_R*1.6, borderRadius: CIRCLE_R*0.8, backgroundColor: c.green+'28', justifyContent: 'center', alignItems: 'center', opacity: chkMarkFade, transform: [{ scale: chkMarkScale }] }}>
                    <Ionicons name="checkmark" size={84} color={c.green} />
                  </Animated.View>
                </View>
              </Animated.View>
            </Animated.View>

            {/* ── Calorie content — full-screen, fades in over the check ── */}
            <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: calContentFade }]}>
              {/* Main content — centered in full screen */}
              <View style={{ flex: 1, paddingHorizontal: 22, justifyContent: 'center', gap: 16 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: c.white, textAlign: 'center', lineHeight: 30 }}>
                  Awesome! This is your daily{'\n'}calorie need...
                </Text>

                {/* Card */}
                <View style={{ backgroundColor: c.card, borderRadius: 24, padding: 22, borderWidth: 1, borderColor: c.border }}>
                  <Text style={{ fontSize: 34, fontWeight: '800', color: c.white, textAlign: 'center', letterSpacing: -0.5 }}>
                    {displayCal.toLocaleString()} kcal
                  </Text>

                  {/* Slider track */}
                  <View style={{ marginTop: 20, marginBottom: 28 }}>
                    <View
                      style={{ height: 6, backgroundColor: c.track, borderRadius: 3, overflow: 'visible' }}
                      onLayout={e => setTrackW(Math.max(1, e.nativeEvent.layout.width))}
                    >
                      <Animated.View style={{ height: 6, width: filledW, backgroundColor: barColor, borderRadius: 3 }} />
                      <Animated.View style={{ position: 'absolute', top: -9, left: thumbLeft, width: 24, height: 24, borderRadius: 12, backgroundColor: barColor, borderWidth: 3, borderColor: c.card }} />
                      {/* Min tick */}
                      <View style={{ position: 'absolute', top: -5, left: minPos * trackW - 1, width: 2, height: 16, backgroundColor: c.white + '55', borderRadius: 1 }} />
                      {/* Max tick */}
                      <View style={{ position: 'absolute', top: -5, left: maxPos * trackW - 1, width: 2, height: 16, backgroundColor: c.border, borderRadius: 1 }} />
                    </View>

                    {/* Labels — centered over their ticks */}
                    <Animated.View style={{ opacity: calLabelFade, height: 22, marginTop: 10 }}>
                      <Text style={{ position: 'absolute', left: minPos * trackW, width: 52, marginLeft: -26, textAlign: 'center', fontSize: 12, color: c.muted, fontWeight: '500' }}>
                        {cd.minCal.toLocaleString()}
                      </Text>
                      <Text style={{ position: 'absolute', left: maxPos * trackW, width: 52, marginLeft: -26, textAlign: 'center', fontSize: 12, color: c.muted, fontWeight: '500' }}>
                        {cd.maxCal.toLocaleString()}
                      </Text>
                    </Animated.View>
                  </View>

                  {/* Macros */}
                  <Animated.View style={{ opacity: calLabelFade, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 18, borderTopWidth: 1, borderTopColor: c.border }}>
                    {[
                      { label: 'Protein', value: `${cd.prot} g`,  color: c.protein },
                      { label: 'Carbs',   value: `${cd.carbs} g`, color: c.carbs   },
                      { label: 'Fats',    value: `${cd.fat} g`,   color: c.fat     },
                    ].map(m => (
                      <View key={m.label} style={{ alignItems: 'center', gap: 5 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: c.muted }}>{m.label}</Text>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: c.white }}>{m.value}</Text>
                        <View style={{ width: 38, height: 3, backgroundColor: m.color, borderRadius: 2 }} />
                      </View>
                    ))}
                  </Animated.View>
                </View>

              </View>
            </Animated.View>

            {/* Next button — fades in with labels, fixed at bottom */}
            <Animated.View style={{ opacity: calLabelFade, position: 'absolute', bottom: 32, left: 22, right: 22 }}>
              <TouchableOpacity
                onPress={goNext}
                style={{ backgroundColor: c.accent, borderRadius: 18, paddingVertical: 18, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: 0.4 }}>Next</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        );
      }

      // Step 10 — Value message + Name
      case 10:
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
                    Why Shred AI
                  </Text>
                </View>
                <Text style={{ fontSize: 15, color: c.white, lineHeight: 24 }}>
                  Shred AI handles the thinking for you. Just tell it what you eat using the voice chat. No typing or photos. Get real-time guidance tailored to your goals.
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

      // Step 2 — Motivational transition
      case 2: {
        const FIRE = '#FF6B00';
        const ringStyle = (opAnim, scaleAnim, size) => ({
          position: 'absolute',
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: FIRE,
          opacity: opAnim,
          transform: [{ scale: scaleAnim }],
        });
        return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 44 }}>
            {/* Fire icon with 3 pulsating rings */}
            <View style={{ alignItems: 'center', justifyContent: 'center', width: 195, height: 195 }}>
              <Animated.View style={ringStyle(transRing1Op, transRing1Scale, 195)} />
              <Animated.View style={ringStyle(transRing2Op, transRing2Scale, 148)} />
              <Animated.View style={ringStyle(transRing3Op, transRing3Scale, 100)} />
              {/* Center — fades + springs in */}
              <Animated.View style={{
                width: 88, height: 88, borderRadius: 44,
                backgroundColor: FIRE + '28',
                justifyContent: 'center', alignItems: 'center',
                opacity: transFireFade,
                transform: [{ scale: transScale }],
              }}>
                <Ionicons name="flame" size={50} color={FIRE} />
              </Animated.View>
            </View>

            {/* Text fades in first */}
            <Animated.View style={{ opacity: transFade, alignItems: 'center', width: '100%' }}>
              <Text style={{ fontSize: 26, fontWeight: '800', color: c.white, textAlign: 'center', lineHeight: 34 }}>
                Keep going! Let's find out{'\n'}your daily calorie intake
              </Text>
            </Animated.View>

            {/* Button fades in after text */}
            <Animated.View style={{ opacity: transButtonFade, width: '100%' }}>
              <TouchableOpacity
                onPress={goNext}
                style={{
                  backgroundColor: c.accent, borderRadius: 18,
                  paddingVertical: 18, alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: 0.4 }}>Continue</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        );
      }

      // Step 3 — About you
      case 3: {
        const genderDisplay = gender ? (gender === 'male' ? 'Male' : 'Female') : null;
        const htDisplay = htFt && htIn !== '' ? `${htFt}'${htIn}"` : null;
        const wtDisplay = wtText ? `${wtText} ${weightUnit === 'imperial' ? 'lbs' : 'kg'}` : null;
        return (
          <View style={{ flex: 1, justifyContent: 'center', gap: 32 }}>
            <View style={{ alignItems: 'center', gap: 20 }}>
              <View style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: c.accent + '22',
                justifyContent: 'center', alignItems: 'center',
              }}>
                <Ionicons name="person-outline" size={38} color={c.accent} />
              </View>
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 30, fontWeight: '800', color: c.white, lineHeight: 36 }}>
                  About you
                </Text>
                <Text style={{ fontSize: 14, color: c.muted, lineHeight: 20, textAlign: 'center' }}>
                  This will help us calculate your target calories
                </Text>
              </View>
            </View>

            <View style={{ gap: 12 }}>
              <StatRow icon="person-outline"   label="Sex"    value={genderDisplay} onPress={() => setOpenModal('sex')} />
              <StatRow icon="calendar-outline" label="Age"    value={ageText || null}     onPress={() => setOpenModal('age')} />
              <StatRow icon="resize-outline"   label="Height" value={htDisplay}    onPress={() => setOpenModal('height')} />
              <StatRow icon="scale-outline"    label="Weight" value={wtDisplay}    onPress={() => setOpenModal('weight')} />
            </View>
          </View>
        );
      }

      // Step 0 — Goal
      case 0:
        return (
          <View style={{ flex: 1, justifyContent: 'center', gap: 32 }}>
            {/* Icon + heading */}
            <View style={{ alignItems: 'center', gap: 20 }}>
              <View style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: c.accent + '22',
                justifyContent: 'center', alignItems: 'center',
              }}>
                <Ionicons name="trophy-outline" size={38} color={c.accent} />
              </View>
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 30, fontWeight: '800', color: c.white, lineHeight: 36, textAlign: 'center' }}>
                  What's your goal?
                </Text>
                <Text style={{ fontSize: 14, color: c.muted, lineHeight: 20, textAlign: 'center' }}>
                  We'll help you find the right calorie intake to achieve it
                </Text>
              </View>
            </View>

            {/* Options — tap to highlight, bounce, then auto-advance */}
            <View style={{ gap: 12 }}>
              {GOALS.map((g, i) => {
                const sel = goal === g.key;
                return (
                  <Animated.View key={g.key} style={{ transform: [{ scale: goalScales[i] }] }}>
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => {
                        setGoal(g.key);
                        Animated.sequence([
                          Animated.timing(goalScales[i], { toValue: 1.04, duration: 100, useNativeDriver: false }),
                          Animated.timing(goalScales[i], { toValue: 1,    duration: 100, useNativeDriver: false }),
                        ]).start(() => slideTo(step + 1, 1));
                      }}
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
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </View>
          </View>
        );

      // Step 1 — Approach
      case 1:
        return (
          <View style={{ flex: 1, justifyContent: 'center', gap: 32 }}>
            <View style={{ alignItems: 'center', gap: 20 }}>
              <View style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: c.accent + '22',
                justifyContent: 'center', alignItems: 'center',
              }}>
                <Ionicons name="flag-outline" size={38} color={c.accent} />
              </View>
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 30, fontWeight: '800', color: c.white, lineHeight: 36, textAlign: 'center' }}>
                  How do you want{'\n'}to achieve it?
                </Text>
                <Text style={{ fontSize: 14, color: c.muted, lineHeight: 20, textAlign: 'center' }}>
                  Don't worry, you can change this later
                </Text>
              </View>
            </View>

            <View style={{ gap: 12 }}>
              {APPROACHES.map((a, i) => {
                const sel = approach === a.key;
                return (
                  <Animated.View key={a.key} style={{ transform: [{ scale: approachScales[i] }] }}>
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => {
                        setApproach(a.key);
                        Animated.sequence([
                          Animated.timing(approachScales[i], { toValue: 1.04, duration: 100, useNativeDriver: false }),
                          Animated.timing(approachScales[i], { toValue: 1,    duration: 100, useNativeDriver: false }),
                        ]).start(() => slideTo(step + 1, 1));
                      }}
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
                        <Ionicons name={a.icon} size={24} color={sel ? '#FFF' : c.muted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: c.white }}>{a.label}</Text>
                        <Text style={{ fontSize: 12, color: c.muted, marginTop: 3 }}>{a.desc}</Text>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </View>
          </View>
        );

      // Step 5 — Strength training
      case 5:
        return (
          <View style={{ flex: 1, justifyContent: 'center', gap: 32 }}>
            <View style={{ alignItems: 'center', gap: 20 }}>
              <View style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: c.accent + '22',
                justifyContent: 'center', alignItems: 'center',
              }}>
                <Ionicons name="barbell-outline" size={38} color={c.accent} />
              </View>
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 30, fontWeight: '800', color: c.white, lineHeight: 36, textAlign: 'center' }}>
                  Do you do strength{'\n'}training?
                </Text>
                <Text style={{ fontSize: 14, color: c.muted, lineHeight: 20, textAlign: 'center' }}>
                  This helps us personalize your nutrition plan
                </Text>
              </View>
            </View>

            <View style={{ gap: 12 }}>
              {[['yes', 'Yes', 'checkmark-circle-outline'], ['no', 'No', 'close-circle-outline']].map(([key, label, icon], i) => {
                const sel = strengthTraining === key;
                return (
                  <Animated.View key={key} style={{ transform: [{ scale: strengthScales[i] }] }}>
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => {
                        setStrengthTraining(key);
                        Animated.sequence([
                          Animated.timing(strengthScales[i], { toValue: 1.04, duration: 100, useNativeDriver: false }),
                          Animated.timing(strengthScales[i], { toValue: 1,    duration: 100, useNativeDriver: false }),
                        ]).start(() => slideTo(step + 1, 1));
                      }}
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
                        <Ionicons name={icon} size={24} color={sel ? '#FFF' : c.muted} />
                      </View>
                      <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: c.white }}>{label}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </View>
          </View>
        );

      // Step 8 — Customize your goal
      case 8: {
        const curWtDisplay  = wtText ? `${wtText} ${weightUnit === 'imperial' ? 'lbs' : 'kg'}` : null;
        const goalWtDisplay = goalWtText ? `${goalWtText} ${weightUnit === 'imperial' ? 'lbs' : 'kg'}` : null;
        return (
          <View style={{ flex: 1, justifyContent: 'center', gap: 32 }}>
            <View style={{ alignItems: 'center', gap: 16 }}>
              <View style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: c.accent + '22',
                justifyContent: 'center', alignItems: 'center',
              }}>
                <Ionicons name="create-outline" size={38} color={c.accent} />
              </View>
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 30, fontWeight: '800', color: c.white, lineHeight: 36, textAlign: 'center' }}>
                  Customize your goal
                </Text>
                <Text style={{ fontSize: 14, color: c.muted, lineHeight: 20, textAlign: 'center' }}>
                  Last step to get your calories and macros
                </Text>
              </View>
            </View>

            <View style={{ gap: 12 }}>
              <StatRow icon="scale-outline"       label="Current weight" value={curWtDisplay}  onPress={() => setOpenModal('weight')} />
              <StatRow icon="trophy-outline"      label="Goal weight"    value={goalWtDisplay} onPress={() => setOpenModal('goalWeight')} />
              <StatRow icon="timer-outline" label="Speed" value={speed ? SPEEDS.find(s => s.key === speed)?.label : null} onPress={() => setOpenModal('speed')} />
            </View>
          </View>
        );
      }

      // Step 7 — Diet type
      case 7:
        return (
          <View style={{ flex: 1, justifyContent: 'center', gap: 24 }}>
            <View style={{ alignItems: 'center', gap: 16 }}>
              <View style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: c.accent + '22',
                justifyContent: 'center', alignItems: 'center',
              }}>
                <Ionicons name="restaurant-outline" size={38} color={c.accent} />
              </View>
              <Text style={{ fontSize: 30, fontWeight: '800', color: c.white, lineHeight: 36, textAlign: 'center' }}>
                Which type of diet{'\n'}do you want?
              </Text>
            </View>

            <View style={{ gap: 10 }}>
              {DIETS.map((d, i) => {
                const sel = diet === d.key;
                return (
                  <Animated.View key={d.key} style={{ transform: [{ scale: dietScales[i] }] }}>
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => {
                        setDiet(d.key);
                        Animated.sequence([
                          Animated.timing(dietScales[i], { toValue: 1.04, duration: 100, useNativeDriver: false }),
                          Animated.timing(dietScales[i], { toValue: 1,    duration: 100, useNativeDriver: false }),
                        ]).start(() => slideTo(step + 1, 1));
                      }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 16,
                        backgroundColor: sel ? c.accentDim : c.card,
                        borderRadius: 20, padding: 16,
                        borderWidth: sel ? 1.5 : 1,
                        borderColor: sel ? c.accent : c.border,
                      }}
                    >
                      <View style={{
                        width: 48, height: 48, borderRadius: 14,
                        backgroundColor: sel ? c.accent : c.card2,
                        justifyContent: 'center', alignItems: 'center',
                      }}>
                        <Ionicons name={d.icon} size={22} color={sel ? '#FFF' : c.muted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: c.white }}>{d.label}</Text>
                        <Text style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{d.desc}</Text>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </View>
          </View>
        );

      // Step 6 — Lifestyle
      case 6:
        return (
          <View style={{ flex: 1, justifyContent: 'center', gap: 24 }}>
            <View style={{ alignItems: 'center', gap: 16 }}>
              <View style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: c.accent + '22',
                justifyContent: 'center', alignItems: 'center',
              }}>
                <Ionicons name="walk-outline" size={38} color={c.accent} />
              </View>
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 30, fontWeight: '800', color: c.white, lineHeight: 36, textAlign: 'center' }}>
                  How is your lifestyle?
                </Text>
                <Text style={{ fontSize: 14, color: c.muted, lineHeight: 20, textAlign: 'center' }}>
                  Exercise doesn't count here. Base your choice{'\n'}on daily movement outside of training.
                </Text>
              </View>
            </View>

            <View style={{ gap: 10 }}>
              {LIFESTYLES.map((l, i) => {
                const sel = lifestyle === l.key;
                return (
                  <Animated.View key={l.key} style={{ transform: [{ scale: lifestyleScales[i] }] }}>
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => {
                        setLifestyle(l.key);
                        Animated.sequence([
                          Animated.timing(lifestyleScales[i], { toValue: 1.04, duration: 100, useNativeDriver: false }),
                          Animated.timing(lifestyleScales[i], { toValue: 1,    duration: 100, useNativeDriver: false }),
                        ]).start(() => slideTo(step + 1, 1));
                      }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 16,
                        backgroundColor: sel ? c.accentDim : c.card,
                        borderRadius: 20, padding: 16,
                        borderWidth: sel ? 1.5 : 1,
                        borderColor: sel ? c.accent : c.border,
                      }}
                    >
                      <View style={{
                        width: 48, height: 48, borderRadius: 14,
                        backgroundColor: sel ? c.accent : c.card2,
                        justifyContent: 'center', alignItems: 'center',
                      }}>
                        <Ionicons name={l.icon} size={22} color={sel ? '#FFF' : c.muted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: c.white }}>{l.label}</Text>
                        <Text style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{l.desc}</Text>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </View>

            <Text style={{ fontSize: 13, color: c.muted, textAlign: 'center' }}>
              Don't worry, you can change this later
            </Text>
          </View>
        );

      // Step 4 — Activity level
      case 4:
        return (
          <View style={{ flex: 1, justifyContent: 'center', gap: 32 }}>
            {/* Icon + heading */}
            <View style={{ alignItems: 'center', gap: 20 }}>
              <View style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: c.accent + '22',
                justifyContent: 'center', alignItems: 'center',
              }}>
                <Ionicons name="flash-outline" size={38} color={c.accent} />
              </View>
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 30, fontWeight: '800', color: c.white, lineHeight: 36, textAlign: 'center' }}>
                  How active are you?
                </Text>
                <Text style={{ fontSize: 14, color: c.muted, lineHeight: 20, textAlign: 'center' }}>
                  Be honest — this directly affects your calorie targets
                </Text>
              </View>
            </View>

            {/* Options — tap to highlight, bounce, then auto-advance */}
            <View style={{ gap: 10 }}>
              {ACTIVITIES.map((a, i) => {
                const sel = activity === a.key;
                return (
                  <Animated.View key={a.key} style={{ transform: [{ scale: activityScales[i] }] }}>
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => {
                        setActivity(a.key);
                        Animated.sequence([
                          Animated.timing(activityScales[i], { toValue: 1.04, duration: 100, useNativeDriver: false }),
                          Animated.timing(activityScales[i], { toValue: 1,    duration: 100, useNativeDriver: false }),
                        ]).start(() => slideTo(step + 1, 1));
                      }}
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
                        <Ionicons name={a.icon} size={24} color={sel ? '#FFF' : c.muted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: c.white }}>{a.label}</Text>
                        <Text style={{ fontSize: 12, color: c.muted, marginTop: 3 }}>{a.desc}</Text>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
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

      {/* Subtle accent glows — hidden on transition steps */}
      {step !== 2 && step !== 9 && (
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <Animated.View style={{ position: 'absolute', top: -100, right: -80,  width: 320, height: 320, borderRadius: 160, backgroundColor: c.accent, opacity: 0.07, transform: [{ translateX: glob1X }, { translateY: glob1Y }] }} />
          <Animated.View style={{ position: 'absolute', bottom: 60,  left: -160, width: 400, height: 400, borderRadius: 200, backgroundColor: c.accent, opacity: 0.04, transform: [{ translateX: glob2X }, { translateY: glob2Y }] }} />
        </View>
      )}

      {/* ── Top bar: back + animated progress dots ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 }}>
        {step > 0 || onGoBack
          ? (
            <TouchableOpacity onPress={step > 0 ? goBack : onGoBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="arrow-back" size={22} color={c.white} />
            </TouchableOpacity>
          )
          : <View style={{ width: 22 }} />
        }
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
          {step !== 2 && step !== 9 && Array.from({ length: STEPS }).map((_, i) => {
            const pill = (
              <View style={{
                height: 7,
                width:  i === step ? 24 : 7,
                borderRadius: 4,
                backgroundColor: i === step ? c.accent : i < step ? c.accent + '66' : c.border,
              }} />
            );
            return DEV_MODE ? (
              <TouchableOpacity
                key={i}
                onPress={() => setStep(i)}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                activeOpacity={0.6}
              >
                {pill}
              </TouchableOpacity>
            ) : (
              <View key={i}>{pill}</View>
            );
          })}
        </View>
        <View style={{ width: 22 }} />
      </View>

      {/* ── Animated step content ── */}
      <Animated.View style={{ flex: 1, paddingHorizontal: 22, paddingBottom: 8, transform: [{ translateX: slideAnim }] }}>
        {renderStep()}
      </Animated.View>

      {/* ── Continue / Get Started button — hidden on step 0 (auto-advances) ── */}
      {(step === 3 || step === 8 || step === 10) && <View style={{ paddingHorizontal: 22, paddingBottom: 24 }}>
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
            {step === 10 ? 'Get Started' : step === 8 ? 'Create My Plan' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>}

      {/* ── Sex modal ── */}
      <StatsModal visible={openModal === 'sex'} onClose={() => setOpenModal(null)} title="Sex">
        <View style={{ gap: 12 }}>
          {[['male', 'Male'], ['female', 'Female']].map(([key, label]) => (
            <TouchableOpacity
              key={key}
              onPress={() => { setGender(key); setOpenModal(null); }}
              style={{
                paddingVertical: 16, borderRadius: 14, alignItems: 'center',
                backgroundColor: gender === key ? c.accent : c.card2,
                borderWidth: 1.5, borderColor: gender === key ? c.accent : c.border,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: gender === key ? '#FFF' : c.white }}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </StatsModal>

      {/* ── Age modal ── */}
      <StatsModal visible={openModal === 'age'} onClose={() => setOpenModal(null)} title="Age">
        <TextInput
          value={ageText}
          onChangeText={t => setAgeText(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="e.g. 25"
          placeholderTextColor={c.muted}
          maxLength={3}
          autoFocus
          style={{
            fontSize: 28, fontWeight: '700', color: c.white, textAlign: 'center',
            backgroundColor: c.card2, borderRadius: 14, paddingVertical: 18,
            borderWidth: 1.5, borderColor: c.accent + '66',
            outlineStyle: 'none',
          }}
        />
        <TouchableOpacity
          onPress={() => { if (ageText.trim()) setOpenModal(null); }}
          style={{ marginTop: 16, backgroundColor: c.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: 0.4 }}>OK</Text>
        </TouchableOpacity>
      </StatsModal>

      {/* ── Height modal ── */}
      <StatsModal visible={openModal === 'height'} onClose={() => setOpenModal(null)} title="Height">
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.muted, fontSize: 11, fontWeight: '700', textAlign: 'center', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Feet</Text>
            <TextInput
              value={htFt}
              onChangeText={t => setHtFt(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="5"
              placeholderTextColor={c.muted}
              maxLength={1}
              autoFocus
              style={{
                fontSize: 28, fontWeight: '700', color: c.white, textAlign: 'center',
                backgroundColor: c.card2, borderRadius: 14, paddingVertical: 18,
                borderWidth: 1.5, borderColor: c.accent + '66',
                outlineStyle: 'none',
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.muted, fontSize: 11, fontWeight: '700', textAlign: 'center', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Inches</Text>
            <TextInput
              value={htIn}
              onChangeText={t => setHtIn(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="10"
              placeholderTextColor={c.muted}
              maxLength={2}
              style={{
                fontSize: 28, fontWeight: '700', color: c.white, textAlign: 'center',
                backgroundColor: c.card2, borderRadius: 14, paddingVertical: 18,
                borderWidth: 1.5, borderColor: c.accent + '66',
                outlineStyle: 'none',
              }}
            />
          </View>
        </View>
        <TouchableOpacity
          onPress={() => { if (htFt && htIn !== '') setOpenModal(null); }}
          style={{ marginTop: 16, backgroundColor: c.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: 0.4 }}>OK</Text>
        </TouchableOpacity>
      </StatsModal>

      {/* ── Speed modal ── */}
      <StatsModal visible={openModal === 'speed'} onClose={() => setOpenModal(null)} title="Speed of Weight Loss">
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: SCREEN_H * 0.55 }}>
          <View style={{ gap: 8 }}>
            {SPEEDS.map(s => {
              const sel = speed === s.key;
              return (
                <View key={s.key}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setSpeed(s.key);
                    }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 14,
                      backgroundColor: sel ? c.accent + '22' : c.card2,
                      borderRadius: 16, padding: 16,
                      borderWidth: sel ? 1.5 : 1,
                      borderColor: sel ? c.accent : c.border,
                    }}
                  >
                    <View style={{
                      width: 42, height: 42, borderRadius: 12,
                      backgroundColor: sel ? c.accent + '33' : c.card,
                      justifyContent: 'center', alignItems: 'center',
                    }}>
                      <Ionicons name="speedometer-outline" size={20} color={c.accent} />
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: c.white }}>{s.label}</Text>
                  </TouchableOpacity>

                  {sel && (
                    <View style={{ paddingHorizontal: 4, paddingTop: 12, paddingBottom: 4, gap: 10 }}>
                      {s.pros.map((text, i) => (
                        <View key={`p${i}`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                          <Ionicons name="checkmark-circle" size={20} color={c.green} style={{ marginTop: 1 }} />
                          <Text style={{ flex: 1, fontSize: 13, color: c.white, lineHeight: 18, fontWeight: '500' }}>{text}</Text>
                        </View>
                      ))}
                      {s.cons.map((text, i) => (
                        <View key={`c${i}`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                          <Ionicons name="remove-circle" size={20} color={c.red} style={{ marginTop: 1 }} />
                          <Text style={{ flex: 1, fontSize: 13, color: c.white, lineHeight: 18, fontWeight: '500' }}>{text}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>
        <TouchableOpacity
          onPress={() => { if (speed) setOpenModal(null); }}
          style={{
            marginTop: 16,
            backgroundColor: speed ? c.accent : c.card2,
            borderRadius: 14, paddingVertical: 16, alignItems: 'center',
            borderWidth: 1, borderColor: speed ? c.accent : c.border,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '800', letterSpacing: 0.4, color: speed ? '#FFF' : c.muted }}>OK</Text>
        </TouchableOpacity>
      </StatsModal>

      {/* ── Goal weight modal ── */}
      <StatsModal visible={openModal === 'goalWeight'} onClose={() => setOpenModal(null)} title="Goal Weight">
        {(() => {
          const inches = (parseInt(htFt) || 0) * 12 + (parseInt(htIn) || 0);
          const minLbs = inches > 0 ? Math.round(18.5 * inches * inches / 703) : null;
          const maxLbs = inches > 0 ? Math.round(24.9 * inches * inches / 703) : null;
          const minDisp = minLbs ? (weightUnit === 'metric' ? (minLbs / 2.20462).toFixed(1) : minLbs) : null;
          const maxDisp = maxLbs ? (weightUnit === 'metric' ? (maxLbs / 2.20462).toFixed(1) : maxLbs) : null;
          const unit = weightUnit === 'imperial' ? 'lbs' : 'kg';
          return (
            <>
              {/* Unit toggle — mirrors current weight modal, converts both values */}
              <View style={{ flexDirection: 'row', backgroundColor: c.card2, borderRadius: 12, padding: 4, marginBottom: 14 }}>
                {[['imperial', 'lbs'], ['metric', 'kg']].map(([u, label]) => (
                  <TouchableOpacity
                    key={u}
                    onPress={() => {
                      if (u !== weightUnit) {
                        const curVal = parseFloat(wtText);
                        if (!isNaN(curVal) && curVal > 0)
                          setWtText(u === 'metric' ? (curVal / 2.20462).toFixed(1) : (curVal * 2.20462).toFixed(0));
                        const goalVal = parseFloat(goalWtText);
                        if (!isNaN(goalVal) && goalVal > 0)
                          setGoalWtText(u === 'metric' ? (goalVal / 2.20462).toFixed(1) : (goalVal * 2.20462).toFixed(0));
                        setWeightUnit(u);
                      }
                    }}
                    style={{
                      flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                      backgroundColor: weightUnit === u ? c.accent : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: weightUnit === u ? '#FFF' : c.muted }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {minDisp && (
                <View style={{
                  backgroundColor: c.accent + '18', borderRadius: 12,
                  borderWidth: 1, borderColor: c.accent + '44',
                  padding: 12, marginBottom: 14,
                }}>
                  <Text style={{ fontSize: 13, color: c.accent, fontWeight: '600', textAlign: 'center', lineHeight: 18 }}>
                    Based on your height, a healthy weight{'\n'}range is {minDisp}–{maxDisp} {unit}
                  </Text>
                </View>
              )}
              <TextInput
                value={goalWtText}
                onChangeText={t => setGoalWtText(t.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder={weightUnit === 'imperial' ? '150' : '68'}
                placeholderTextColor={c.muted}
                autoFocus
                style={{
                  fontSize: 28, fontWeight: '700', color: c.white, textAlign: 'center',
                  backgroundColor: c.card2, borderRadius: 14, paddingVertical: 18,
                  borderWidth: 1.5, borderColor: c.accent + '66',
                  outlineStyle: 'none',
                }}
              />
              <TouchableOpacity
                onPress={() => { if (goalWtText.trim()) setOpenModal(null); }}
                style={{ marginTop: 16, backgroundColor: c.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: 0.4 }}>OK</Text>
              </TouchableOpacity>
            </>
          );
        })()}
      </StatsModal>

      {/* ── Weight modal ── */}
      <StatsModal visible={openModal === 'weight'} onClose={() => setOpenModal(null)} title="Weight">
        <View style={{ flexDirection: 'row', backgroundColor: c.card2, borderRadius: 12, padding: 4, marginBottom: 16 }}>
          {[['imperial', 'lbs'], ['metric', 'kg']].map(([unit, label]) => (
            <TouchableOpacity
              key={unit}
              onPress={() => {
                if (unit !== weightUnit) {
                  const val = parseFloat(wtText);
                  if (!isNaN(val) && val > 0) {
                    setWtText(
                      unit === 'metric'
                        ? (val / 2.20462).toFixed(1)
                        : (val * 2.20462).toFixed(0)
                    );
                  }
                  setWeightUnit(unit);
                }
              }}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                backgroundColor: weightUnit === unit ? c.accent : 'transparent',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: weightUnit === unit ? '#FFF' : c.muted }}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          value={wtText}
          onChangeText={t => setWtText(t.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder={weightUnit === 'imperial' ? '175' : '79'}
          placeholderTextColor={c.muted}
          autoFocus
          style={{
            fontSize: 28, fontWeight: '700', color: c.white, textAlign: 'center',
            backgroundColor: c.card2, borderRadius: 14, paddingVertical: 18,
            borderWidth: 1.5, borderColor: c.accent + '66',
            outlineStyle: 'none',
          }}
        />
        <TouchableOpacity
          onPress={() => { if (wtText.trim()) setOpenModal(null); }}
          style={{ marginTop: 16, backgroundColor: c.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: 0.4 }}>OK</Text>
        </TouchableOpacity>
      </StatsModal>

    </SafeAreaView>
  );
}
