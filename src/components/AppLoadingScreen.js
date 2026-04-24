import { useRef, useEffect } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ICON_COLOR = '#6B7280'; // gray-500 — slightly darker than the in-app #9CA3AF, readable on white
const ICON_SIZE  = 52;

// Separation from natural side-by-side position (px). Icons start this far apart,
// clash to CLASH_X, then retract. Kept small so the motion reads as "subtle".
const START_X = 14;
const CLASH_X = -7; // negative = past center (overlap)

export default function AppLoadingScreen() {
  const forkX  = useRef(new Animated.Value(-START_X)).current; // left icon, starts shifted left
  const knifeX = useRef(new Animated.Value(START_X)).current;  // right icon, starts shifted right

  useEffect(() => {
    const sequence = Animated.sequence([
      // Slide together (clash)
      Animated.parallel([
        Animated.timing(forkX,  { toValue: -CLASH_X, duration: 560, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(knifeX, { toValue:  CLASH_X, duration: 560, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      // Hold at clash
      Animated.delay(260),
      // Slide apart
      Animated.parallel([
        Animated.timing(forkX,  { toValue: -START_X, duration: 480, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(knifeX, { toValue:  START_X, duration: 480, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
      // Pause before next cycle
      Animated.delay(700),
    ]);

    const loop = Animated.loop(sequence);
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {/* Fork — left icon, tilted left */}
        <Animated.View style={{ transform: [{ translateX: forkX }] }}>
          <View style={{ transform: [{ rotate: '-22deg' }] }}>
            <Ionicons name="restaurant-outline" size={ICON_SIZE} color={ICON_COLOR} />
          </View>
        </Animated.View>

        {/* Knife — right icon, mirrored and tilted right */}
        <Animated.View style={{ transform: [{ translateX: knifeX }] }}>
          <View style={{ transform: [{ rotate: '22deg' }, { scaleX: -1 }] }}>
            <Ionicons name="restaurant-outline" size={ICON_SIZE} color={ICON_COLOR} />
          </View>
        </Animated.View>
      </View>
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
  row: {
    flexDirection: 'row',
    alignItems:    'center',
  },
});
