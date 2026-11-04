import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PhoneFrame } from '../components/ui/PhoneFrame';
import { RepositoryProvider } from '../data/RepositoryProvider';
import { colors } from '../theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <RepositoryProvider>
        <PhoneFrame>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="experiment/new" />
            <Stack.Screen name="experiment/[id]" />
          </Stack>
        </PhoneFrame>
        <StatusBar style="dark" />
      </RepositoryProvider>
    </SafeAreaProvider>
  );
}
