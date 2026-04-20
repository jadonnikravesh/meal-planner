import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, RADIUS, SPACING } from '../theme';
import NutrientBar from '../components/NutrientBar';

const NUTRIENTS = [
  { label: 'Calories', value: 1840, max: 2200, unit: ' kcal', color: COLORS.orange, icon: '🔥', group: 'energy' },
  { label: 'Protein', value: 124, max: 150, unit: 'g', color: COLORS.blue, icon: '💪', group: 'macro' },
  { label: 'Carbohydrates', value: 210, max: 250, unit: 'g', color: COLORS.yellow, icon: '🌾', group: 'macro' },
  { label: 'Fat', value: 62, max: 73, unit: 'g', color: COLORS.orange, icon: '🥑', group: 'macro' },
  { label: 'Saturated Fat', value: 16, max: 20, unit: 'g', color: COLORS.red, icon: '⚠️', group: 'macro' },
  { label: 'Fiber', value: 18, max: 30, unit: 'g', color: COLORS.accent, icon: '🥦', group: 'micro' },
  { label: 'Sugar', value: 42, max: 50, unit: 'g', color: COLORS.pink, icon: '🍬', group: 'micro' },
  { label: 'Sodium', value: 1820, max: 2300, unit: 'mg', color: COLORS.purple, icon: '🧂', group: 'micro' },
  { label: 'Potassium', value: 2900, max: 3500, unit: 'mg', color: COLORS.teal, icon: '🍌', group: 'micro' },
  { label: 'Water', value: 1200, max: 2000, unit: 'ml', color: COLORS.blue, icon: '💧', group: 'hydration' },
  { label: 'Vitamin C', value: 65, max: 90, unit: 'mg', color: COLORS.yellow, icon: '🍊', group: 'vitamin' },
  { label: 'Vitamin D', value: 12, max: 20, unit: 'mcg', color: COLORS.yellow, icon: '☀️', group: 'vitamin' },
  { label: 'Calcium', value: 780, max: 1000, unit: 'mg', color: COLORS.blue, icon: '🦴', group: 'mineral' },
  { label: 'Iron', value: 12, max: 18, unit: 'mg', color: COLORS.red, icon: '⚙️', group: 'mineral' },
  { label: 'Magnesium', value: 280, max: 400, unit: 'mg', color: COLORS.teal, icon: '✨', group: 'mineral' },
];

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'macro', label: 'Macros' },
  { key: 'micro', label: 'Micros' },
  { key: 'vitamin', label: 'Vitamins' },
  { key: 'mineral', label: 'Minerals' },
];

const MEAL_BREAKDOWN = [
  { name: 'Breakfast', calories: 385, pct: 21, color: COLORS.yellow, icon: '🌅' },
  { name: 'Lunch', calories: 620, pct: 34, color: COLORS.blue, icon: '🥗' },
  { name: 'Snack', calories: 180, pct: 10, color: COLORS.accent, icon: '🍎' },
  { name: 'Dinner', calories: 655, pct: 36, color: COLORS.purple, icon: '🌙' },
];

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('all');

  const filtered = activeTab === 'all'
    ? NUTRIENTS
    : activeTab === 'macro'
      ? NUTRIENTS.filter(n => n.group === 'macro' || n.group === 'energy')
      : NUTRIENTS.filter(n => n.group === activeTab);

  const overallPct = Math.round((1840 / 2200) * 100);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Today's Nutrition</Text>
          <Text style={styles.headerDate}>Monday, April 7</Text>
        </View>
        <TouchableOpacity style={styles.historyBtn}>
          <Ionicons name="time-outline" size={20} color={COLORS.textSub} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Overview Card */}
        <LinearGradient
          colors={['#1A1A2A', '#161B27']}
          style={styles.overviewCard}
        >
          <View style={styles.overviewTop}>
            <View>
              <Text style={styles.overviewLabel}>Daily Score</Text>
              <Text style={styles.overviewScore}>{overallPct}<Text style={styles.overviewPct}>%</Text></Text>
              <Text style={styles.overviewSub}>of daily goals met</Text>
            </View>
            <View style={styles.scoreCircle}>
              <View style={[styles.scoreArc, { borderColor: overallPct >= 80 ? COLORS.accent : COLORS.orange }]} />
              <Text style={[styles.scoreEmoji]}>
                {overallPct >= 90 ? '🌟' : overallPct >= 70 ? '👍' : '📈'}
              </Text>
            </View>
          </View>

          {/* Calorie breakdown bar */}
          <View style={styles.breakdownSection}>
            <Text style={styles.breakdownTitle}>Calorie Sources</Text>
            <View style={styles.breakdownBar}>
              {MEAL_BREAKDOWN.map((m) => (
                <View
                  key={m.name}
                  style={[styles.breakdownSegment, { flex: m.pct, backgroundColor: m.color }]}
                />
              ))}
            </View>
            <View style={styles.breakdownLegend}>
              {MEAL_BREAKDOWN.map((m) => (
                <View key={m.name} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: m.color }]} />
                  <Text style={styles.legendText}>{m.icon} {m.name}</Text>
                  <Text style={[styles.legendKcal, { color: m.color }]}>{m.calories}</Text>
                </View>
              ))}
            </View>
          </View>
        </LinearGradient>

        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScroll}
          style={styles.tabsContainer}
        >
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Nutrient bars */}
        <View style={styles.barsContainer}>
          {filtered.map((n) => (
            <NutrientBar
              key={n.label}
              label={n.label}
              value={n.value}
              max={n.max}
              unit={n.unit}
              color={n.color}
              icon={n.icon}
            />
          ))}
        </View>

        {/* Tips */}
        <View style={styles.tipCard}>
          <View style={styles.tipIcon}>
            <Text style={{ fontSize: 20 }}>💡</Text>
          </View>
          <View style={styles.tipContent}>
            <Text style={styles.tipTitle}>Daily Tip</Text>
            <Text style={styles.tipText}>
              Your fiber intake is at 60%. Try adding a handful of mixed nuts or an extra serving of vegetables at dinner to reach your goal.
            </Text>
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
  },
  headerDate: {
    color: COLORS.textSub,
    fontSize: 13,
    marginTop: 2,
  },
  historyBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewCard: {
    marginHorizontal: SPACING.md,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  overviewTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  overviewLabel: {
    color: COLORS.textSub,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '600',
    marginBottom: 4,
  },
  overviewScore: {
    color: COLORS.accent,
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 52,
  },
  overviewPct: {
    fontSize: 24,
    fontWeight: '700',
  },
  overviewSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.accent,
  },
  scoreArc: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: RADIUS.full,
    borderWidth: 3,
  },
  scoreEmoji: {
    fontSize: 32,
  },
  breakdownSection: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
  },
  breakdownTitle: {
    color: COLORS.textSub,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  breakdownBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    gap: 2,
    marginBottom: 14,
  },
  breakdownSegment: {
    borderRadius: RADIUS.full,
  },
  breakdownLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: COLORS.textSub,
    fontSize: 11,
  },
  legendKcal: {
    fontSize: 11,
    fontWeight: '700',
  },
  tabsContainer: {
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabsScroll: {
    paddingHorizontal: SPACING.md,
    gap: 8,
    paddingBottom: 10,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  tabActive: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accent,
  },
  tabText: {
    color: COLORS.textSub,
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: COLORS.accent,
  },
  barsContainer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.yellowDim,
    gap: 12,
    marginTop: 4,
  },
  tipIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.yellowDim,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    color: COLORS.yellow,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  tipText: {
    color: COLORS.textSub,
    fontSize: 13,
    lineHeight: 18,
  },
});
