import { useRef, useCallback } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

export default function AppLoadingScreen({ onAnimationComplete }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const didHide = useRef(false);

  const onLayout = useCallback(() => {
    if (didHide.current) return;
    didHide.current = true;

    SplashScreen.hideAsync().catch(() => {});

    Animated.timing(scale, {
      toValue:         1.2,
      duration:        600,
      easing:          Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onAnimationComplete?.();
    });
  }, []);

  return (
    <View style={styles.container} onLayout={onLayout}>
      <Animated.Image
        source={require('../../assets/splash-icon.png')}
        style={[styles.icon, { transform: [{ scale }] }]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: '#FFFFFF',
    alignItems:      'center',
    justifyContent:  'center',
  },
  icon: {
    width:  140,
    height: 140,
  },
});
