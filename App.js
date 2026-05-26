import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, Animated, useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import HomeScreen      from './src/screens/HomeScreen';
import HelperScreen    from './src/screens/HelperScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import SettingsScreen      from './src/screens/SettingsScreen';
import PantryScreen        from './src/screens/PantryScreen';
import AccountScreen       from './src/screens/AccountScreen';
import PersonalInfoScreen  from './src/screens/PersonalInfoScreen';
import SettingsPrefsScreen from './src/screens/SettingsPrefsScreen';
import SupportScreen            from './src/screens/SupportScreen';
import NutritionSourcesScreen   from './src/screens/NutritionSourcesScreen';
import AIDataUsageScreen        from './src/screens/AIDataUsageScreen';
import LoginScreen        from './src/screens/LoginScreen';
import SignUpScreen       from './src/screens/SignUpScreen';
import OnboardingScreen  from './src/screens/OnboardingScreen';
import WelcomeScreen     from './src/screens/WelcomeScreen';
import MealLogOverlay  from './src/components/MealLogOverlay';

import { MealContextProvider }               from './src/context/MealContext';
import { AppProvider, useApp, useTheme, useIsPremium } from './src/context/AppContext';
import { PremiumProvider, usePremium }         from './src/context/PremiumContext';
import PremiumModal                             from './src/components/PremiumModal';
import { AuthProvider, useAuth }             from './src/context/AuthContext';
import { MealOverlayContext }                from './src/context/OverlayContext';
import { TtsProvider }                        from './src/context/TtsContext';
import { useNotifications }                  from './src/notifications/NotificationManager';
import WeightReviewModal                     from './src/components/WeightReviewModal';
import { TEST_MODE }                         from './src/config/testMode';
import { estimateWeeklyWeightChange, isWeeklyReviewDue } from './src/utils/weightEstimation';
import { getTodayKey }                       from './src/utils/nutrition';
import { initAudioSession }                  from './src/utils/ttsService';
import { registerForPushNotifications }      from './src/utils/pushNotifications';
import { useJobProcessor }                   from './src/hooks/useJobProcessor';
import { useVoiceInput }                     from './src/hooks/useVoiceInput';
import { VoiceChatProvider, useVoiceChat }   from './src/context/VoiceChatContext';
import VoiceResponseOverlay                  from './src/components/VoiceResponseOverlay';
import AppLoadingScreen                      from './src/components/AppLoadingScreen';
import AIConsentModal                        from './src/components/AIConsentModal';

// Hold the native splash until our custom screen is ready to take over.
SplashScreen.preventAutoHideAsync().catch(() => {});

const Tab = createBottomTabNavigator();

// ─── Tab layout: 2 left · mic center · 2 right ───────────────────────────────
const LEFT_TABS = [
  { name: 'Home',   icon: 'home-outline',    iconFocused: 'home'   },
  { name: 'Pantry', icon: 'basket-outline',  iconFocused: 'basket', beta: true, iconSize: 26, iconOffset: 8 },
];
const RIGHT_TABS = [
  { name: 'Helper',    icon: 'sparkles-outline',  iconFocused: 'sparkles'  },
  { name: 'Analytics', icon: 'bar-chart-outline',  iconFocused: 'bar-chart' },
];

