import React, { useEffect, useRef } from 'react';
import {
  View, Text, Image, StyleSheet, Animated,
  TouchableOpacity, Dimensions, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/AppContext';

const { width: W, height: H } = Dimensions.get('window');
const CARD_W  = Math.min(W * 0.88, 360);   // never wider than 360 on large screens
const IMG_H   = H < 700 ? 160 : 220;       // smaller image on short screens (iPhone SE)
const MAX_H   = H * 0.72;                  // card never taller than 72% of screen

// Particle burst — 8 dots shoot outward from the checkmark
const ANGLES   = [0, 45, 90, 135, 180, 225, 270, 315];
const P_COLORS = ['#5E8C61', '#4CAF50', '#D97745', '#C0504A', '#4A80C4', '#B8893A', '#D97745', '#5E8C61'];
const P_DIST   = 55;

export default function MealLogOverlay({ visible, meal, onClose }) {
  const c = useTheme();

  // ── Core animated values ──────────────────────────────────────────────────
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY  = useRef(new Animated.Value(80)).current;
  const cardScale       = useRef(new Animated.Value(0.88)).current;
  const cardOpacity     = useRef(new Animated.Value(0)).current;
  const checkScale      = useRef(new Animated.Value(0)).current;
  const checkOpacity    = useRef(new Animated.Value(0)).current;
  const ringScale       = useRef(new Animated.Value(1)).current;
  const ringOpacity     = useRef(new Animated.Value(0)).current;
  const loggedOpacity   = useRef(new Animated.Value(0)).current;

  const particles = useRef(
    ANGLES.map((deg) => {
      const dist    = new Animated.Value(0);
      const opacity = new Animated.Value(0);
      const rad     = (deg * Math.PI) / 180;
      const tx = dist.interpolate({ inputRange: [0, P_DIST], outputRange: [0, P_DIST * Math.cos(rad)] });
      const ty = dist.interpolate({ inputRange: [0, P_DIST], outputRange: [0, P_DIST * Math.sin(rad)] });
      return { dist, opacity, tx, ty };
    })
  ).current;

  const autoCloseTimer = useRef(null);

  // ── Dismiss ───────────────────────────────────────────────────────────────
  const dismiss = () => {
    clearTimeout(autoCloseTimer.current);
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 280, useNativeDriver: true }),
      Animated.timing(cardOpacity,     { toValue: 0, duration: 280, useNativeDriver: true }),
      Animated.timing(cardTranslateY,  { toValue: -40, duration: 280, useNativeDriver: true }),
      Animated.timing(cardScale,       { toValue: 0.92, duration: 280, useNativeDriver: true }),
    ]).start(onClose);
  };

  // ── Entry animation sequence ──────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !meal) return;

    // Reset
    backdropOpacity.setValue(0);
    cardTranslateY.setValue(80);
    cardScale.setValue(0.88);
    cardOpacity.setValue(0);
    checkScale.setValue(0);
    checkOpacity.setValue(0);
    ringScale.setValue(1);
    ringOpacity.setValue(0);
    loggedOpacity.setValue(0);
    particles.forEach((p) => { p.dist.setValue(0); p.opacity.setValue(0); });

    // 1 ── Backdrop + card slide in simultaneously
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0.72, duration: 300, useNativeDriver: true }),
      Animated.spring(cardTranslateY,  { toValue: 0, friction: 7, tension: 55, useNativeDriver: true }),
      Animated.spring(cardScale,       { toValue: 1, friction: 7, tension: 55, useNativeDriver: true }),
      Animated.timing(cardOpacity,     { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start(() => {

      // 2 ── Pause 650ms then show checkmark + haptic + particles
      setTimeout(() => {
        // Ring pulse first
        Animated.sequence([
          Animated.parallel([
            Animated.timing(ringScale,   { toValue: 2.0, duration: 300, useNativeDriver: true }),
            Animated.timing(ringOpacity, { toValue: 0.7, duration: 140, useNativeDriver: true }),
          ]),
          Animated.timing(ringOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start();

        // Checkmark springs in
        Animated.parallel([
          Animated.spring(checkScale,   { toValue: 1, friction: 3.5, tension: 130, useNativeDriver: true }),
          Animated.timing(checkOpacity, { toValue: 1, duration: 80, useNativeDriver: true }),
        ]).start();

        // Haptic "ding"
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Particles burst
        Animated.parallel(
          particles.flatMap((p) => [
            Animated.timing(p.opacity, { toValue: 1, duration: 60,  useNativeDriver: true }),
            Animated.timing(p.dist,    { toValue: P_DIST, duration: 400, useNativeDriver: true }),
          ])
        ).start();
        setTimeout(() => {
          Animated.parallel(
            particles.map((p) =>
              Animated.timing(p.opacity, { toValue: 0, duration: 300, useNativeDriver: true })
            )
          ).start();
        }, 420);

        // "Logged" badge fades in just after checkmark
        setTimeout(() => {
          Animated.timing(loggedOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        }, 200);

      }, 650);
    });

    // 3 ── Auto-dismiss after 4.5 s
    autoCloseTimer.current = setTimeout(dismiss, 4500);
    return () => clearTimeout(autoCloseTimer.current);
  }, [visible, meal]);

  if (!meal) return null;

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[
        StyleSheet.absoluteFillObject,
        { zIndex: 999, justifyContent: 'center', alignItems: 'center' },
      ]}
    >
      {/* ── Dimmed backdrop ── */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', opacity: backdropOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={dismiss} />
      </Animated.View>

      {/* ── Center card ── */}
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: c.card, borderColor: c.border },
          {
            transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
            opacity: cardOpacity,
          },
        ]}
      >
        {/* ── Food image ── */}
        <View style={styles.imageWrap}>
          <Image
            source={{ uri: meal.imageUrl }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']}
            style={StyleSheet.absoluteFillObject}
          />

          {/* Calorie badge — bottom-left of image */}
          <View style={styles.calBadge}>
            <Ionicons name="flame" size={14} color="#FF6B00" />
            <Text style={styles.calText}>{meal.calories} kcal</Text>
          </View>

          {/* Checkmark + particles — centered on image */}
          <View style={styles.checkWrap} pointerEvents="none">
            <Animated.View
              style={[styles.checkRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
            />
            {particles.map((p, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.particle,
                  { backgroundColor: P_COLORS[i] },
                  { opacity: p.opacity, transform: [{ translateX: p.tx }, { translateY: p.ty }] },
                ]}
              />
            ))}
            <Animated.View
              style={[styles.checkCircle, { transform: [{ scale: checkScale }], opacity: checkOpacity }]}
            >
              <Ionicons name="checkmark" size={36} color="#FFF" />
            </Animated.View>
          </View>
        </View>

        {/* ── Card content (scrollable so long replies don't overflow) ── */}
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Meal name */}
          <Text style={[styles.mealName, { color: c.white }]} numberOfLines={2}>
            {meal.name}
          </Text>

          {/* Macro pills */}
          <View style={styles.macroRow}>
            {[
              { label: 'Protein', value: meal.protein, color: c.protein, icon: 'flash'   },
              { label: 'Carbs',   value: meal.carbs,   color: c.carbs,   icon: 'leaf'    },
              { label: 'Fat',     value: meal.fat,     color: c.fat,     icon: 'ellipse' },
            ].map((m) => (
              <View key={m.label} style={[styles.macroPill, { backgroundColor: c.card2, borderColor: c.border }]}>
                <Ionicons name={m.icon} size={13} color={m.color} />
                <View>
                  <Text style={[styles.macroLabel, { color: m.color }]}>{m.label}</Text>
                  <Text style={[styles.macroValue, { color: c.white }]}>{m.value}g</Text>
                </View>
              </View>
            ))}
          </View>

          {/* AI reply snippet */}
          {!!meal.reply && (
            <View style={[styles.replyBox, { backgroundColor: c.accentDim, borderColor: c.accent + '44' }]}>
              <Ionicons name="sparkles" size={13} color={c.accent} style={{ marginTop: 1 }} />
              <Text style={[styles.replyText, { color: c.white }]} numberOfLines={4}>
                {meal.reply}
              </Text>
            </View>
          )}

          {/* Logged confirmation badge */}
          <Animated.View
            style={[
              styles.loggedRow,
              { backgroundColor: c.greenDim, borderColor: c.green + '44' },
              { opacity: loggedOpacity },
            ]}
          >
            <Ionicons name="checkmark-circle" size={15} color={c.green} />
            <Text style={[styles.loggedText, { color: c.green }]}>Logged to your dashboard</Text>
          </Animated.View>

          <Text style={[styles.hint, { color: c.muted }]}>Tap anywhere to close</Text>
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    width:        CARD_W,
    maxHeight:    MAX_H,
    borderRadius: 24,
    borderWidth:  1,
    overflow:     'hidden',
    shadowColor:  '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation:    30,
  },
  imageWrap: {
    height:          IMG_H,
    backgroundColor: '#EDE8DF',
  },
  calBadge: {
    position:          'absolute',
    bottom: 14, left:  14,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    backgroundColor:   'rgba(0,0,0,0.60)',
    paddingHorizontal: 11,
    paddingVertical:   6,
    borderRadius:      20,
  },
  calText: {
    color: '#FFF', fontWeight: '700', fontSize: 13,
  },
  checkWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems:     'center',
  },
  checkRing: {
    position:    'absolute',
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 2.5,
    borderColor: '#5E8C61',
  },
  particle: {
    position:    'absolute',
    width: 10, height: 10, borderRadius: 5,
  },
  checkCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor:  '#5E8C61',
    justifyContent:   'center',
    alignItems:       'center',
    shadowColor:      '#5E8C61',
    shadowOffset:     { width: 0, height: 0 },
    shadowOpacity:    1,
    shadowRadius:     24,
    elevation:        16,
  },
  contentScroll: {
    flexShrink: 1,
  },
  content: {
    padding: 18,
    gap:     12,
  },
  mealName: {
    fontSize: 20, fontWeight: '800', lineHeight: 26,
  },
  macroRow: {
    flexDirection: 'row', gap: 8,
  },
  macroPill: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           7,
    padding:       11,
    borderRadius:  14,
    borderWidth:   1,
  },
  macroLabel: {
    fontSize: 9, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  macroValue: {
    fontSize: 16, fontWeight: '800',
  },
  replyBox: {
    flexDirection: 'row',
    gap:           9,
    padding:       12,
    borderRadius:  14,
    borderWidth:   1,
    alignItems:    'flex-start',
  },
  replyText: {
    flex: 1, fontSize: 13, lineHeight: 19,
  },
  loggedRow: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              7,
    paddingHorizontal: 14,
    paddingVertical:   10,
    borderRadius:     12,
    borderWidth:      1,
    justifyContent:   'center',
  },
  loggedText: {
    fontSize: 13, fontWeight: '700',
  },
  hint: {
    textAlign: 'center', fontSize: 11, marginTop: -4,
  },
});
