import React, { useState } from 'react';
import { View, Text, ScrollView, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as StoreReview from 'expo-store-review';
import { useTheme } from '../context/AppContext';
import { SectionLabel, Card, RowItem, SubScreenHeader } from '../components/SettingsShared';
import TermsOfServiceScreen from './TermsOfServiceScreen';
import PrivacyPolicyScreen  from './PrivacyPolicyScreen';

const STORE_URLS = {
  ios:     'https://apps.apple.com/app/id000000000',
  android: 'https://play.google.com/store/apps/details?id=com.fitchatai.app',
};

async function requestAppRating() {
  try {
    const available = await StoreReview.isAvailableAsync();
    if (available) {
      await StoreReview.requestReview();
    } else {
      const url = Platform.OS === 'ios' ? STORE_URLS.ios : STORE_URLS.android;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) Linking.openURL(url);
    }
  } catch (_) {}
}

export default function SupportScreen() {
  const navigation = useNavigation();
  const c          = useTheme();

  const [showTerms,   setShowTerms]   = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}>

        <SubScreenHeader title="Support" onBack={() => navigation.goBack()} c={c} />

        <SectionLabel label="Help" c={c} />
        <Card c={c}>
          <RowItem c={c} icon="star-outline"          label="Rate the App"          onPress={requestAppRating}                              />
          <RowItem c={c} icon="leaf-outline"          label="Nutrition Data Sources" onPress={() => navigation.navigate('NutritionSourcesScreen')} />
          <RowItem c={c} icon="document-text-outline" label="Privacy Policy"         onPress={() => setShowPrivacy(true)}                   />
          <RowItem c={c} icon="shield-outline"        label="Terms of Service"       onPress={() => setShowTerms(true)}  noBorder           />
        </Card>

        <Text style={{ textAlign: 'center', fontSize: 11, color: c.muted, marginTop: 4 }}>
          Shred AI · v1.0.0 · SDK 54
        </Text>
        <View style={{ height: 20 }} />

      </ScrollView>

      <TermsOfServiceScreen visible={showTerms}   onClose={() => setShowTerms(false)}   />
      <PrivacyPolicyScreen  visible={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </SafeAreaView>
  );
}
