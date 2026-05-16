import { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVoiceChat } from '../context/VoiceChatContext';
import { useTheme } from '../context/AppContext';

const AUTO_DISMISS_MS = 6000;

export default function VoiceResponseOverlay() {
  const { voiceResponse, clearVoiceResponse } = useVoiceChat();
  const c      = useTheme();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const timer   = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (voiceResponse) {
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: true })
          .start(() => clearVoiceResponse());
      }, AUTO_DISMISS_MS);
    } else {
      opacity.setValue(0);
    }
    return () => clearTimeout(timer.current);
  }, [voiceResponse]);

  if (!voiceResponse) return null;

  // Sit just above the floating pill tab bar (~80px tall + safe area)
  const bottomOffset = 88 + (insets.bottom > 0 ? insets.bottom : 10);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[s.container, { bottom: bottomOffset, opacity }]}
    >
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={s.row}>
          <View style={[s.avatar, { backgroundColor: c.accentDim }]}>
            <Ionicons name="sparkles" size={12} color={c.accent} />
          </View>
          <Text style={[s.label, { color: c.muted }]}>AI Helper</Text>
          <TouchableOpacity
            onPress={clearVoiceResponse}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={16} color={c.muted} />
          </TouchableOpacity>
        </View>
        <Text style={[s.text, { color: c.white }]} numberOfLines={4}>
          {voiceResponse}
        </Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    position:  'absolute',
    left:      16,
    right:     16,
    zIndex:    9998,
    elevation: 9998,
  },
  card: {
    borderRadius: 18,
    borderWidth:  1,
    padding:      14,
    gap:          8,
    shadowColor:  '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation:    12,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           7,
  },
  avatar: {
    width: 22, height: 22, borderRadius: 11,
    alignItems:    'center',
    justifyContent: 'center',
  },
  label: {
    flex:       1,
    fontSize:   12,
    fontWeight: '600',
  },
  text: {
    fontSize:   14,
    lineHeight: 21,
  },
});
