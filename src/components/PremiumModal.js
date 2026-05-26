import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ActivityIndicator, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { usePremium } from '../context/PremiumContext';
import { isDevEnabled, isReviewAccount } from '../config/testMode';
import TermsOfServiceScreen from '../screens/TermsOfServiceScreen';
import PrivacyPolicyScreen  from '../screens/PrivacyPolicyScreen';

const PRODUCT_IDS = ['com.foodchatai.yearly', 'com.foodchatai.monthly'];

const MOCK_PRODUCTS = {
  'com.foodchatai.monthly': {
    price: '$4.99', period: 'month', label: 'Monthly',
    badge: null,
  },
  'com.foodchatai.yearly': {
    price: '$34.99', period: 'year', label: 'Yearly',
    badge: 'SAVE 42%',
  },
};

const PLAN_META = {
  'com.foodchatai.monthly': { key: 'monthly' },
  'com.foodchatai.yearly':  { key: 'yearly'  },
};

const FEATURES = [
  { icon: 'sparkles',       text: 'AI Coach — personalized nutrition advice' },
  { icon: 'mic-outline',    text: 'Unlimited voice meal logging'              },
  { icon: 'basket-outline', text: 'Pantry — unlimited items + AI scan'        },
  { icon: 'trending-up',    text: 'Full analytics & weekly progress tracking' },
];

const MOCK_MODE = false;
const FORCE_REAL_IAP = process.env.EXPO_PUBLIC_FORCE_IAP === 'true';

const makeStyles = (c) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: c.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
    paddingBottom: 8,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: c.border,
    alignSelf: 'center',
    marginTop: 12, marginBottom: 4,
  },
  closeBtn: {
    position: 'absolute', top: 16, right: 16,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: c.card2,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  scroll: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 32,
  },

  iconWrap: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: c.accentDim,
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center',
    marginTop: 12, marginBottom: 12,
  },
  title:    { fontSize: 22, fontWeight: '800', color: c.white, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: c.muted, textAlign: 'center', marginBottom: 16 },

  trialBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center',
    backgroundColor: c.greenDim,
    borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
    marginBottom: 20,
    borderWidth: 1, borderColor: c.green + '33',
  },
  trialBadgeText: { fontSize: 13, fontWeight: '700', color: c.green },

  featureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10,
  },
  featureCheck: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: c.accentDim,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  featureText: { fontSize: 14, color: c.white, flex: 1 },

  divider: { height: 1, backgroundColor: c.border, marginVertical: 18 },

  storeLoadingWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    alignSelf: 'center', marginBottom: 12,
  },
  storeLoadingText: { fontSize: 12, color: c.muted },

  planRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, borderWidth: 2, borderColor: c.border,
    backgroundColor: c.card,
    paddingHorizontal: 14, paddingVertical: 14,
    marginBottom: 10,
  },
  planRowSel: {
    borderColor: c.accent,
    backgroundColor: c.accentDim,
  },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  radioSel:  { borderColor: c.accent },
  radioDot:  { width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent },
  planLabel: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  planPrice: { fontSize: 12, fontWeight: '500' },

  saveBadge: {
    backgroundColor: c.green,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    flexShrink: 0,
  },
  saveBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFF', letterSpacing: 0.4 },

  error: { fontSize: 13, color: c.red, textAlign: 'center', marginBottom: 10 },

  chargeHint: {
    fontSize: 12, color: c.muted, textAlign: 'center', marginBottom: 12,
  },

  ctaBtn: {
    backgroundColor: c.accent, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
    shadowColor: c.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  ctaBtnDisabled: { opacity: 0.45, shadowOpacity: 0 },
  ctaBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 },

  devBtn: {
    borderWidth: 1.5, borderColor: '#F59E0B', borderStyle: 'dashed',
    borderRadius: 12, paddingVertical: 11,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginBottom: 8,
  },
  devBtnText: { fontSize: 13, fontWeight: '700', color: '#F59E0B' },
  devLabel:   { fontSize: 10, fontWeight: '700', color: '#F59E0B', textTransform: 'uppercase', letterSpacing: 0.7, textAlign: 'center', marginBottom: 8, opacity: 0.7 },

  restoreBtn: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16, marginBottom: 10 },
  restoreBtnText: { fontSize: 13, color: c.muted, textDecorationLine: 'underline' },

  legal:       { fontSize: 11, color: c.muted, textAlign: 'center', lineHeight: 17, marginBottom: 4 },
  legalAccent: { color: c.accent },
});

