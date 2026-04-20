import React, { useState, useMemo } from 'react';
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
import { RADIUS, SPACING } from '../theme';
import { useApp, useTheme } from '../context/AppContext';
import {
  getAdherenceScore,
  getAdherenceColor,
  getAdherenceLabel,
  getDateKey,
} from '../utils/nutrition';
import { generateDaySummary } from '../utils/aiCoach';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTHLY_HIGHLIGHTS = [
  { icon: '🌟', label: 'Perfect Days', color: 'accent' },
  { icon: '🔥', label: 'Best Streak',  color: 'orange' },
  { icon: '📊', label: 'Avg Adherence',color: 'blue' },
  { icon: '⚡', label: 'Days Logged',  color: 'purple' },
];

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { state } = useApp();
  const C = useTheme();

  const { dailyLogs, userProfile } = state;

  const today = new Date();
  const todayNum = today.getDate();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState(todayNum);

  const targets = {
    calorieTarget: userProfile.calorieTarget || 2000,
    proteinTarget: userProfile.proteinTarget || 150,
    waterTarget: userProfile.waterTarget || 2700,
  };

  const isCurrentMonth =
    currentMonth === today.getMonth() && currentYear === today.getFullYear();

  // Build calendar metadata
  const firstOfMonth = new Date(currentYear, currentMonth, 1);
  const monthStartDay = firstOfMonth.getDay(); // 0=Sun
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Build calendar cells
  const calendarCells = useMemo(() => {
    const cells = [];
    for (let i = 0; i < monthStartDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthStartDay, daysInMonth]);

  // Get adherence for a day number in the current view
  const getAdh = (day) => {
    const key = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const log = dailyLogs[key];
    return getAdherenceScore(log, targets);
  };

  const isFuture = (day) => {
    if (!isCurrentMonth) return false;
    return day > todayNum;
  };

  // Selected day data
  const selectedKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
  const selectedLog = dailyLogs[selectedKey];
  const selectedAdh = getAdh(selectedDay);
  const aiSummary = selectedLog
    ? (selectedLog.aiSummary || generateDaySummary(selectedLog, targets))
    : 'No data logged for this day.';

  // Monthly stats
  const monthStats = useMemo(() => {
    let perfect = 0;
    let logged = 0;
    let totalAdh = 0;
    let streak = 0;
    let maxStreak = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      if (isCurrentMonth && d > todayNum) break;
      const key = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const log = dailyLogs[key];
      const adh = getAdherenceScore(log, targets);
      if (adh > 0) {
        logged++;
        totalAdh += adh;
        streak++;
        maxStreak = Math.max(maxStreak, streak);
        if (adh === 4) perfect++;
      } else {
        streak = 0;
      }
    }

    const avgAdhPct = logged > 0 ? Math.round((totalAdh / (logged * 4)) * 100) : 0;
    return { perfect, avgAdhPct, maxStreak, logged };
  }, [dailyLogs, currentMonth, currentYear, daysInMonth, todayNum, isCurrentMonth, targets]);

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
    setSelectedDay(1);
  };

  const nextMonth = () => {
    const now = new Date();
    if (currentYear === now.getFullYear() && currentMonth === now.getMonth()) return;
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
    setSelectedDay(1);
  };

  return (
    <View style={[{ flex: 1, backgroundColor: C.bg }, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: C.text }]}>Progress History</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={[styles.headerBtn, { backgroundColor: C.surface }]}>
            <Ionicons name="stats-chart" size={18} color={C.textSub} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.headerBtn, { backgroundColor: C.surface }]}>
            <Ionicons name="share-outline" size={18} color={C.textSub} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Month navigation */}
        <View style={styles.monthNav}>
          <TouchableOpacity
            style={[styles.navBtn, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={prevMonth}
          >
            <Ionicons name="chevron-back" size={20} color={C.textSub} />
          </TouchableOpacity>
          <Text style={[styles.monthTitle, { color: C.text }]}>{MONTHS[currentMonth]} {currentYear}</Text>
          <TouchableOpacity
            style={[styles.navBtn, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={nextMonth}
          >
            <Ionicons name="chevron-forward" size={20} color={C.textSub} />
          </TouchableOpacity>
        </View>

        {/* Calendar */}
        <View style={[styles.calendar, { backgroundColor: C.surface, borderColor: C.border }]}>
          {/* Day headers */}
          <View style={styles.dayHeaders}>
            {DAY_LABELS.map((d) => (
              <Text key={d} style={[styles.dayHeader, { color: C.textMuted }]}>{d}</Text>
            ))}
          </View>

          {/* Grid */}
          <View style={styles.grid}>
            {calendarCells.map((day, idx) => {
              if (!day) return <View key={`empty-${idx}`} style={styles.dayCell} />;

              const adh = getAdh(day);
              const adhColor = getAdherenceColor(adh, C);
              const isToday = isCurrentMonth && day === todayNum;
              const isSelected = day === selectedDay;
              const future = isFuture(day);

              return (
                <TouchableOpacity
                  key={day}
                  style={styles.dayCell}
                  onPress={() => !future && setSelectedDay(day)}
                  activeOpacity={future ? 1 : 0.7}
                >
                  <View
                    style={[
                      styles.dayInner,
                      isToday && [styles.dayToday, { borderColor: C.accent, backgroundColor: C.accentDim }],
                      isSelected && { backgroundColor: C.accent },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNum,
                        { color: C.text },
                        isToday && { color: C.accent, fontWeight: '800' },
                        isSelected && { color: C.bg, fontWeight: '800' },
                        future && { color: C.textMuted },
                      ]}
                    >
                      {day}
                    </Text>
                    {!future && adh > 0 && (
                      <View style={[styles.adherenceDot, { backgroundColor: adhColor }]} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Legend */}
          <View style={[styles.legend, { borderTopColor: C.border }]}>
            {[1, 2, 3, 4].map((level) => (
              <View key={level} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: getAdherenceColor(level, C) }]} />
                <Text style={[styles.legendText, { color: C.textSub }]}>{getAdherenceLabel(level)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Selected day detail */}
        <View style={[styles.selectedCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={styles.selectedHeader}>
            <Text style={[styles.selectedTitle, { color: C.text }]}>
              {MONTHS[currentMonth]} {selectedDay}, {currentYear}
              {isCurrentMonth && selectedDay === todayNum ? '  (Today)' : ''}
            </Text>
            <View style={[
              styles.adherenceBadge,
              { backgroundColor: getAdherenceColor(selectedAdh, C) + '22', borderColor: getAdherenceColor(selectedAdh, C) },
            ]}>
              <Text style={[styles.adherenceBadgeText, { color: getAdherenceColor(selectedAdh, C) }]}>
                {getAdherenceLabel(selectedAdh)}
              </Text>
            </View>
          </View>

          {selectedLog ? (
            <>
              <View style={styles.dayStats}>
                {[
                  { label: 'Calories',  value: Math.round(selectedLog.calories || 0), unit: 'kcal', icon: '🔥', target: targets.calorieTarget },
                  { label: 'Protein',   value: Math.round(selectedLog.protein || 0),  unit: 'g',    icon: '💪', target: targets.proteinTarget },
                  { label: 'Water',     value: ((selectedLog.water || 0) / 1000).toFixed(1), unit: 'L', icon: '💧', target: null },
                ].map((stat) => (
                  <View key={stat.label} style={styles.dayStat}>
                    <Text style={styles.dayStatIcon}>{stat.icon}</Text>
                    <Text style={[styles.dayStatValue, { color: C.text }]}>
                      {stat.value}
                      <Text style={[styles.dayStatUnit, { color: C.textSub }]}>{stat.unit}</Text>
                    </Text>
                    {stat.target && (
                      <Text style={[styles.dayStatTarget, { color: C.textMuted }]}>of {stat.target}</Text>
                    )}
                    <Text style={[styles.dayStatLabel, { color: C.textMuted }]}>{stat.label}</Text>
                  </View>
                ))}
              </View>

              {/* AI summary */}
              <View style={[styles.aiSummaryBox, { backgroundColor: C.purpleDim, borderColor: C.purple + '44' }]}>
                <View style={styles.aiSummaryHeader}>
                  <Ionicons name="sparkles" size={14} color={C.purple} />
                  <Text style={[styles.aiSummaryTitle, { color: C.purple }]}>AI Summary</Text>
                </View>
                <Text style={[styles.aiSummaryText, { color: C.textSub }]}>{aiSummary}</Text>
              </View>
            </>
          ) : (
            <Text style={[styles.noDataText, { color: C.textMuted }]}>
              {isFuture(selectedDay) ? 'Future date — nothing logged yet.' : 'No data logged for this day.'}
            </Text>
          )}
        </View>

        {/* Monthly highlights */}
        <View style={[styles.section, { paddingHorizontal: SPACING.md }]}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>{MONTHS[currentMonth]} Highlights</Text>
          <View style={styles.highlightsGrid}>
            {[
              { ...MONTHLY_HIGHLIGHTS[0], value: String(monthStats.perfect) },
              { ...MONTHLY_HIGHLIGHTS[1], value: `${monthStats.maxStreak} days` },
              { ...MONTHLY_HIGHLIGHTS[2], value: `${monthStats.avgAdhPct}%` },
              { ...MONTHLY_HIGHLIGHTS[3], value: String(monthStats.logged) },
            ].map((h) => {
              const color = C[h.color] || C.accent;
              return (
                <LinearGradient
                  key={h.label}
                  colors={[color + '18', C.surface]}
                  style={[styles.highlightCard, { borderColor: color + '33' }]}
                >
                  <Text style={styles.highlightIcon}>{h.icon}</Text>
                  <Text style={[styles.highlightValue, { color }]}>{h.value}</Text>
                  <Text style={[styles.highlightLabel, { color: C.textSub }]}>{h.label}</Text>
                </LinearGradient>
              );
            })}
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  calendar: {
    marginHorizontal: SPACING.md,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    marginBottom: SPACING.md,
  },
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.285%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  dayInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
    gap: 2,
  },
  dayToday: {
    borderWidth: 1.5,
  },
  dayNum: {
    fontSize: 13,
    fontWeight: '600',
  },
  adherenceDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
  },
  selectedCard: {
    marginHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    marginBottom: SPACING.md,
  },
  selectedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    flexWrap: 'wrap',
    gap: 8,
  },
  selectedTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  adherenceBadge: {
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  adherenceBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  dayStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: SPACING.md,
  },
  dayStat: {
    alignItems: 'center',
    gap: 2,
  },
  dayStatIcon: {
    fontSize: 20,
  },
  dayStatValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  dayStatUnit: {
    fontSize: 12,
    fontWeight: '500',
  },
  dayStatTarget: {
    fontSize: 10,
  },
  dayStatLabel: {
    fontSize: 11,
  },
  aiSummaryBox: {
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 1,
  },
  aiSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  aiSummaryTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  aiSummaryText: {
    fontSize: 13,
    lineHeight: 19,
  },
  noDataText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  highlightsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  highlightCard: {
    width: '47.5%',
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  highlightIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  highlightValue: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  highlightLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
});
