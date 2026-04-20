import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Switch, TextInput, Modal, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as StoreReview from 'expo-store-review';
import { useApp, useTheme } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import TermsOfServiceScreen from './TermsOfServiceScreen';
import PrivacyPolicyScreen  from './PrivacyPolicyScreen';

// ─── Rate the app ─────────────────────────────────────────────────────────────
// Store URLs used as a fallback when the native review dialog isn't available
// (e.g. in development). Replace with your real store IDs once published.
const STORE_URLS = {
  ios:     'https://apps.apple.com/app/id000000000',   // replace id with your numeric App Store ID
  android: 'https://play.google.com/store/apps/details?id=com.fitchatai.app',
};

async function requestAppRating() {
  try {
    const available = await StoreReview.isAvailableAsync();
    if (available) {
      // Native in-app review dialog — rating goes straight to the store
      await StoreReview.requestReview();
    } else {
      // Fallback: open the store listing directly
      const url = Platform.OS === 'ios' ? STORE_URLS.ios : STORE_URLS.android;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) Linking.openURL(url);
    }
  } catch (_) {}
}

const USER_EMAIL = 'alex@example.com'; // placeholder until Firebase profile sync

// ─── Picker option arrays ─────────────────────────────────────────────────────
const AGE_OPTIONS = Array.from({ length: 83 }, (_, i) => `${i + 13} yrs`);

const HEIGHT_OPTIONS = (() => {
  const opts = [];
  for (let ft = 4; ft <= 7; ft++)
    for (let inch = 0; inch <= 11; inch++)
      opts.push(`${ft}'${inch}"`);
  return opts;
})();

const WEIGHT_OPTIONS   = Array.from({ length: 251 }, (_, i) => `${i + 80} lbs`);
const GOAL_OPTIONS     = ['Lose Fat', 'Maintain Weight', 'Gain Muscle'];
const ACTIVITY_OPTIONS = ['Inactive', 'Lightly Active', 'Moderately Active', 'Very Active'];

// ─── Styles factory ───────────────────────────────────────────────────────────
const makeStyles = (c) => StyleSheet.create({
  safe:      { flex: 1, backgroundColor: c.bg },
  scroll:    { paddingHorizontal: 16, paddingBottom: 110 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: c.white, paddingTop: 16, paddingBottom: 18 },

  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 20, gap: 14 },
  avatar:      { width: 58, height: 58, borderRadius: 29, backgroundColor: c.accent, justifyContent: 'center', alignItems: 'center' },
  avatarText:  { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 16, fontWeight: '700', color: c.white },
  profileEmail:{ fontSize: 12, color: c.muted, marginTop: 2 },
  profileGoal: { fontSize: 12, color: c.muted, marginTop: 4 },

  version: { textAlign: 'center', fontSize: 11, color: c.muted, marginTop: 4 },
});