// ─── Floating tab bar ────────────────────────────────────────────────────────
function FloatingTabBar({ state, navigation }) {
  const c      = useTheme();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const [barH, setBarH] = useState(80);
  const SAFE = insets.bottom > 0 ? insets.bottom : 14;

  // ── SVG notch geometry ──────────────────────────────────────────────────────
  // The bar background is ONE continuous path. The notch is a true circular
  // arc (SVG 'A' command), not a bezier approximation.
  //
  // R   = arc radius = FAB radius (31) + 8 px clearance = 39
  // CX  = screen horizontal centre
  //
  // Arc geometry:
  //   centre of the circular arc sits at (CX, 0) — the bar's top edge.
  //   The arc runs from (CX-R, 0) clockwise through the bottom semicircle
  //   to (CX+R, 0), dipping exactly R px into the bar at its lowest point.
  //   This means the notch radius perfectly matches the FAB radius + padding,
  //   so the bar visually "wraps" the button.
  const CX = W / 2, R = 39;

  // Bar fill — concave circular notch is the literal absence of fill
  const notchFill = [
    `M 0,0`,
    `L ${CX - R},0`,
    `A ${R} ${R} 0 0 0 ${CX + R},0`,   // true circular arc, clockwise, dips R px
    `L ${W},0`,
    `L ${W},${barH}`,
    `L 0,${barH}`,
    `Z`,
  ].join(' ');

  // Top-edge stroke — same arc, just drawn as an open stroke for the border
  const notchEdge = [
    `M 0,0`,
    `L ${CX - R},0`,
    `A ${R} ${R} 0 0 0 ${CX + R},0`,
    `L ${W},0`,
  ].join(' ');

  const { state: appState, dispatch: appDispatch } = useApp();
  const { showPremium } = usePremium();
  const isPremium = useIsPremium();

  // ── AI consent (mic button) ─────────────────────────────────────────────────
  const [showMicConsent, setShowMicConsent] = useState(false);

  // ── Voice input ─────────────────────────────────────────────────────────────
  const { sendVoiceMessage } = useVoiceChat();

  const { isListening, isTranscribing, startListening, stopListening } =
    useVoiceInput({ onResult: sendVoiceMessage });

  const handleMicPress = useCallback(() => {
    if (isListening || isTranscribing) { stopListening(); return; }
    if (!appState.aiConsent) { setShowMicConsent(true); return; }
    // Free tier: 1 voice log per day
    if (!isPremium) {
      const today = getTodayKey();
      const { voiceLogDate, voiceLogCount } = appState.freeTier || {};
      if (voiceLogDate === today && (voiceLogCount ?? 0) >= 1) {
        showPremium();
        return;
      }
    }
    appDispatch({ type: 'LOG_VOICE_USAGE', payload: { date: getTodayKey() } });
    startListening();
  }, [isListening, isTranscribing, startListening, stopListening, appState.aiConsent, appState.freeTier, isPremium, showPremium, appDispatch]);

  const handleMicConsentAccept = useCallback(() => {
    appDispatch({ type: 'SET_AI_CONSENT', payload: true });
    setShowMicConsent(false);
    appDispatch({ type: 'LOG_VOICE_USAGE', payload: { date: getTodayKey() } });
    startListening();
  }, [appDispatch, startListening]);

  const handleMicConsentDecline = useCallback(() => {
    setShowMicConsent(false);
  }, []);

  // ── Pulse animation while listening ────────────────────────────────────────
  const ring1Scale   = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0)).current;
  const ring2Scale   = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0)).current;
  const pulseRef     = useRef(null);

  useEffect(() => {
    if (isListening) {
      pulseRef.current = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(ring1Scale,   { toValue: 1.65, duration: 900, useNativeDriver: true }),
            Animated.timing(ring1Scale,   { toValue: 1,    duration: 900, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(ring1Opacity, { toValue: 0.55, duration: 900, useNativeDriver: true }),
            Animated.timing(ring1Opacity, { toValue: 0,    duration: 900, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(450),
            Animated.timing(ring2Scale,   { toValue: 1.65, duration: 900, useNativeDriver: true }),
            Animated.timing(ring2Scale,   { toValue: 1,    duration: 900, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(450),
            Animated.timing(ring2Opacity, { toValue: 0.35, duration: 900, useNativeDriver: true }),
            Animated.timing(ring2Opacity, { toValue: 0,    duration: 900, useNativeDriver: true }),
          ]),
        ])
      );
      pulseRef.current.start();
    } else {
      pulseRef.current?.stop();
      ring1Scale.setValue(1); ring1Opacity.setValue(0);
      ring2Scale.setValue(1); ring2Opacity.setValue(0);
    }
  }, [isListening]);

  const currentRoute = state.routes[state.index].name;
  const goTo = (name) => navigation.navigate(name);
  const micColor = isListening ? '#E84B4B' : c.accent;

  const TabBtn = ({ tab }) => {
    const focused = currentRoute === tab.name;
    const isLocked = tab.name === 'Helper' && !isPremium;
    const color   = focused ? c.accent : c.tabInactive;
    const handleTabPress = () => {
      if (isLocked) { showPremium(); return; }
      goTo(tab.name);
    };
    return (
      <TouchableOpacity onPress={handleTabPress} activeOpacity={0.7} style={s.tabBtn}>
        <View style={{ position: 'relative' }}>
          <Ionicons name={focused ? tab.iconFocused : tab.icon} size={tab.iconSize ?? 22} color={color} style={tab.iconOffset ? { transform: [{ translateY: tab.iconOffset }] } : undefined} />
          {tab.beta && (
            <View style={[s.betaBadge, { backgroundColor: c.accent }]}>
              <Text style={s.betaBadgeText}>beta</Text>
            </View>
          )}
          {isLocked && (
            <View style={[s.betaBadge, { backgroundColor: c.muted, right: -10 }]}>
              <Ionicons name="lock-closed" size={7} color="#FFF" />
            </View>
          )}
        </View>
        <Text style={[s.tabLabel, { color }]}>{tab.name}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[s.barOuter, { zIndex: 9999, elevation: 9999 }]}>

      {/* 1 ── SVG bar background with carved notch (renders first = behind tabs) */}
      <Svg
        width={W}
        height={barH}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        {/* Bar fill with notch cutout */}
        <Path d={notchFill} fill={c.tabBar} />
        {/* Thin hairline border along the top edge, following the notch curve */}
        <Path d={notchEdge} fill="none" stroke={c.tabBorder} strokeWidth={1} />
      </Svg>

      {/* Bar top-edge shadow — two strips, left and right of the notch.
           Splitting avoids painting a visible background line across the
           transparent notch opening. */}
      <View style={{ position:'absolute', top:0, left:0, width: CX - R, height:2, backgroundColor:c.tabBar, shadowColor:'#000', shadowOffset:{width:0,height:-6}, shadowOpacity:0.18, shadowRadius:10 }} />
      <View style={{ position:'absolute', top:0, left: CX + R, right:0, height:2, backgroundColor:c.tabBar, shadowColor:'#000', shadowOffset:{width:0,height:-6}, shadowOpacity:0.18, shadowRadius:10 }} />

      {/* 2 ── Tab items — normal flow child that drives barOuter height */}
      <View
        style={[s.tabsRow, { paddingBottom: SAFE }]}
        onLayout={(e) => setBarH(e.nativeEvent.layout.height)}
      >
        {LEFT_TABS.map((tab) => <TabBtn key={tab.name} tab={tab} />)}
        <View style={s.fabSpacer} />
        {RIGHT_TABS.map((tab) => <TabBtn key={tab.name} tab={tab} />)}
      </View>

      {/* 3 ── Floating mic FAB — no backing view, notch is purely the SVG path */}
      <View style={s.fabWrapper} pointerEvents="box-none">
        <Animated.View style={[s.fabRing, { borderColor: micColor, transform: [{ scale: ring1Scale }], opacity: ring1Opacity }]} />
        <Animated.View style={[s.fabRing, { borderColor: micColor, transform: [{ scale: ring2Scale }], opacity: ring2Opacity }]} />
        <TouchableOpacity
          style={[s.fab, { backgroundColor: micColor }]}
          onPress={handleMicPress}
          activeOpacity={0.85}
        >
          <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={[s.tabLabel, { color: c.tabInactive, marginTop: 18, fontSize: 12 }]}>Speak</Text>
      </View>

      <AIConsentModal
        visible={showMicConsent}
        onAccept={handleMicConsentAccept}
        onDecline={handleMicConsentDecline}
      />
    </View>
  );
}

