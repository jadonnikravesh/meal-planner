import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/AppContext';

const DATA_POINTS = [
  { icon: 'camera-outline',     text: 'Food photos you share' },
  { icon: 'chatbubble-outline', text: 'Meal descriptions and chat messages' },
  { icon: 'bar-chart-outline',  text: 'Nutrition logs and daily totals' },
  { icon: 'person-outline',     text: 'Profile info (age, weight, and goals)' },
];

export default function AIConsentModal({ visible, onAccept, onDecline }) {
  const c = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDecline}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
        <View style={{ backgroundColor: c.card, borderRadius: 24, borderWidth: 1, borderColor: c.border, padding: 24, width: '100%', maxWidth: 400 }}>

          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: c.accentDim, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 16 }}>
            <Ionicons name="shield-checkmark-outline" size={26} color={c.accent} />
          </View>

          <Text style={{ fontSize: 18, fontWeight: '800', color: c.white, textAlign: 'center', marginBottom: 10 }}>
            AI Data Usage
          </Text>

          <Text style={{ fontSize: 14, color: c.muted, textAlign: 'center', lineHeight: 21, marginBottom: 18 }}>
            We may send your food images, meal data, nutrition logs, and profile information (such as age and weight) to third-party AI services (including Anthropic) to generate personalized meal insights and recommendations.
          </Text>

          <View style={{ backgroundColor: c.card2, borderRadius: 14, padding: 14, marginBottom: 16, gap: 10 }}>
            {DATA_POINTS.map(({ icon, text }) => (
              <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name={icon} size={15} color={c.accent} />
                <Text style={{ fontSize: 13, color: c.white, flex: 1, lineHeight: 19 }}>{text}</Text>
              </View>
            ))}
          </View>

          <Text style={{ fontSize: 12, color: c.muted, textAlign: 'center', lineHeight: 18, marginBottom: 22 }}>
            Data is processed via our secure backend and sent to Anthropic. You can review or revoke this at any time in{' '}
            <Text style={{ color: c.accent }}>Settings → Privacy → AI Data Usage</Text>.
          </Text>

          <TouchableOpacity
            style={{ backgroundColor: c.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10, shadowColor: c.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 }}
            onPress={onAccept}
            activeOpacity={0.85}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>Continue</Text>
          </TouchableOpacity>

          <TouchableOpacity style={{ paddingVertical: 11, alignItems: 'center' }} onPress={onDecline} activeOpacity={0.7}>
            <Text style={{ fontSize: 14, color: c.muted }}>Not now</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}