// ─── Name edit modal (same sheet style as WheelPickerModal) ──────────────────
function NameEditModal({ visible, value, onConfirm, onDismiss }) {
  const c = useTheme();
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!visible) return;
    setDraft(value);
    // Focus the input once the sheet has finished sliding up
    const t = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, [visible]);

  const handleDone = () => {
    onConfirm(draft.trim() || value);
    onDismiss();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
        activeOpacity={1}
        onPress={onDismiss}
      />
      <View style={{
        backgroundColor: c.card,
        borderTopLeftRadius: 26, borderTopRightRadius: 26,
        paddingBottom: 36,
        borderTopWidth: 1, borderColor: c.border,
      }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          paddingHorizontal: 20, paddingVertical: 16,
          borderBottomWidth: 1, borderBottomColor: c.border,
        }}>
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 15, color: c.muted }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.white }}>Name</Text>
          <TouchableOpacity onPress={handleDone} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: c.accent }}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Input area */}
        <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 }}>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            placeholder="Enter your name"
            placeholderTextColor={c.muted}
            selectionColor={c.accent}
            returnKeyType="done"
            onSubmitEditing={handleDone}
            style={{
              fontSize: 18, fontWeight: '600', color: c.white,
              backgroundColor: c.card2,
              borderWidth: 1, borderColor: c.accent + '55',
              borderRadius: 14,
              paddingHorizontal: 16, paddingVertical: 14,
              outlineStyle: 'none',
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

// ─── Text list modal (dietary restrictions / allergies) ───────────────────────
function TextListModal({ visible, title, subtitle, placeholder, value, onConfirm, onDismiss }) {
  const c = useTheme();
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!visible) return;
    setDraft(value);
    const t = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, [visible]);

  const handleDone = () => {
    onConfirm(draft.trim());
    onDismiss();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
        activeOpacity={1}
        onPress={onDismiss}
      />
      <View style={{
        backgroundColor: c.card,
        borderTopLeftRadius: 26, borderTopRightRadius: 26,
        paddingBottom: 36,
        borderTopWidth: 1, borderColor: c.border,
      }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          paddingHorizontal: 20, paddingVertical: 16,
          borderBottomWidth: 1, borderBottomColor: c.border,
        }}>
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 15, color: c.muted }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.white }}>{title}</Text>
          <TouchableOpacity onPress={handleDone} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: c.accent }}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Hint */}
        <Text style={{ fontSize: 12, color: c.muted, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }}>
          {subtitle}
        </Text>

        {/* Input */}
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholder}
            placeholderTextColor={c.muted}
            selectionColor={c.accent}
            returnKeyType="done"
            onSubmitEditing={handleDone}
            multiline
            style={{
              fontSize: 15, fontWeight: '500', color: c.white,
              backgroundColor: c.card2,
              borderWidth: 1, borderColor: c.accent + '55',
              borderRadius: 14,
              paddingHorizontal: 16, paddingVertical: 14,
              minHeight: 80, textAlignVertical: 'top',
              outlineStyle: 'none',
            }}
          />
        </View>

        {/* Clear button */}
        {draft.trim().length > 0 && (
          <TouchableOpacity
            onPress={() => setDraft('')}
            style={{ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 20 }}
          >
            <Text style={{ fontSize: 13, color: c.muted }}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

// ─── Wheel picker ─────────────────────────────────────────────────────────────
const ITEM_H   = 50;
const VISIBLE  = 5;            // rows shown; selected is the middle (index 2)

function WheelPickerModal({ visible, title, options, selectedIndex, onConfirm, onDismiss }) {
  const c = useTheme();
  const scrollRef  = useRef(null);
  const [idx, setIdx] = useState(selectedIndex);

  // Scroll to current selection whenever the modal opens
  useEffect(() => {
    if (!visible) return;
    setIdx(selectedIndex);
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
    }, 60);
    return () => clearTimeout(t);
  }, [visible, selectedIndex]);

  const snapToNearest = (e) => {
    const raw     = e.nativeEvent.contentOffset.y / ITEM_H;
    const snapped = Math.max(0, Math.min(Math.round(raw), options.length - 1));
    setIdx(snapped);
    scrollRef.current?.scrollTo({ y: snapped * ITEM_H, animated: true });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      {/* Tap-outside to cancel */}
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
        activeOpacity={1}
        onPress={onDismiss}
      />

      {/* Sheet */}
      <View style={{
        backgroundColor: c.card,
        borderTopLeftRadius: 26, borderTopRightRadius: 26,
        paddingBottom: 36,
        borderTopWidth: 1, borderColor: c.border,
      }}>
        {/* Header row */}
        <View style={{
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          paddingHorizontal: 20, paddingVertical: 16,
          borderBottomWidth: 1, borderBottomColor: c.border,
        }}>
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 15, color: c.muted }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.white }}>{title}</Text>
          <TouchableOpacity
            onPress={() => { onConfirm(idx); onDismiss(); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: c.accent }}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Wheel */}
        <View style={{ height: ITEM_H * VISIBLE, overflow: 'hidden' }}>
          {/* Center highlight — sits behind the text */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: ITEM_H * 2, left: 24, right: 24, height: ITEM_H,
              backgroundColor: c.accentDim,
              borderRadius: 12,
              borderWidth: 1, borderColor: c.accent + '55',
            }}
          />

          <ScrollView
            ref={scrollRef}
            snapToInterval={ITEM_H}
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
            onMomentumScrollEnd={snapToNearest}
            onScrollEndDrag={snapToNearest}
          >
            {options.map((opt, i) => {
              const sel = i === idx;
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.7}
                  style={{ height: ITEM_H, justifyContent: 'center', alignItems: 'center' }}
                  onPress={() => {
                    setIdx(i);
                    scrollRef.current?.scrollTo({ y: i * ITEM_H, animated: true });
                  }}
                >
                  <Text style={{
                    fontSize:   sel ? 18 : 15,
                    fontWeight: sel ? '700' : '400',
                    color:      sel ? c.white : c.muted,
                    letterSpacing: sel ? 0.2 : 0,
                  }}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Top fade overlay */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              height: ITEM_H * 1.8,
              backgroundColor: c.card, opacity: 0.72,
            }}
          />
          {/* Bottom fade overlay */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              height: ITEM_H * 1.8,
              backgroundColor: c.card, opacity: 0.72,
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionLabel({ label, c }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 8, marginTop: 4 }}>
      {label}
    </Text>
  );
}