const s = StyleSheet.create({
  barOuter: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    overflow: 'visible',
  },

  tabsRow: {
    flexDirection: 'row',
    alignItems:    'center',
    paddingTop:    10,
  },

  tabBtn: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    paddingVertical: 5,
    gap:             3,
  },
  tabLabel: { fontSize: 10, fontWeight: '700' },

  betaBadge: {
    position: 'absolute', top: -4, right: -8,
    borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1,
  },
  betaBadgeText: { fontSize: 8, fontWeight: '700', color: '#FFF', lineHeight: 10 },

  // Space in the flex row reserved for the FAB
  fabSpacer: { width: 80 },

  // FAB center sits exactly on the bar's top edge: 50% above, 50% below.
  // top = -(FAB radius) = -31
  fabWrapper: {
    position:   'absolute',
    top:        -31,
    left:       0,
    right:      0,
    alignItems: 'center',
    zIndex:     10,
    overflow:   'visible',
  },

  fabRing: {
    position: 'absolute',
    width: 62, height: 62, borderRadius: 31,
    borderWidth: 2,
  },

  fab: {
    width: 62, height: 62, borderRadius: 31,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    3,
    borderColor:    '#FFFFFF',
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 0 },
    shadowOpacity:  0.20,
    shadowRadius:   12,
    elevation:      12,
  },
});

// ─── Notification setup — inside AppProvider so useApp() works ───────────────
function NotificationSetup() {
  const { state } = useApp();
  useNotifications(state);
  return null;
}

// ─── Audio session setup — initializes iOS playback session at app start ──────
function AudioSetup() {
  useEffect(() => { initAudioSession(); }, []);
  return null;
}

