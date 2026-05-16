import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Animated, ActivityIndicator, Dimensions,
  TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import { useTheme, useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { getAuthHeaders } from '../utils/getAuthHeaders';
import { usePantryStorage } from '../hooks/usePantryStorage';
import { getOrFetchFoodImage } from '../utils/imageService';
import { API_BASE_URL } from '../config/api';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_GAP       = 12;
const CARD_W         = (SCREEN_W - 32 - CARD_GAP) / 2;
const IMAGE_H        = 130;
const VIEWFINDER_SIZE = SCREEN_W - 80;
const CORNER_SIZE    = 28;
const CORNER_W       = 3;

// ─── Category + emoji from item name ─────────────────────────────────────────
function getItemMeta(name) {
  const n = name.toLowerCase();
  if (/milk|cheese|yogurt|cream|butter|kefir|whey|dairy/.test(n))
    return { category: 'Dairy',   emoji: '🥛' };
  if (/chicken|beef|pork|lamb|fish|salmon|tuna|shrimp|egg|turkey|steak|bacon|ham|meat|sausage|protein/.test(n))
    return { category: 'Protein', emoji: '🍗' };
  if (/apple|banana|berry|grape|orange|lemon|mango|lettuce|spinach|kale|broccoli|carrot|tomato|pepper|onion|garlic|celery|cucumber|zucchini|potato|avocado|fruit|vegetable|produce/.test(n))
    return { category: 'Produce', emoji: '🥦' };
  if (/rice|bread|pasta|oat|cereal|flour|tortilla|grain|quinoa|barley|noodle/.test(n))
    return { category: 'Grains',  emoji: '🍚' };
  if (/nut|almond|cashew|walnut|peanut|chip|cracker|cookie|pretzel|popcorn|granola|bar|snack/.test(n))
    return { category: 'Snacks',  emoji: '🫘' };
  return   { category: 'Other',   emoji: '🥫' };
}

// Fire-and-forget: records a label correction signal to the backend.
// Called whenever a user renames a scan-detected item or edits an existing one.
async function reportLabelCorrection(original, corrected, user) {
  const orig = (original || '').trim().toLowerCase();
  const corr = (corrected || '').trim().toLowerCase();
  if (!orig || !corr || orig === corr) return;
  try {
    const headers = await getAuthHeaders(user);
    fetch(`${API_BASE_URL}/corrections/label`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({ original: original.trim(), corrected: corrected.trim() }),
    }).catch(() => {});
  } catch (_) {}
}

// Converts structured API items → pantry state objects.
// quantity comes from AI; category/emoji still derived from name for accuracy.
// imageUrl is the backend-fetched Pexels URL — use it directly as imageUri so
// the client never needs a separate /food-image round-trip after a scan.
function apiItemsToPantry(rawItems) {
  const dateAdded = new Date().toISOString();
  return rawItems.map((item, i) => ({
    id:        `scan_${Date.now()}_${i}`,
    name:      item.name,
    ...getItemMeta(item.name),
    qty:       item.quantity || '',
    imageUri:  item.imageUrl || null,
    timestamp: dateAdded,
    dateAdded,
  }));
}

const MOCK_RECEIPT_ITEMS = [
  { id: 'r1', name: 'Oat Milk',       category: 'Dairy',   emoji: '🥛', qty: '½ gal' },
  { id: 'r2', name: 'Wild Salmon',    category: 'Protein', emoji: '🐟', qty: '1 lb'  },
  { id: 'r3', name: 'Avocados',       category: 'Produce', emoji: '🥑', qty: '4 ct'  },
  { id: 'r4', name: 'Quinoa',         category: 'Grains',  emoji: '🌾', qty: '1 lb'  },
  { id: 'r5', name: 'Baby Carrots',   category: 'Produce', emoji: '🥕', qty: '1 bag' },
  { id: 'r6', name: 'Cottage Cheese', category: 'Dairy',   emoji: '🧀', qty: '16 oz' },
];

// ─── Eat-at-home suggestion chips ────────────────────────────────────────────
const EAT_AT_HOME = [
  { id: 'eah1', icon: 'moon-outline',     label: "Tonight's Dinner",   prompt: "What should I make for dinner tonight using only the ingredients I currently have in my pantry? Keep it simple and practical." },
  { id: 'eah2', icon: 'flame-outline',    label: 'High-Protein Meals', prompt: "Suggest high-protein meal ideas using only what I have in my pantry right now. No outside ingredients." },
  { id: 'eah3', icon: 'leaf-outline',     label: 'Low-Calorie Options',prompt: "What low-calorie meals or snacks can I make using only what's in my pantry right now?" },
  { id: 'eah4', icon: 'calendar-outline', label: 'Plan My Week',       prompt: "Create a simple meal plan for the week using only the ingredients I have in my pantry right now." },
  { id: 'eah5', icon: 'flash-outline',    label: 'Quick & Easy',       prompt: "What quick and easy meals can I throw together using only what's in my pantry right now?" },
];