function Card({ children, c }) {
  return (
    <View style={{ backgroundColor: c.card, borderRadius: 18, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, marginBottom: 16, overflow: 'hidden' }}>
      {children}
    </View>
  );
}

function RowItem({ icon, iconBg, iconColor, label, value, right, onPress, noBorder, c }) {
  const rowStyle = {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13,
    borderBottomWidth: noBorder ? 0 : 1,
    borderBottomColor: c.border,
  };
  const content = (
    <View style={rowStyle}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: iconBg || c.card2, justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
        <Ionicons name={icon} size={17} color={iconColor || c.white} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: c.white }}>{label}</Text>
        {value ? <Text style={{ fontSize: 12, color: c.muted, marginTop: 1 }}>{value}</Text> : null}
      </View>
      {right !== undefined
        ? right
        : onPress
          ? <Ionicons name="chevron-forward" size={16} color={c.muted} />
          : null
      }
    </View>
  );
  return onPress
    ? <TouchableOpacity activeOpacity={0.7} onPress={onPress}>{content}</TouchableOpacity>
    : content;
}

// Name row — opens NameEditModal, identical UX to PickerRow
function NameRow({ value, onChange, c }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <RowItem
        c={c}
        icon="person-outline"
        iconBg={c.card2}
        label="Name"
        value={value || 'Tap to set'}
        onPress={() => setOpen(true)}
      />
      <NameEditModal
        visible={open}
        value={value}
        onConfirm={onChange}
        onDismiss={() => setOpen(false)}
      />
    </>
  );
}

