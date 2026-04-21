import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
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

function InfoCard({ icon, iconColor, iconBg, title, body, c }) {
  return (
    <View style={{
      flexDirection: 'row', gap: 12, alignItems: 'flex-start',
      backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border,
      padding: 14, marginBottom: 10,
    }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: iconBg, justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: c.white, marginBottom: 4 }}>{title}</Text>
        <Text style={{ fontSize: 13, color: c.muted, lineHeight: 20 }}>{body}</Text>
      </View>
    </View>
  );
}

export default function PrivacyPolicyScreen({ visible, onClose }) {
  const c = useTheme();
  const dm = true; // always use dark-style backgrounds for icon cards

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
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.white }}>Privacy Policy</Text>
          <View style={{ width: 70 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 60 }}
        >
          {/* Intro card */}
          <View style={{
            backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border,
            padding: 16, marginBottom: 28, flexDirection: 'row', alignItems: 'center', gap: 12,
          }}>
            <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: c.accentDim, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="lock-closed-outline" size={22} color={c.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: c.white }}>FoodChat AI — Privacy Policy</Text>
              <Text style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>Last updated: {LAST_UPDATED}</Text>
            </View>
          </View>

          <Section title="Our Commitment" c={c}>
            <Body c={c}>
              Your privacy matters. This policy explains what data FoodChat AI collects, how it's used, and how it's protected. We collect only what we need to make the app work well for you.
            </Body>
          </Section>

          <Section title="1. What Data We Collect" c={c}>
            <Body c={c}>
              We collect the following types of information when you use FoodChat AI:
            </Body>

            <View style={{ marginTop: 14, gap: 0 }}>
              <InfoCard
                c={c}
                icon="person-outline"
                iconColor={c.accent}
                iconBg={c.accentDim}
                title="Personal Information"
                body="Name, age, gender, height, weight, and fitness goals you enter during onboarding or in Settings."
              />
              <InfoCard
                c={c}
                icon="restaurant-outline"
                iconColor="#FFD166"
                iconBg="#2D2200"
                title="Meal & Nutrition Logs"
                body="Meals you log, including food names, calories, macros (protein, carbs, fat), and water intake."
              />
              <InfoCard
                c={c}
                icon="chatbubble-outline"
                iconColor="#63E6BE"
                iconBg="#0A2D20"
                title="AI Chat Messages"
                body="Messages you send to the AI assistant, including text and food photos you share for analysis."
              />
              <InfoCard
                c={c}
                icon="settings-outline"
                iconColor={c.muted}
                iconBg={c.card2}
                title="App Preferences"
                body="Your in-app settings such as dark mode, notification preferences, and unit preferences."
              />
            </View>
          </Section>

          <Section title="2. How We Use Your Data" c={c}>
            <Body c={c}>
              We use the data we collect to:
            </Body>
            <Bullet text="Calculate personalized calorie and macro targets based on your profile" c={c} />
            <Bullet text="Power AI responses with context about your goals and daily progress" c={c} />
            <Bullet text="Analyze food photos to estimate nutritional content" c={c} />
            <Bullet text="Remember your preferences and settings across sessions" c={c} />
            <Bullet text="Improve the accuracy and relevance of the app over time" c={c} />
          </Section>

          <Section title="3. AI Processing" c={c}>
            <Body c={c}>
              FoodChat AI sends your messages and food photos to a third-party AI provider (Anthropic) to generate responses. Your profile data (goals, macros, progress) may be included as context to personalize those responses. Anthropic processes this data under their own privacy policy and does not store it for training purposes by default.
            </Body>
          </Section>

          <Section title="4. Data Storage & Security" c={c}>
            <Body c={c}>
              Your data is stored in two places:
            </Body>
            <Bullet text="On your device — app preferences and recent session data are stored locally using secure device storage." c={c} />
            <Bullet text="In the cloud — your account and profile are stored securely via Firebase (Google), which uses industry-standard encryption at rest and in transit." c={c} />
            <View style={{ marginTop: 12, backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderLeftWidth: 3, borderColor: c.border, borderLeftColor: c.accent, padding: 14 }}>
              <Text style={{ fontSize: 13, color: c.muted, lineHeight: 20 }}>
                We use HTTPS for all network communication and Firebase Authentication for secure sign-in. We do not store payment information.
              </Text>
            </View>
          </Section>

          <Section title="5. Data Sharing" c={c}>
            <Body c={c}>
              We do not sell, rent, or share your personal data with third parties for marketing purposes. Data is only shared with:
            </Body>
            <Bullet text="Anthropic — to process your AI chat messages and photo analyses" c={c} />
            <Bullet text="Firebase (Google) — to store your account and profile securely" c={c} />
            <Bullet text="Legal authorities — only if required by law or valid legal process" c={c} />
          </Section>

          <Section title="6. Your Rights" c={c}>
            <Body c={c}>
              You have control over your data. You can:
            </Body>
            <Bullet text="Update your personal information at any time in the Settings screen" c={c} />
            <Bullet text="Delete your account, which removes your profile and stored data" c={c} />
            <Bullet text="Request a copy of your data by contacting us via the Help Center" c={c} />
          </Section>

          <Section title="7. Children's Privacy" c={c}>
            <Body c={c}>
              FoodChat AI is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with their information, please contact us so we can remove it.
            </Body>
          </Section>

          <Section title="8. Changes to This Policy" c={c}>
            <Body c={c}>
              We may update this Privacy Policy from time to time. When we make changes, we will update the "Last updated" date at the top of this page. We encourage you to review this policy periodically.
            </Body>
          </Section>

          <Section title="9. Contact Us" c={c}>
            <Body c={c}>
              If you have any questions, concerns, or requests regarding this Privacy Policy or your data, please reach out through the Help Center found in the app's Settings screen.
            </Body>
          </Section>

        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