// ─── Category colours ─────────────────────────────────────────────────────────
function getCategoryStyle(category) {
  const map = {
    Dairy:   { bg: '#E8F2FC', accent: '#4A8FC4' },
    Protein: { bg: '#FCEAE8', accent: '#C0504A' },
    Produce: { bg: '#EAF3EB', accent: '#5E8C61' },
    Grains:  { bg: '#FDF3E3', accent: '#B8893A' },
    Snacks:  { bg: '#FDEEE4', accent: '#D97745' },
    Other:   { bg: '#EDE8DF', accent: '#8A8278' },
  };
  return map[category] || map.Other;
}

// ─── Pantry item card ─────────────────────────────────────────────────────────
function PantryItemCard({ item, c, darkMode, onDelete, onEdit, isExpiring }) {
  const style      = getCategoryStyle(item.category);
  const imgOpacity = useRef(new Animated.Value(0)).current;

  // Reset fade-in animation when imageUri clears (e.g. after name edit)
  useEffect(() => {
    if (!item.imageUri) imgOpacity.setValue(0);
  }, [item.imageUri, imgOpacity]);

  const handleImageLoad = () => {
    Animated.timing(imgOpacity, {
      toValue: 1, duration: 260, useNativeDriver: true,
    }).start();
  };

  return (
    <TouchableOpacity
      onPress={onEdit}
      activeOpacity={0.88}
      style={[pc.card, { width: CARD_W, backgroundColor: c.card, borderColor: c.border }]}
    >
      {/* Image area */}
      <View style={[pc.imageWrap, { backgroundColor: style.bg }]}>
        <Text style={pc.emoji}>{item.emoji}</Text>

        {!!item.imageUri && (
          <Animated.Image
            source={{ uri: item.imageUri }}
            style={[pc.image, { opacity: imgOpacity }]}
            resizeMode="cover"
            onLoad={handleImageLoad}
          />
        )}

        {/* Category badge — top-right */}
        <View style={[pc.catBadge, { backgroundColor: style.accent + 'DD' }]}>
          <Text style={pc.catText}>{item.category}</Text>
        </View>

        {/* Delete button — top-left */}
        <TouchableOpacity
          onPress={onDelete}
          style={pc.deleteBtn}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          activeOpacity={0.75}
        >
          <Ionicons name="close" size={11} color="#FFF" />
        </TouchableOpacity>

        {/* Expiring soon banner — bottom of image */}
        {isExpiring && (
          <View style={pc.expiryBanner}>
            <Ionicons name="time-outline" size={10} color="#FFF" />
            <Text style={pc.expiryText}>Expiring Soon</Text>
          </View>
        )}
      </View>

      {/* Info row */}
      <View style={pc.info}>
        <Text style={[pc.name, { color: c.white }]} numberOfLines={2}>{item.name}</Text>
        <View style={pc.footer}>
          <Text style={[pc.qty, { color: c.muted }]}>{item.qty}</Text>
          <View style={pc.editPill}>
            <Ionicons name="pencil-outline" size={9} color={c.muted} />
            <Text style={[pc.editText, { color: c.muted }]}>edit</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const pc = StyleSheet.create({
  card:      { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  imageWrap: { height: IMAGE_H, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  emoji:     { fontSize: 38, position: 'absolute' },
  image:     { ...StyleSheet.absoluteFillObject },
  catBadge:  { position: 'absolute', top: 8, right: 8, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  catText:   { fontSize: 10, fontWeight: '700', color: '#FFF' },
  deleteBtn: {
    position: 'absolute', top: 8, left: 8,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  info:     { padding: 12, gap: 6 },
  name:     { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  footer:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qty:      { fontSize: 11 },
  editPill:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
  editText:    { fontSize: 10 },
  expiryBanner:{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#D97745CC', paddingVertical: 5 },
  expiryText:  { fontSize: 10, fontWeight: '700', color: '#FFF' },
});

// ─── Processing banner ────────────────────────────────────────────────────────
function ProcessingBanner({ message, c }) {
  return (
    <View style={[pb.wrap, { backgroundColor: c.card, borderColor: c.border }]}>
      <ActivityIndicator size="small" color={c.accent} />
      <Text style={[pb.text, { color: c.white }]}>{message}</Text>
    </View>
  );
}

const pb = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 20 },
  text: { fontSize: 14, fontWeight: '600' },
});

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ c }) {
  return (
    <View style={[es.wrap, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={[es.iconWrap, { backgroundColor: c.accentDim }]}>
        <Ionicons name="basket-outline" size={32} color={c.accent} />
      </View>
      <Text style={[es.title, { color: c.white }]}>Your pantry is empty</Text>
      <Text style={[es.sub, { color: c.muted }]}>
        Scan your pantry or upload a receipt{'\n'}to get started
      </Text>
    </View>
  );
}

const es = StyleSheet.create({
  wrap:     { borderRadius: 24, borderWidth: 1, alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 12 },
  iconWrap: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title:    { fontSize: 17, fontWeight: '700' },
  sub:      { fontSize: 14, textAlign: 'center', lineHeight: 22 },
});

// ─── Item input modal (add / edit) ────────────────────────────────────────────
function ItemInputModal({ visible, mode, item, onSave, onClose, c }) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (visible) setName(mode === 'edit' ? (item?.name ?? '') : '');
  }, [visible, mode, item]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed) onSave(trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[im.sheet, { backgroundColor: c.card, borderTopColor: c.border }]}>
          <View style={[im.handle, { backgroundColor: c.border }]} />
          <Text style={[im.title, { color: c.white }]}>
            {mode === 'add' ? 'Add Item' : 'Edit Item'}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Chicken Breast"
            placeholderTextColor={c.muted}
            style={[im.input, { color: c.white, backgroundColor: c.bg, borderColor: c.border }]}
            autoFocus
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={onClose}
              style={[im.btn, { flex: 1, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border }]}
            >
              <Text style={{ color: c.muted, fontWeight: '600', fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={[im.btn, { flex: 2, backgroundColor: c.accent }]}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>
                {mode === 'add' ? 'Add to Pantry' : 'Save Changes'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const im = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 44,
    gap: 16,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  title:  { fontSize: 18, fontWeight: '700' },
  input:  { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontWeight: '500' },
  btn:    { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
});

// ─── In-app camera modal ─────────────────────────────────────────────────────

function CornerBrackets() {
  const s = { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderColor: 'rgba(255,255,255,0.9)' };
  return (
    <>
      <View style={[s, { top: 0, left: 0,  borderTopWidth: CORNER_W, borderLeftWidth: CORNER_W }]} />
      <View style={[s, { top: 0, right: 0, borderTopWidth: CORNER_W, borderRightWidth: CORNER_W }]} />
      <View style={[s, { bottom: 0, left: 0,  borderBottomWidth: CORNER_W, borderLeftWidth: CORNER_W }]} />
      <View style={[s, { bottom: 0, right: 0, borderBottomWidth: CORNER_W, borderRightWidth: CORNER_W }]} />
    </>
  );
}

function CameraModal({ visible, onCapture, onClose, c }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const [ready,     setReady]     = useState(false);
  const [facing,    setFacing]    = useState('back');
  const cameraRef = useRef(null);
  const scanAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) { scanAnim.stopAnimation(); setReady(false); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, scanAnim]);

  const handleCapture = async () => {
    if (!cameraRef.current || capturing || !ready) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64:  true,
        quality: 0.6,
        exif:    false,
      });
      onCapture({ base64: photo.base64, mimeType: 'image/jpeg' });
    } catch (err) {
      console.warn('[camera capture]', err.message);
      setCapturing(false);
    }
  };

  const scanTranslate = scanAnim.interpolate({
    inputRange: [0, 1], outputRange: [0, VIEWFINDER_SIZE - 2],
  });

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>

        {!permission?.granted ? (
          /* ── Permission gate ── */
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 20 }}>
            <Ionicons name="camera-outline" size={56} color="rgba(255,255,255,0.3)" />
            <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
              Camera Access Required
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
              Allow camera access to scan your pantry and detect food items automatically.
            </Text>
            <TouchableOpacity
              onPress={requestPermission}
              activeOpacity={0.85}
              style={{ backgroundColor: c.accent, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 }}
            >
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>Allow Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>

        ) : (
          <>
            {/* ── Full-screen camera preview ── */}
            <CameraView
              ref={cameraRef}
              style={{ flex: 1 }}
              facing={facing}
              onCameraReady={() => setReady(true)}
            />

            {/* ── Dim overlay with transparent scan frame ── */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
              <View style={{ flexDirection: 'row', height: VIEWFINDER_SIZE }}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
                <View style={{ width: VIEWFINDER_SIZE, overflow: 'hidden' }}>
                  <CornerBrackets />
                  <Animated.View style={[cam.scanLine, { transform: [{ translateY: scanTranslate }] }]} />
                </View>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
              </View>
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
            </View>

            {/* ── Close button ── */}
            <TouchableOpacity onPress={onClose} style={cam.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color="#FFF" />
            </TouchableOpacity>

            {/* ── Flip camera button ── */}
            <TouchableOpacity
              onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
              style={cam.flipBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="camera-reverse-outline" size={22} color="#FFF" />
            </TouchableOpacity>

            {/* ── Hint ── */}
            <Text style={cam.hint}>Point at your pantry or fridge</Text>

            {/* ── Shutter ── */}
            <View style={cam.shutterRow}>
              <TouchableOpacity
                onPress={handleCapture}
                activeOpacity={0.8}
                disabled={capturing || !ready}
                style={[cam.shutter, { opacity: capturing || !ready ? 0.45 : 1 }]}
              >
                {capturing
                  ? <ActivityIndicator size="small" color="#000" />
                  : <View style={cam.shutterInner} />
                }
              </TouchableOpacity>
            </View>
          </>
        )}

      </View>
    </Modal>
  );
}

