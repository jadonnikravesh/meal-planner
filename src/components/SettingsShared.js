import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput,
  Platform, KeyboardAvoidingView, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/AppContext';

// ─── Picker option arrays ─────────────────────────────────────────────────────
export const AGE_OPTIONS    = Array.from({ length: 83 }, (_, i) => `${i + 13} yrs`);
export const WEIGHT_OPTIONS = Array.from({ length: 251 }, (_, i) => `${i + 80} lbs`);
export const GOAL_OPTIONS   = ['Lose Fat', 'Maintain Weight', 'Gain Muscle'];
export const ACTIVITY_OPTIONS = ['Inactive', 'Lightly Active', 'Moderately Active', 'Very Active'];

export const HEIGHT_OPTIONS = (() => {
  const opts = [];
  for (let ft = 4; ft <= 7; ft++)
    for (let inch = 0; inch <= 11; inch++)
      opts.push(`${ft}'${inch}"`);
  return opts;
})();

// ─── Shared UI ────────────────────────────────────────────────────────────────
export function SectionLabel({ label, c }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 8, marginTop: 4 }}>
      {label}
    </Text>
  );
}

export function Card({ children, c }) {
  return (
    <View style={{ backgroundColor: c.card, borderRadius: 18, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, marginBottom: 16, overflow: 'hidden' }}>
      {children}
    </View>
  );
}

export function RowItem({ icon, iconBg, iconColor, label, value, right, onPress, noBorder, c }) {
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

// ─── Wheel picker modal ───────────────────────────────────────────────────────
const ITEM_H  = 50;
const VISIBLE = 5;

export function WheelPickerModal({ visible, title, options, selectedIndex, onConfirm, onDismiss }) {
  const c = useTheme();
  const scrollRef    = useRef(null);
  const idxRef       = useRef(selectedIndex); // shadow of idx, safe to read inside callbacks
  const momentumRef  = useRef(false);         // true while momentum animation is running
  const [idx, setIdx] = useState(selectedIndex);

  useEffect(() => {
    if (!visible) return;
    idxRef.current = selectedIndex;
    setIdx(selectedIndex);
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
    }, 60);
    return () => clearTimeout(t);
  }, [visible, selectedIndex]);

  // Compute nearest index from a raw y offset and snap the scroll there
  const snapTo = (y) => {
    const snapped = Math.max(0, Math.min(Math.round(y / ITEM_H), options.length - 1));
    if (snapped !== idxRef.current) {
      idxRef.current = snapped;
      setIdx(snapped);
    }
    scrollRef.current?.scrollTo({ y: snapped * ITEM_H, animated: true });
  };

  // Live highlight: update idx as items pass through the center zone
  const handleScroll = (e) => {
    const snapped = Math.max(0, Math.min(Math.round(e.nativeEvent.contentOffset.y / ITEM_H), options.length - 1));
    if (snapped !== idxRef.current) {
      idxRef.current = snapped;
      setIdx(snapped);
    }
  };

  // When the user lifts their finger without generating momentum, snap manually
  const handleScrollEndDrag = (e) => {
    if (!momentumRef.current) snapTo(e.nativeEvent.contentOffset.y);
  };

  const handleMomentumScrollEnd = (e) => {
    momentumRef.current = false;
    snapTo(e.nativeEvent.contentOffset.y);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} activeOpacity={1} onPress={onDismiss} />
      <View style={{ backgroundColor: c.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: 36, borderTopWidth: 1, borderColor: c.border }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 15, color: c.muted }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.white }}>{title}</Text>
          <TouchableOpacity onPress={() => { onConfirm(idxRef.current); onDismiss(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: c.accent }}>Done</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: ITEM_H * VISIBLE, overflow: 'hidden' }}>
          {/* Selection highlight behind the center row */}
          <View pointerEvents="none" style={{ position: 'absolute', top: ITEM_H * 2, left: 24, right: 24, height: ITEM_H, backgroundColor: c.accentDim, borderRadius: 12, borderWidth: 1, borderColor: c.accent + '55' }} />
          <ScrollView
            ref={scrollRef}
            snapToInterval={ITEM_H}
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
            onScroll={handleScroll}
            onMomentumScrollBegin={() => { momentumRef.current = true; }}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            onScrollEndDrag={handleScrollEndDrag}
          >
            {options.map((opt, i) => {
              const sel = i === idx;
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.7}
                  style={{ height: ITEM_H, justifyContent: 'center', alignItems: 'center' }}
                  onPress={() => {
                    idxRef.current = i;
                    setIdx(i);
                    scrollRef.current?.scrollTo({ y: i * ITEM_H, animated: true });
                  }}
                >
                  <Text style={{
                    fontSize:     sel ? 18 : 15,
                    fontWeight:   sel ? '700' : '400',
                    color:        sel ? c.white : c.muted,
                    letterSpacing:sel ? 0.2 : 0,
                  }}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {/* Fade masks top and bottom */}
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: ITEM_H * 1.8, backgroundColor: c.card, opacity: 0.72 }} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: ITEM_H * 1.8, backgroundColor: c.card, opacity: 0.72 }} />
        </View>
      </View>
    </Modal>
  );
}

