import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { PhoneFrame } from '../components/ui/PhoneFrame';
import { LocalMockRepository } from '../data/LocalMockRepository';
import { RepositoryProvider } from '../data/RepositoryProvider';
import { SupabaseRepository } from '../data/SupabaseRepository';
import type { Repository } from '../data/repository';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppShell />
        <StatusBar style="dark" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/**
 * Picks the data back end from the auth state: a signed-in user gets the
 * Supabase repository, everyone else the local demo repository. Routes are
 * guarded so the sign-in screen and the app never show at the same time.
 */
function AppShell() {
  const auth = useAuth();
  const userId = auth.user?.id;
  const repository = useMemo<Repository>(
    () => (auth.status === 'signed_in' && supabase && userId ? new SupabaseRepository(supabase, userId) : new LocalMockRepository()),
    [auth.status, userId],
  );

  if (auth.status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const signedOut = auth.status === 'signed_out';
  return (
    <RepositoryProvider repository={repository}>
      <PhoneFrame>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Protected guard={!signedOut}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="experiment/new" />
            <Stack.Screen name="experiment/[id]" />
          </Stack.Protected>
          <Stack.Protected guard={signedOut}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
        </Stack>
      </PhoneFrame>
    </RepositoryProvider>
  );
}
