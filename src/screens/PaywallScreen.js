import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { DEV_MODE, isReviewAccount } from '../config/testMode';

import { API_BASE_URL } from '../config/api';

const BACKEND_URL = API_BASE_URL;

// Set true to skip IAP entirely and test the UI with mock state
const MOCK_MODE = false;

// Apple product IDs — must match exactly what you create in App Store Connect
// App Store Connect → your app → Subscriptions → create these two products:
//   com.foodchatai.monthly  (1 month, auto-renewable, $4.99, 14-day intro offer)
//   com.foodchatai.yearly   (1 year,  auto-renewable, $34.99, 14-day intro offer)

const PRODUCT_IDS = ['com.foodchatai.monthly', 'com.foodchatai.yearly'];

// Fallback prices shown while store loads or when IAP is unavailable
const MOCK_PRODUCTS = {
  'com.foodchatai.monthly': {
    price: '$4.99', period: 'per month',
    priceFull: '$9.99', badge: null, billingText: '$4.99/month',
  },
  'com.foodchatai.yearly': {
    price: '$34.99', period: 'per year',
    priceFull: '$59.99', badge: 'SAVE 42%', billingText: '$34.99/year',
  },
};

const PLAN_META = {
  'com.foodchatai.monthly': { key: 'monthly', label: 'Monthly' },
  'com.foodchatai.yearly':  { key: 'yearly',  label: 'Yearly'  },
};

const FEATURES = [
  { icon: 'sparkles',    text: 'AI-powered meal tracking'   },
  { icon: 'flash',       text: 'Personalized macro targets'  },
  { icon: 'trending-up', text: 'Weekly progress check-ins'  },
  { icon: 'mic-outline', text: 'Voice & photo meal logging'  },
];

