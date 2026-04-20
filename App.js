import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, Animated,
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

import { MealContextProvider }               from './src/context/MealContext';
import { AppProvider, useApp, useTheme }     from './src/context/AppContext';
import { AuthProvider, useAuth }             from './src/context/AuthContext';
import { MealOverlayContext }                from './src/context/OverlayContext';
import { TtsProvider, useTts }               from './src/context/TtsContext';
import { useVoiceInput }                     from './src/hooks/useVoiceInput';
import { useNotifications }                  from './src/notifications/NotificationManager';

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

// ─── Floating tab bar with built-in voice mic ─────────────────────────────────
function FloatingTabBar({ state, navigation }) {
  const c                     = useTheme();
  const insets                = useSafeAreaInsets();
  const { isSpeaking, stop }  = useTts();

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

  // ── Voice result → navigate to Helper and auto-send ───────────────────────
  const handleVoiceResult = (text) => {
    if (!text?.trim()) return;
    // Route through HelperScreen: it handles TTS, chat display, meal logging,
    // and triggers the overlay via MealOverlayContext.
    navigation.navigate('Helper', { preset: text.trim(), presetKey: Date.now() });
  };

  const { isListening, isSupported, startListening, stopListening } =
    useVoiceInput({ onResult: handleVoiceResult });

  useEffect(() => {
    if (isListening) startRings();
    else             stopRings();
  }, [isListening]);

  const handleMicPress = () => {
    if (!isSupported) return;
    if (isListening) stopListening();
    else             startListening();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const currentRoute = state.routes[state.index].name;
  const goTo = (name) => navigation.navigate(name);

  const micColor = isListening ? c.red : c.accent;

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
            <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={26} color="#FFF" />
          </TouchableOpacity>

          {/* "Listening" label below FAB */}
          {isListening && (
            <Text style={[s.listenLabel, { color: c.red }]}>Listening…</Text>
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
  const c = useTheme();
  const [overlayMeal, setOverlayMeal] = useState(null);
  const showOverlay = useCallback((meal) => setOverlayMeal(meal), []);

  return (
    <TtsProvider>
    <MealOverlayContext.Provider value={showOverlay}>
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

  if (!user)                 return <AuthScreens />;
  if (!state.isOnboarded)    return <OnboardingScreen />;
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
