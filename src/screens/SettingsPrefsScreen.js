import React, { useState } from 'react';
import { View, Text, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useApp, useTheme } from '../context/AppContext';
import {
  SectionLabel, Card, RowItem, TextListModal, SubScreenHeader,
} from '../components/SettingsShared';

export default function SettingsPrefsScreen() {
  const navigation    = useNavigation();
  const { state, dispatch } = useApp();
  const c             = useTheme();
  const darkMode      = state.settings?.darkMode !== false;
  const p             = state.userProfile;

  const notifications = state.settings?.notifications ?? true;
  const mealReminders = state.settings?.mealReminders ?? true;
  const voiceEnabled  = state.settings?.voiceEnabled  ?? true;
  const [units, setUnits] = useState('Imperial');

  const [dietaryRestrictions, setDietaryRestrictions] = useState(p.dietaryRestrictions || '');
  const [allergies,           setAllergies]           = useState(p.allergies           || '');
  const [showDietModal,    setShowDietModal]    = useState(false);
  const [showAllergyModal, setShowAllergyModal] = useState(false);

  const targets = {
    calories: p.calorieTarget || 2000,
    protein:  p.proteinTarget || 150,
    carbs:    p.carbTarget    || 225,
    fat:      p.fatTarget     || 56,
    water:    p.waterTarget   || 2700,
  };

  const switchProps = (value, onChange) => ({
    value,
    onValueChange: onChange,
    trackColor: { false: c.border, true: c.accent + '88' },
    thumbColor: value ? c.accent : c.muted,
    ios_backgroundColor: c.border,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}>

        <SubScreenHeader title="Settings" onBack={() => navigation.goBack()} c={c} />

        {/* ── Daily Targets ── */}
        <SectionLabel label="Daily Targets" c={c} />
        <Card c={c}>
          <RowItem c={c} icon="flame"   iconBg={darkMode ? '#2E1E0A' : '#FFF3E0'} iconColor={c.fire}    label="Calories"      value={`${targets.calories} kcal`} />
          <RowItem c={c} icon="flash"   iconBg={darkMode ? '#2E1214' : '#FFF0F0'} iconColor={c.protein} label="Protein"       value={`${targets.protein}g`}      />
          <RowItem c={c} icon="leaf"    iconBg={darkMode ? '#1E2E14' : '#F0FFF0'} iconColor={c.green}   label="Carbohydrates" value={`${targets.carbs}g`}        />
          <RowItem c={c} icon="ellipse" iconBg={darkMode ? '#141A2E' : '#EFF6FF'} iconColor={c.fat}     label="Fats"          value={`${targets.fat}g`}          />
          <RowItem c={c} icon="water"   iconBg={darkMode ? '#101A2E' : '#EFF6FF'} iconColor={c.water}   label="Water Target"  value={`${targets.water} ml`}      noBorder />
        </Card>

        {/* ── Preferences ── */}
        <SectionLabel label="Preferences" c={c} />
        <Card c={c}>
          <RowItem
            c={c}
            icon="moon-outline" iconBg={darkMode ? '#1A1A3A' : '#F0EEFF'} iconColor={c.accent}
            label="Dark Mode"
            right={<Switch {...switchProps(darkMode, (val) => dispatch({ type: 'SET_DARK_MODE', payload: val }))} />}
          />
          <RowItem
            c={c}
            icon="notifications-outline" iconBg={darkMode ? '#2A1A1A' : '#FFF0F0'} iconColor={c.protein}
            label="Notifications"
            right={<Switch {...switchProps(notifications, (val) => dispatch({ type: 'SET_NOTIFICATIONS', payload: val }))} />}
          />
          <RowItem
            c={c}
            icon="alarm-outline" iconBg={darkMode ? '#1A2A1A' : '#F0FFF0'} iconColor={c.green}
            label="Meal Reminders"
            right={<Switch {...switchProps(mealReminders, (val) => dispatch({ type: 'SET_MEAL_REMINDERS', payload: val }))} />}
          />
          <RowItem
            c={c}
            icon="volume-high-outline" iconBg={darkMode ? '#1A1A2E' : '#F0F0FF'} iconColor={c.accent}
            label="Voice Responses"
            value={voiceEnabled ? 'AI speaks replies aloud' : 'Text only'}
            right={<Switch {...switchProps(voiceEnabled, (val) => dispatch({ type: 'SET_VOICE_ENABLED', payload: val }))} />}
          />
          <RowItem
            c={c}
            icon="globe-outline" iconBg={darkMode ? '#2A2A1A' : '#FFFAF0'} iconColor={c.carbs}
            label="Units"
            value={units}
            onPress={() => setUnits(units === 'Imperial' ? 'Metric' : 'Imperial')}
            noBorder
          />
        </Card>

        {/* ── Dietary Preferences ── */}
        <SectionLabel label="Dietary Preferences" c={c} />
        <Card c={c}>
          <RowItem
            c={c} icon="leaf-outline" iconBg={darkMode ? '#1A2A1A' : '#F0FFF0'} iconColor={c.green}
            label="Dietary Restrictions"
            value={dietaryRestrictions.trim() || 'None'}
            onPress={() => setShowDietModal(true)}
          />
          <RowItem
            c={c} icon="alert-circle-outline" iconBg={darkMode ? '#2E1414' : '#FFF0F0'} iconColor={c.red}
            label="Allergies"
            value={allergies.trim() || 'None'}
            onPress={() => setShowAllergyModal(true)}
            noBorder
          />
        </Card>

        <View style={{ height: 10 }} />
      </ScrollView>

      <TextListModal
        visible={showDietModal}
        title="Dietary Restrictions"
        subtitle="Tell the AI what you don't eat. Separate items with commas."
        placeholder="e.g. vegetarian, gluten-free, no dairy"
        value={dietaryRestrictions}
        onConfirm={(val) => { setDietaryRestrictions(val); dispatch({ type: 'UPDATE_PROFILE', payload: { dietaryRestrictions: val } }); }}
        onDismiss={() => setShowDietModal(false)}
      />
      <TextListModal
        visible={showAllergyModal}
        title="Allergies"
        subtitle="The AI will never suggest foods containing these. Separate with commas."
        placeholder="e.g. peanuts, shellfish, tree nuts, soy"
        value={allergies}
        onConfirm={(val) => { setAllergies(val); dispatch({ type: 'UPDATE_PROFILE', payload: { allergies: val } }); }}
        onDismiss={() => setShowAllergyModal(false)}
      />
    </SafeAreaView>
  );
}