export default function PremiumModal() {
  const c = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const { dispatch } = useApp();
  const { user }     = useAuth();
  const { premiumVisible, hidePremium } = usePremium();

  const isTestAccount = MOCK_MODE || (!FORCE_REAL_IAP && isDevEnabled(user)) || isReviewAccount(user);

  const [selectedId,   setSelectedId]   = useState('com.foodchatai.yearly');
  const [storeReady,   setStoreReady]   = useState(isTestAccount);
  const [storeProducts, setStoreProducts] = useState({});
  const [loading,      setLoading]      = useState(false);
  const [restoring,    setRestoring]    = useState(false);
  const [error,        setError]        = useState('');
  const [showTerms,    setShowTerms]    = useState(false);
  const [showPrivacy,  setShowPrivacy]  = useState(false);

  const connectedRef       = useRef(false);
  const IAPRef             = useRef(null);
  const purchaseTimeoutRef = useRef(null);

  // Reset state when modal opens
  useEffect(() => {
    if (premiumVisible) {
      setError('');
      setLoading(false);
      setSelectedId('com.foodchatai.yearly');
    }
  }, [premiumVisible]);

  // App Store connection (set up once, reused across opens)
  useEffect(() => {
    if (isTestAccount || Platform.OS === 'web') return;
    let mounted = true;

    const setup = async () => {
      const IAP = await import('expo-in-app-purchases');
      IAPRef.current = IAP;

      IAP.setPurchaseListener(({ responseCode, results }) => {
        clearTimeout(purchaseTimeoutRef.current);
        const RC = IAP.IAPResponseCode;

        if (responseCode === RC.OK && results?.length) {
          results.forEach(async (purchase) => {
            const txId = purchase.orderId ?? purchase.transactionId ?? null;
            try {
              if (!purchase.acknowledged) {
                await IAP.finishTransactionAsync(purchase, false);
              }
            } catch (_) {}
            const planKey = PLAN_META[purchase.productId]?.key ?? 'yearly';
            dispatch({
              type: 'SET_SUBSCRIPTION',
              payload: {
                status: 'active', plan: planKey,
                subscriptionId: txId,
                transactionReceipt: purchase.transactionReceipt ?? null,
                customerId: null, trialEnd: null,
              },
            });
            if (mounted) { setLoading(false); hidePremium(); }
          });

        } else if (responseCode === RC.DEFERRED) {
          if (mounted) {
            setError("Your purchase is awaiting approval. You'll be notified when it's approved.");
            setLoading(false);
          }
        } else if (responseCode === RC.USER_CANCELED) {
          if (mounted) setLoading(false);
        } else {
          if (mounted) { setError('Purchase failed. Please try again.'); setLoading(false); }
        }
      });

      try {
        await IAP.connectAsync();
        connectedRef.current = true;
      } catch (connectErr) {
        if (connectErr?.message?.includes('Already connected')) {
          connectedRef.current = true;
        } else {
          if (mounted) setStoreReady(true);
          return;
        }
      }

      try {
        const { responseCode, results } = await IAP.getProductsAsync(
          ['com.foodchatai.monthly', 'com.foodchatai.yearly']
        );
        if (mounted && responseCode === IAP.IAPResponseCode.OK && results?.length) {
          const map = {};
          results.forEach((p) => { map[p.productId] = p; });
          setStoreProducts(map);
        }
      } catch (_) {}
      finally { if (mounted) setStoreReady(true); }
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

  const handleUnlockForTesting = () => {
    const planKey = PLAN_META[selectedId]?.key ?? 'yearly';
    dispatch({
      type: 'SET_SUBSCRIPTION',
      payload: { status: 'active', plan: planKey, subscriptionId: 'review_mode', customerId: null, trialEnd: null },
    });
    hidePremium();
  };

  const handleSubscribe = async () => {
    setError('');

    if (isTestAccount || Platform.OS === 'web') {
      const planKey = PLAN_META[selectedId]?.key ?? 'yearly';
      dispatch({
        type: 'SET_SUBSCRIPTION',
        payload: { status: 'active', plan: planKey, subscriptionId: 'mock', customerId: null, trialEnd: null },
      });
      hidePremium();
      return;
    }

    const IAP = IAPRef.current;
    if (!IAP) { setError('Still connecting to App Store. Please wait a moment.'); return; }

    if (!connectedRef.current) {
      try {
        await IAP.connectAsync();
        connectedRef.current = true;
      } catch (reconnectErr) {
        if (reconnectErr?.message?.includes('Already connected')) {
          connectedRef.current = true;
        } else {
          setError('App Store connection lost. Please close and reopen the app.');
          return;
        }
      }
    }

    if (!storeProducts[selectedId]) {
      setError('Could not load this product from the App Store. Please close and reopen the app.');
      return;
    }

    setLoading(true);
    purchaseTimeoutRef.current = setTimeout(() => {
      setLoading(false);
      setError('The App Store is taking too long to respond. Please try again.');
    }, 45000);

    try {
      await IAP.purchaseItemAsync(selectedId);
    } catch (e) {
      clearTimeout(purchaseTimeoutRef.current);
      setError('Could not connect to the App Store. Please try again.');
      setLoading(false);
    }
  };

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
        const PIDS = ['com.foodchatai.monthly', 'com.foodchatai.yearly'];
        const sub = results
          .filter((p) => PIDS.includes(p.productId))
          .sort((a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0))[0];
        if (sub) {
          const planKey = PLAN_META[sub.productId]?.key ?? 'yearly';
          dispatch({
            type: 'SET_SUBSCRIPTION',
            payload: {
              status: 'active', plan: planKey,
              subscriptionId: sub.orderId ?? sub.transactionId ?? null,
              transactionReceipt: sub.transactionReceipt ?? null,
              customerId: null, trialEnd: null,
            },
          });
          hidePremium();
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

  return (
    <Modal
      visible={premiumVisible}
      transparent
      animationType="slide"
      onRequestClose={hidePremium}
    >
      <View style={s.overlay}>
        {/* Backdrop tap to dismiss */}
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={hidePremium} />

        <View style={s.sheet}>
          <View style={s.handle} />

          {/* Close button */}
          <TouchableOpacity style={s.closeBtn} onPress={hidePremium} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={16} color={c.muted} />
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={s.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Icon + branding */}
            <View style={s.iconWrap}>
              <Ionicons name="lock-closed" size={24} color={c.accent} />
            </View>
            <Text style={s.title}>Shred AI Premium</Text>
            <Text style={s.subtitle}>Unlock your full fitness potential</Text>

            {/* Trial badge */}
            <View style={s.trialBadge}>
              <Ionicons name="gift-outline" size={14} color={c.green} />
              <Text style={s.trialBadgeText}>FREE TRIAL — no charge today</Text>
            </View>

            {/* Features */}
            {FEATURES.map(({ icon, text }) => (
              <View key={text} style={s.featureRow}>
                <View style={s.featureCheck}>
                  <Ionicons name="checkmark" size={14} color={c.accent} />
                </View>
                <Text style={s.featureText}>{text}</Text>
              </View>
            ))}

            <View style={s.divider} />

            {/* Store loading */}
            {!storeReady && !isTestAccount && (
              <View style={s.storeLoadingWrap}>
                <ActivityIndicator size="small" color={c.muted} />
                <Text style={s.storeLoadingText}>Connecting to App Store…</Text>
              </View>
            )}

            {/* Plan rows */}
            {PRODUCT_IDS.map((productId) => {
              const meta = MOCK_PRODUCTS[productId];
              const sel  = selectedId === productId;
              return (
                <TouchableOpacity
                  key={productId}
                  style={[s.planRow, sel && s.planRowSel]}
                  onPress={() => { setSelectedId(productId); setError(''); }}
                  activeOpacity={0.75}
                >
                  <View style={[s.radio, sel && s.radioSel]}>
                    {sel && <View style={s.radioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.planLabel, { color: sel ? c.accent : c.white }]}>
                      {meta.label}
                    </Text>
                    <Text style={[s.planPrice, { color: sel ? c.accent : c.muted }]}>
                      {getDisplayPrice(productId)} / {meta.period}
                    </Text>
                  </View>
                  {meta.badge && (
                    <View style={s.saveBadge}>
                      <Text style={s.saveBadgeText}>{meta.badge}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}

            {error ? <Text style={s.error}>{error}</Text> : null}

            {/* CTA */}
            <Text style={s.chargeHint}>You won't be charged during your free trial</Text>

            <TouchableOpacity
              style={[s.ctaBtn, (loading || (!storeReady && !isTestAccount)) && s.ctaBtnDisabled]}
              onPress={handleSubscribe}
              activeOpacity={0.85}
              disabled={loading || (!storeReady && !isTestAccount)}
            >
              {loading
                ? <ActivityIndicator color="#FFF" />
                : <Text style={s.ctaBtnText}>Start Free Trial</Text>
              }
            </TouchableOpacity>

            {/* Dev / review unlock */}
            {(isDevEnabled(user) || isReviewAccount(user)) && (
              <>
                <Text style={s.devLabel}>Test Mode — not visible in production</Text>
                <TouchableOpacity style={s.devBtn} onPress={handleUnlockForTesting} activeOpacity={0.8}>
                  <Ionicons name="construct-outline" size={14} color="#F59E0B" />
                  <Text style={s.devBtnText}>Unlock for Testing</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Restore */}
            <TouchableOpacity style={s.restoreBtn} onPress={handleRestore} disabled={restoring} activeOpacity={0.7}>
              {restoring
                ? <ActivityIndicator size="small" color={c.muted} />
                : <Text style={s.restoreBtnText}>Restore Purchases</Text>
              }
            </TouchableOpacity>

            {/* Legal */}
            <Text style={s.legal}>
              After your free trial, you'll be charged{' '}
              {getDisplayPrice(selectedId)}/{MOCK_PRODUCTS[selectedId].period} through your Apple ID. Cancel any time before the trial ends.
            </Text>
            <Text style={s.legal}>
              {'By continuing you agree to our '}
              <Text style={s.legalAccent} onPress={() => setShowTerms(true)}>Terms of Service</Text>
              {' and '}
              <Text style={s.legalAccent} onPress={() => setShowPrivacy(true)}>Privacy Policy</Text>
              {'. Subscriptions auto-renew unless canceled 24 hours before renewal.'}
            </Text>

            <TermsOfServiceScreen visible={showTerms}   onClose={() => setShowTerms(false)}   />
            <PrivacyPolicyScreen  visible={showPrivacy} onClose={() => setShowPrivacy(false)} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
