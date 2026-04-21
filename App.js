import { useState, useRef, useEffect, useCallback, useContext, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, Animated, Dimensions,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import HomeScreen      from './src/screens/HomeScreen';
import HelperScreen    from './src/screens/HelperScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import SettingsScreen  from './src/screens/SettingsScreen';
import LoginScreen        from './src/screens/LoginScreen';
import SignUpScreen       from './src/screens/SignUpScreen';
import OnboardingScreen  from './src/screens/OnboardingScreen';
import MealLogOverlay  from './src/components/MealLogOverlay';

import { MealContextProvider, useMealContext } from './src/context/MealContext';
import { AppProvider, useApp, useTheme }     from './src/context/AppContext';
import { AuthProvider, useAuth }             from './src/context/AuthContext';
import { MealOverlayContext }                from './src/context/OverlayContext';
import { TtsProvider, useTts }               from './src/context/TtsContext';
import { useVoiceInput }                     from './src/hooks/useVoiceInput';
import { useNotifications }                  from './src/notifications/NotificationManager';
import WeightReviewModal                     from './src/components/WeightReviewModal';
import PaywallScreen                         from './src/screens/PaywallScreen';
import { REVIEW_MODE }                       from './src/config/reviewMode';
import { estimateWeeklyWeightChange, isWeeklyReviewDue } from './src/utils/weightEstimation';
import { getTodayKey }                       from './src/utils/nutrition';
import { getOrFetchFoodImage, getFoodColor } from './src/utils/imageService';
import { speakWithElevenLabs }               from './src/utils/ttsService';
import { computeFoodPreferences }            from './src/utils/foodPreferences';

const Tab = createBottomTabNavigator();

// ─── Tab layout: 2 left, mic center, 2 right ─────────────────────────────────
const LEFT_TABS = [
  { name: 'Home',      icon: 'home-outline',     iconFocused: 'home'      },
  { name: 'Analytics', icon: 'bar-chart-outline', iconFocused: 'bar-chart' },
];
const RIGHT_TABS = [
  { name: 'Helper',   icon: 'sparkles-outline', iconFocused: 'sparkles' },
  { name: 'Settings', icon: 'settings-outline',  iconFocused: 'settings' },
];

const BACKEND_URL = 'http://localhost:3001';

// ─── Floating tab bar with built-in voice mic ─────────────────────────────────
function FloatingTabBar({ state, navigation }) {
  const c                                      = useTheme();
  const insets                                 = useSafeAreaInsets();
  const { isSpeaking, stop, markSpeaking, markStopped } = useTts();
  const { state: appState, dispatch }          = useApp();
  const { addMeal }                            = useMealContext();
  const showOverlay                            = useContext(MealOverlayContext);

  const [processing, setProcessing] = useState(false);

  // Recency-weighted preference list — recomputes only when logs change
  const foodPreferences = useMemo(
    () => computeFoodPreferences(appState.dailyLogs),
    [appState.dailyLogs],
  );

  // Pulsating rings for the mic FAB
  const ring1    = useRef(new Animated.Value(1)).current;
  const ring1Opa = useRef(new Animated.Value(0)).current;
  const ring2    = useRef(new Animated.Value(1)).current;
  const ring2Opa = useRef(new Animated.Value(0)).current;
  const loopRef1 = useRef(null);
  const loopRef2 = useRef(null);

  const startRings = () => {
    loopRef1.current = Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.timing(ring1,    { toValue: 2.4, duration: 850, useNativeDriver: true }),
        Animated.timing(ring1,    { toValue: 1,   duration: 850, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(ring1Opa, { toValue: 0.65, duration: 850, useNativeDriver: true }),
        Animated.timing(ring1Opa, { toValue: 0,    duration: 850, useNativeDriver: true }),
      ]),
    ]));
    loopRef2.current = Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.delay(420),
        Animated.timing(ring2,    { toValue: 2.4,  duration: 850, useNativeDriver: true }),
        Animated.timing(ring2,    { toValue: 1,    duration: 850, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(420),
        Animated.timing(ring2Opa, { toValue: 0.38, duration: 850, useNativeDriver: true }),
        Animated.timing(ring2Opa, { toValue: 0,    duration: 850, useNativeDriver: true }),
      ]),
    ]));
    loopRef1.current.start();
    loopRef2.current.start();
  };

  const stopRings = () => {
    loopRef1.current?.stop();
    loopRef2.current?.stop();
    ring1.setValue(1); ring1Opa.setValue(0);
    ring2.setValue(1); ring2Opa.setValue(0);
  };

  // ── Voice result — process in-place, never navigate ───────────────────────
  const handleVoiceResult = useCallback(async (text) => {
    if (!text?.trim()) return;
    const trimmed = text.trim();

    // Immediately add the user message to shared chat history (HelperScreen syncs this)
    const userMsgId = `msg_${Date.now()}_u`;
    dispatch({ type: 'ADD_CHAT_MESSAGE', payload: { id: userMsgId, role: 'user', text: trimmed } });

    setProcessing(true);
    try {
      const today     = getTodayKey();
      const todayLog  = appState.dailyLogs?.[today] || {};
      const profileForAI = {
        ...appState.userProfile,
        loggedCalories: todayLog.calories || 0,
        loggedProtein:  todayLog.protein  || 0,
        loggedCarbs:    todayLog.carbs    || 0,
        loggedFat:      todayLog.fat      || 0,
      };
      // Use shared chat history for context (last 20 turns)
      const historyForApi = appState.chatMessages.slice(-20).map((m) => ({
        role:    m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

      const res = await fetch(`${BACKEND_URL}/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history: historyForApi, userProfile: profileForAI, foodPreferences }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();

      // Speak the AI response
      if (appState.settings.voiceEnabled !== false && data.reply) {
        speakWithElevenLabs(data.reply, { onStart: markSpeaking, onEnd: markStopped });
      }

      const validMeal = data.mealLogged && data.meal?.logged === true
                     && data.meal?.name && (data.meal?.calories ?? 0) > 0;

      let aiPayload = {
        id:   `msg_${Date.now()}_a`,
        role: 'ai',
        text: data.reply || 'Logged!',
      };

      if (validMeal) {
        const m = data.meal;
        const { uri: finalUri, confidence } = await getOrFetchFoodImage(m.name);
        const imgColor    = getFoodColor(m.imageKey || m.name);
        const foodVerified = confidence === 'verified';

        // Log to MealContext + AppContext (same path as HelperScreen)
        addMeal({
          id:          `meal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name:        m.name,
          time:        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          kcal:        m.calories,
          protein:     m.protein,
          carbs:       m.carbs,
          fat:         m.fat,
          uri:         finalUri,
          fallbackColor: imgColor,
        });

        // Show the overlay on whatever screen is currently visible
        showOverlay({
          name:     m.name,    calories: m.calories,
          protein:  m.protein, carbs:    m.carbs,
          fat:      m.fat,     imageUrl: finalUri,
          reply:    data.reply,
        });

        // Attach mealData so HelperScreen renders the full meal card
        const items = [{ name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, grams: 0 }];
        const total = { calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat };
        aiPayload = {
          ...aiPayload,
          mealData: { items, total, primaryUri: finalUri, fallbackColor: imgColor, imageConfidence: confidence, voteStats: {} },
        };
      }

      dispatch({ type: 'ADD_CHAT_MESSAGE', payload: aiPayload });

    } catch (err) {
      console.error('[tab-mic error]', err.message);
      const isOffline = err.message.includes('Failed to fetch') || err.message.includes('Network');
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id:   `msg_${Date.now()}_err`,
          role: 'ai',
          text: isOffline
            ? '⚠️ Backend not running. Start it with: cd backend && npm start'
            : `⚠️ Error: ${err.message}`,
        },
      });
    } finally {
      setProcessing(false);
    }
  }, [appState, dispatch, addMeal, showOverlay, markSpeaking, markStopped]);

  const { isListening, isSupported, startListening, stopListening } =
    useVoiceInput({ onResult: handleVoiceResult });

  useEffect(() => {
    if (isListening) startRings();
    else             stopRings();
  }, [isListening]);

  const handleMicPress = () => {
    if (!isSupported || processing) return;
    if (isListening) stopListening();
    else             startListening();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const currentRoute = state.routes[state.index].name;
  const goTo = (name) => navigation.navigate(name);

  const micColor = isListening ? c.red : processing ? c.tabInactive : c.accent;

  const TabBtn = ({ tab }) => {
    const focused = currentRoute === tab.name;
    const color   = focused ? c.accent : c.tabInactive;
    return (
      <TouchableOpacity onPress={() => goTo(tab.name)} activeOpacity={0.7} style={s.tabBtn}>
        <Ionicons name={focused ? tab.iconFocused : tab.icon} size={22} color={color} />
        <Text style={[s.tabLabel, { color }]}>{tab.name}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[s.barOuter, { paddingBottom: insets.bottom > 0 ? insets.bottom : 10 }]}>
      <View style={[s.pill, { backgroundColor: c.tabBar, borderColor: c.tabBorder }]}>

        {LEFT_TABS.map((tab)  => <TabBtn key={tab.name} tab={tab} />)}

        {/* ── Center mic FAB ── */}
        <View style={s.fabSlot}>
          {/* Pulsating rings */}
          <Animated.View style={[s.ring, { borderColor: micColor, transform: [{ scale: ring1 }], opacity: ring1Opa }]} />
          <Animated.View style={[s.ring, { borderColor: micColor, transform: [{ scale: ring2 }], opacity: ring2Opa }]} />

          <TouchableOpacity
            style={[s.fab, { backgroundColor: micColor, shadowColor: micColor }]}
            onPress={handleMicPress}
            activeOpacity={0.85}
          >
            {processing
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={26} color="#FFF" />
            }
          </TouchableOpacity>

          {/* Status label below FAB */}
          {isListening && !processing && (
            <Text style={[s.listenLabel, { color: c.red }]}>Listening…</Text>
          )}
          {processing && (
            <Text style={[s.listenLabel, { color: c.accent }]}>Thinking…</Text>
          )}

          {/* Stop TTS button — floats above-right of mic while AI is speaking */}
          {isSpeaking && (
            <TouchableOpacity
              onPress={stop}
              activeOpacity={0.8}
              style={s.stopBtn}
            >
              <Ionicons name="stop-circle" size={13} color="#fff" />
              <Text style={s.stopBtnText}>Stop</Text>
            </TouchableOpacity>
          )}
        </View>

        {RIGHT_TABS.map((tab) => <TabBtn key={tab.name} tab={tab} />)}

      </View>
    </View>
  );
}

