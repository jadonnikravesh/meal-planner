import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

// ─── Styles factory (matches app's makeStyles pattern) ────────────────────────
const makeStyles = (c) => StyleSheet.create({
  safe:      { flex: 1, backgroundColor: c.bg },
  scroll:    { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  icon:      { marginBottom: 16 },
  title:     { fontSize: 28, fontWeight: '800', color: c.white, marginBottom: 6 },
  subtitle:  { fontSize: 14, color: c.muted, marginBottom: 32 },
  label:     { fontSize: 12, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  input:     {
    backgroundColor: c.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: c.white,
    marginBottom: 16,
  },
  button:    { backgroundColor: c.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  buttonText:{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  error:     { fontSize: 13, color: c.red, marginBottom: 14, textAlign: 'center' },
  footer:    { flexDirection: 'row', justifyContent: 'center', marginTop: 28, gap: 4 },
  footerText:{ fontSize: 13, color: c.muted },
  footerLink:{ fontSize: 13, fontWeight: '700', color: c.accent },
});

// ─── Map Firebase error codes to readable messages ────────────────────────────
function friendlyError(code, message) {
  switch (code) {
    case 'auth/email-already-in-use':   return 'An account with this email already exists.';
    case 'auth/invalid-email':          return 'Please enter a valid email address.';
    case 'auth/weak-password':          return 'Password must be at least 6 characters.';
    case 'auth/network-request-failed': return 'Network error. Check your connection.';
    case 'auth/too-many-requests':      return 'Too many attempts. Try again later.';
    case 'auth/operation-not-allowed':  return 'Email/password sign-in is not enabled. Enable it in Firebase Console → Authentication → Sign-in method.';
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
    case 'auth/invalid-api-key':        return 'Invalid Firebase config. Fill in your credentials in src/firebase/config.js.';
    default:                            return `Sign up failed (${code ?? message ?? 'unknown'}). Check the browser console for details.`;
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SignUpScreen({ onGoToLogin }) {
  const c = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const { signUp } = useAuth();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function handleSignUp() {
    setError('');
    if (!email.trim())        { setError('Please enter your email.'); return; }
    if (password.length < 6)  { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm)  { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      await signUp(email.trim(), password);
      // onAuthStateChanged in AuthContext fires → App.js re-renders the main tabs
    } catch (e) {
      console.error('[SignUp error]', e.code, e.message);
      setError(friendlyError(e.code, e.message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          <Ionicons name="person-add-outline" size={38} color={c.accent} style={s.icon} />
          <Text style={s.title}>Create account</Text>
          <Text style={s.subtitle}>Start tracking your nutrition goals today</Text>

          {error ? <Text style={s.error}>{error}</Text> : null}

          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            placeholder="you@example.com"
            placeholderTextColor={c.muted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            returnKeyType="next"
          />

          <Text style={s.label}>Password</Text>
          <TextInput
            style={s.input}
            placeholder="At least 6 characters"
            placeholderTextColor={c.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            returnKeyType="next"
          />

          <Text style={s.label}>Confirm Password</Text>
          <TextInput
            style={[s.input, { marginBottom: 0 }]}
            placeholder="Re-enter password"
            placeholderTextColor={c.muted}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoComplete="new-password"
            returnKeyType="done"
            onSubmitEditing={handleSignUp}
          />

          <TouchableOpacity
            style={s.button}
            onPress={handleSignUp}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={s.buttonText}>Create Account</Text>
            }
          </TouchableOpacity>

          <View style={s.footer}>
            <Text style={s.footerText}>Already have an account?</Text>
            <TouchableOpacity onPress={onGoToLogin} activeOpacity={0.7}>
              <Text style={s.footerLink}> Log In</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
