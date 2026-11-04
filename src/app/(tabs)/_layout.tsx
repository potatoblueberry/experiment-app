import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import type { ColorValue } from 'react-native';

import { colors } from '../../theme';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(active: IconName, inactive: IconName) {
  return function TabIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? active : inactive} size={size} color={color as string} />;
  };
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 60, paddingTop: 6, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home', 'home-outline') }} />
      <Tabs.Screen name="trends" options={{ title: 'Trends', tabBarIcon: tabIcon('trending-up', 'trending-up-outline') }} />
      <Tabs.Screen name="checkin" options={{ title: 'Check-in', tabBarIcon: tabIcon('checkbox', 'checkbox-outline') }} />
      <Tabs.Screen name="experiments" options={{ title: 'Experiments', tabBarIcon: tabIcon('flask', 'flask-outline') }} />
    </Tabs>
  );
}