const s = StyleSheet.create({
  barOuter: {
    position:         'absolute',
    bottom:           0,
    left:             0,
    right:            0,
    alignItems:       'center',
    paddingHorizontal: 14,
    paddingTop:       10,
  },
  pill: {
    flexDirection:    'row',
    alignItems:       'center',
    width:            '100%',
    borderRadius:     40,
    borderWidth:      1,
    paddingHorizontal: 8,
    paddingVertical:  10,
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: 8 },
    shadowOpacity:    0.20,
    shadowRadius:     22,
    elevation:        18,
  },
  tabBtn: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            3,
    paddingVertical: 2,
  },
  tabLabel: {
    fontSize:   10,
    fontWeight: '600',
  },
  fabSlot: {
    width:          68,
    alignItems:     'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  ring: {
    position:     'absolute',
    width:  56, height: 56, borderRadius: 28,
    borderWidth:  2.5,
  },
  fab: {
    width:  56, height: 56, borderRadius: 28,
    alignItems:     'center',
    justifyContent: 'center',
    shadowOffset:   { width: 0, height: 4 },
    shadowOpacity:  0.5,
    shadowRadius:   12,
    elevation:      12,
  },
  listenLabel: {
    position:   'absolute',
    bottom:     -18,
    fontSize:   9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  stopBtn: {
    position:        'absolute',
    top:             -34,
    flexDirection:   'row',
    alignItems:      'center',
    gap:             4,
    backgroundColor: '#EF4444',
    borderRadius:    14,
    paddingHorizontal: 9,
    paddingVertical:   5,
    shadowColor:     '#EF4444',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.45,
    shadowRadius:    6,
    elevation:       8,
  },
  stopBtnText: {
    color:       '#fff',
    fontSize:    11,
    fontWeight:  '700',
    letterSpacing: 0.3,
  },
});

