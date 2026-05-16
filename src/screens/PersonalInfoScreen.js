import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useApp, useTheme } from '../context/AppContext';
import {
  AGE_OPTIONS, HEIGHT_OPTIONS, WEIGHT_OPTIONS, GOAL_OPTIONS, ACTIVITY_OPTIONS,
  SectionLabel, Card, NameRow, PickerRow, SubScreenHeader,
} from '../components/SettingsShared';

export default function PersonalInfoScreen() {
  const navigation    = useNavigation();
  const { state, dispatch } = useApp();
  const c             = useTheme();
  const darkMode      = state.settings?.darkMode !== false;
  const p             = state.userProfile;

  // ── Seed state from saved profile ─────────────────────────────────────────
  const initAgeIdx = () => {
    const a = parseInt(p.age) || 28;
    return Math.max(0, Math.min(a - 13, AGE_OPTIONS.length - 1));
  };
  const initHtIdx = () => {
    const totalIn = parseInt(p.height) || 70;
    const ft   = Math.floor(totalIn / 12);
    const inch = totalIn % 12;
    const label = `${ft}'${inch}"`;
    const i = HEIGHT_OPTIONS.indexOf(label);
    return i >= 0 ? i : HEIGHT_OPTIONS.indexOf("5'10\"");
  };
  const initWtIdx    = () => Math.max(0, Math.min((parseInt(p.weight) || 175) - 80, WEIGHT_OPTIONS.length - 1));
  const initGoalIdx  = () => ({ loseFat: 0, maintain: 1, gainMuscle: 2 }[p.goal]          ?? 0);
  const initActIdx   = () => ({ sedentary: 0, light: 1, moderate: 2, veryActive: 3 }[p.activityLevel] ?? 2);

  const [name,    setName]    = useState(p.name    || '');
  const [ageIdx,  setAgeIdx]  = useState(initAgeIdx);
  const [htIdx,   setHtIdx]   = useState(initHtIdx);
  const [wtIdx,   setWtIdx]   = useState(initWtIdx);
  const [goalIdx, setGoalIdx] = useState(initGoalIdx);
  const [actIdx,  setActIdx]  = useState(initActIdx);

  const saveProfile = (overrides = {}) => {
    const htStr = HEIGHT_OPTIONS[overrides.htIdx ?? htIdx];
    const [ftP, inP] = htStr.replace('"', '').split("'");
    const totalInches = parseInt(ftP) * 12 + parseInt(inP || '0');
    const goalKeys    = ['loseFat', 'maintain', 'gainMuscle'];
    const actKeys     = ['sedentary', 'light', 'moderate', 'veryActive'];
    dispatch({
      type: 'UPDATE_PROFILE',
      payload: {
        name:          overrides.name    ?? name,
        age:           String(((overrides.ageIdx  ?? ageIdx)  + 13)),
        height:        String(overrides.htIn ?? totalInches),
        weight:        String(((overrides.wtIdx   ?? wtIdx)   + 80)),
        goal:          goalKeys[overrides.goalIdx ?? goalIdx],
        activityLevel: actKeys[overrides.actIdx   ?? actIdx],
      },
    });
  };

  const handleName    = (v) => { setName(v);   saveProfile({ name: v }); };
  const handleAgeIdx  = (i) => { setAgeIdx(i); saveProfile({ ageIdx: i }); };
  const handleHtIdx   = (i) => {
    setHtIdx(i);
    const htStr = HEIGHT_OPTIONS[i];
    const [ftP, inP] = htStr.replace('"', '').split("'");
    saveProfile({ htIdx: i, htIn: parseInt(ftP) * 12 + parseInt(inP || '0') });
  };
  const handleWtIdx   = (i) => { setWtIdx(i);   saveProfile({ wtIdx: i }); };
  const handleGoalIdx = (i) => { setGoalIdx(i);  saveProfile({ goalIdx: i }); };
  const handleActIdx  = (i) => { setActIdx(i);   saveProfile({ actIdx: i }); };

  const iconBg = darkMode ? '#1A2A2A' : '#F0FEFF';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}>

        <SubScreenHeader title="Personal Info" onBack={() => navigation.goBack()} c={c} />

        <SectionLabel label="Profile" c={c} />
        <Card c={c}>
          <NameRow value={name} onChange={handleName} c={c} />

          <PickerRow
            c={c} icon="calendar-outline" label="Age"
            iconBg={iconBg} iconColor={c.muted}
            displayValue={`${ageIdx + 13} yrs`}
            pickerTitle="Age"
            options={AGE_OPTIONS}
            selectedIndex={ageIdx}
            onConfirm={handleAgeIdx}
          />
          <PickerRow
            c={c} icon="body-outline" label="Height"
            iconBg={iconBg} iconColor={c.muted}
            displayValue={HEIGHT_OPTIONS[htIdx]}
            pickerTitle="Height"
            options={HEIGHT_OPTIONS}
            selectedIndex={htIdx}
            onConfirm={handleHtIdx}
          />
          <PickerRow
            c={c} icon="scale-outline" label="Weight"
            iconBg={iconBg} iconColor={c.muted}
            displayValue={`${wtIdx + 80} lbs`}
            pickerTitle="Weight"
            options={WEIGHT_OPTIONS}
            selectedIndex={wtIdx}
            onConfirm={handleWtIdx}
          />
          <PickerRow
            c={c} icon="flag-outline" label="Goal"
            iconBg={iconBg} iconColor={c.muted}
            displayValue={GOAL_OPTIONS[goalIdx]}
            pickerTitle="Goal"
            options={GOAL_OPTIONS}
            selectedIndex={goalIdx}
            onConfirm={handleGoalIdx}
          />
          <PickerRow
            c={c} icon="fitness-outline" label="Activity Level"
            iconBg={iconBg} iconColor={c.muted}
            displayValue={ACTIVITY_OPTIONS[actIdx]}
            pickerTitle="Activity Level"
            options={ACTIVITY_OPTIONS}
            selectedIndex={actIdx}
            onConfirm={handleActIdx}
            noBorder
          />
        </Card>

        <View style={{ height: 10 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
