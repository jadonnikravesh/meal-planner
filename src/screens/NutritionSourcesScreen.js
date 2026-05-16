import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/AppContext';
import { SubScreenHeader, SectionLabel, Card } from '../components/SettingsShared';

const SOURCES = [
  {
    name: 'USDA FoodData Central',
    detail: 'The primary reference for calorie and macro estimates. FoodData Central is the U.S. Department of Agriculture\'s comprehensive nutrient database, covering thousands of branded and generic foods with lab-verified values.',
  },
  {
    name: 'NIH Dietary Guidelines',
    detail: 'Daily targets and macro recommendations are informed by the Dietary Guidelines for Americans, published jointly by the U.S. Department of Health and Human Services and the USDA, and by research from the National Institutes of Health.',
  },
  {
    name: 'Mayo Clinic Nutrition Guidance',
    detail: 'General nutritional context, serving size references, and dietary best practices draw from guidance published by Mayo Clinic, a nonprofit academic medical center.',
  },
];

export default function NutritionSourcesScreen() {
  const navigation = useNavigation();
  const c          = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}
      >
        <SubScreenHeader title="Nutrition Data Sources" onBack={() => navigation.goBack()} c={c} />

        <Text style={{ fontSize: 14, color: c.muted, lineHeight: 22, marginBottom: 20 }}>
          Calorie and macro estimates provided by this app are based on publicly available nutrition databases and dietary guidelines. All values are approximations intended for general informational purposes and should not replace advice from a registered dietitian or healthcare provider.
        </Text>

        <SectionLabel label="Primary Sources" c={c} />
        <Card c={c}>
          {SOURCES.map((src, idx) => (
            <View
              key={src.name}
              style={{
                paddingVertical: 14,
                borderBottomWidth: idx < SOURCES.length - 1 ? 1 : 0,
                borderBottomColor: c.border,
                gap: 4,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.white }}>{src.name}</Text>
              <Text style={{ fontSize: 13, color: c.muted, lineHeight: 20 }}>{src.detail}</Text>
            </View>
          ))}
        </Card>

        <SectionLabel label="Important" c={c} />
        <Card c={c}>
          <View style={{ paddingVertical: 14, gap: 10 }}>
            <Text style={{ fontSize: 13, color: c.muted, lineHeight: 20 }}>
              Nutrient values can vary based on preparation method, portion size, brand, and ingredient quality. Estimates shown in this app are averages and may not reflect the exact nutritional content of every food item.
            </Text>
            <Text style={{ fontSize: 13, color: c.muted, lineHeight: 20 }}>
              If you have a medical condition, specific dietary requirement, or clinical nutrition goal, please consult a qualified healthcare professional.
            </Text>
          </View>
        </Card>

      </ScrollView>
    </SafeAreaView>
  );
}