// Client-side authoritative — backend records usage only
const PROMO_CODES = {
  Squidward22: { plan: 'lifetime_free', label: 'Lifetime Free Access' },
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const makeStyles = (c) => StyleSheet.create({
  safe:   { flex: 1, backgroundColor: c.bg },
  kav:    { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 44 },

  iconWrap: {
    width: 64, height: 64, borderRadius: 22,
    backgroundColor: c.accentDim,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 18, alignSelf: 'center',
  },
  title:    { fontSize: 26, fontWeight: '800', color: c.white, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 14, color: c.muted, textAlign: 'center', marginBottom: 4 },

  trialBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center',
    backgroundColor: c.greenDim, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
    marginTop: 8, marginBottom: 26,
    borderWidth: 1, borderColor: c.green + '33',
  },
  trialBadgeText: { fontSize: 13, fontWeight: '700', color: c.green },

  storeLoadingWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    alignSelf: 'center', marginBottom: 14,
  },
  storeLoadingText: { fontSize: 12, color: c.muted },

  plansRow:       { flexDirection: 'row', gap: 12, marginBottom: 16 },
  planCard:       { flex: 1, borderRadius: 18, borderWidth: 2, padding: 16, position: 'relative', overflow: 'hidden' },
  planUnselected: { borderColor: c.border, backgroundColor: c.card },
  planSelected:   { borderColor: c.accent, backgroundColor: c.accentDim },
  planLifetime:   { borderColor: c.green,  backgroundColor: c.greenDim  },

  planBadgeWrap:   { backgroundColor: c.green,  borderRadius: 8, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  planBadgeAccent: { backgroundColor: c.accent, borderRadius: 8, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  planBadgeText:   { fontSize: 9, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  planBadgeSpacer: { height: 21, marginBottom: 8 },

  planPriceFull: { fontSize: 12, color: c.muted, textDecorationLine: 'line-through', marginBottom: 2 },
  planPrice:     { fontSize: 28, fontWeight: '800', color: c.white, lineHeight: 32 },
  planPriceFree: { fontSize: 28, fontWeight: '800', color: c.green, lineHeight: 32 },
  planPeriod:    { fontSize: 11, color: c.muted, fontWeight: '500', marginBottom: 10 },
  planLabel:     { fontSize: 13, fontWeight: '700', color: c.white },

  planCheck: {
    position: 'absolute', top: 10, right: 10,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: c.accent,
    justifyContent: 'center', alignItems: 'center',
  },
  planCheckGreen: {
    position: 'absolute', top: 10, right: 10,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: c.green,
    justifyContent: 'center', alignItems: 'center',
  },

  promoRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 6 },
  promoInputWrap: {
    flex: 1,
    backgroundColor: c.inputBg, borderRadius: 12,
    borderWidth: 1, borderColor: c.border,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14,
  },
  promoInputFocused: { borderColor: c.accent },
  promoInputValid:   { borderColor: c.green  },
  promoTextInput: { flex: 1, fontSize: 15, color: c.white, paddingVertical: 13 },
  promoIcon: { marginRight: 8 },
  promoApplyBtn: {
    backgroundColor: c.accent, borderRadius: 12,
    paddingHorizontal: 18, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center', minWidth: 76,
  },
  promoApplyBtnGreen:    { backgroundColor: c.green },
  promoApplyBtnDisabled: { opacity: 0.38 },
  promoApplyText: { fontSize: 14, fontWeight: '700', color: '#FFF' },

  promoValidHint: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 18 },
  promoValidText: { fontSize: 12, fontWeight: '600', color: c.green },
  promoError:     { fontSize: 12, color: c.red, marginBottom: 16 },

  noPayNote: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.greenDim, borderRadius: 14,
    borderWidth: 1, borderColor: c.green + '44',
    padding: 14, marginBottom: 20,
  },
  noPayText: { fontSize: 14, color: c.green, fontWeight: '600', flex: 1 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: c.muted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  featureRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  featureIconBg: { width: 30, height: 30, borderRadius: 9, backgroundColor: c.accentDim, justifyContent: 'center', alignItems: 'center' },
  featureText:   { fontSize: 14, color: c.white, flex: 1 },

  divider: { height: 1, backgroundColor: c.border, marginVertical: 22 },

  error: { fontSize: 13, color: c.red, textAlign: 'center', marginBottom: 14 },

  ctaBtn: {
    backgroundColor: c.accent, borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 14,
    shadowColor: c.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.40, shadowRadius: 14, elevation: 8,
  },
  ctaBtnGreen: {
    backgroundColor: c.green,
    shadowColor: c.green,
  },
  ctaBtnDisabled: { opacity: 0.45, shadowOpacity: 0 },
  ctaBtnText:     { fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 },

  restoreBtn: {
    alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16,
    marginBottom: 14,
  },
  restoreBtnText: { fontSize: 13, color: c.muted, textDecorationLine: 'underline' },

  // ── Review mode only — remove before shipping ──────────────────────────────
  reviewBtn: {
    borderWidth: 1.5, borderColor: '#F59E0B', borderRadius: 14,
    borderStyle: 'dashed', paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 10,
  },
  reviewBtnText: { fontSize: 14, fontWeight: '700', color: '#F59E0B' },
  reviewLabel: {
    fontSize: 10, fontWeight: '700', color: '#F59E0B',
    textTransform: 'uppercase', letterSpacing: 0.8,
    textAlign: 'center', marginBottom: 14, opacity: 0.7,
  },

  legal:       { fontSize: 11, color: c.muted, textAlign: 'center', lineHeight: 17, marginBottom: 6 },
  legalAccent: { color: c.accent },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function PaywallScreen() {
  const c = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const { dispatch } = useApp();
  const { user }     = useAuth();

  // Runtime flag: true for the test account (Apple reviewer) and in DEV.
  // Used to bypass real IAP and show developer UI — never true for real users.
  const isTestAccount = MOCK_MODE || DEV_MODE || isReviewAccount(user);

  const [selectedId,    setSelectedId]    = useState('com.foodchatai.yearly');
  const [storeReady,    setStoreReady]    = useState(isTestAccount);
  const [storeProducts, setStoreProducts] = useState({});
  const [loading,      setLoading]      = useState(false);
  const [restoring,    setRestoring]    = useState(false);
  const [error,        setError]        = useState('');

  const [promoCode,    setPromoCode]    = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError,   setPromoError]   = useState('');
  const [focusedPromo, setFocusedPromo] = useState(false);

  const connectedRef = useRef(false);
  const IAPRef       = useRef(null); // dynamically imported on native only

  // ── App Store connection (native only — skipped on web and in TEST/MOCK mode) ─
  useEffect(() => {
    if (isTestAccount || Platform.OS === 'web') return;

    let mounted = true;

    const setup = async () => {
      const IAP = await import('expo-in-app-purchases');
      IAPRef.current = IAP;

      // Register the purchase listener BEFORE connecting so no events are missed
      IAP.setPurchaseListener(({ responseCode, results }) => {
        const RC = IAP.IAPResponseCode;

        if (responseCode === RC.OK && results?.length) {
          results.forEach(async (purchase) => {
            // Finish the transaction — false = do NOT consume (correct for subscriptions)
            try {
              if (!purchase.acknowledged) {
                await IAP.finishTransactionAsync(purchase, false);
              }
            } catch { /* non-fatal — Apple will retry on next launch */ }

            const planKey = PLAN_META[purchase.productId]?.key ?? 'monthly';
            dispatch({
              type: 'SET_SUBSCRIPTION',
              payload: {
                status:           'active',
                plan:             planKey,
                subscriptionId:   purchase.transactionId   ?? null,
                // transactionReceipt is the raw StoreKit receipt for backend validation
                transactionReceipt: purchase.transactionReceipt ?? null,
                customerId:       null,
                trialEnd:         null,
              },
            });
            if (mounted) setLoading(false);
          });

        } else if (responseCode === RC.DEFERRED) {
          // Ask to Buy — purchase is pending parental approval; not an error
          if (mounted) {
            setError("Your purchase is awaiting approval. You'll be notified when it's approved.");
            setLoading(false);
          }

        } else if (responseCode === RC.USER_CANCELED) {
          if (mounted) setLoading(false);

        } else {
          if (mounted) {
            setError('Purchase failed. Please try again.');
            setLoading(false);
          }
        }
      });

      try {
        await IAP.connectAsync();
        connectedRef.current = true;

        const { responseCode, results } = await IAP.getProductsAsync(PRODUCT_IDS);
        if (mounted && responseCode === IAP.IAPResponseCode.OK && results?.length) {
          const map = {};
          results.forEach((p) => { map[p.productId] = p; });
          setStoreProducts(map);
        }
      } catch {
        // Store unavailable — mock prices will be shown, purchase will surface an error
      } finally {
        if (mounted) setStoreReady(true);
      }
    };

    setup();

    return () => {
      mounted = false;
      if (connectedRef.current && IAPRef.current) {
        IAPRef.current.disconnectAsync().catch(() => {});
        connectedRef.current = false;
      }
    };
  }, []);

  // ── Derived display values ────────────────────────────────────────────────
  const previewPromo   = PROMO_CODES[promoCode.trim()] ?? null;
  const isLifetimeFree = previewPromo?.plan === 'lifetime_free';

  const getDisplayPrice = (productId) => {
    const store = storeProducts[productId];
    if (store?.price) return store.price;
    return MOCK_PRODUCTS[productId].price;
  };

  const selectedMock = MOCK_PRODUCTS[selectedId];

  // ── Review mode: bypass purchase entirely ────────────────────────────────
  const handleUnlockForTesting = () => {
    const planKey = PLAN_META[selectedId]?.key ?? 'monthly';
    dispatch({
      type: 'SET_SUBSCRIPTION',
      payload: { status: 'active', plan: planKey, subscriptionId: 'review_mode', customerId: null, trialEnd: null },
    });
  };

  // ── Subscribe via Apple IAP ───────────────────────────────────────────────
  const handleSubscribe = async () => {
    setError('');

    // Non-production paths — bypass real IAP
    if (isTestAccount || Platform.OS === 'web') {
      const planKey = PLAN_META[selectedId]?.key ?? 'monthly';
      dispatch({
        type: 'SET_SUBSCRIPTION',
        payload: { status: 'active', plan: planKey, subscriptionId: 'mock', customerId: null, trialEnd: null },
      });
      return;
    }

    if (!storeReady || !IAPRef.current) {
      setError('Still connecting to App Store. Please wait a moment.');
      return;
    }

    setLoading(true);
    try {
      // Triggers the native StoreKit sheet — result arrives via setPurchaseListener
      await IAPRef.current.purchaseItemAsync(selectedId);
    } catch {
      setError('Could not connect to the App Store. Please try again.');
      setLoading(false);
    }
  };

  // ── Restore previous purchases ────────────────────────────────────────────
  const handleRestore = async () => {
    if (isTestAccount || Platform.OS === 'web' || !IAPRef.current) {
      setError('Restore is only available on a real device with an active Apple ID.');
      return;
    }
    setRestoring(true);
    setError('');
    try {
      const IAP = IAPRef.current;
      const { responseCode, results } = await IAP.getPurchaseHistoryAsync();
      if (responseCode === IAP.IAPResponseCode.OK && results?.length) {
        // Use the most recent subscription purchase
        const sub = results
          .filter((p) => PRODUCT_IDS.includes(p.productId))
          .sort((a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0))[0];

        if (sub) {
          const planKey = PLAN_META[sub.productId]?.key ?? 'monthly';
          dispatch({
            type: 'SET_SUBSCRIPTION',
            payload: {
              status:             'active',
              plan:               planKey,
              subscriptionId:     sub.transactionId        ?? null,
              transactionReceipt: sub.transactionReceipt   ?? null,
              customerId:         null,
              trialEnd:           null,
            },
          });
        } else {
          setError('No FoodChat AI subscription found on this Apple ID.');
        }
      } else {
        setError('No previous purchases found.');
      }
    } catch {
      setError('Could not restore purchases. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  // ── Apply promo code ──────────────────────────────────────────────────────
  const handlePromoApply = async () => {
    const trimmed = promoCode.trim();
    if (!trimmed) return;
    setPromoError('');

    const code = PROMO_CODES[trimmed];
    if (!code) { setPromoError('Invalid code'); return; }

    setPromoLoading(true);

    fetch(`${BACKEND_URL}/promo/redeem`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: trimmed, userId: user?.uid, email: user?.email }),
    }).catch(() => {});

    dispatch({
      type: 'SET_SUBSCRIPTION',
      payload: {
        status:         'lifetime_free',
        plan:           'lifetime_free',
        subscriptionId: null,
        customerId:     null,
        trialEnd:       null,
      },
    });

    setPromoLoading(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Icon + title ── */}
          <View style={s.iconWrap}>
            <Ionicons name="sparkles" size={30} color={c.accent} />
          </View>
          <Text style={s.title}>Try FoodChat AI Free</Text>
          <Text style={s.subtitle}>Full access, no restrictions</Text>

          {/* ── 14-day trial badge ── */}
          <View style={s.trialBadge}>
            <Ionicons name="gift-outline" size={15} color={c.green} />
            <Text style={s.trialBadgeText}>14-day free trial — no charge today</Text>
          </View>

          {/* ── Store loading indicator ── */}
          {!storeReady && !MOCK_MODE && (
            <View style={s.storeLoadingWrap}>
              <ActivityIndicator size="small" color={c.muted} />
              <Text style={s.storeLoadingText}>Connecting to App Store…</Text>
            </View>
          )}

          {/* ── Plan cards ── */}
          <View style={s.plansRow}>
            {PRODUCT_IDS.map((productId) => {
              const meta = PLAN_META[productId];
              const mock = MOCK_PRODUCTS[productId];
              const sel  = selectedId === productId;

              const cardStyle = isLifetimeFree
                ? s.planLifetime
                : sel ? s.planSelected : s.planUnselected;

              const displayBadge  = isLifetimeFree ? 'LIFETIME' : mock.badge;
              const displayFull   = isLifetimeFree ? getDisplayPrice(productId) : mock.priceFull;
              const displayPrice  = isLifetimeFree ? 'FREE' : getDisplayPrice(productId);
              const displayPeriod = isLifetimeFree ? 'forever' : mock.period;

              return (
                <TouchableOpacity
                  key={productId}
                  style={[s.planCard, cardStyle]}
                  onPress={() => { setSelectedId(productId); setError(''); }}
                  activeOpacity={0.82}
                >
                  {displayBadge
                    ? <View style={isLifetimeFree ? s.planBadgeWrap : (mock.badge ? s.planBadgeWrap : s.planBadgeAccent)}>
                        <Text style={s.planBadgeText}>{displayBadge}</Text>
                      </View>
                    : <View style={s.planBadgeSpacer} />
                  }
                  <Text style={s.planPriceFull}>{displayFull}</Text>
                  <Text style={isLifetimeFree ? s.planPriceFree : s.planPrice}>{displayPrice}</Text>
                  <Text style={s.planPeriod}>{displayPeriod}</Text>
                  <Text style={s.planLabel}>{meta.label}</Text>
                  {(sel || isLifetimeFree) && (
                    <View style={isLifetimeFree ? s.planCheckGreen : s.planCheck}>
                      <Ionicons name="checkmark" size={13} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Promo code ── */}
          <View style={s.promoRow}>
            <View style={[
              s.promoInputWrap,
              focusedPromo && s.promoInputFocused,
              isLifetimeFree && s.promoInputValid,
            ]}>
              <Ionicons
                name={isLifetimeFree ? 'checkmark-circle' : 'pricetag-outline'}
                size={16}
                color={isLifetimeFree ? c.green : c.muted}
                style={s.promoIcon}
              />
              <TextInput
                style={s.promoTextInput}
                value={promoCode}
                onChangeText={(t) => { setPromoCode(t); setPromoError(''); }}
                placeholder="Enter discount code"
                placeholderTextColor={c.muted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onFocus={() => setFocusedPromo(true)}
                onBlur={() => setFocusedPromo(false)}
                onSubmitEditing={handlePromoApply}
              />
            </View>
            <TouchableOpacity
              style={[
                s.promoApplyBtn,
                isLifetimeFree && s.promoApplyBtnGreen,
                (!promoCode.trim() || promoLoading) && s.promoApplyBtnDisabled,
              ]}
              onPress={handlePromoApply}
              activeOpacity={0.8}
              disabled={!promoCode.trim() || promoLoading}
            >
              {promoLoading
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={s.promoApplyText}>{isLifetimeFree ? 'Unlock' : 'Apply'}</Text>
              }
            </TouchableOpacity>
          </View>

          {isLifetimeFree && !promoError && (
            <View style={s.promoValidHint}>
              <Ionicons name="checkmark-circle" size={14} color={c.green} />
              <Text style={s.promoValidText}>Lifetime free access unlocked — no payment needed</Text>
            </View>
          )}
          {promoError ? <Text style={s.promoError}>{promoError}</Text> : null}

          {/* ── Features ── */}
          <Text style={s.sectionLabel}>What's included</Text>
          {FEATURES.map(({ icon, text }) => (
            <View key={text} style={s.featureRow}>
              <View style={s.featureIconBg}>
                <Ionicons name={icon} size={15} color={c.accent} />
              </View>
              <Text style={s.featureText}>{text}</Text>
            </View>
          ))}

          <View style={s.divider} />

          {/* ── No-payment note when lifetime promo active ── */}
          {isLifetimeFree && (
            <View style={s.noPayNote}>
              <Ionicons name="shield-checkmark" size={20} color={c.green} />
              <Text style={s.noPayText}>No payment required — your code grants lifetime access.</Text>
            </View>
          )}

          {error ? <Text style={s.error}>{error}</Text> : null}

          {/* ── CTA ── */}
          {isLifetimeFree ? (
            <TouchableOpacity
              style={[s.ctaBtn, s.ctaBtnGreen, promoLoading && s.ctaBtnDisabled]}
              onPress={handlePromoApply}
              activeOpacity={0.85}
              disabled={promoLoading}
            >
              {promoLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="infinite" size={18} color="#FFF" />
                  <Text style={s.ctaBtnText}>Unlock Lifetime Access</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[s.ctaBtn, (loading || !storeReady) && s.ctaBtnDisabled]}
              onPress={handleSubscribe}
              activeOpacity={0.85}
              disabled={loading || (!storeReady && !isTestAccount)}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="lock-closed" size={16} color="#FFF" />
                  <Text style={s.ctaBtnText}>Start 14-Day Free Trial</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* ── Test mode unlock button (DEV or review account only) ── */}
          {(DEV_MODE || isReviewAccount(user)) && !isLifetimeFree && (
            <>
              <Text style={s.reviewLabel}>Test Mode — not visible in production</Text>
              <TouchableOpacity
                style={s.reviewBtn}
                onPress={handleUnlockForTesting}
                activeOpacity={0.8}
              >
                <Ionicons name="construct-outline" size={16} color="#F59E0B" />
                <Text style={s.reviewBtnText}>Unlock for Testing</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Restore purchases ── */}
          {!isLifetimeFree && (
            <TouchableOpacity
              style={s.restoreBtn}
              onPress={handleRestore}
              activeOpacity={0.7}
              disabled={restoring}
            >
              {restoring
                ? <ActivityIndicator size="small" color={c.muted} />
                : <Text style={s.restoreBtnText}>Restore Purchases</Text>
              }
            </TouchableOpacity>
          )}

          {/* ── Legal ── */}
          {isLifetimeFree ? (
            <Text style={s.legal}>
              By continuing you agree to our{' '}
              <Text style={s.legalAccent}>Terms of Service</Text>
              {' '}and <Text style={s.legalAccent}>Privacy Policy</Text>.
            </Text>
          ) : (
            <>
              <Text style={s.legal}>
                After your free trial, you'll be automatically charged{' '}
                <Text style={{ color: c.white, fontWeight: '600' }}>
                  {getDisplayPrice(selectedId)}/{MOCK_PRODUCTS[selectedId].period.replace('per ', '')}
                </Text>
                {' '}through your Apple ID. Cancel any time before the trial ends.
              </Text>
              <Text style={s.legal}>
                By continuing you agree to our{' '}
                <Text style={s.legalAccent}>Terms of Service</Text>
                {' '}and <Text style={s.legalAccent}>Privacy Policy</Text>.
                {' '}Subscriptions auto-renew unless canceled 24 hours before the renewal date.
              </Text>
            </>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
