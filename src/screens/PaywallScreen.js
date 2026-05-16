import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { isDevEnabled, isReviewAccount } from '../config/testMode';
import TermsOfServiceScreen from './TermsOfServiceScreen';
import PrivacyPolicyScreen  from './PrivacyPolicyScreen';

import { API_BASE_URL } from '../config/api';

const BACKEND_URL = API_BASE_URL;

const MOCK_MODE = false;

const FORCE_REAL_IAP = process.env.EXPO_PUBLIC_FORCE_IAP === 'true';

const PRODUCT_IDS = ['com.foodchatai.monthly', 'com.foodchatai.yearly'];

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

  planBadgeWrap:   { backgroundColor: c.green,  borderRadius: 8, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  planBadgeAccent: { backgroundColor: c.accent, borderRadius: 8, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  planBadgeText:   { fontSize: 9, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  planBadgeSpacer: { height: 21, marginBottom: 8 },

  planPriceFull: { fontSize: 12, color: c.muted, textDecorationLine: 'line-through', marginBottom: 2 },
  planPrice:     { fontSize: 28, fontWeight: '800', color: c.white, lineHeight: 32 },
  planPeriod:    { fontSize: 11, color: c.muted, fontWeight: '500', marginBottom: 10 },
  planLabel:     { fontSize: 13, fontWeight: '700', color: c.white },

  planCheck: {
    position: 'absolute', top: 10, right: 10,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: c.accent,
    justifyContent: 'center', alignItems: 'center',
  },

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
  ctaBtnDisabled: { opacity: 0.45, shadowOpacity: 0 },
  ctaBtnText:     { fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 },

  restoreBtn: {
    alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16,
    marginBottom: 14,
  },
  restoreBtnText: { fontSize: 13, color: c.muted, textDecorationLine: 'underline' },

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

  const isTestAccount = MOCK_MODE || (!FORCE_REAL_IAP && isDevEnabled(user)) || isReviewAccount(user);

  const [selectedId,    setSelectedId]    = useState('com.foodchatai.yearly');
  const [storeReady,    setStoreReady]    = useState(isTestAccount);
  const [storeProducts, setStoreProducts] = useState({});
  const [loading,      setLoading]      = useState(false);
  const [restoring,    setRestoring]    = useState(false);
  const [error,        setError]        = useState('');
  const [showTerms,    setShowTerms]    = useState(false);
  const [showPrivacy,  setShowPrivacy]  = useState(false);

  const connectedRef      = useRef(false);
  const IAPRef            = useRef(null);
  const purchaseTimeoutRef = useRef(null);

  // ── App Store connection ───────────────────────────────────────────────────
  useEffect(() => {
    if (isTestAccount || Platform.OS === 'web') return;

    let mounted = true;

    const setup = async () => {
      const IAP = await import('expo-in-app-purchases');
      IAPRef.current = IAP;

      IAP.setPurchaseListener(({ responseCode, results, errorCode }) => {
        console.log('[IAP] Purchase listener fired — responseCode:', responseCode, 'results:', results?.length ?? 0);
        clearTimeout(purchaseTimeoutRef.current);
        const RC = IAP.IAPResponseCode;

        if (responseCode === RC.OK && results?.length) {
          results.forEach(async (purchase) => {
            const txId = purchase.orderId ?? purchase.transactionId ?? null;
            console.log('[IAP] Purchase OK:', purchase.productId, 'txId:', txId);
            try {
              if (!purchase.acknowledged) {
                await IAP.finishTransactionAsync(purchase, false);
                console.log('[IAP] Transaction finished:', txId);
              }
            } catch (e) { console.warn('[IAP] finishTransactionAsync error:', e?.message); }

            const planKey = PLAN_META[purchase.productId]?.key ?? 'monthly';
            dispatch({
              type: 'SET_SUBSCRIPTION',
              payload: {
                status:           'active',
                plan:             planKey,
                subscriptionId:   txId,
                transactionReceipt: purchase.transactionReceipt ?? null,
                customerId:       null,
                trialEnd:         null,
              },
            });
            if (mounted) setLoading(false);
          });

        } else if (responseCode === RC.DEFERRED) {
          console.log('[IAP] Purchase deferred (Ask to Buy)');
          if (mounted) {
            setError("Your purchase is awaiting approval. You'll be notified when it's approved.");
            setLoading(false);
          }

        } else if (responseCode === RC.USER_CANCELED) {
          console.log('[IAP] Purchase cancelled by user');
          if (mounted) setLoading(false);

        } else {
          console.warn('[IAP] Purchase failed — responseCode:', responseCode, 'errorCode:', errorCode);
          if (mounted) {
            setError('Purchase failed. Please try again.');
            setLoading(false);
          }
        }
      });

      try {
        console.log('[IAP] Connecting to App Store...');
        await IAP.connectAsync();
        connectedRef.current = true;
        console.log('[IAP] Connected');
      } catch (connectErr) {
        if (connectErr?.message?.includes('Already connected')) {
          console.log('[IAP] Already connected — reusing existing session');
          connectedRef.current = true;
        } else {
          console.warn('[IAP] connectAsync failed:', connectErr?.message ?? connectErr);
          if (mounted) setStoreReady(true);
          return;
        }
      }

      try {
        console.log('[IAP] Fetching products:', PRODUCT_IDS);
        const { responseCode, results } = await IAP.getProductsAsync(PRODUCT_IDS);
        console.log('[IAP] getProductsAsync responseCode:', responseCode, '— products returned:', results?.length ?? 0);
        if (mounted) {
          if (responseCode === IAP.IAPResponseCode.OK && results?.length) {
            const map = {};
            results.forEach((p) => {
              map[p.productId] = p;
              console.log('[IAP] Product loaded:', p.productId, p.price);
            });
            setStoreProducts(map);
          } else {
            console.warn('[IAP] No products returned — verify these IDs exist in App Store Connect:', PRODUCT_IDS);
          }
        }
      } catch (fetchErr) {
        console.warn('[IAP] getProductsAsync failed:', fetchErr?.message ?? fetchErr);
      } finally {
        if (mounted) setStoreReady(true);
      }
    };

    setup();

    return () => {
      mounted = false;
      clearTimeout(purchaseTimeoutRef.current);
      if (connectedRef.current && IAPRef.current) {
        IAPRef.current.disconnectAsync().catch(() => {});
        connectedRef.current = false;
      }
    };
  }, []);

  const getDisplayPrice = (productId) => {
    const store = storeProducts[productId];
    if (store?.price) return store.price;
    return MOCK_PRODUCTS[productId].price;
  };

  // ── Review mode: bypass purchase entirely ─────────────────────────────────
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

    if (isTestAccount || Platform.OS === 'web') {
      const planKey = PLAN_META[selectedId]?.key ?? 'monthly';
      dispatch({
        type: 'SET_SUBSCRIPTION',
        payload: { status: 'active', plan: planKey, subscriptionId: 'mock', customerId: null, trialEnd: null },
      });
      return;
    }

    const IAP = IAPRef.current;
    if (!IAP) {
      setError('Still connecting to App Store. Please wait a moment.');
      return;
    }

    // If the connection was lost (e.g. app backgrounded), attempt to reconnect
    // before blocking the purchase — previously we hard-returned here which
    // meant Apple's reviewers never saw the IAP sheet.
    if (!connectedRef.current) {
      console.log('[IAP] Not connected — attempting reconnect before purchase');
      try {
        await IAP.connectAsync();
        connectedRef.current = true;
        console.log('[IAP] Reconnected successfully');
      } catch (reconnectErr) {
        if (reconnectErr?.message?.includes('Already connected')) {
          connectedRef.current = true;
        } else {
          console.warn('[IAP] Reconnect failed:', reconnectErr?.message ?? reconnectErr);
          setError('App Store connection lost. Please close and reopen the app.');
          return;
        }
      }
    }

    if (!storeProducts[selectedId]) {
      console.warn('[IAP] Product not in storeProducts cache:', selectedId);
      setError('Could not load this product from the App Store. Please close and reopen the app.');
      return;
    }

    console.log('[IAP] Purchasing:', selectedId, storeProducts[selectedId]?.price);
    setLoading(true);

    // Safety net: if the purchase sheet never appears or the listener never fires,
    // reset after 45 seconds so the user isn't stuck on a spinning button forever.
    purchaseTimeoutRef.current = setTimeout(() => {
      setLoading(false);
      setError('The App Store is taking too long to respond. Please try again.');
    }, 45000);

    try {
      console.log('[IAP] Calling purchaseItemAsync:', selectedId);
      await IAP.purchaseItemAsync(selectedId);
      console.log('[IAP] purchaseItemAsync resolved — waiting for purchase listener');
    } catch (e) {
      clearTimeout(purchaseTimeoutRef.current);
      console.warn('[IAP] purchaseItemAsync error:', e?.message ?? e);
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
              subscriptionId:     sub.orderId ?? sub.transactionId ?? null,
              transactionReceipt: sub.transactionReceipt   ?? null,
              customerId:         null,
              trialEnd:           null,
            },
          });
        } else {
          setError('No Shred AI subscription found on this Apple ID.');
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
          <Text style={s.title}>Try Shred AI Free</Text>
          <Text style={s.subtitle}>Full access, no restrictions</Text>

          {/* ── Trial badge ── */}
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

              return (
                <TouchableOpacity
                  key={productId}
                  style={[s.planCard, sel ? s.planSelected : s.planUnselected]}
                  onPress={() => { setSelectedId(productId); setError(''); }}
                  activeOpacity={0.82}
                >
                  {mock.badge
                    ? <View style={s.planBadgeWrap}>
                        <Text style={s.planBadgeText}>{mock.badge}</Text>
                      </View>
                    : <View style={s.planBadgeSpacer} />
                  }
                  <Text style={s.planPriceFull}>{mock.priceFull}</Text>
                  <Text style={s.planPrice}>{getDisplayPrice(productId)}</Text>
                  <Text style={s.planPeriod}>{mock.period}</Text>
                  <Text style={s.planLabel}>{meta.label}</Text>
                  {sel && (
                    <View style={s.planCheck}>
                      <Ionicons name="checkmark" size={13} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

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

          {error ? <Text style={s.error}>{error}</Text> : null}

          {/* ── CTA ── */}
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

          {/* ── Test mode unlock button (DEV or review account only) ── */}
          {(isDevEnabled(user) || isReviewAccount(user)) && (
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

          {/* ── Legal ── */}
          <Text style={s.legal}>
            After your free trial, you'll be automatically charged{' '}
            <Text style={{ color: c.white, fontWeight: '600' }}>
              {getDisplayPrice(selectedId)}/{MOCK_PRODUCTS[selectedId].period.replace('per ', '')}
            </Text>
            {' '}through your Apple ID. Cancel any time before the trial ends.
          </Text>
          <Text style={s.legal}>
            {'By continuing you agree to our '}
            <Text style={s.legalAccent} onPress={() => setShowTerms(true)}>Terms of Service</Text>
            {' and '}
            <Text style={s.legalAccent} onPress={() => setShowPrivacy(true)}>Privacy Policy</Text>
            {'. Subscriptions auto-renew unless canceled 24 hours before the renewal date.'}
          </Text>

          <TermsOfServiceScreen visible={showTerms}   onClose={() => setShowTerms(false)}   />
          <PrivacyPolicyScreen  visible={showPrivacy} onClose={() => setShowPrivacy(false)} />

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
