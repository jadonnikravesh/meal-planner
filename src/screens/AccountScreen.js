import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp, useTheme } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { isDevEnabled } from '../config/testMode';
import { SectionLabel, Card, RowItem, ReauthModal, SubScreenHeader } from '../components/SettingsShared';

export default function AccountScreen() {
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const { user, signOut, deleteAccount, reauthenticate } = useAuth();
  const c = useTheme();

  const darkMode = state.settings?.darkMode !== false;
  const p = state.userProfile;

  const initials = (p.name || '')
    .trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

  const GOAL_LABELS   = { loseFat: 'Lose Fat', maintain: 'Maintain Weight', gainMuscle: 'Gain Muscle' };
  const ACT_LABELS    = { sedentary: 'Inactive', light: 'Lightly Active', moderate: 'Moderately Active', veryActive: 'Very Active' };
  const goalDisplay   = GOAL_LABELS[p.goal]          || 'Not set';
  const actDisplay    = ACT_LABELS[p.activityLevel]  || 'Not set';

  const targets = {
    calories: p.calorieTarget || 2000,
    protein:  p.proteinTarget || 150,
    carbs:    p.carbTarget    || 225,
    fat:      p.fatTarget     || 56,
  };

  // ── Account deletion ──────────────────────────────────────────────────────
  const [deleting,      setDeleting]      = useState(false);
  const [showReauth,    setShowReauth]    = useState(false);
  const [reauthError,   setReauthError]   = useState(null);
  const [reauthLoading, setReauthLoading] = useState(false);

  const handleDeleteAccount = () => {
    if (user?.isTestAccount) {
      Alert.alert(
        'Delete Account',
        'This will permanently delete all your data. This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: performDeletion },
        ],
      );
    } else {
      setReauthError(null);
      setShowReauth(true);
    }
  };

  const handleReauthConfirm = async (password) => {
    if (!password.trim()) return;
    setReauthLoading(true);
    setReauthError(null);
    try {
      await reauthenticate(password);
      setShowReauth(false);
      await performDeletion();
    } catch (err) {
      const code = err?.code ?? '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setReauthError('Incorrect password. Please try again.');
      } else if (code === 'auth/too-many-requests') {
        setReauthError('Too many attempts. Please wait a moment and try again.');
      } else if (code === 'auth/network-request-failed') {
        setReauthError('No internet connection. Please check your network.');
      } else {
        setReauthError(`Error: ${err?.message ?? 'Unknown error'}`);
      }
    } finally {
      setReauthLoading(false);
    }
  };

  const performDeletion = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
    } catch (err) {
      setDeleting(false);
      const isOffline = err?.code === 'auth/network-request-failed' || err?.message?.toLowerCase().includes('network');
      Alert.alert(
        'Deletion Failed',
        isOffline
          ? 'No internet connection. Please check your network and try again.'
          : `Something went wrong: ${err?.message ?? 'Unknown error'}. Please try again.`,
        [{ text: 'OK' }],
      );
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}>

        <SubScreenHeader title="Account" onBack={() => navigation.goBack()} c={c} />

        {/* ── Profile card ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 20, gap: 14 }}>
          <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: c.accent, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#FFFFFF' }}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.white }}>{p.name || 'Your Name'}</Text>
            <Text style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{user?.email || ''}</Text>
            <Text style={{ fontSize: 12, color: c.muted, marginTop: 4 }}>{goalDisplay} · {actDisplay}</Text>
          </View>
        </View>

        {/* ── Daily Targets ── */}
        <SectionLabel label="Daily Targets" c={c} />
        <Card c={c}>
          <RowItem c={c} icon="flame"   iconBg={darkMode ? '#2E1E0A' : '#FFF3E0'} iconColor={c.fire}    label="Calories"      value={`${targets.calories} kcal`} />
          <RowItem c={c} icon="flash"   iconBg={darkMode ? '#2E1214' : '#FFF0F0'} iconColor={c.protein} label="Protein"       value={`${targets.protein}g`}      />
          <RowItem c={c} icon="leaf"    iconBg={darkMode ? '#1E2E14' : '#F0FFF0'} iconColor={c.green}   label="Carbohydrates" value={`${targets.carbs}g`}        />
          <RowItem c={c} icon="ellipse" iconBg={darkMode ? '#141A2E' : '#EFF6FF'} iconColor={c.fat}     label="Fats"          value={`${targets.fat}g`}          noBorder />
        </Card>

        {/* ── Danger zone ── */}
        <SectionLabel label="Account" c={c} />
        <Card c={c}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.border }}
            activeOpacity={0.7}
            onPress={signOut}
            disabled={deleting}
          >
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: darkMode ? '#2E1214' : '#FFF0F0', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="log-out-outline" size={17} color={c.red} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.red }}>Sign Out</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, opacity: deleting ? 0.5 : 1 }}
            activeOpacity={0.7}
            onPress={handleDeleteAccount}
            disabled={deleting}
          >
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: darkMode ? '#2A1010' : '#FEE2E2', justifyContent: 'center', alignItems: 'center' }}>
              {deleting
                ? <ActivityIndicator size="small" color="#EF4444" />
                : <Ionicons name="trash-outline" size={17} color="#EF4444" />
              }
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#EF4444' }}>
                {deleting ? 'Deleting Account…' : 'Delete Account'}
              </Text>
              <Text style={{ fontSize: 11, color: c.muted, marginTop: 1 }}>Permanently removes all data</Text>
            </View>
          </TouchableOpacity>
        </Card>

        {/* ── Developer (DEV or review account only) ── */}
        {isDevEnabled(user) && (
          <>
            <SectionLabel label="Developer" c={c} />
            <Card c={c}>
              <RowItem
                c={c}
                icon="construct-outline"
                iconBg="#2A1F00"
                iconColor="#F59E0B"
                label="Open Paywall"
                value="Reset subscription to test the paywall"
                onPress={() => dispatch({
                  type: 'SET_SUBSCRIPTION',
                  payload: { status: 'none', plan: null, subscriptionId: null, customerId: null, trialEnd: null },
                })}
                noBorder
              />
            </Card>
          </>
        )}

      </ScrollView>

      <ReauthModal
        visible={showReauth}
        email={user?.email ?? ''}
        loading={reauthLoading}
        error={reauthError}
        onConfirm={handleReauthConfirm}
        onDismiss={() => { if (!reauthLoading) { setShowReauth(false); setReauthError(null); } }}
      />
    </SafeAreaView>
  );
}