// Picker-backed row — looks like RowItem but opens WheelPickerModal on press
function PickerRow({ icon, iconBg, iconColor, label, displayValue, pickerTitle, options, selectedIndex, onConfirm, noBorder, c }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <RowItem
        c={c}
        icon={icon}
        iconBg={iconBg}
        iconColor={iconColor}
        label={label}
        value={displayValue}
        onPress={() => setOpen(true)}
        noBorder={noBorder}
      />
      <WheelPickerModal
        visible={open}
        title={pickerTitle}
        options={options}
        selectedIndex={selectedIndex}
        onConfirm={(i) => { onConfirm(i); }}
        onDismiss={() => setOpen(false)}
      />
    </>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { state, dispatch } = useApp();
  const { signOut } = useAuth();
  const c = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);

  const darkMode      = state.settings.darkMode;
  const notifications = state.settings.notifications ?? true;
  const mealReminders = state.settings.mealReminders ?? true;
  const voiceEnabled  = state.settings.voiceEnabled  ?? true;
  const [units, setUnits] = useState('Imperial');

  // ── Personal info — seed from saved profile ──────────────────────────────
  const p = state.userProfile;

  const initAgeIdx = () => {
    const a = parseInt(p.age) || 28;
    return Math.max(0, Math.min(a - 13, AGE_OPTIONS.length - 1));
  };
  const initHtIdx = () => {
    const totalIn = parseInt(p.height) || 70;
    const ft = Math.floor(totalIn / 12);
    const inch = totalIn % 12;
    const label = `${ft}'${inch}"`;
    const i = HEIGHT_OPTIONS.indexOf(label);
    return i >= 0 ? i : HEIGHT_OPTIONS.indexOf("5'10\"");
  };
  const initWtIdx = () => {
    const w = parseInt(p.weight) || 175;
    return Math.max(0, Math.min(w - 80, WEIGHT_OPTIONS.length - 1));
  };
  const initGoalIdx = () => {
    const map = { loseFat: 0, maintain: 1, gainMuscle: 2 };
    return map[p.goal] ?? 0;
  };
  const initActIdx = () => {
    const map = { sedentary: 0, light: 1, moderate: 2, veryActive: 3 };
    return map[p.activityLevel] ?? 2;
  };

  const [name,    setName]    = useState(p.name    || '');
  const [ageIdx,  setAgeIdx]  = useState(initAgeIdx);
  const [htIdx,   setHtIdx]   = useState(initHtIdx);
  const [wtIdx,   setWtIdx]   = useState(initWtIdx);
  const [goalIdx, setGoalIdx] = useState(initGoalIdx);
  const [actIdx,  setActIdx]  = useState(initActIdx);
  const [dietaryRestrictions, setDietaryRestrictions] = useState(p.dietaryRestrictions || '');
  const [allergies,           setAllergies]           = useState(p.allergies           || '');
  const [showDietModal,   setShowDietModal]   = useState(false);
  const [showAllergyModal, setShowAllergyModal] = useState(false);

  const goalDisplay     = GOAL_OPTIONS[goalIdx];
  const activityDisplay = ACTIVITY_OPTIONS[actIdx];
  const initials        = name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

  // Save changes back to AppContext whenever any field changes
  const saveProfile = (overrides = {}) => {
    const htStr   = HEIGHT_OPTIONS[htIdx];
    const [ftPart, inPart] = htStr.replace('"', '').split("'");
    const totalInches = parseInt(ftPart) * 12 + parseInt(inPart || '0');
    const goalKeys     = ['loseFat', 'maintain', 'gainMuscle'];
    const activityKeys = ['sedentary', 'light', 'moderate', 'veryActive'];
    dispatch({
      type: 'UPDATE_PROFILE',
      payload: {
        name:          overrides.name          ?? name,
        age:           String((overrides.ageIdx  ?? ageIdx)  + 13),
        height:        String(overrides.htIn   ?? totalInches),
        weight:        String((overrides.wtIdx   ?? wtIdx)   + 80),
        goal:          goalKeys[overrides.goalIdx ?? goalIdx],
        activityLevel: activityKeys[overrides.actIdx ?? actIdx],
        ...overrides.raw,
      },
    });
  };

  // Wrap each setter so it also persists
  const handleName    = (v)   => { setName(v);    saveProfile({ name: v }); };
  const handleAgeIdx  = (i)   => { setAgeIdx(i);  saveProfile({ ageIdx: i }); };
  const handleHtIdx   = (i)   => {
    setHtIdx(i);
    const htStr = HEIGHT_OPTIONS[i];
    const [ftP, inP] = htStr.replace('"', '').split("'");
    saveProfile({ htIn: parseInt(ftP) * 12 + parseInt(inP || '0') });
  };
  const handleWtIdx   = (i)   => { setWtIdx(i);   saveProfile({ wtIdx: i }); };
  const handleGoalIdx = (i)   => { setGoalIdx(i);  saveProfile({ goalIdx: i }); };
  const handleActIdx  = (i)   => { setActIdx(i);   saveProfile({ actIdx: i }); };

  // Real computed targets from stored profile
  const targets = {
    calories: p.calorieTarget || 2000,
    protein:  p.proteinTarget || 150,
    carbs:    p.carbTarget    || 225,
    fat:      p.fatTarget     || 56,
    water:    p.waterTarget   || 2700,
  };

  const [showTerms,   setShowTerms]   = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const toggleDarkMode = (val) => dispatch({ type: 'SET_DARK_MODE', payload: val });

  const switchProps = (value, onChange) => ({
    value,
    onValueChange: onChange,
    trackColor: { false: c.border, true: c.accent + '88' },
    thumbColor: value ? c.accent : c.muted,
    ios_backgroundColor: c.border,
  });

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── Header ── */}
        <Text style={s.pageTitle}>Settings</Text>

        {/* ── Profile card — updates live from personal info state ── */}
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <View style={s.profileInfo}>
            <Text style={s.profileName}>{name || 'Your Name'}</Text>
            <Text style={s.profileEmail}>{USER_EMAIL}</Text>
            <Text style={s.profileGoal}>{goalDisplay} · {activityDisplay}</Text>
          </View>
        </View>

        {/* ── Daily Targets — computed from profile ── */}
        <SectionLabel label="Daily Targets" c={c} />
        <Card c={c}>
          <RowItem c={c} icon="flame"   iconBg={darkMode ? '#2E1E0A' : '#FFF3E0'} iconColor={c.fire}    label="Calories"      value={`${targets.calories} kcal`} />
          <RowItem c={c} icon="flash"   iconBg={darkMode ? '#2E1214' : '#FFF0F0'} iconColor={c.protein} label="Protein"       value={`${targets.protein}g`}      />
          <RowItem c={c} icon="leaf"    iconBg={darkMode ? '#1E2E14' : '#F0FFF0'} iconColor={c.green}   label="Carbohydrates" value={`${targets.carbs}g`}        />
          <RowItem c={c} icon="ellipse" iconBg={darkMode ? '#141A2E' : '#EFF6FF'} iconColor={c.fat}     label="Fats"          value={`${targets.fat}g`}          />
          <RowItem c={c} icon="water"   iconBg={darkMode ? '#101A2E' : '#EFF6FF'} iconColor={c.water}   label="Water Target"  value={`${targets.water} ml`}      noBorder />
        </Card>

        {/* ── Personal Info — fully editable, saves + recalculates targets ── */}
        <SectionLabel label="Personal Info" c={c} />
        <Card c={c}>
          <NameRow value={name} onChange={handleName} c={c} />

          <PickerRow
            c={c} icon="calendar-outline" label="Age"
            iconBg={darkMode ? '#1A2A2A' : '#F0FEFF'} iconColor={c.muted}
            displayValue={`${ageIdx + 13} yrs`}
            pickerTitle="Age"
            options={AGE_OPTIONS}
            selectedIndex={ageIdx}
            onConfirm={handleAgeIdx}
          />
          <PickerRow
            c={c} icon="body-outline" label="Height"
            iconBg={darkMode ? '#1A2A2A' : '#F0FEFF'} iconColor={c.muted}
            displayValue={HEIGHT_OPTIONS[htIdx]}
            pickerTitle="Height"
            options={HEIGHT_OPTIONS}
            selectedIndex={htIdx}
            onConfirm={handleHtIdx}
          />
          <PickerRow
            c={c} icon="scale-outline" label="Weight"
            iconBg={darkMode ? '#1A2A2A' : '#F0FEFF'} iconColor={c.muted}
            displayValue={`${wtIdx + 80} lbs`}
            pickerTitle="Weight"
            options={WEIGHT_OPTIONS}
            selectedIndex={wtIdx}
            onConfirm={handleWtIdx}
          />
          <PickerRow
            c={c} icon="flag-outline" label="Goal"
            iconBg={darkMode ? '#1A2A2A' : '#F0FEFF'} iconColor={c.muted}
            displayValue={goalDisplay}
            pickerTitle="Goal"
            options={GOAL_OPTIONS}
            selectedIndex={goalIdx}
            onConfirm={handleGoalIdx}
          />
          <PickerRow
            c={c} icon="fitness-outline" label="Activity Level"
            iconBg={darkMode ? '#1A2A2A' : '#F0FEFF'} iconColor={c.muted}
            displayValue={activityDisplay}
            pickerTitle="Activity Level"
            options={ACTIVITY_OPTIONS}
            selectedIndex={actIdx}
            onConfirm={handleActIdx}
            noBorder
          />
        </Card>

        {/* ── Preferences ── */}
        <SectionLabel label="Preferences" c={c} />
        <Card c={c}>
          <RowItem
            c={c}
            icon="moon-outline" iconBg={darkMode ? '#1A1A3A' : '#F0EEFF'} iconColor={c.accent}
            label="Dark Mode"
            right={<Switch {...switchProps(darkMode, toggleDarkMode)} />}
          />
          <RowItem
            c={c}
            icon="notifications-outline" iconBg={darkMode ? '#2A1A1A' : '#FFF0F0'} iconColor={c.protein}
            label="Notifications"
            right={<Switch {...switchProps(notifications, (val) => dispatch({ type: 'SET_NOTIFICATIONS', payload: val }))} />}
          />
          <RowItem
            c={c}
            icon="alarm-outline" iconBg={darkMode ? '#1A2A1A' : '#F0FFF0'} iconColor={c.green}
            label="Meal Reminders"
            right={<Switch {...switchProps(mealReminders, (val) => dispatch({ type: 'SET_MEAL_REMINDERS', payload: val }))} />}
          />
          <RowItem
            c={c}
            icon="volume-high-outline" iconBg={darkMode ? '#1A1A2E' : '#F0F0FF'} iconColor={c.accent}
            label="Voice Responses"
            value={voiceEnabled ? 'AI speaks replies aloud' : 'Text only'}
            right={<Switch {...switchProps(voiceEnabled, (val) => dispatch({ type: 'SET_VOICE_ENABLED', payload: val }))} />}
          />
          <RowItem
            c={c}
            icon="globe-outline" iconBg={darkMode ? '#2A2A1A' : '#FFFAF0'} iconColor={c.carbs}
            label="Units"
            value={units}
            onPress={() => setUnits(units === 'Imperial' ? 'Metric' : 'Imperial')}
            noBorder
          />
        </Card>

        {/* ── Dietary Preferences ── */}
        <SectionLabel label="Dietary Preferences" c={c} />
        <Card c={c}>
          <RowItem
            c={c} icon="leaf-outline" iconBg={darkMode ? '#1A2A1A' : '#F0FFF0'} iconColor={c.green}
            label="Dietary Restrictions"
            value={dietaryRestrictions.trim() || 'None'}
            onPress={() => setShowDietModal(true)}
          />
          <RowItem
            c={c} icon="alert-circle-outline" iconBg={darkMode ? '#2E1414' : '#FFF0F0'} iconColor={c.red}
            label="Allergies"
            value={allergies.trim() || 'None'}
            onPress={() => setShowAllergyModal(true)}
            noBorder
          />
        </Card>

        {/* ── Support ── */}
        <SectionLabel label="Support" c={c} />
        <Card c={c}>
          <RowItem c={c} icon="star-outline"          label="Rate the App"     onPress={requestAppRating} />
          <RowItem c={c} icon="document-text-outline" label="Privacy Policy"   onPress={() => setShowPrivacy(true)} />
          <RowItem c={c} icon="shield-outline"        label="Terms of Service" onPress={() => setShowTerms(true)}   noBorder />
        </Card>

        {/* ── Account ── */}
        <SectionLabel label="Account" c={c} />
        <Card c={c}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 }}
            activeOpacity={0.7}
            onPress={signOut}
          >
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: darkMode ? '#2E1214' : '#FFF0F0', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="log-out-outline" size={17} color={c.red} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.red }}>Sign Out</Text>
          </TouchableOpacity>
        </Card>

        <Text style={s.version}>FitChat AI · v1.0.0 · SDK 54</Text>
        <View style={{ height: 20 }} />

      </ScrollView>

      <TermsOfServiceScreen visible={showTerms}   onClose={() => setShowTerms(false)}   />
      <PrivacyPolicyScreen  visible={showPrivacy} onClose={() => setShowPrivacy(false)} />

      <TextListModal
        visible={showDietModal}
        title="Dietary Restrictions"
        subtitle="Tell the AI what you don't eat. Separate items with commas."
        placeholder="e.g. vegetarian, gluten-free, no dairy"
        value={dietaryRestrictions}
        onConfirm={(val) => {
          setDietaryRestrictions(val);
          dispatch({ type: 'UPDATE_PROFILE', payload: { dietaryRestrictions: val } });
        }}
        onDismiss={() => setShowDietModal(false)}
      />

      <TextListModal
        visible={showAllergyModal}
        title="Allergies"
        subtitle="The AI will never suggest foods containing these. Separate with commas."
        placeholder="e.g. peanuts, shellfish, tree nuts, soy"
        value={allergies}
        onConfirm={(val) => {
          setAllergies(val);
          dispatch({ type: 'UPDATE_PROFILE', payload: { allergies: val } });
        }}
        onDismiss={() => setShowAllergyModal(false)}
      />

    </SafeAreaView>
  );
}
