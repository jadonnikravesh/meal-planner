import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  ScrollView, Image, Alert, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/AppContext';
import { useMealContext } from '../context/MealContext';

// ─── Serving multiplier presets ───────────────────────────────────────────────
const PRESETS = [
  { label: '½x',    value: 0.5  },
  { label: '¾x',    value: 0.75 },
  { label: '1x',    value: 1.0  },
  { label: '1½x',   value: 1.5  },
  { label: '2x',    value: 2.0  },
];

// Round to at most 1 decimal place, remove trailing .0
function fmt(n) {
  const r = Math.round(n * 10) / 10;
  return r % 1 === 0 ? String(Math.round(r)) : r.toFixed(1);
}

// ─── Single editable macro row ────────────────────────────────────────────────
function MacroRow({ icon, color, label, value, onChange, c, s }) {
  const [text, setText] = useState(String(value));

  // Sync when parent recomputes (serving change)
  useEffect(() => { setText(String(value)); }, [value]);

  const commit = () => {
    const n = parseFloat(text);
    if (!isNaN(n) && n >= 0) onChange(Math.round(n * 10) / 10);
    else setText(String(value)); // revert bad input
  };

  return (
    <View style={s.macroRow}>
      <View style={[s.macroIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <Text style={s.macroLabel}>{label}</Text>
      <View style={s.macroInputWrap}>
        <TextInput
          style={[s.macroInput, { color: c.white, borderColor: c.border }]}
          value={text}
          onChangeText={setText}
          onBlur={commit}
          keyboardType="decimal-pad"
          selectTextOnFocus
        />
        <Text style={s.macroUnit}>{label === 'Calories' ? 'kcal' : 'g'}</Text>
      </View>
    </View>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
export default function MealEditModal({ visible, meal, date, onClose }) {
  const c = useTheme();
  const { updateMeal, removeMeal } = useMealContext();
  const s = makeStyles(c);

  // Base values (from the original meal, captured when modal opens)
  const [base, setBase]     = useState(null);
  const [name, setName]     = useState('');
  const [multiplier, setMult] = useState(1.0);
  const [customMult, setCustomMult] = useState('');
  const [macros, setMacros] = useState({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const [dirty, setDirty]   = useState(false);

  // Initialise when meal changes
  useEffect(() => {
    if (!meal) return;
    const b = {
      kcal:    meal.kcal    ?? meal.calories ?? 0,
      protein: meal.protein ?? 0,
      carbs:   meal.carbs   ?? 0,
      fat:     meal.fat     ?? 0,
    };
    setBase(b);
    setName(meal.name ?? '');
    setMult(1.0);
    setCustomMult('');
    setMacros({ ...b });
    setDirty(false);
  }, [meal]);

  // Apply a multiplier to base values
  const applyMultiplier = useCallback((m) => {
    if (!base) return;
    setMult(m);
    setCustomMult('');
    setMacros({
      kcal:    Math.round(base.kcal    * m),
      protein: Math.round(base.protein * m * 10) / 10,
      carbs:   Math.round(base.carbs   * m * 10) / 10,
      fat:     Math.round(base.fat     * m * 10) / 10,
    });
    setDirty(true);
  }, [base]);

  const applyCustomMult = () => {
    const n = parseFloat(customMult);
    if (!isNaN(n) && n > 0) applyMultiplier(Math.round(n * 100) / 100);
  };

  const setMacro = (key, val) => {
    setMacros((prev) => ({ ...prev, [key]: val }));
    setMult(null); // custom macro edit → clear preset highlight
    setDirty(true);
  };

  const handleSave = () => {
    if (!meal) return;
    const updated = {
      ...meal,
      name:     name.trim() || meal.name,
      kcal:     macros.kcal,
      calories: macros.kcal,
      protein:  macros.protein,
      carbs:    macros.carbs,
      fat:      macros.fat,
    };
    updateMeal(updated, date);
    onClose();
  };

  const handleDelete = () => {
    Alert.alert(
      'Remove Meal',
      'Are you sure you want to delete this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            removeMeal(meal.id, date);
            onClose();
          },
        },
      ],
      { cancelable: true },
    );
  };

  if (!meal) return null;

  const activePreset = PRESETS.find((p) => p.value === multiplier);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[s.root, { backgroundColor: c.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={20} color={c.white} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: c.white }]}>Edit Meal</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Meal photo + name ── */}
          <View style={s.heroRow}>
            <Image
              source={{ uri: meal.uri }}
              style={[s.heroImg, { backgroundColor: meal.fallbackColor || c.card }]}
              resizeMode="cover"
            />
            <View style={{ flex: 1 }}>
              <Text style={[s.fieldLabel, { color: c.muted }]}>Meal Name</Text>
              <TextInput
                style={[s.nameInput, { color: c.white, borderColor: c.border, backgroundColor: c.card }]}
                value={name}
                onChangeText={(t) => { setName(t); setDirty(true); }}
                placeholder="Meal name"
                placeholderTextColor={c.muted}
              />
            </View>
          </View>

          {/* ── Serving size ── */}
          <View style={[s.section, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[s.sectionTitle, { color: c.white }]}>Serving Size</Text>
            <Text style={[s.sectionSub, { color: c.muted }]}>
              Scale all macros relative to the original logged portion
            </Text>

            <View style={s.presetRow}>
              {PRESETS.map((p) => {
                const active = activePreset?.value === p.value;
                return (
                  <TouchableOpacity
                    key={p.value}
                    style={[s.presetBtn, { borderColor: c.border, backgroundColor: active ? c.accent : c.card2 }]}
                    onPress={() => applyMultiplier(p.value)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.presetLabel, { color: active ? '#FFF' : c.muted }]}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={s.customRow}>
              <Text style={[s.fieldLabel, { color: c.muted, marginBottom: 0 }]}>Custom multiplier</Text>
              <View style={s.customInputWrap}>
                <TextInput
                  style={[s.customInput, { color: c.white, borderColor: c.border, backgroundColor: c.card2 }]}
                  value={customMult}
                  onChangeText={setCustomMult}
                  onSubmitEditing={applyCustomMult}
                  placeholder="e.g. 1.3"
                  placeholderTextColor={c.muted}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[s.applyBtn, { backgroundColor: c.accentDim, borderColor: c.accent + '55' }]}
                  onPress={applyCustomMult}
                  activeOpacity={0.8}
                >
                  <Text style={[s.applyBtnText, { color: c.accent }]}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ── Macros ── */}
          <View style={[s.section, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[s.sectionTitle, { color: c.white }]}>Macros</Text>
            <Text style={[s.sectionSub, { color: c.muted }]}>
              Fine-tune individual values for accuracy
            </Text>

            <MacroRow icon="flame"   color="#FF6B6B" label="Calories" value={macros.kcal}    onChange={(v) => setMacro('kcal',    v)} c={c} s={s} />
            <MacroRow icon="flash"   color={c.protein} label="Protein"  value={macros.protein} onChange={(v) => setMacro('protein', v)} c={c} s={s} />
            <MacroRow icon="leaf"    color={c.carbs}   label="Carbs"    value={macros.carbs}   onChange={(v) => setMacro('carbs',   v)} c={c} s={s} />
            <MacroRow icon="ellipse" color={c.fat}     label="Fat"      value={macros.fat}     onChange={(v) => setMacro('fat',     v)} c={c} s={s} />
          </View>

          {/* ── Actions ── */}
          <TouchableOpacity
            style={[s.saveBtn, { backgroundColor: dirty ? c.accent : c.card, borderColor: dirty ? c.accent : c.border }]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={!dirty}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color={dirty ? '#FFF' : c.muted} />
            <Text style={[s.saveBtnText, { color: dirty ? '#FFF' : c.muted }]}>Save Changes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.deleteBtn, { borderColor: c.red + '55' }]}
            onPress={handleDelete}
            activeOpacity={0.85}
          >
            <Ionicons name="trash-outline" size={16} color={c.red} />
            <Text style={[s.deleteBtnText, { color: c.red }]}>Delete Meal</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function makeStyles(c) {
  return StyleSheet.create({
    root:       { flex: 1 },
    header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
    closeBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: c.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: c.border },
    headerTitle:{ fontSize: 17, fontWeight: '700' },
    scroll:     { paddingHorizontal: 16, paddingBottom: 48, gap: 14 },

    heroRow:    { flexDirection: 'row', gap: 14, alignItems: 'center' },
    heroImg:    { width: 80, height: 80, borderRadius: 16 },

    fieldLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 },
    nameInput:  { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontWeight: '600' },

    section:    { borderRadius: 18, borderWidth: 1, padding: 16, gap: 12 },
    sectionTitle:{ fontSize: 15, fontWeight: '700' },
    sectionSub: { fontSize: 12, marginTop: -6 },

    presetRow:  { flexDirection: 'row', gap: 8 },
    presetBtn:  { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
    presetLabel:{ fontSize: 13, fontWeight: '700' },

    customRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    customInputWrap: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    customInput:{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, width: 90, textAlign: 'center' },
    applyBtn:   { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
    applyBtnText:{ fontSize: 13, fontWeight: '700' },

    macroRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
    macroIcon:  { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    macroLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: c.white },
    macroInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    macroInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, fontSize: 14, fontWeight: '600', width: 80, textAlign: 'right' },
    macroUnit:  { fontSize: 12, color: c.muted, width: 28 },

    saveBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 16, paddingVertical: 15 },
    saveBtnText:{ fontSize: 15, fontWeight: '700' },

    deleteBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 16, paddingVertical: 13, backgroundColor: 'transparent' },
    deleteBtnText:{ fontSize: 14, fontWeight: '600' },
  });
}