// ─── Push notification setup — registers for push on first launch ─────────────
function PushSetup() {
  useEffect(() => { registerForPushNotifications(); }, []);
  return null;
}

// ─── Background job processor — retries failed meal-log jobs on foreground ────
function JobProcessor() {
  useJobProcessor();
  return null;
}

// ─── Main tab navigator ───────────────────────────────────────────────────────
function AppNavigator() {
  const c                   = useTheme();
  const { state, dispatch } = useApp();
  const [overlayMeal,      setOverlayMeal]      = useState(null);
  const [weeklyReviewData, setWeeklyReviewData] = useState(null);
  const showOverlay = useCallback((meal) => setOverlayMeal(meal), []);

  // ── Weekly weight review check ──────────────────────────────────────────────
  // Runs whenever daily logs or lastReviewedDate change. Opens the modal at most
  // once per week and only when there are ≥ 3 days of tracked data.
  useEffect(() => {
    if (weeklyReviewData) return; // modal already open — don't re-trigger
    const lastDate = state.weeklyReview?.lastReviewedDate ?? null;
    if (!isWeeklyReviewDue(lastDate)) return;
    const data = estimateWeeklyWeightChange(state.dailyLogs, state.userProfile);
    if (data) setWeeklyReviewData(data);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.dailyLogs, state.weeklyReview?.lastReviewedDate]);

  const handleWeightSave = useCallback((weight) => {
    dispatch({ type: 'SAVE_WEIGHT_UPDATE', payload: { weight, date: getTodayKey() } });
    setWeeklyReviewData(null);
  }, [dispatch]);

  const handleWeightDismiss = useCallback(() => {
    dispatch({ type: 'DISMISS_WEEKLY_REVIEW', payload: getTodayKey() });
    setWeeklyReviewData(null);
  }, [dispatch]);

  return (
    <TtsProvider>
    <MealOverlayContext.Provider value={showOverlay}>
    <VoiceChatProvider>
      <View style={{ flex: 1 }} pointerEvents="box-none">
        <NotificationSetup />
        <AudioSetup />
        <PushSetup />
        <JobProcessor />
        <StatusBar style={c.statusBar} backgroundColor={c.bg} />
        <NavigationContainer theme={{ dark: false, colors: { primary: c.accent, background: c.bg, card: c.card, text: c.white, border: c.border, notification: c.accent } }}>
          <Tab.Navigator
            tabBar={(props) => <FloatingTabBar {...props} />}
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}
          >
            <Tab.Screen name="Home"            component={HomeScreen}        />
            <Tab.Screen name="Analytics"      component={AnalyticsScreen}   />
            <Tab.Screen name="Helper"         component={HelperScreen}      />
            <Tab.Screen name="Pantry"         component={PantryScreen}      />
            {/* Hidden screens — accessible via profile dropdown */}
            <Tab.Screen name="Settings"          component={SettingsScreen}       options={{ tabBarButton: () => null }} />
            <Tab.Screen name="AccountScreen"     component={AccountScreen}        options={{ tabBarButton: () => null }} />
            <Tab.Screen name="PersonalInfoScreen"  component={PersonalInfoScreen} options={{ tabBarButton: () => null }} />
            <Tab.Screen name="SettingsPrefsScreen" component={SettingsPrefsScreen} options={{ tabBarButton: () => null }} />
            <Tab.Screen name="SupportScreen"          component={SupportScreen}          options={{ tabBarButton: () => null }} />
            <Tab.Screen name="NutritionSourcesScreen" component={NutritionSourcesScreen} options={{ tabBarButton: () => null }} />
            <Tab.Screen name="AIDataUsageScreen"      component={AIDataUsageScreen}      options={{ tabBarButton: () => null }} />
          </Tab.Navigator>
        </NavigationContainer>

        {/* Meal log overlay — renders above everything including the tab bar */}
        <MealLogOverlay
          visible={!!overlayMeal}
          meal={overlayMeal}
          onClose={() => setOverlayMeal(null)}
        />

        {/* Voice AI response — floats above current screen, auto-dismisses */}
        <VoiceResponseOverlay />

        {/* Weekly weight check-in — renders above everything */}
        <WeightReviewModal
          visible={!!weeklyReviewData}
          reviewData={weeklyReviewData}
          onSave={handleWeightSave}
          onDismiss={handleWeightDismiss}
        />
      </View>
    </VoiceChatProvider>
    </MealOverlayContext.Provider>
    </TtsProvider>
  );
}

