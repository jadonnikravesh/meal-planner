import React from 'react';
import { View, Text, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp, useTheme } from '../context/AppContext';
import { SectionLabel, Card, SubScreenHeader } from '../components/SettingsShared';

const DATA_SENT = [
  { icon: 'camera-outline',     label: 'Food Photos',         value: 'Images you share for meal analysis' },
  { icon: 'chatbubble-outline', label: 'Text Messages',       value: 'Meal descriptions and questions' },
  { icon: 'bar-chart-outline',  label: 'Nutrition Logs',      value: 'Daily calorie and macro totals' },
  { icon: 'person-outline',     label: 'Profile Information', value: 'Age, weight, height, and goals' },
];

const THIRD_PARTIES = [
  { icon: 'hardware-chip-outline', label: 'Anthropic',   value: 'AI model powering meal analysis and recommendations' },
  { icon: 'image-outline',         label: 'Pexels',      value: 'Food imagery for meal cards (food name only, no personal data)' },
  { icon: 'mic-outline',           label: 'ElevenLabs',  value: 'Text-to-speech for AI voice responses' },
];

export default function AIDataUsageScreen() {
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const c = useTheme();

  const aiConsent = state.aiConsent ?? false;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}>

        <SubScreenHeader title="AI Data Usage" onBack={() => navigation.goBack()} c={c} />

        <View style={{ backgroundColor: c.card, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 14, color: c.muted, lineHeight: 22 }}>
            We may send your food images, meal data, nutrition logs, and profile information (such as age and weight) to third-party AI services (including Anthropic) to generate personalized meal insights and recommendations.
          </Text>
        </View>

        <SectionLabel label="Data Sent to AI" c={c} />
        <Card c={c}>
          {DATA_SENT.map(({ icon, label, value }, idx) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: idx < DATA_SENT.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c.card2, justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name={icon} size={17} color={c.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.white }}>{label}</Text>
                <Text style={{ fontSize: 12, color: c.muted, marginTop: 1 }}>{value}</Text>
              </View>
            </View>
          ))}
        </Card>

        <SectionLabel label="Third Parties" c={c} />
        <Card c={c}>
          {THIRD_PARTIES.map(({ icon, label, value }, idx) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: idx < THIRD_PARTIES.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c.card2, justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name={icon} size={17} color={c.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.white }}>{label}</Text>
                <Text style={{ fontSize: 12, color: c.muted, marginTop: 1 }}>{value}</Text>
              </View>
            </View>
          ))}
        </Card>

        <SectionLabel label="Permission" c={c} />
        <Card c={c}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: aiConsent ? c.greenDim : c.card2, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name={aiConsent ? 'checkmark-circle' : 'close-circle-outline'} size={17} color={aiConsent ? c.green : c.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.white }}>Allow AI Meal Analysis</Text>
              <Text style={{ fontSize: 12, color: c.muted, marginTop: 1 }}>
                {aiConsent ? 'AI features are enabled' : 'AI features are disabled'}
              </Text>
            </View>
            <Switch
              value={aiConsent}
              onValueChange={(v) => dispatch({ type: 'SET_AI_CONSENT', payload: v })}
              trackColor={{ false: c.border, true: c.green + '88' }}
              thumbColor={aiConsent ? c.green : c.muted}
            />
          </View>
        </Card>

        <Text style={{ fontSize: 12, color: c.muted, textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 }}>
          Turning off AI meal analysis prevents the app from sending your data to third-party AI services. AI Helper features will be unavailable until you re-enable this setting.
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}
