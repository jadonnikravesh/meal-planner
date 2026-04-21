/**
 * ImageFeedbackModal  — three-screen image correction flow
 *
 * Screen 1 · confirm    (fade, centred card)
 *   Shows the current image.  "Yes, that's it" saves and closes.
 *   "No, show alternatives" slides to screen 2.
 *
 * Screen 2 · alternatives  (slide-up page sheet)
 *   2–4 Pexels results for the food name — all strictly relevant.
 *   Tap any image to save and close.
 *   "Browse all" opens screen 3.
 *
 * Screen 3 · browse  (slide-up page sheet)
 *   Curated grid of common foods + live Pexels search as you type.
 *
 * Props
 *   visible        bool
 *   item           { name }
 *   currentUri     URI currently shown on the meal card
 *   onSelect(uri)  called when user picks an image; caller persists it
 *   onClose()      called when user dismisses without selecting
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, Image,
  TextInput, FlatList, StyleSheet, Dimensions,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getCandidateImages, loadBrowseImages, searchFoodImages,
} from '../utils/imageService';

// ─── Palette ──────────────────────────────────────────────────────────────────
const BG      = '#0E0E14';
const CARD    = '#18182A';
const CARD2   = '#1E1E30';
const BORDER  = '#23233A';
const WHITE   = '#FFFFFF';
const MUTED   = '#7878A0';
const ACCENT  = '#7C6FE0';
const GREEN   = '#4CAF50';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Confirm card sizing ──────────────────────────────────────────────────────
const CONFIRM_H_PAD = 20;
const CONFIRM_IMG_H = 190;

// ─── Alternatives grid sizing ─────────────────────────────────────────────────
const ALT_SIDE_PAD  = 16;
const ALT_COL_GAP   = 12;
const ALT_CELL_W    = (SCREEN_W - ALT_SIDE_PAD * 2 - ALT_COL_GAP) / 2;
const ALT_IMG_H     = ALT_CELL_W;

// ─── Browse grid sizing ───────────────────────────────────────────────────────
const BROWSE_COLS   = 3;
const BROWSE_PAD    = 16;
const BROWSE_GAP    = 8;
const BROWSE_CELL_W = (SCREEN_W - BROWSE_PAD * 2 - BROWSE_GAP * (BROWSE_COLS - 1)) / BROWSE_COLS;

// ─── Component ────────────────────────────────────────────────────────────────
export default function ImageFeedbackModal({
  visible, item, currentUri,
  onSelect, onClose,
}) {
  const [screen,       setScreen]       = useState('confirm');
  const [search,       setSearch]       = useState('');
  const [candidates,   setCandidates]   = useState([]);
  const [loadingAlt,   setLoadingAlt]   = useState(false);
  const [browseItems,  setBrowseItems]  = useState([]);
  const [loadingBrowse,setLoadingBrowse]= useState(false);
  const searchDebounce = useRef(null);

  // Reset state each time the modal opens
  useEffect(() => {
    if (visible) {
      setScreen('confirm');
      setSearch(item?.name || '');
      setCandidates([]);
      setBrowseItems([]);
    }
  }, [visible]);

  // ── Load Pexels alternatives when screen 2 opens ────────────────────────────
  useEffect(() => {
    if (screen !== 'alternatives' || !item?.name) return;
    let alive = true;
    setLoadingAlt(true);
    getCandidateImages(item.name, currentUri).then((cands) => {
      if (alive) { setCandidates(cands); setLoadingAlt(false); }
    });
    return () => { alive = false; };
  }, [screen, item?.name, currentUri]);

  // ── Browse screen: curated list on open, live Pexels search on type ─────────
  useEffect(() => {
    if (screen !== 'browse') return;
    const q = search.trim();

    // Debounce all browse data changes so rapid keystrokes don't fire many requests
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      setLoadingBrowse(true);
      if (!q) {
        const curated = await loadBrowseImages();
        setBrowseItems(curated);
      } else {
        // Try a live Pexels search first; fall back to curated-list filter
        const live = await searchFoodImages(q, 12);
        if (live.length > 0) {
          setBrowseItems(live);
        } else {
          const curated = await loadBrowseImages();
          setBrowseItems(curated.filter((f) =>
            f.label.toLowerCase().includes(q.toLowerCase()),
          ));
        }
      }
      setLoadingBrowse(false);
    }, q ? 400 : 0);

    return () => clearTimeout(searchDebounce.current);
  }, [search, screen]);

  if (!item) return null;

  // ── Helpers ────────────────────────────────────────────────────────────────
  // uri   = medium thumbnail (display)
  // uriHd = large (persisted quality)
  const pick = (uri, uriHd) => {
    onSelect(uriHd || uri);
  };

  const confirmCurrentImage = () => {
    if (currentUri) onSelect(currentUri);
    else onClose();
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Screen 3: Browse — curated grid + live Pexels search
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'browse') {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setScreen('alternatives')}
      >
        <SafeAreaView style={s.sheetSafe}>

          <View style={s.sheetHeader}>
            <TouchableOpacity
              onPress={() => setScreen('alternatives')}
              style={s.sheetHeaderBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={18} color={WHITE} />
            </TouchableOpacity>
            <Text style={s.sheetHeaderTitle}>Browse All Images</Text>
            <TouchableOpacity onPress={onClose} style={s.sheetHeaderBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color={MUTED} />
            </TouchableOpacity>
          </View>

          <Text style={s.sheetSub}>
            Choosing image for <Text style={{ color: WHITE }}>{item.name}</Text>
          </Text>

          <View style={s.searchRow}>
            <Ionicons name="search-outline" size={15} color={MUTED} />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search any food…"
              placeholderTextColor={MUTED}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}>
                <Ionicons name="close-circle" size={16} color={MUTED} />
              </TouchableOpacity>
            )}
          </View>

          {loadingBrowse ? (
            <View style={s.centeredLoader}>
              <ActivityIndicator size="large" color={ACCENT} />
              <Text style={s.loaderText}>Fetching images…</Text>
            </View>
          ) : (
            <FlatList
              data={browseItems}
              keyExtractor={(f) => f.key}
              numColumns={BROWSE_COLS}
              contentContainerStyle={s.browseGrid}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: food }) => (
                <TouchableOpacity
                  style={s.browseCell}
                  onPress={() => pick(food.uri, food.uriHd)}
                  activeOpacity={0.75}
                >
                  <Image
                    source={{ uri: food.uri }}
                    style={s.browseImg}
                    resizeMode="cover"
                    fadeDuration={200}
                  />
                  <Text style={s.browseLabel} numberOfLines={2}>{food.label}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={s.centeredLoader}>
                  <Ionicons name="search-outline" size={32} color={MUTED} />
                  <Text style={s.loaderText}>No results found</Text>
                </View>
              }
            />
          )}
        </SafeAreaView>
      </Modal>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Screen 2: Alternatives — 2×2 Pexels grid
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'alternatives') {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setScreen('confirm')}
      >
        <SafeAreaView style={s.sheetSafe}>

          <View style={s.sheetHeader}>
            <TouchableOpacity
              onPress={() => setScreen('confirm')}
              style={s.sheetHeaderBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={18} color={WHITE} />
            </TouchableOpacity>
            <Text style={s.sheetHeaderTitle}>Pick the Right Image</Text>
            <TouchableOpacity onPress={onClose} style={s.sheetHeaderBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color={MUTED} />
            </TouchableOpacity>
          </View>

          <Text style={s.sheetSub}>
            for <Text style={{ color: WHITE, fontWeight: '700' }}>{item.name}</Text>
          </Text>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.altScroll}
          >
            {loadingAlt ? (
              <View style={s.centeredLoader}>
                <ActivityIndicator size="large" color={ACCENT} />
                <Text style={s.loaderText}>Finding alternatives…</Text>
              </View>
            ) : (
              /* 2-column grid — explicit rows avoid flexWrap/ScrollView issues on Android */
              <View style={s.altGridOuter}>
                {[candidates.slice(0, 2), candidates.slice(2, 4)].map((row, ri) =>
                  row.length > 0 ? (
                    <View key={ri} style={s.altGridRow}>
                      {row.map((cand) => (
                        <TouchableOpacity
                          key={cand.key}
                          style={s.altCell}
                          onPress={() => pick(cand.uri, cand.uriHd)}
                          activeOpacity={0.78}
                        >
                          <Image
                            source={{ uri: cand.uri }}
                            style={s.altImg}
                            resizeMode="cover"
                            fadeDuration={200}
                          />
                          <View style={s.altLabelWrap}>
                            <Text style={s.altLabel} numberOfLines={1}>{cand.label}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null,
                )}
              </View>
            )}

            <View style={s.altDivider} />

            <TouchableOpacity
              style={s.browseAllBtn}
              onPress={() => setScreen('browse')}
              activeOpacity={0.75}
            >
              <View style={s.browseAllInner}>
                <Ionicons name="images-outline" size={18} color={ACCENT} />
                <Text style={s.browseAllText}>Browse all food images</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={MUTED} />
            </TouchableOpacity>

          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Screen 1: Confirm — is this the right image?
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <View style={s.confirmCard}>

          <Text style={s.confirmQuestion}>Is this the correct item?</Text>
          <Text style={s.confirmFoodName}>"{item.name}"</Text>

          <View style={s.previewWrap}>
            {currentUri ? (
              <Image
                source={{ uri: currentUri }}
                style={s.preview}
                resizeMode="cover"
                fadeDuration={200}
              />
            ) : (
              <View style={[s.preview, s.previewEmpty]}>
                <Ionicons name="restaurant-outline" size={44} color={MUTED} />
                <Text style={s.previewEmptyText}>No image yet</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={s.yesBtn}
            onPress={confirmCurrentImage}
            activeOpacity={0.82}
          >
            <Ionicons name="checkmark-circle" size={18} color="#FFF" />
            <Text style={s.yesBtnText}>Yes, that's it</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.noBtn}
            onPress={() => setScreen('alternatives')}
            activeOpacity={0.82}
          >
            <Ionicons name="close-circle-outline" size={18} color={WHITE} />
            <Text style={s.noBtnText}>No, show alternatives</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={s.skipBtn} activeOpacity={0.7}>
            <Text style={s.skipText}>Skip for now</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({

  // ── Shared sheet styles (screens 2 & 3) ────────────────────────────────────
  sheetSafe: { flex: 1, backgroundColor: BG },

  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  sheetHeaderBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CARD, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  sheetHeaderTitle: { fontSize: 16, fontWeight: '700', color: WHITE },

  sheetSub: {
    fontSize: 13, color: MUTED,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },

  // ── Loading state ───────────────────────────────────────────────────────────
  centeredLoader: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 48, gap: 12,
  },
  loaderText: { fontSize: 13, color: MUTED, fontWeight: '500' },

  // ── Browse (screen 3) ───────────────────────────────────────────────────────
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 8, marginBottom: 4,
    backgroundColor: CARD, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: BORDER,
  },
  searchInput: { flex: 1, fontSize: 14, color: WHITE },
  browseGrid:  { padding: BROWSE_PAD, gap: BROWSE_GAP },
  browseCell:  { width: BROWSE_CELL_W, marginBottom: 4, alignItems: 'center' },
  browseImg: {
    width: BROWSE_CELL_W, height: BROWSE_CELL_W,
    borderRadius: 10, backgroundColor: CARD2,
  },
  browseLabel: {
    fontSize: 10, fontWeight: '600', color: MUTED,
    textAlign: 'center', marginTop: 5, lineHeight: 14,
  },

  // ── Alternatives (screen 2) ─────────────────────────────────────────────────
  altScroll: { paddingBottom: 40 },

  altGridOuter: {
    paddingHorizontal: ALT_SIDE_PAD,
    paddingTop: 16,
    gap: ALT_COL_GAP,
  },
  altGridRow: {
    flexDirection: 'row',
    gap: ALT_COL_GAP,
  },
  altCell: {
    width: ALT_CELL_W,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: CARD2,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  altImg:      { width: ALT_CELL_W, height: ALT_IMG_H },
  altLabelWrap:{ paddingHorizontal: 10, paddingVertical: 10, backgroundColor: CARD2 },
  altLabel:    { fontSize: 13, fontWeight: '700', color: WHITE, textAlign: 'center' },

  altDivider: {
    height: 1, backgroundColor: BORDER,
    marginHorizontal: ALT_SIDE_PAD, marginTop: 24, marginBottom: 8,
  },
  browseAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: ALT_SIDE_PAD, marginTop: 8,
    backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  browseAllInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  browseAllText:  { fontSize: 14, fontWeight: '600', color: ACCENT },

  // ── Confirm (screen 1) ──────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: CONFIRM_H_PAD,
  },
  confirmCard: {
    width: '100%',
    backgroundColor: CARD,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },

  confirmQuestion: { fontSize: 13, color: MUTED, fontWeight: '500' },
  confirmFoodName: {
    fontSize: 18, fontWeight: '800', color: WHITE,
    textAlign: 'center', marginTop: -4,
  },

  previewWrap:      { width: '100%', borderRadius: 16, overflow: 'hidden' },
  preview:          { width: '100%', height: CONFIRM_IMG_H },
  previewEmpty: {
    height: CONFIRM_IMG_H, justifyContent: 'center', alignItems: 'center',
    gap: 8, backgroundColor: CARD2,
  },
  previewEmptyText: { fontSize: 13, color: MUTED },

  yesBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, alignSelf: 'stretch',
    backgroundColor: GREEN + 'CC',
    borderRadius: 14, paddingVertical: 13,
  },
  yesBtnText: { fontSize: 15, fontWeight: '700', color: WHITE },

  noBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, alignSelf: 'stretch',
    backgroundColor: 'transparent',
    borderRadius: 14, paddingVertical: 13,
    borderWidth: 1, borderColor: BORDER,
  },
  noBtnText: { fontSize: 15, fontWeight: '600', color: WHITE },

  skipBtn:  { paddingVertical: 4 },
  skipText: { fontSize: 12, color: MUTED },
});
