import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '../../theme';
import { AppText } from './AppText';

interface Option<T extends string | number> {
  label: string;
  value: T;
}

interface Props<T extends string | number> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string | number>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.track}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} style={[styles.segment, active && styles.active]} accessibilityRole="button" accessibilityState={{ selected: active }}>
            <AppText variant="caption" color={active ? 'text' : 'textSecondary'} style={{ fontWeight: '600' }}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm },
  active: { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
});
