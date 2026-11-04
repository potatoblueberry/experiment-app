import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, shadow, spacing } from '../../theme';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  tone?: 'default' | 'muted' | 'primary' | 'warning';
  padding?: number;
}

export function Card({ children, onPress, style, tone = 'default', padding = spacing.lg }: Props) {
  const toneStyle = tone === 'muted' ? styles.muted : tone === 'primary' ? styles.primary : tone === 'warning' ? styles.warning : null;
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, toneStyle, { padding }, pressed && styles.pressed, style]} accessibilityRole="button">
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, toneStyle, { padding }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  muted: { backgroundColor: colors.surfaceMuted, shadowOpacity: 0, elevation: 0 },
  primary: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  warning: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
  pressed: { opacity: 0.85 },
});