// ─── Auth screens ─────────────────────────────────────────────────────────────
function AuthScreens() {
  const c = useTheme();
  const [screen, setScreen] = useState('welcome');
  return (
    <>
      <StatusBar style={c.statusBar} backgroundColor={c.bg} />
      {screen === 'welcome' && (
        <WelcomeScreen
          onStart={() => setScreen('onboarding')}
          onLogin={() => setScreen('login')}
        />
      )}
      {screen === 'onboarding' && (
        <OnboardingScreen
          onGoBack={() => setScreen('welcome')}
          onComplete={() => setScreen('signup')}
        />
      )}
      {screen === 'login' && (
        <LoginScreen
          onGoToSignUp={() => setScreen('signup')}
          onGoToWelcome={() => setScreen('welcome')}
        />
      )}
      {screen === 'signup' && (
        <SignUpScreen
          onGoToLogin={() => setScreen('login')}
          onGoToWelcome={() => setScreen('welcome')}
        />
      )}
    </>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
function RootNavigator() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { state, dispatch, stateLoaded } = useApp();
  const { showPremium } = usePremium();

  // TEST_MODE: track onboarding completion in session memory for the test account.
  const [testOnboarded, setTestOnboarded] = useState(false);
  const lastUidRef = useRef(null);

  // Custom splash state — starts visible and fades out once both the app is ready
  // and the loading animation has completed.
  const [splashVisible, setSplashVisible] = useState(true);
  const [animationDone, setAnimationDone] = useState(false);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const splashDoneRef = useRef(false);

  // Native splash is hidden by AppLoadingScreen via onLayout — do not hide here.

  useEffect(() => {
    const uid = user?.uid ?? null;
    if (uid === lastUidRef.current) return;
    lastUidRef.current = uid;

    // Reset the onboarding tracker so a newly created account always
    // gets the post-onboarding modal, even if a previous account was onboarded.
    initialOnboardedRef.current = null;

    if (TEST_MODE && user?.isTestAccount) {
      setTestOnboarded(false);
      dispatch({
        type: 'SET_SUBSCRIPTION',
        payload: { status: 'none', plan: null, subscriptionId: null, customerId: null, trialEnd: null },
      });
    }
  }, [user?.uid, dispatch]);

  // Show PremiumModal once after onboarding completes (not on returning user load)
  const initialOnboardedRef = useRef(null);
  useEffect(() => {
    if (!stateLoaded) return;
    const isTestUser = TEST_MODE && user?.isTestAccount;
    const nowOnboarded = isTestUser ? testOnboarded : state.isOnboarded;

    if (initialOnboardedRef.current === null) {
      // First time state is ready for this user — record without triggering
      initialOnboardedRef.current = nowOnboarded;
      return;
    }
    // Transition false → true means user just finished onboarding this session
    if (nowOnboarded && !initialOnboardedRef.current) {
      initialOnboardedRef.current = true;
      const hasSub = ['trial', 'active'].includes(state.subscription?.status);
      if (!hasSub) {
        const t = setTimeout(showPremium, 600);
        return () => clearTimeout(t);
      }
    }
  }, [stateLoaded, state.isOnboarded, testOnboarded]);

  // Fade out once Firebase auth, AsyncStorage, and the scale animation are all done.
  const appReady  = !authLoading && stateLoaded;
  const bothReady = appReady && animationDone;
  useEffect(() => {
    if (!bothReady || splashDoneRef.current) return;
    splashDoneRef.current = true;
    Animated.timing(splashOpacity, {
      toValue:         0,
      duration:        300,
      useNativeDriver: true,
    }).start(() => setSplashVisible(false));
  }, [bothReady]);

  function renderContent() {
    if (!user) return <AuthScreens />;

    const isTestUser = TEST_MODE && user.isTestAccount;
    const effectiveOnboarded = isTestUser ? testOnboarded : state.isOnboarded;

    if (!effectiveOnboarded) {
      return (
        <OnboardingScreen
          onComplete={isTestUser ? () => setTestOnboarded(true) : undefined}
          onGoBack={signOut}
        />
      );
    }

    return <AppNavigator />;
  }

  return (
    <View style={{ flex: 1 }}>
      {appReady && renderContent()}

      {/* Branded loading overlay — sits on top and fades out when the app is ready */}
      {splashVisible && (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { opacity: splashOpacity }]}
        >
          <AppLoadingScreen onAnimationComplete={() => setAnimationDone(true)} />
        </Animated.View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppProvider>
          <MealContextProvider>
            <PremiumProvider>
              <RootNavigator />
              <PremiumModal />
            </PremiumProvider>
          </MealContextProvider>
        </AppProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
