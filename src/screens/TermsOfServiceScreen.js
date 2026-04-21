import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/AppContext';

const LAST_UPDATED = 'April 12, 2026';

function Section({ title, children, c }) {
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: c.white, marginBottom: 8 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Body({ children, c }) {
  return (
    <Text style={{ fontSize: 14, color: c.muted, lineHeight: 22 }}>
      {children}
    </Text>
  );
}

function Bullet({ text, c }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
      <Text style={{ fontSize: 14, color: c.accent, lineHeight: 22 }}>•</Text>
      <Text style={{ flex: 1, fontSize: 14, color: c.muted, lineHeight: 22 }}>{text}</Text>
    </View>
  );
}

export default function TermsOfServiceScreen({ visible, onClose }) {
  const c = useTheme();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>

        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 14,
          borderBottomWidth: 1, borderBottomColor: c.border,
        }}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Ionicons name="chevron-down" size={20} color={c.accent} />
            <Text style={{ fontSize: 15, color: c.accent, fontWeight: '600' }}>Close</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.white }}>Terms of Service</Text>
          <View style={{ width: 70 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 60 }}
        >
          {/* App name + last updated */}
          <View style={{
            backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border,
            padding: 16, marginBottom: 28, flexDirection: 'row', alignItems: 'center', gap: 12,
          }}>
            <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: c.accentDim, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="shield-checkmark-outline" size={22} color={c.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: c.white }}>FoodChat AI — Terms of Service</Text>
              <Text style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>Last updated: {LAST_UPDATED}</Text>
            </View>
          </View>

          <Section title="1. Acceptance of Terms" c={c}>
            <Body c={c}>
              By downloading, installing, or using FoodChat AI, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the app.
            </Body>
          </Section>

          <Section title="2. About FoodChat AI" c={c}>
            <Body c={c}>
              FoodChat AI is a nutrition tracking application that uses artificial intelligence to help you log meals, track macros, and work toward your personal health goals. The app provides:
            </Body>
            <Bullet text="AI-powered meal and calorie tracking" c={c} />
            <Bullet text="Personalized macro and water intake targets" c={c} />
            <Bullet text="AI chat for nutrition guidance and meal suggestions" c={c} />
            <Bullet text="Photo-based food analysis" c={c} />
          </Section>

          <Section title="3. Not Medical Advice" c={c}>
            <Body c={c}>
              FoodChat AI is a wellness and tracking tool — it is NOT a medical service. Everything the app provides, including calorie targets, macro recommendations, and AI chat responses, is for general informational and motivational purposes only.
            </Body>
            <View style={{ marginTop: 12, backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderLeftWidth: 3, borderColor: c.border, borderLeftColor: c.red, padding: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.white, marginBottom: 4 }}>Important Disclaimer</Text>
              <Text style={{ fontSize: 13, color: c.muted, lineHeight: 20 }}>
                Nothing in FoodChat AI constitutes medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional before making significant changes to your diet, exercise routine, or health plan. Do not use this app as a substitute for professional medical guidance.
              </Text>
            </View>
          </Section>

          <Section title="4. User Responsibilities" c={c}>
            <Body c={c}>
              By using FoodChat AI, you agree to:
            </Body>
            <Bullet text="Provide accurate personal information (age, weight, height, goals) for best results" c={c} />
            <Bullet text="Use the app for personal, non-commercial purposes only" c={c} />
            <Bullet text="Take full responsibility for any health or dietary decisions you make" c={c} />
            <Bullet text="Not rely solely on the app for medical or clinical nutrition guidance" c={c} />
            <Bullet text="Keep your account credentials secure and not share access with others" c={c} />
          </Section>

          <Section title="5. Account and Access" c={c}>
            <Body c={c}>
              You must create an account to use FoodChat AI. You are responsible for all activity under your account. We reserve the right to suspend or terminate accounts that violate these terms, engage in fraudulent activity, or misuse the AI systems.
            </Body>
          </Section>

          <Section title="6. AI-Generated Content" c={c}>
            <Body c={c}>
              FoodChat AI uses large language model AI to generate nutrition guidance and meal suggestions. AI responses may occasionally be inaccurate, incomplete, or not suited to your specific health needs. We do not guarantee the accuracy of any AI-generated content. Always use your own judgment.
            </Body>
          </Section>

          <Section title="7. Intellectual Property" c={c}>
            <Body c={c}>
              All content, design, branding, and code in FoodChat AI is owned by or licensed to FoodChat AI. You may not copy, redistribute, or create derivative works from any part of the app without prior written permission.
            </Body>
          </Section>

          <Section title="8. Limitation of Liability" c={c}>
            <Body c={c}>
              To the maximum extent permitted by law, FoodChat AI and its developers shall not be liable for any indirect, incidental, or consequential damages arising from your use of the app — including but not limited to health outcomes, data loss, or reliance on AI-generated recommendations.
            </Body>
          </Section>

          <Section title="9. Changes to These Terms" c={c}>
            <Body c={c}>
              We may update these Terms from time to time. When we do, we will update the "Last updated" date above. Continued use of the app after changes constitutes acceptance of the new terms.
            </Body>
          </Section>

          <Section title="10. Contact" c={c}>
            <Body c={c}>
              If you have any questions about these Terms of Service, please contact us through the Help Center in the app settings.
            </Body>
          </Section>

        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
