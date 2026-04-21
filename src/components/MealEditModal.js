import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  ScrollView, Image, StyleSheet, KeyboardAvoidingView,
  Platform, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/AppContext';
import { useMealContext } from '../context/MealContext';
import { parseFoodMessage, lookupIngredient, getIngredientBreakdown } from '../utils/foodParser';

const CARD_SIZE = 140;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function totalsFromIngredients(ings) {
  return ings.reduce(
    (acc, ing) => {
      const scale = (ing.grams || 0) / 100;
      return {
        kcal:    acc.kcal    + Math.round((ing.cal100    || 0) * scale),
        protein: Math.round((acc.protein + (ing.protein100 || 0) * scale) * 10) / 10,
        carbs:   Math.round((acc.carbs   + (ing.carbs100  || 0) * scale) * 10) / 10,
        fat:     Math.round((acc.fat     + (ing.fat100    || 0) * scale) * 10) / 10,
      };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function initIngredientsFromMeal(meal) {
  if (meal.ingredients && meal.ingredients.length > 0) return meal.ingredients;

  const breakdown = getIngredientBreakdown(meal.name ?? '');
  if (breakdown && breakdown.length > 0) return breakdown;

  const { items } = parseFoodMessage(meal.name ?? '');
  if (items.length > 0) {
    return items.map((item, idx) => ({
      id:         `parsed_${meal.id}_${idx}`,
      name:       item.name,
      grams:      item.grams,
      cal100:     item.cal100     ?? 0,
      protein100: item.protein100 ?? 0,
      carbs100:   item.carbs100   ?? 0,
      fat100:     item.fat100     ?? 0,
    }));
  }

  return [{
    id:         `single_${meal.id}`,
    name:       meal.name || 'Meal',
    grams:      100,
    cal100:     meal.kcal    ?? meal.calories ?? 0,
    protein100: meal.protein ?? 0,
    carbs100:   meal.carbs   ?? 0,
    fat100:     meal.fat     ?? 0,
  }];
}

// ─── Animated counter hook ────────────────────────────────────────────────────
// Smoothly counts from the previous value to `target` whenever it changes.

function useAnimatedValue(target, duration = 420) {
  const animValue  = useRef(new Animated.Value(target)).current;
  const prevTarget = useRef(target);
  const [displayed, setDisplayed] = useState(target);

  useEffect(() => {
    if (prevTarget.current === target) return;
    prevTarget.current = target;

    const isInt = Number.isInteger(target);

    const anim = Animated.timing(animValue, {
      toValue:         target,
      duration,
      useNativeDriver: false,
    });

    const listenerId = animValue.addListener(({ value }) => {
      setDisplayed(isInt ? Math.round(value) : Math.round(value * 10) / 10);
    });

    anim.start(({ finished }) => {
      animValue.removeListener(listenerId);
      if (finished) setDisplayed(target);
    });

    return () => {
      anim.stop();
      animValue.removeListener(listenerId);
    };
  }, [target]);

  return displayed;
}

// ─── Ingredient square card ───────────────────────────────────────────────────
function IngredientCard({ ingredient, onGramsChange, onRemove, c, s }) {
  const [text, setText] = useState(String(ingredient.grams));

  useEffect(() => { setText(String(ingredient.grams)); }, [ingredient.grams]);

  const handleChange = (t) => {
    setText(t);
    // Fire live update so macros recalculate in real-time while typing
    const n = parseFloat(t);
    if (!isNaN(n) && n > 0) onGramsChange(Math.round(n));
  };

  const handleBlur = () => {
    const n = parseFloat(text);
    if (!isNaN(n) && n > 0) onGramsChange(Math.round(n));
    else setText(String(ingredient.grams));
  };

  const scale   = ingredient.grams / 100;
  const kcal    = Math.round((ingredient.cal100    || 0) * scale);
  const protein = Math.round((ingredient.protein100 || 0) * scale * 10) / 10;
  const carbs   = Math.round((ingredient.carbs100   || 0) * scale * 10) / 10;
  const fat     = Math.round((ingredient.fat100     || 0) * scale * 10) / 10;

  return (
    <View style={[s.ingCard, { backgroundColor: c.card2, borderColor: c.border }]}>
      <TouchableOpacity
        style={s.ingCardRemove}
        onPress={onRemove}
        activeOpacity={0.7}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      >
        <Ionicons name="close-circle" size={18} color={c.red} />
      </TouchableOpacity>

      <Text style={[s.ingCardName, { color: c.white }]} numberOfLines={2}>
        {ingredient.name}
      </Text>

      <View style={[s.ingCardServingPill, { borderColor: c.border, backgroundColor: c.card }]}>
        <TextInput
          style={[s.ingCardServingInput, { color: c.white }]}
          value={text}
          onChangeText={handleChange}
          onBlur={handleBlur}
          keyboardType="decimal-pad"
          selectTextOnFocus
        />
        <Text style={[s.ingCardServingUnit, { color: c.muted }]}>g</Text>
      </View>

      <Text style={[s.ingCardKcal, { color: c.white }]}>
        {kcal} <Text style={[s.ingCardKcalUnit, { color: c.muted }]}>kcal</Text>
      </Text>
      <Text style={[s.ingCardMacros, { color: c.muted }]}>
        P{protein} · C{carbs} · F{fat}
      </Text>
    </View>
  );
}

// ─── Add ingredient card (last slot in the row) ───────────────────────────────
function AddIngredientCard({ onPress, c, s }) {
  return (
    <TouchableOpacity
      style={[s.ingCard, s.ingCardAdd, { borderColor: c.accent + '66' }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Ionicons name="add-circle-outline" size={28} color={c.accent} />
      <Text style={[s.ingCardAddText, { color: c.accent }]}>Add{'\n'}Ingredient</Text>
    </TouchableOpacity>
  );
}

// ─── Animated macro display row ───────────────────────────────────────────────
function MacroRow({ icon, color, label, value, c, s }) {
  const displayed = useAnimatedValue(value);
  return (
    <View style={s.macroRow}>
      <View style={[s.macroIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <Text style={s.macroLabel}>{label}</Text>
      <Text style={[s.macroValue, { color: c.white }]}>
        {displayed}
        <Text style={{ color: c.muted, fontSize: 12 }}>{label === 'Calories' ? ' kcal' : ' g'}</Text>
      </Text>
    </View>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
export default function MealEditModal({ visible, meal, date, onClose }) {
  const c = useTheme();
  const { updateMeal, removeMeal } = useMealContext();
  const s = makeStyles(c);

  const [name,        setName]        = useState('');
  const [dirty,       setDirty]       = useState(false);
  const [ingredients, setIngredients] = useState([]);

  const [showAddForm,     setShowAddForm]     = useState(false);
  const [newIngName,      setNewIngName]      = useState('');
  const [newIngGrams,     setNewIngGrams]     = useState('');
  const [estimatedGrams,  setEstimatedGrams]  = useState(null);
  const [addError,        setAddError]        = useState('');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // Derive macros reactively — always in sync with ingredient state
  const macros = useMemo(() => totalsFromIngredients(ingredients), [ingredients]);

  useEffect(() => {
    if (!meal) return;
    setName(meal.name ?? '');
    setDirty(false);
    setShowAddForm(false);
    setNewIngName('');
    setNewIngGrams('');
    setEstimatedGrams(null);
    setAddError('');
    setShowConfirmDelete(false);
    setIngredients(initIngredientsFromMeal(meal));
  }, [meal]);

  // ── Ingredient handlers ────────────────────────────────────────────────────

  const handleIngGramsChange = useCallback((id, newGrams) => {
    setIngredients((prev) =>
      prev.map((ing) => ing.id === id ? { ...ing, grams: newGrams } : ing)
    );
    setDirty(true);
  }, []);

  const handleIngRemove = useCallback((id) => {
    setIngredients((prev) => prev.filter((ing) => ing.id !== id));
    setDirty(true);
  }, []);

  // Lookup auto-estimate whenever the food name changes
  const handleNameChange = (t) => {
    setNewIngName(t);
    setAddError('');
    const trimmed = t.trim();
    if (trimmed) {
      const looked = lookupIngredient(trimmed);
      setEstimatedGrams(looked?.defaultGrams ?? 100);
    } else {
      setEstimatedGrams(null);
    }
  };

  const handleAddIngredient = () => {
    const nameVal = newIngName.trim();
    if (!nameVal) { setAddError('Enter a food name.'); return; }

    const looked    = lookupIngredient(nameVal);
    // Use typed grams if provided, otherwise use the auto-estimated default
    const rawGrams  = newIngGrams.trim();
    const gramsVal  = rawGrams ? parseFloat(rawGrams) : (estimatedGrams ?? 100);

    if (isNaN(gramsVal) || gramsVal <= 0) { setAddError('Enter a valid amount.'); return; }

    const newIng = {
      id:         `manual_${Date.now()}`,
      name:       looked?.resolvedName ?? (nameVal.charAt(0).toUpperCase() + nameVal.slice(1)),
      grams:      Math.round(gramsVal),
      cal100:     looked?.cal100     ?? 0,
      protein100: looked?.protein100 ?? 0,
      carbs100:   looked?.carbs100   ?? 0,
      fat100:     looked?.fat100     ?? 0,
    };

    setIngredients((prev) => [...prev, newIng]);
    setNewIngName('');
    setNewIngGrams('');
    setEstimatedGrams(null);
    setAddError('');
    setShowAddForm(false);
    setDirty(true);
  };

  // ── Save / Delete ──────────────────────────────────────────────────────────

  const handleSave = () => {
    if (!meal) return;
    updateMeal({
      ...meal,
      name:        name.trim() || meal.name,
      kcal:        macros.kcal,
      calories:    macros.kcal,
      protein:     macros.protein,
      carbs:       macros.carbs,
      fat:         macros.fat,
      ingredients,
    }, date);
    onClose();
  };

  const handleDelete = () => setShowConfirmDelete(true);

  const confirmDelete = () => {
    setShowConfirmDelete(false);
    // Close the modal first so the list re-renders without the deleted item
    onClose();
    // Small tick so the modal dismiss animation starts before state mutates
    setTimeout(() => {
      removeMeal(meal.id, date);
    }, 50);
  };

  if (!meal) return null;

  const gramsPlaceholder = estimatedGrams ? `~${estimatedGrams}` : '100';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
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

          {/* ── Ingredients ── */}
          <View style={[s.section, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[s.sectionTitle, { color: c.white }]}>Ingredients</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.ingScroll}
              keyboardShouldPersistTaps="handled"
            >
              {ingredients.map((ing) => (
                <IngredientCard
                  key={ing.id}
                  ingredient={ing}
                  onGramsChange={(g) => handleIngGramsChange(ing.id, g)}
                  onRemove={() => handleIngRemove(ing.id)}
                  c={c}
                  s={s}
                />
              ))}
              <AddIngredientCard onPress={() => setShowAddForm(true)} c={c} s={s} />
            </ScrollView>

            {/* Add ingredient inline form */}
            {showAddForm && (
              <View style={[s.addIngForm, { borderColor: c.border, backgroundColor: c.card2 }]}>
                <TextInput
                  style={[s.addIngNameInput, { color: c.white, borderColor: c.border, backgroundColor: c.card }]}
                  value={newIngName}
                  onChangeText={handleNameChange}
                  placeholder="Food name (e.g. chicken, cheese)"
                  placeholderTextColor={c.muted}
                  autoFocus
                />
                <View style={s.addIngBottom}>
                  <View style={[s.addIngQtyRow, { borderColor: c.border, backgroundColor: c.card }]}>
                    <TextInput
                      style={[s.addIngQtyInput, { color: c.white }]}
                      value={newIngGrams}
                      onChangeText={(t) => { setNewIngGrams(t); setAddError(''); }}
                      placeholder={gramsPlaceholder}
                      placeholderTextColor={c.muted}
                      keyboardType="decimal-pad"
                    />
                    <Text style={{ color: c.muted, fontSize: 13 }}>g</Text>
                  </View>
                  <TouchableOpacity
                    style={[s.addIngConfirmBtn, { backgroundColor: c.accent }]}
                    onPress={handleAddIngredient}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark" size={18} color="#FFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.addIngCancelBtn, { borderColor: c.border }]}
                    onPress={() => { setShowAddForm(false); setNewIngName(''); setNewIngGrams(''); setEstimatedGrams(null); setAddError(''); }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="close" size={18} color={c.muted} />
                  </TouchableOpacity>
                </View>
                {/* Auto-estimate hint */}
                {estimatedGrams && !newIngGrams ? (
                  <Text style={[s.autoEstimateHint, { color: c.accent }]}>
                    Auto-estimated: ~{estimatedGrams}g — tap ✓ or enter a custom amount
                  </Text>
                ) : null}
                {addError ? <Text style={{ color: c.red, fontSize: 12 }}>{addError}</Text> : null}
              </View>
            )}
          </View>

          {/* ── Total Macros (live, animated) ── */}
          <View style={[s.section, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[s.sectionTitle, { color: c.white }]}>Total Macros</Text>
            <Text style={[s.sectionSub, { color: c.muted }]}>Recalculated from ingredients</Text>
            <MacroRow icon="flame"   color="#FF6B6B"   label="Calories" value={macros.kcal}    c={c} s={s} />
            <MacroRow icon="flash"   color={c.protein} label="Protein"  value={macros.protein} c={c} s={s} />
            <MacroRow icon="leaf"    color={c.carbs}   label="Carbs"    value={macros.carbs}   c={c} s={s} />
            <MacroRow icon="ellipse" color={c.fat}     label="Fat"      value={macros.fat}     c={c} s={s} />
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

      {/* ── Confirm-delete sheet ── */}
      {showConfirmDelete && (
        <View style={s.confirmOverlay}>
          <View style={[s.confirmSheet, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[s.confirmIconWrap, { backgroundColor: c.red + '18' }]}>
              <Ionicons name="trash-outline" size={26} color={c.red} />
            </View>
            <Text style={[s.confirmTitle, { color: c.white }]}>Remove Meal?</Text>
            <Text style={[s.confirmBody, { color: c.muted }]}>
              This will permanently delete{'\n'}
              <Text style={{ color: c.white, fontWeight: '700' }} numberOfLines={1}>
                {meal?.name}
              </Text>
              {'\n'}and update all your totals.
            </Text>
            <View style={s.confirmBtns}>
              <TouchableOpacity
                style={[s.confirmCancelBtn, { borderColor: c.border }]}
                onPress={() => setShowConfirmDelete(false)}
                activeOpacity={0.8}
              >
                <Text style={[s.confirmCancelText, { color: c.muted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmDeleteBtn, { backgroundColor: c.red }]}
                onPress={confirmDelete}
                activeOpacity={0.8}
              >
                <Ionicons name="trash" size={15} color="#FFF" />
                <Text style={s.confirmDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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

    section:      { borderRadius: 18, borderWidth: 1, padding: 16, gap: 12 },
    sectionTitle: { fontSize: 15, fontWeight: '700' },
    sectionSub:   { fontSize: 12, marginTop: -4 },

    ingScroll: { paddingVertical: 4, paddingRight: 4, gap: 10 },

    ingCard: {
      width: CARD_SIZE,
      height: CARD_SIZE,
      borderRadius: 16,
      borderWidth: 1,
      padding: 12,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
    },
    ingCardRemove: {
      position: 'absolute',
      top: 8,
      right: 8,
    },
    ingCardName: {
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: 17,
    },
    ingCardServingPill: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderRadius: 20,
      paddingHorizontal: 8,
      paddingVertical: 4,
      width: CARD_SIZE * 0.5,
    },
    ingCardServingInput: {
      fontSize: 15,
      fontWeight: '700',
      textAlign: 'center',
      width: 36,
    },
    ingCardServingUnit: { fontSize: 12, fontWeight: '600' },
    ingCardKcal:        { fontSize: 12, fontWeight: '700', textAlign: 'center' },
    ingCardKcalUnit:    { fontSize: 10, fontWeight: '400' },
    ingCardMacros:      { fontSize: 10, textAlign: 'center' },

    ingCardAdd: {
      justifyContent: 'center',
      alignItems: 'center',
      borderStyle: 'dashed',
      gap: 6,
    },
    ingCardAddText: { fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 17 },

    addIngForm:         { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
    addIngNameInput:    { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
    addIngBottom:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
    addIngQtyRow:       { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
    addIngQtyInput:     { flex: 1, fontSize: 14 },
    addIngConfirmBtn:   { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    addIngCancelBtn:    { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
    autoEstimateHint:   { fontSize: 11, fontWeight: '500' },

    macroRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
    macroIcon:  { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    macroLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: c.white },
    macroValue: { fontSize: 15, fontWeight: '700' },

    saveBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 16, paddingVertical: 15 },
    saveBtnText:  { fontSize: 15, fontWeight: '700' },
    deleteBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 16, paddingVertical: 13, backgroundColor: 'transparent' },
    deleteBtnText:{ fontSize: 14, fontWeight: '600' },

    // Confirm-delete overlay
    confirmOverlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    confirmSheet: {
      borderTopLeftRadius: 28, borderTopRightRadius: 28,
      borderWidth: 1, padding: 28, alignItems: 'center', gap: 14,
    },
    confirmIconWrap: {
      width: 56, height: 56, borderRadius: 18,
      justifyContent: 'center', alignItems: 'center', marginBottom: 2,
    },
    confirmTitle:  { fontSize: 18, fontWeight: '800' },
    confirmBody:   { fontSize: 14, lineHeight: 21, textAlign: 'center' },
    confirmBtns:   { flexDirection: 'row', gap: 12, marginTop: 6, width: '100%' },
    confirmCancelBtn: {
      flex: 1, borderWidth: 1, borderRadius: 14,
      paddingVertical: 14, alignItems: 'center',
    },
    confirmCancelText: { fontSize: 15, fontWeight: '600' },
    confirmDeleteBtn: {
      flex: 1, borderRadius: 14, paddingVertical: 14,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    },
    confirmDeleteText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  });
}