// ─── Notification setup — inside AppProvider so useApp() works ───────────────
function NotificationSetup() {
  const { state } = useApp();
  useNotifications(state);
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
      {/* Root View gives absoluteFillObject a reliable full-screen anchor */}
      <View style={{ flex: 1 }}>
        <NotificationSetup />
        <StatusBar style={c.statusBar} backgroundColor={c.bg} />
        <NavigationContainer>
          <Tab.Navigator
            tabBar={(props) => <FloatingTabBar {...props} />}
            screenOptions={{ headerShown: false }}
          >
            <Tab.Screen name="Home"      component={HomeScreen} />
            <Tab.Screen name="Helper"    component={HelperScreen} />
            <Tab.Screen name="Analytics" component={AnalyticsScreen} />
            <Tab.Screen name="Settings"  component={SettingsScreen} />
          </Tab.Navigator>
        </NavigationContainer>

        {/* Meal log overlay — renders above everything including the tab bar */}
        <MealLogOverlay
          visible={!!overlayMeal}
          meal={overlayMeal}
          onClose={() => setOverlayMeal(null)}
        />

        {/* Weekly weight check-in — renders above everything */}
        <WeightReviewModal
          visible={!!weeklyReviewData}
          reviewData={weeklyReviewData}
          onSave={handleWeightSave}
          onDismiss={handleWeightDismiss}
        />
      </View>
    </MealOverlayContext.Provider>
    </TtsProvider>
  );
}

// ─── Auth screens ─────────────────────────────────────────────────────────────
function AuthScreens() {
  const c = useTheme();
  const [screen, setScreen] = useState('login');
  return (
    <>
      <StatusBar style={c.statusBar} backgroundColor={c.bg} />
      {screen === 'login'
        ? <LoginScreen  onGoToSignUp={() => setScreen('signup')} />
        : <SignUpScreen onGoToLogin={()  => setScreen('login')}  />
      }
    </>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
function RootNavigator() {
  const { user, loading: authLoading } = useAuth();
  const { state, stateLoaded } = useApp();
  const c = useTheme();

  // Wait for both Firebase auth AND AsyncStorage to resolve before deciding
  if (authLoading || !stateLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={c.accent} />
      </View>
    );
  }

  if (!user)              return <AuthScreens />;
  if (!state.isOnboarded) return <OnboardingScreen />;

  // Gate: require an active or trialing subscription before showing the app
  // REVIEW_MODE forces hasSub = false so the paywall always appears for reviewers
  const hasSub = !REVIEW_MODE && ['trial', 'active', 'lifetime_free'].includes(state.subscription?.status);
  if (!hasSub)            return <PaywallScreen />;

  return <AppNavigator />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppProvider>
          <MealContextProvider>
            <RootNavigator />
          </MealContextProvider>
        </AppProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
