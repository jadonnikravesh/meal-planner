/**
 * WeightReviewModal
 *
 * Slide-up weekly check-in sheet. Shows the user's estimated weight change
 * for the past week, lets them accept or fine-tune the suggested value,
 * then saves (or skips) before closing.
 *
 * Props
 *   visible      bool
 *   reviewData   output of estimateWeeklyWeightChange()
 *   onSave(w)    called with the accepted weight string
 *   onDismiss()  called when the user skips for this week
 */

import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput,
  StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// ─── Palette (Shred AI light theme) ──────────────────────────────────────────
// To revert: restore original dark values committed in git history
const BG     = '#F6F1E8';
const CARD   = '#FFFDF9';
const CARD2  = '#EDE8DF';
const BORDER = '#E5DDD2';
const WHITE  = '#1F2933';
const MUTED  = '#8A8278';
const ACCENT = '#5E8C61';
const GREEN  = '#5E8C61';
const ORANGE = '#D97745';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n)      { return n?.toLocaleString?.() ?? n; }
function fmtW(w)     { return isNaN(parseFloat(w)) ? '' : parseFloat(w).toFixed(1); }
function absKcal(n)  { return Math.abs(n).toLocaleString(); }
function sign(n)     { return n >= 0 ? '+' : ''; }

// ─── Tiny stat card ───────────────────────────────────────────────────────────
function StatCard({ icon, iconColor, value, sub }) {
  return (
    <View style={s.statCard}>
      <View style={[s.statIcon, { backgroundColor: iconColor + '22' }]}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statSub}>{sub}</Text>
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function WeightReviewModal({ visible, reviewData, onSave, onDismiss }) {
  const [weight, setWeight] = useState('');

  // Seed the input whenever new review data arrives
  useEffect(() => {
    if (reviewData) {
      setWeight(fmtW(reviewData.suggestedWeight));
    }
  }, [reviewData]);

  if (!reviewData) return null;

  const {
    daysTracked, avgCalories, tdee,
    weeklyBalance, weightChange, currentWeight, unit,
  } = reviewData;

  const isDeficit  = weeklyBalance < 0;
  const isSurplus  = weeklyBalance > 0;
  const balColor   = isDeficit ? GREEN : isSurplus ? ORANGE : MUTED;
  const balIcon    = isDeficit ? 'trending-down' : isSurplus ? 'trending-up' : 'remove';
  const balLabel   = isDeficit ? 'Deficit' : isSurplus ? 'Surplus' : 'Balanced';

  const adjust = (delta) => {
    const cur = parseFloat(weight) || reviewData.suggestedWeight;
    const next = Math.max(0, Math.round((cur + delta) * 10) / 10);
    setWeight(fmtW(next));
  };

  const handleSave = () => {
    const w = parseFloat(weight);
    if (!isNaN(w) && w > 0) onSave(fmtW(w));
  };

  const weightNum = parseFloat(weight);
  const saveDisabled = isNaN(weightNum) || weightNum <= 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* ── Header ── */}
          <View style={s.header}>
            <View style={[s.headerIcon, { backgroundColor: ACCENT + '22' }]}>
              <Ionicons name="scale-outline" size={18} color={ACCENT} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.headerTitle}>Weekly Weight Check-In</Text>
              <Text style={s.headerSub}>Based on your last 7 days of tracking</Text>
            </View>
            <TouchableOpacity onPress={onDismiss} style={s.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color={MUTED} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
          >

            {/* ── Stats row ── */}
            <View style={s.statsRow}>
              <StatCard
                icon="flame"
                iconColor={ORANGE}
                value={fmt(avgCalories)}
                sub="avg kcal/day"
              />
              <StatCard
                icon="flash"
                iconColor={ACCENT}
                value={fmt(tdee)}
                sub="TDEE target"
              />
              <StatCard
                icon="calendar-outline"
                iconColor={GREEN}
                value={`${daysTracked}/7`}
                sub="days tracked"
              />
            </View>

            {/* ── Weekly balance banner ── */}
            <View style={[s.balanceBanner, { borderColor: balColor + '44', backgroundColor: balColor + '11' }]}>
              <View style={s.balanceLeft}>
                <View style={[s.balancePill, { backgroundColor: balColor + '22' }]}>
                  <Ionicons name={balIcon} size={13} color={balColor} />
                  <Text style={[s.balancePillText, { color: balColor }]}>{balLabel}</Text>
                </View>
                <Text style={s.balanceKcal}>
                  {sign(weeklyBalance)}{absKcal(weeklyBalance)} kcal this week
                </Text>
              </View>
              <View style={s.balanceRight}>
                <Text style={[s.balanceChange, { color: balColor }]}>
                  {sign(weightChange)}{Math.abs(weightChange)} {unit}
                </Text>
                <Text style={s.balanceChangeSub}>estimated</Text>
              </View>
            </View>

            {/* ── Weight input ── */}
            <View style={s.weightSection}>
              <View style={s.weightLabelRow}>
                <Text style={s.weightLabel}>Suggested new weight</Text>
                <Text style={s.weightCurrent}>was {currentWeight} {unit}</Text>
              </View>

              <View style={s.weightRow}>
                {/* Minus */}
                <TouchableOpacity
                  style={s.adjBtn}
                  onPress={() => adjust(-0.1)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="remove" size={20} color={WHITE} />
                </TouchableOpacity>

                {/* Input */}
                <View style={s.weightInputWrap}>
                  <TextInput
                    style={s.weightInput}
                    value={weight}
                    onChangeText={(t) => setWeight(t.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    maxLength={7}
                  />
                  <Text style={s.weightUnit}>{unit}</Text>
                </View>

                {/* Plus */}
                <TouchableOpacity
                  style={s.adjBtn}
                  onPress={() => adjust(+0.1)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="add" size={20} color={WHITE} />
                </TouchableOpacity>
              </View>

              <Text style={s.weightHint}>
                Tap the number to type, or use − / + to fine-tune
              </Text>
            </View>

            {/* ── Divider ── */}
            <View style={s.divider} />

            {/* ── Actions ── */}
            <TouchableOpacity
              style={[s.saveBtn, saveDisabled && s.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saveDisabled}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={18} color="#FFF" />
              <Text style={s.saveBtnText}>Save & Update Weight</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.skipBtn}
              onPress={onDismiss}
              activeOpacity={0.7}
            >
              <Text style={s.skipBtnText}>Skip for this week</Text>
            </TouchableOpacity>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: WHITE },
  headerSub:   { fontSize: 12, color: MUTED, marginTop: 1 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: CARD2, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: BORDER,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row', gap: 10,
    marginTop: 20, marginBottom: 14,
  },
  statCard: {
    flex: 1, backgroundColor: CARD, borderRadius: 14, borderWidth: 1,
    borderColor: BORDER, padding: 12, alignItems: 'center', gap: 4,
  },
  statIcon: {
    width: 30, height: 30, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center', marginBottom: 2,
  },
  statValue: { fontSize: 16, fontWeight: '800', color: WHITE },
  statSub:   { fontSize: 10, color: MUTED, textAlign: 'center' },

  // Balance banner
  balanceBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 20,
  },
  balanceLeft:  { gap: 4 },
  balancePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  balancePillText: { fontSize: 11, fontWeight: '700' },
  balanceKcal:     { fontSize: 13, fontWeight: '600', color: WHITE },
  balanceRight:    { alignItems: 'flex-end', gap: 2 },
  balanceChange:   { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  balanceChangeSub:{ fontSize: 11, color: MUTED },

  // Weight input section
  weightSection: {
    backgroundColor: CARD, borderRadius: 18, borderWidth: 1,
    borderColor: BORDER, padding: 18, gap: 14, marginBottom: 20,
  },
  weightLabelRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  weightLabel:   { fontSize: 13, fontWeight: '700', color: WHITE },
  weightCurrent: { fontSize: 12, color: MUTED },

  weightRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  adjBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: CARD2, borderWidth: 1, borderColor: BORDER,
    justifyContent: 'center', alignItems: 'center',
  },
  weightInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: CARD2, borderRadius: 14, borderWidth: 1, borderColor: ACCENT + '55',
    paddingHorizontal: 14, paddingVertical: 12, gap: 6,
  },
  weightInput: {
    fontSize: 28, fontWeight: '800', color: WHITE,
    textAlign: 'center', minWidth: 80,
    // no explicit height so it sizes to font
  },
  weightUnit: { fontSize: 14, fontWeight: '600', color: MUTED, marginTop: 4 },
  weightHint: { fontSize: 11, color: MUTED, textAlign: 'center' },

  // Divider
  divider: { height: 1, backgroundColor: BORDER, marginBottom: 18 },

  // Save button
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: ACCENT, borderRadius: 14,
    paddingVertical: 14, marginBottom: 10,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: WHITE },

  // Skip button
  skipBtn: {
    alignItems: 'center', paddingVertical: 10,
  },
  skipBtnText: { fontSize: 14, color: MUTED, fontWeight: '500' },
});