const cam = StyleSheet.create({
  scanLine:    { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: '#5E8C61', shadowColor: '#5E8C61', shadowOpacity: 0.9, shadowRadius: 6 },
  closeBtn:    { position: 'absolute', top: 56, left: 20, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  flipBtn:     { position: 'absolute', top: 56, right: 20, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  hint:        { position: 'absolute', bottom: 164, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '500' },
  shutterRow:  { position: 'absolute', bottom: 64, left: 0, right: 0, alignItems: 'center' },
  shutter:     { width: 78, height: 78, borderRadius: 39, backgroundColor: '#FFF', borderWidth: 4, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  shutterInner:{ width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFF' },
});

// ─── Scan confirm modal ───────────────────────────────────────────────────────
function ScanConfirmModal({ visible, detectedItems, hasExisting, darkMode, onConfirm, onCancel, c }) {
  const [editItems, setEditItems] = useState([]);

  useEffect(() => {
    if (visible) setEditItems(detectedItems.map((i) => ({ ...i })));
  }, [visible, detectedItems]);

  const updateName = (id, name) => {
    setEditItems((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
  };

  const removeItem = (id) => {
    setEditItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleAdd = (replace) => {
    const final = editItems
      .filter((i) => i.name.trim())
      .map((i) => ({ ...i, name: i.name.trim(), ...getItemMeta(i.name.trim()) }));
    if (final.length) onConfirm(final, replace);
  };

  const count = editItems.length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <View style={[scm.sheet, { backgroundColor: c.card, borderTopColor: c.border }]}>
          <View style={[scm.handle, { backgroundColor: c.border }]} />

          <View style={scm.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[scm.title, { color: c.white }]}>
                {count} item{count !== 1 ? 's' : ''} detected
              </Text>
              <Text style={[scm.sub, { color: c.muted }]}>
                Edit names or remove incorrect items before saving
              </Text>
            </View>
            <TouchableOpacity onPress={onCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={c.muted} />
            </TouchableOpacity>
          </View>

          {count === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
              <Ionicons name="alert-circle-outline" size={32} color={c.muted} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.muted }}>No items remaining</Text>
            </View>
          ) : (
            <ScrollView
              style={scm.list}
              contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {editItems.map((item) => {
                const meta  = getItemMeta(item.name);
                const style = getCategoryStyle(meta.category);
                return (
                  <View key={item.id} style={[scm.itemRow, { backgroundColor: c.bg, borderColor: c.border }]}>
                    <View style={[scm.itemIcon, { backgroundColor: style.bg }]}>
                      <Text style={{ fontSize: 20 }}>{meta.emoji}</Text>
                    </View>
                    <TextInput
                      value={item.name}
                      onChangeText={(v) => updateName(item.id, v)}
                      style={[scm.itemInput, { color: c.white }]}
                      autoCapitalize="words"
                      returnKeyType="done"
                      selectionColor={c.accent}
                    />
                    <View style={[scm.catPill, { backgroundColor: style.accent + '22' }]}>
                      <Text style={[scm.catText, { color: style.accent }]}>{meta.category}</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={20} color={c.muted} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={scm.footer}>
            {hasExisting && count > 0 && (
              <TouchableOpacity
                onPress={() => handleAdd(true)}
                style={[scm.secondaryBtn, { borderColor: c.border }]}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.muted }}>Replace Pantry</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => handleAdd(false)}
              style={[scm.primaryBtn, { backgroundColor: count > 0 ? c.accent : c.border }]}
              activeOpacity={0.85}
              disabled={count === 0}
            >
              <Ionicons name={count > 0 ? 'checkmark-circle' : 'alert-circle-outline'} size={18} color="#FFF" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>
                {count > 0 ? `Add ${count} Item${count !== 1 ? 's' : ''}` : 'Nothing to Add'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const scm = StyleSheet.create({
  sheet:       { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 44, maxHeight: '82%' },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  headerRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  title:       { fontSize: 18, fontWeight: '700' },
  sub:         { fontSize: 13, marginTop: 3, lineHeight: 18 },
  list:        { maxHeight: 340 },
  itemRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  itemIcon:    { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  itemInput:   { flex: 1, fontSize: 14, fontWeight: '600', paddingVertical: 0 },
  catPill:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  catText:     { fontSize: 10, fontWeight: '700' },
  footer:      { gap: 10, marginTop: 16 },
  secondaryBtn:{ borderRadius: 14, paddingVertical: 13, alignItems: 'center', borderWidth: 1 },
  primaryBtn:  { borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});

// ─── Add to Pantry bottom sheet ──────────────────────────────────────────────
function AddPantrySheet({ visible, onTakePhoto, onPickLibrary, onScanReceipt, onClose, c }) {
  const OPTIONS = [
    { icon: 'camera-outline',  label: 'Take Photo',               sub: 'Use in-app camera to scan',  onPress: onTakePhoto   },
    { icon: 'images-outline',  label: 'Upload from Camera Roll',  sub: 'Pick an image from library', onPress: onPickLibrary },
    { icon: 'receipt-outline', label: 'Scan Receipt',             sub: 'Parse a grocery receipt',    onPress: onScanReceipt },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[as.sheet, { backgroundColor: c.card, borderTopColor: c.border }]}>
          <View style={[as.handle, { backgroundColor: c.border }]} />
          <Text style={[as.title, { color: c.white }]}>Add to Pantry</Text>
          {OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.label}
              onPress={opt.onPress}
              activeOpacity={0.75}
              style={[as.row, { borderColor: c.border }]}
            >
              <View style={[as.iconWrap, { backgroundColor: c.accentDim }]}>
                <Ionicons name={opt.icon} size={22} color={c.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[as.rowLabel, { color: c.white }]}>{opt.label}</Text>
                <Text style={[as.rowSub,   { color: c.muted  }]}>{opt.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.muted} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const as = StyleSheet.create({
  sheet:    { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 48, gap: 6 },
  handle:   { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:    { fontSize: 19, fontWeight: '800', marginBottom: 8 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14 },
  iconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowLabel: { fontSize: 15, fontWeight: '700' },
  rowSub:   { fontSize: 12, marginTop: 2 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function PantryScreen() {
  const c          = useTheme();
  const { state }  = useApp();
  const { user }   = useAuth();
  const navigation = useNavigation();
  const { items, loaded, addItems, removeItem, clearAll, updateItemImage, updateItem, replaceAll } = usePantryStorage();
  const insets   = useSafeAreaInsets();
  const darkMode = false; // permanently light — to revert: state.settings?.darkMode !== false

  const [scanning,         setScanning]         = useState(false);
  const [uploading,        setUploading]        = useState(false);
  const [addSheetOpen,     setAddSheetOpen]     = useState(false);
  const [itemModal,        setItemModal]        = useState({ visible: false, mode: 'add', item: null });
  const [detectFeedback,   setDetectFeedback]   = useState(null); // { count } | null
  const [detectionFailed,  setDetectionFailed]  = useState(false);
  const [searchQuery,      setSearchQuery]      = useState('');
  const [pendingScanItems, setPendingScanItems] = useState(null); // null | Item[]
  const [cameraOpen,       setCameraOpen]       = useState(false);
  const feedbackTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(feedbackTimerRef.current), []);

  // ── Image streaming ────────────────────────────────────────────────────────
  // Only runs /food-image fetch for items that didn't get a URL from the backend.
  // Scan items already have imageUri set by apiItemsToPantry; manual adds do not.
  const streamImages = useCallback((baseItems) => {
    baseItems.forEach(async (item) => {
      if (item.imageUri) {
        console.log(`[pantry] "${item.name}" image from backend: ${item.imageUri}`);
        return;
      }
      console.log(`[pantry] "${item.name}" fetching image from /food-image...`);
      const { uri } = await getOrFetchFoodImage(item.name);
      if (!uri) {
        console.warn(`[pantry] "${item.name}" no image returned`);
        return;
      }
      console.log(`[pantry] "${item.name}" image loaded: ${uri}`);
      updateItemImage(item.id, uri);
    });
  }, [updateItemImage]);

  // Fetch images for any stored items that don't have one yet (runs once on load)
  useEffect(() => {
    if (!loaded) return;
    const missing = items.filter((i) => !i.imageUri);
    if (missing.length) streamImages(missing);
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Detection feedback banner (auto-dismisses after 6 s) ──────────────────
  const showDetectFeedback = useCallback((count) => {
    clearTimeout(feedbackTimerRef.current);
    setDetectFeedback({ count });
    feedbackTimerRef.current = setTimeout(() => setDetectFeedback(null), 6000);
  }, []);

  // ── Commit scanned items — add or replace ──────────────────────────────────
  const doCommitScan = useCallback((baseItems, replace) => {
    if (replace) replaceAll(baseItems);
    else         addItems(baseItems);
    streamImages(baseItems);
    showDetectFeedback(baseItems.length);
  }, [replaceAll, addItems, streamImages, showDetectFeedback]);

  // ── Confirm scan — called from ScanConfirmModal ────────────────────────────
  const handleConfirmScan = useCallback((finalItems, replace) => {
    // Capture implicit label corrections: any item whose name differs from what
    // the AI returned is a correction signal. Match by id (preserved through editing).
    if (pendingScanItems) {
      const origById = new Map(pendingScanItems.map((i) => [i.id, i.name]));
      finalItems.forEach((item) => {
        const origName = origById.get(item.id);
        if (origName) reportLabelCorrection(origName, item.name, user);
      });
    }
    doCommitScan(finalItems, replace);
    setPendingScanItems(null);
  }, [doCommitScan, pendingScanItems, user]);

  // ── Open in-app camera from sheet ─────────────────────────────────────────
  const handleTakePhoto = useCallback(() => {
    setAddSheetOpen(false);
    setCameraOpen(true);
  }, []);

  // ── Shared: send base64 image to /analyze-pantry, open confirm modal ────────
  const runPantryDetection = useCallback(async (imageBase64, mimeType = 'image/jpeg', label = 'scan') => {
    setDetectionFailed(false);
    setScanning(true);
    try {
      console.log(`[pantry ${label}] sending image to /analyze-pantry...`);
      const res  = await fetch(`${API_BASE_URL}/analyze-pantry`, {
        method:  'POST',
        headers: await getAuthHeaders(user),
        body:    JSON.stringify({ imageBase64, mimeType }),
      });
      const data = await res.json();
      console.log(`[pantry ${label}] API response received`);

      const rawItems = (data.items ?? []).filter((i) => i && typeof i.name === 'string');
      console.log(`[pantry ${label}] parsed ${rawItems.length} item(s):`, rawItems.map((i) => i.name).join(', ') || '(none)');

      if (!rawItems.length) {
        setDetectionFailed(true);
        return;
      }
      setPendingScanItems(apiItemsToPantry(rawItems));
    } catch (err) {
      console.warn(`[pantry ${label}]`, err.message);
      setDetectionFailed(true);
    } finally {
      setScanning(false);
    }
  }, [user]);

  // ── Pick from library → AI detect → confirm modal ─────────────────────────
  const handlePickFromLibrary = useCallback(async () => {
    setAddSheetOpen(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    await runPantryDetection(result.assets[0].base64, 'image/jpeg', 'library');
  }, [runPantryDetection]);

  // ── After camera capture: run AI, open confirm modal ──────────────────────
  const handleCameraCapture = useCallback(async ({ base64, mimeType }) => {
    setCameraOpen(false);
    await runPantryDetection(base64, mimeType, 'camera');
  }, [runPantryDetection]);

  // ── Scan receipt (mock flow) ───────────────────────────────────────────────
  const handleUploadReceipt = useCallback(async () => {
    setAddSheetOpen(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });
    if (result.canceled) return;

    setUploading(true);
    await new Promise((r) => setTimeout(r, 1800));
    setUploading(false);

    const dateAdded = new Date().toISOString();
    const baseItems = MOCK_RECEIPT_ITEMS.map((item) => ({
      ...item, imageUri: null, timestamp: dateAdded, dateAdded,
    }));
    addItems(baseItems);
    streamImages(baseItems);
  }, [addItems, streamImages]);

  // ── Add item manually ──────────────────────────────────────────────────────
  const handleAddManualItem = useCallback((name) => {
    const dateAdded = new Date().toISOString();
    const newItem = {
      id: `manual_${Date.now()}`,
      name,
      ...getItemMeta(name),
      qty:      '',
      imageUri: null,
      timestamp: dateAdded,
      dateAdded,
    };
    addItems([newItem]);
    getOrFetchFoodImage(name).then(({ uri }) => {
      if (uri) updateItemImage(newItem.id, uri);
    });
    setItemModal({ visible: false, mode: 'add', item: null });
  }, [addItems, updateItemImage]);

  // ── Edit item name ─────────────────────────────────────────────────────────
  const handleEditItem = useCallback((id, newName, originalName) => {
    if (originalName) reportLabelCorrection(originalName, newName, user);
    updateItem(id, { name: newName, ...getItemMeta(newName), imageUri: null });
    getOrFetchFoodImage(newName).then(({ uri }) => {
      if (uri) updateItemImage(id, uri);
    });
    setItemModal({ visible: false, mode: 'add', item: null });
  }, [updateItem, updateItemImage, user]);

  // ── Per-item delete ────────────────────────────────────────────────────────
  const handleDeleteItem = useCallback((id) => removeItem(id), [removeItem]);

  // ── Open edit modal ────────────────────────────────────────────────────────
  const openEditModal = useCallback((item) => {
    setItemModal({ visible: true, mode: 'edit', item });
  }, []);

  // ── Expiring soon — oldest items float to top with badge ──────────────────
  const { expiringIds, sortedItems } = useMemo(() => {
    if (items.length < 3) return { expiringIds: new Set(), sortedItems: items };
    const byAge = [...items].sort((a, b) =>
      new Date(a.dateAdded || a.timestamp || 0).getTime() -
      new Date(b.dateAdded || b.timestamp || 0).getTime()
    );
    const count = Math.min(4, Math.max(2, Math.floor(byAge.length * 0.3)));
    const expiring = byAge.slice(0, count);
    const ids = new Set(expiring.map((i) => i.id));
    // Expiring items first, then the rest in original order
    const rest = items.filter((i) => !ids.has(i.id));
    return { expiringIds: ids, sortedItems: [...expiring, ...rest] };
  }, [items]);

  // ── Search filter ──────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedItems;
    return sortedItems.filter((item) => item.name.toLowerCase().includes(q));
  }, [sortedItems, searchQuery]);

  // ── 2-column row pairs (expiring items first) ──────────────────────────────
  const rows = [];
  for (let i = 0; i < filteredItems.length; i += 2)
    rows.push([filteredItems[i], filteredItems[i + 1] || null]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110, paddingTop: insets.top + 16 }}
      >

        {/* ── Header ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: c.white, letterSpacing: 0.2 }}>Pantry</Text>
            <View style={{ backgroundColor: c.accent, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFF', letterSpacing: 0.4 }}>BETA</Text>
            </View>
          </View>
          {items.length > 0 && (
            <TouchableOpacity
              onPress={clearAll}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={{ fontSize: 13, color: c.muted }}>Clear all</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Eat at home ── */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: c.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.7 }}>
          Want to eat at home?
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 2 }}
          style={{ marginHorizontal: -16, paddingHorizontal: 16, marginBottom: 20 }}
        >
          {EAT_AT_HOME.map((chip) => (
            <TouchableOpacity
              key={chip.id}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('Helper', {
                preset:    chip.prompt,
                presetKey: `${chip.id}_${Date.now()}`,
              })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.accentDim, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: c.accent + '44' }}
            >
              <Ionicons name={chip.icon} size={14} color={c.accent} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.accent }}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Primary action button ── */}
        <TouchableOpacity
          onPress={() => setAddSheetOpen(true)}
          activeOpacity={0.82}
          style={[ab.btn, { backgroundColor: c.accent, shadowColor: c.accent, marginBottom: 24 }]}
        >
          <View style={[ab.iconWrap, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name="add-circle-outline" size={22} color="#FFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[ab.label, { color: '#FFF' }]}>Add to Pantry</Text>
            <Text style={[ab.sub, { color: 'rgba(255,255,255,0.7)' }]}>Camera, library, or receipt</Text>
          </View>
          <Ionicons name="chevron-up" size={18} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>

        {/* ── Detection feedback banner ── */}
        {detectFeedback && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setDetectFeedback(null)}
            style={[df.wrap, { backgroundColor: c.accentDim, borderColor: c.accent + '44' }]}
          >
            <Ionicons name="checkmark-circle" size={16} color={c.accent} />
            <Text style={[df.text, { color: c.accent }]}>
              Detected {detectFeedback.count} item{detectFeedback.count !== 1 ? 's' : ''} — missing anything? Tap + to add more.
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Processing banner ── */}
        {scanning  && <ProcessingBanner message="Analyzing pantry…" c={c} />}
        {uploading && <ProcessingBanner message="Reading receipt…"  c={c} />}

        {/* ── Detection failure banner ── */}
        {detectionFailed && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setDetectionFailed(false)}
            style={[df.wrap, { backgroundColor: '#2A0D0D', borderColor: '#E86B6B44' }]}
          >
            <Ionicons name="alert-circle-outline" size={16} color="#E86B6B" />
            <Text style={[df.text, { color: '#E86B6B' }]}>
              Couldn't detect items — try again with a clearer photo.
            </Text>
            <Ionicons name="close" size={14} color="#E86B6B88" />
          </TouchableOpacity>
        )}

        {/* ── Item count label + Add button ── */}
        {(items.length > 0 || scanning || uploading) && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Items
              </Text>
              <View style={{ backgroundColor: c.accentDim, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.accent }}>{items.length}</Text>
              </View>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                onPress={() => setItemModal({ visible: true, mode: 'add', item: null })}
                style={[add.btn, { backgroundColor: c.accentDim, borderColor: c.accent + '44' }]}
                activeOpacity={0.75}
              >
                <Ionicons name="add" size={14} color={c.accent} />
                <Text style={[add.label, { color: c.accent }]}>Add Item</Text>
              </TouchableOpacity>
            </View>

            {/* ── Search bar ── */}
            <View style={[sb.wrap, { backgroundColor: c.card, borderColor: c.border }]}>
              <Ionicons name="search-outline" size={15} color={c.muted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search pantry…"
                placeholderTextColor={c.muted}
                style={[sb.input, { color: c.white }]}
                returnKeyType="search"
                clearButtonMode="never"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={15} color={c.muted} />
                </TouchableOpacity>
              )}
            </View>

            {/* ── No search results ── */}
            {searchQuery.trim().length > 0 && filteredItems.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 32, gap: 6 }}>
                <Ionicons name="search-outline" size={28} color={c.muted} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.muted }}>
                  No items matching "{searchQuery.trim()}"
                </Text>
              </View>
            )}
          </>
        )}

        {/* ── Empty state ── */}
        {items.length === 0 && !scanning && !uploading && (
          <>
            <EmptyState c={c} />
            <TouchableOpacity
              onPress={() => setItemModal({ visible: true, mode: 'add', item: null })}
              activeOpacity={0.75}
              style={[add.emptyBtn, { backgroundColor: c.accentDim, borderColor: c.accent + '44' }]}
            >
              <Ionicons name="add-circle-outline" size={18} color={c.accent} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.accent }}>Add Item Manually</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Item grid ── */}
        {rows.map((row, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: CARD_GAP, marginBottom: CARD_GAP }}>
            <PantryItemCard
              item={row[0]}
              c={c}
              darkMode={darkMode}
              onDelete={() => handleDeleteItem(row[0].id)}
              onEdit={() => openEditModal(row[0])}
              isExpiring={expiringIds.has(row[0].id)}
            />
            {row[1]
              ? <PantryItemCard
                  item={row[1]}
                  c={c}
                  darkMode={darkMode}
                  onDelete={() => handleDeleteItem(row[1].id)}
                  onEdit={() => openEditModal(row[1])}
                  isExpiring={expiringIds.has(row[1].id)}
                />
              : <View style={{ width: CARD_W }} />
            }
          </View>
        ))}

      </ScrollView>

      <AddPantrySheet
        visible={addSheetOpen}
        onTakePhoto={handleTakePhoto}
        onPickLibrary={handlePickFromLibrary}
        onScanReceipt={handleUploadReceipt}
        onClose={() => setAddSheetOpen(false)}
        c={c}
      />

      <ItemInputModal
        visible={itemModal.visible}
        mode={itemModal.mode}
        item={itemModal.item}
        onSave={itemModal.mode === 'add'
          ? handleAddManualItem
          : (name) => handleEditItem(itemModal.item.id, name, itemModal.item.name)
        }
        onClose={() => setItemModal({ visible: false, mode: 'add', item: null })}
        c={c}
      />

      <ScanConfirmModal
        visible={pendingScanItems !== null}
        detectedItems={pendingScanItems ?? []}
        hasExisting={items.length > 0}
        darkMode={darkMode}
        onConfirm={handleConfirmScan}
        onCancel={() => setPendingScanItems(null)}
        c={c}
      />

      {cameraOpen && (
        <CameraModal
          visible
          onCapture={handleCameraCapture}
          onClose={() => setCameraOpen(false)}
          c={c}
        />
      )}

    </View>
  );
}

const ab = StyleSheet.create({
  btn:     { borderRadius: 18, padding: 14, gap: 10, flexDirection: 'row', alignItems: 'center', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 6 },
  iconWrap:{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label:   { fontSize: 14, fontWeight: '700' },
  sub:     { fontSize: 11, marginTop: 1 },
});

const df = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 },
  text: { fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 19 },
});

const add = StyleSheet.create({
  btn:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1 },
  label:   { fontSize: 12, fontWeight: '700' },
  emptyBtn:{ marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: 13, borderWidth: 1 },
});

const sb = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  input: { flex: 1, fontSize: 14, fontWeight: '500', paddingVertical: 0 },
});
