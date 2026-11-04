/**
 * Sign in / create account with e-mail and password, or continue on local demo
 * data. Shown only when Supabase is configured and nobody is signed in.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { AppText, Button, Card, InfoBox, Screen, SegmentedControl } from '../components/ui';
import { colors, radius, spacing } from '../theme';

type Mode = 'signin' | 'signup';

export default function SignInScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canSubmit = email.includes('@') && password.length >= 6 && !busy;

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = mode === 'signin' ? await auth.signIn(email, password) : await auth.signUp(email, password);
    setBusy(false);
    if (result.error) setError(result.error);
    else if (result.needsConfirmation) setNotice('Account created. Check your e-mail for a confirmation link, then sign in here.');
    // On success the root layout notices the session and switches screens.
  };

  return (
    <Screen title="N1 Lab" subtitle="Rigorous self-experiments on your own wearable data.">
      <Card>
        <SegmentedControl<Mode>
          options={[
            { value: 'signin', label: 'Sign in' },
            { value: 'signup', label: 'Create account' },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
            setNotice(null);
          }}
        />
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="E-mail"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={mode === 'signup' ? 'Password (at least 6 characters)' : 'Password'}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            textContentType={mode === 'signup' ? 'newPassword' : 'password'}
            onSubmitEditing={() => canSubmit && submit()}
            style={styles.input}
          />
          {error && (
            <View style={styles.error}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <AppText variant="caption" color="danger" style={{ flex: 1 }}>
                {error}
              </AppText>
            </View>
          )}
          {notice && <InfoBox tone="success">{notice}</InfoBox>}
          <Button label={mode === 'signin' ? 'Sign in' : 'Create account'} onPress={submit} disabled={!canSubmit} loading={busy} />
        </View>
      </Card>

      <Card tone="muted">
        <AppText variant="bodyStrong">Just looking?</AppText>
        <AppText variant="caption" color="textSecondary" style={{ marginTop: 2, marginBottom: spacing.md }}>
          Demo mode runs entirely on this device with a generated year of Oura-like data. Nothing is sent anywhere.
        </AppText>
        <Button label="Continue with demo data" variant="secondary" icon="flask-outline" onPress={() => auth.enterDemo()} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  error: { flexDirection: 'row', gap: 6, alignItems: 'center' },
});
