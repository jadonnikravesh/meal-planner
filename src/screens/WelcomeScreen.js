import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, StyleSheet,
  Animated, Dimensions, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../context/AppContext';

const { width: W } = Dimensions.get('window');

// Image is 20% larger than before (W*0.80 → W*0.96) and shifted right so
// 1/4 of it bleeds off screen.
const IMG_SIZE   = W * 0.96;
const IMG_OFFSET = IMG_SIZE * 0.50;   // push right so half the image is off screen

export default function WelcomeScreen({ onStart, onLogin }) {
  const c      = useTheme();
  const insets = useSafeAreaInsets();

  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue:         1,
        duration:        20000,
        useNativeDriver: false,
      })
    ).start();
  }, []);

  const spin = spinAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      <StatusBar style="dark" />

      {/* ── Logo top-right ── */}
      <Image
        source={require('../../assets/logotrans.png')}
        style={[s.logo, { top: insets.top - 20 }]}
        resizeMode="contain"
      />

      {/* ── Spinning food — overflow hidden on root keeps it clipped ── */}
      <View style={s.imageArea}>
        <Animated.Image
          source={require('../../assets/greeksalad.png')}
          style={[s.bowlImage, { marginLeft: IMG_OFFSET, transform: [{ rotate: spin }] }]}
          resizeMode="contain"
        />
      </View>

      {/* ── Bottom content ── */}
      <View style={[s.bottom, { paddingBottom: insets.bottom + 28 }]}>
        <Text style={[s.headline, { color: c.white }]}>
          Train Hard.{'\n'}Eat Smarter.
        </Text>

        <Pressable
          style={[s.ctaBtn, { backgroundColor: c.accent }]}
          onPress={onStart}
        >
          {({ pressed }) => (
            <Text style={[s.ctaBtnText, { opacity: pressed ? 0.5 : 1 }]}>Start now</Text>
          )}
        </Pressable>

        <TouchableOpacity onPress={onLogin} activeOpacity={0.7} style={s.loginBtn}>
          <Text style={[s.loginText, { color: c.muted }]}>
            Already have an account?{'  '}
            <Text style={{ color: c.white, fontWeight: '700' }}>Log In</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex:     1,
    overflow: 'hidden',
  },

  logo: {
    position: 'absolute',
    left:     -90,
    width:    404,
    height:   180,
    zIndex:   10,
  },

  imageArea: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   -50,   // pulls bottom content up ~50px into the image area
  },

  bowlImage: {
    width:  IMG_SIZE,
    height: IMG_SIZE,
  },

  bottom: {
    paddingHorizontal: 28,
    gap:               0,
  },

  headline: {
    fontSize:      42,
    fontWeight:    '900',
    lineHeight:    48,
    letterSpacing: -0.5,
    marginBottom:  48,
  },

  ctaBtn: {
    borderRadius:    50,
    paddingVertical: 18,
    alignItems:      'center',
  },
  ctaBtnText: {
    fontSize:      17,
    fontWeight:    '700',
    color:         '#FFF',
    letterSpacing: 0.2,
  },

  loginBtn: {
    alignItems:    'center',
    paddingBottom: 4,
    marginTop:     16,
  },
  loginText: {
    fontSize: 14,
  },
});
