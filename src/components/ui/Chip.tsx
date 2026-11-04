import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../theme';
import { AppText } from './AppText';

interface Props {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'primary' | 'neutral';
}

export function Chip({ label, selected, onPress, tone = 'primary' }: Props) {
  const bg = selected ? (tone === 'primary' ? colors.primary : colors.text) : colors.surface;
  const fg = selected ? colors.onPrimary : colors.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [styles.chip, { backgroundColor: bg, borderColor: selected ? bg : colors.border }, pressed && { opacity: 0.8 }]}
    >
      <AppText variant="caption" color={fg} style={{ fontWeight: '600' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
