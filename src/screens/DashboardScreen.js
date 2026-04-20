import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { RADIUS, SPACING } from '../theme';
import { useApp, useTheme } from '../context/AppContext';
import { getTodayKey, getGreeting, formatDate } from '../utils/nutrition';
import CircularProgress from '../components/CircularProgress';
import MealCard from '../components/MealCard';

const WATER_QUICK = [
  { label: '+250ml', ml: 250, icon: '🥛' },
  { label: '+500ml', ml: 500, icon: '🍶' },
  { label: '+750ml', ml: 750, icon: '🫙' },
];

export default function DashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useApp();
  const C = useTheme();

  const { userProfile, dailyLogs } = state;
  const todayKey = getTodayKey();
  const log = dailyLogs[todayKey] || { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0, meals: [] };

  const [waterModalVisible, setWaterModalVisible] = useState(false);
  const [customWater, setCustomWater] = useState('');

  const calories = Math.round(log.calories || 0);
  const protein = Math.round(log.protein || 0);
  const carbs = Math.round(log.carbs || 0);
  const fat = Math.round(log.fat || 0);
  const water = Math.round(log.water || 0);

  const calTarget = userProfile.calorieTarget || 2000;
  const protTarget = userProfile.proteinTarget || 150;
  const carbTarget = userProfile.carbTarget || 225;
  const fatTarget = userProfile.fatTarget || 56;
  const waterTarget = userProfile.waterTarget || 2700;

  const calRemaining = Math.max(0, calTarget - calories);
  const calPct = Math.min(100, Math.round((calories / calTarget) * 100));
  const waterPct = Math.min(100, Math.round((water / waterTarget) * 100));

  const macros = [
    { label: 'Protein', value: protein, max: protTarget, unit: 'g', color: C.blue },
    { label: 'Carbs',   value: carbs,   max: carbTarget, unit: 'g', color: C.yellow },
    { label: 'Fat',     value: fat,     max: fatTarget,  unit: 'g', color: C.orange },
  ];

  const addWater = (ml) => {
    dispatch({ type: 'LOG_WATER', payload: { date: todayKey, amount: ml } });
  };

  const handleCustomWater = () => {
    const ml = parseInt(customWater, 10);
    if (ml > 0 && ml <= 5000) {
      addWater(ml);
      setCustomWater('');
      setWaterModalVisible(false);
    }
  };

  const recentMeals = (log.meals || []).slice(-4);

  // Build meal card display (up to 4 slots)
  const MEAL_SLOTS = [
    { title: 'Breakfast', icon: '🌅' },
    { title: 'Lunch',     icon: '🥗' },
    { title: 'Snack',     icon: '🍎' },
    { title: 'Dinner',    icon: '🌙' },
  ];

  const firstInitial = (userProfile.name || 'U')[0].toUpperCase();
  const greeting = getGreeting();
  const firstName = userProfile.name ? userProfile.name.split(' ')[0] : 'there';
  const todayLabel = formatDate(todayKey);

  return (
    <View style={[{ flex: 1, backgroundColor: C.bg }, { paddingTop: insets.top }]}>
      <StatusBar barStyle={state.settings.darkMode ? 'light-content' : 'dark-content'} backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: C.text }]}>{greeting}, {firstName} 👋</Text>
          <Text style={[styles.date, { color: C.textSub }]}>{todayLabel}</Text>
        </View>
        <TouchableOpacity style={styles.avatarBtn}>
          <LinearGradient colors={[C.accent, C.teal]} style={styles.avatar}>
            <Text style={styles.avatarText}>{firstInitial}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Calorie card */}
        <LinearGradient
          colors={state.settings.darkMode ? ['#1A2A1A', '#161B27'] : ['#F0FDF4', '#FFFFFF']}
          style={[styles.calorieCard, { borderColor: C.accent + '33' }]}
        >
          <View style={styles.calorieCardInner}>
            <View style={styles.calorieLeft}>
              <Text style={[styles.calorieTitle, { color: C.textSub }]}>TODAY'S CALORIES</Text>
              <Text style={styles.calorieRemain}>
                <Text style={[styles.calorieRemainNum, { color: C.accent }]}>{calRemaining} </Text>
                <Text style={[styles.calorieRemainLabel, { color: C.textSub }]}>kcal remaining</Text>
              </Text>
              <View style={[styles.calorieTrack, { backgroundColor: C.borderLight }]}>
                <View style={[styles.calorieFill, { width: `${calPct}%`, backgroundColor: C.accent }]} />
              </View>
              <Text style={[styles.calorieSub, { color: C.textMuted }]}>{calories} / {calTarget} kcal consumed</Text>
            </View>
            <CircularProgress
              value={calories}
              max={calTarget}
              size={118}
              strokeWidth={10}
              color={C.accent}
              label={String(calories)}
              sublabel="kcal"
            />
          </View>
        </LinearGradient>

        {/* Macro chips */}
        <View style={styles.macrosRow}>
          {macros.map((m) => {
            const pct = Math.min(100, Math.round((m.value / m.max) * 100));
            return (
              <View key={m.label} style={[styles.macroChip, { backgroundColor: C.surface, borderColor: C.border }]}>
                <Text style={[styles.macroLabel, { color: m.color }]}>{m.label}</Text>
                <Text style={[styles.macroValue, { color: C.text }]}>
                  {m.value}<Text style={[styles.macroUnit, { color: C.textSub }]}>{m.unit}</Text>
                </Text>
                <View style={[styles.macroTrack, { backgroundColor: C.borderLight }]}>
                  <View style={[styles.macroFill, { width: `${pct}%`, backgroundColor: m.color }]} />
                </View>
                <Text style={[styles.macroPct, { color: m.color }]}>{pct}%</Text>
              </View>
            );
          })}
        </View>

        {/* Water tracking */}
        <View style={[styles.waterCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={styles.waterHeader}>
            <View style={styles.waterTitleRow}>
              <Text style={{ fontSize: 18 }}>💧</Text>
              <Text style={[styles.waterTitle, { color: C.text }]}>Water Intake</Text>
            </View>
            <Text style={[styles.waterAmount, { color: C.blue }]}>
              {(water / 1000).toFixed(1)} / {(waterTarget / 1000).toFixed(1)} L
            </Text>
          </View>

          <View style={[styles.waterTrack, { backgroundColor: C.borderLight }]}>
            <View style={[styles.waterFill, { width: `${waterPct}%`, backgroundColor: C.blue }]} />
          </View>

          <Text style={[styles.waterPct, { color: C.textMuted }]}>{waterPct}% of daily goal</Text>

          <View style={styles.waterBtns}>
            {WATER_QUICK.map((q) => (
              <TouchableOpacity
                key={q.label}
                style={[styles.waterBtn, { backgroundColor: C.blueDim, borderColor: C.blue + '55' }]}
                onPress={() => addWater(q.ml)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 14 }}>{q.icon}</Text>
                <Text style={[styles.waterBtnText, { color: C.blue }]}>{q.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.waterBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
              onPress={() => setWaterModalVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={16} color={C.textSub} />
              <Text style={[styles.waterBtnText, { color: C.textSub }]}>Custom</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Today's Meals */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: C.text }]}>🍽 Today's Meals</Text>
            <Text style={[styles.sectionSub, { color: C.textSub }]}>
              {recentMeals.length} logged
            </Text>
          </View>

          {recentMeals.length > 0 ? (
            recentMeals.map((meal, i) => (
              <View key={i} style={[styles.loggedMeal, { backgroundColor: C.surface, borderColor: C.border }]}>
                <Text style={[styles.loggedMealName, { color: C.text }]}>{meal.name}</Text>
                <View style={styles.loggedMealMacros}>
                  <Text style={[styles.loggedMealKcal, { color: C.accent }]}>{meal.calories} kcal</Text>
                  <Text style={[styles.loggedMealMacro, { color: C.textSub }]}>{meal.protein.toFixed(0)}g P</Text>
                  <Text style={[styles.loggedMealMacro, { color: C.textSub }]}>{meal.carbs.toFixed(0)}g C</Text>
                  <Text style={[styles.loggedMealMacro, { color: C.textSub }]}>{meal.fat.toFixed(0)}g F</Text>
                </View>
              </View>
            ))
          ) : (
            MEAL_SLOTS.map((slot) => (
              <MealCard
                key={slot.title}
                title={slot.title}
                icon={slot.icon}
                calories={0}
                items=""
                time=""
                logged={false}
              />
            ))
          )}
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          {[
            { icon: '💪', num: `${protTarget - protein > 0 ? protTarget - protein : 0}g`, label: 'Protein Left', color: C.blue },
            { icon: '⚡', num: `${calRemaining}`, label: 'Kcal Left', color: C.accent },
            { icon: '💧', num: `${((waterTarget - water) / 1000).toFixed(1)}L`, label: 'Water Left', color: C.teal },
          ].map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Text style={styles.statIcon}>{s.icon}</Text>
              <Text style={[styles.statNum, { color: s.color }]}>{s.num}</Text>
              <Text style={[styles.statLabel, { color: C.textMuted }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* FAB → navigate to Assistant */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 80 }]}
        onPress={() => navigation?.navigate('Assistant')}
      >
        <LinearGradient colors={[C.purple, '#6D28D9']} style={styles.fabGradient}>
          <Ionicons name="mic" size={26} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>

      {/* Custom water modal */}
      <Modal visible={waterModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Add Water</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: C.surfaceAlt, borderColor: C.border, color: C.text }]}
              placeholder="Amount in ml (e.g. 350)"
              placeholderTextColor={C.textMuted}
              value={customWater}
              onChangeText={setCustomWater}
              keyboardType="numeric"
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: C.border }]}
                onPress={() => { setWaterModalVisible(false); setCustomWater(''); }}
              >
                <Text style={[styles.modalBtnText, { color: C.textSub }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: C.blue, borderColor: C.blue }]}
                onPress={handleCustomWater}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  date: {
    fontSize: 13,
    marginTop: 2,
  },
  avatarBtn: {},
  avatar: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  scroll: {
    paddingHorizontal: SPACING.md,
    paddingTop: 4,
  },
  calorieCard: {
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
  },
  calorieCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calorieLeft: {
    flex: 1,
    marginRight: SPACING.md,
  },
  calorieTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  calorieRemain: {
    marginBottom: 10,
  },
  calorieRemainNum: {
    fontSize: 22,
    fontWeight: '800',
  },
  calorieRemainLabel: {
    fontSize: 13,
  },
  calorieTrack: {
    height: 6,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: 6,
  },
  calorieFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },
  calorieSub: {
    fontSize: 11,
  },
  macrosRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  macroChip: {
    flex: 1,
    borderRadius: RADIUS.lg,
    padding: 12,
    borderWidth: 1,
  },
  macroLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  macroValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  macroUnit: {
    fontSize: 11,
    fontWeight: '500',
  },
  macroTrack: {
    height: 4,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginTop: 6,
    marginBottom: 4,
  },
  macroFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },
  macroPct: {
    fontSize: 10,
    fontWeight: '700',
  },
  // Water
  waterCard: {
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
  },
  waterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  waterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  waterTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  waterAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  waterTrack: {
    height: 8,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: 6,
  },
  waterFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },
  waterPct: {
    fontSize: 11,
    marginBottom: 12,
  },
  waterBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  waterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  waterBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  // Meals
  section: {
    marginBottom: SPACING.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionSub: {
    fontSize: 13,
  },
  loggedMeal: {
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  loggedMealName: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'capitalize',
    marginBottom: 6,
  },
  loggedMealMacros: {
    flexDirection: 'row',
    gap: 12,
  },
  loggedMealKcal: {
    fontSize: 13,
    fontWeight: '700',
  },
  loggedMealMacro: {
    fontSize: 12,
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  statCard: {
    flex: 1,
    borderRadius: RADIUS.lg,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  statIcon: {
    fontSize: 22,
    marginBottom: 6,
  },
  statNum: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  // FAB
  fab: {
    position: 'absolute',
    right: SPACING.md,
    zIndex: 100,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBox: {
    width: '80%',
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: SPACING.md,
  },
  modalInput: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: SPACING.md,
  },
  modalBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