// ─── Name edit modal ──────────────────────────────────────────────────────────
export function NameEditModal({ visible, value, onConfirm, onDismiss }) {
  const c = useTheme();
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!visible) return;
    setDraft(value);
    const t = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, [visible]);

  const handleDone = () => { onConfirm(draft.trim() || value); onDismiss(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} activeOpacity={1} onPress={onDismiss} />
        <View style={{ backgroundColor: c.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: 36, borderTopWidth: 1, borderColor: c.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: 15, color: c.muted }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.white }}>Name</Text>
            <TouchableOpacity onPress={handleDone} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: c.accent }}>Done</Text>
            </TouchableOpacity>
          </View>
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
              style={{ fontSize: 18, fontWeight: '600', color: c.white, backgroundColor: c.card2, borderWidth: 1, borderColor: c.accent + '55', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, outlineStyle: 'none' }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Text list modal ──────────────────────────────────────────────────────────
export function TextListModal({ visible, title, subtitle, placeholder, value, onConfirm, onDismiss }) {
  const c = useTheme();
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!visible) return;
    setDraft(value);
    const t = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, [visible]);

  const handleDone = () => { onConfirm(draft.trim()); onDismiss(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} activeOpacity={1} onPress={onDismiss} />
        <View style={{ backgroundColor: c.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: 36, borderTopWidth: 1, borderColor: c.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: 15, color: c.muted }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.white }}>{title}</Text>
            <TouchableOpacity onPress={handleDone} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: c.accent }}>Done</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 12, color: c.muted, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }}>{subtitle}</Text>
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
              scrollEnabled
              style={{ fontSize: 15, fontWeight: '500', color: c.white, backgroundColor: c.card2, borderWidth: 1, borderColor: c.accent + '55', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, minHeight: 80, maxHeight: 140, textAlignVertical: 'top', outlineStyle: 'none' }}
            />
          </View>
          {draft.trim().length > 0 && (
            <TouchableOpacity onPress={() => setDraft('')} style={{ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 20 }}>
              <Text style={{ fontSize: 13, color: c.muted }}>Clear all</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Re-auth modal ────────────────────────────────────────────────────────────
export function ReauthModal({ visible, email, onConfirm, onDismiss, error, loading }) {
  const c = useTheme();
  const inputRef = useRef(null);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!visible) { setPassword(''); return; }
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} activeOpacity={1} onPress={onDismiss} disabled={loading} />
        <View style={{ backgroundColor: c.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: 40, borderTopWidth: 1, borderColor: c.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <TouchableOpacity onPress={onDismiss} disabled={loading} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: 15, color: loading ? c.border : c.muted }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.white }}>Confirm Identity</Text>
            <TouchableOpacity onPress={() => onConfirm(password)} disabled={loading || !password.trim()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              {loading
                ? <ActivityIndicator size="small" color={c.red} />
                : <Text style={{ fontSize: 15, fontWeight: '700', color: !password.trim() ? c.border : c.red }}>Delete</Text>
              }
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 12 }}>
            <Text style={{ fontSize: 14, color: c.muted, lineHeight: 20 }}>For security, please enter your password to confirm account deletion.</Text>
            <Text style={{ fontSize: 12, color: c.muted, fontWeight: '500' }}>{email}</Text>
            <TextInput
              ref={inputRef}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={c.muted}
              secureTextEntry
              autoComplete="password"
              returnKeyType="done"
              onSubmitEditing={() => password.trim() && onConfirm(password)}
              editable={!loading}
              style={{ fontSize: 16, color: c.white, backgroundColor: c.card2, borderWidth: 1, borderColor: error ? '#EF4444' : c.accent + '55', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, outlineStyle: 'none' }}
            />
            {error ? <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '500' }}>{error}</Text> : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Name row ─────────────────────────────────────────────────────────────────
export function NameRow({ value, onChange, c }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <RowItem c={c} icon="person-outline" iconBg={c.card2} label="Name" value={value || 'Tap to set'} onPress={() => setOpen(true)} />
      <NameEditModal visible={open} value={value} onConfirm={onChange} onDismiss={() => setOpen(false)} />
    </>
  );
}

// ─── Picker row ───────────────────────────────────────────────────────────────
export function PickerRow({ icon, iconBg, iconColor, label, displayValue, pickerTitle, options, selectedIndex, onConfirm, noBorder, c }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <RowItem c={c} icon={icon} iconBg={iconBg} iconColor={iconColor} label={label} value={displayValue} onPress={() => setOpen(true)} noBorder={noBorder} />
      <WheelPickerModal visible={open} title={pickerTitle} options={options} selectedIndex={selectedIndex} onConfirm={(i) => onConfirm(i)} onDismiss={() => setOpen(false)} />
    </>
  );
}

// ─── Sub-screen header (back button + title) ──────────────────────────────────
export function SubScreenHeader({ title, onBack, c }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 18, paddingTop: 6, gap: 4 }}>
      <TouchableOpacity onPress={onBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ marginRight: 4 }}>
        <Ionicons name="chevron-back" size={24} color={c.white} />
      </TouchableOpacity>
      <Text style={{ fontSize: 22, fontWeight: '700', color: c.white }}>{title}</Text>
    </View>
  );
}
