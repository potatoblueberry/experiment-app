/**
 * Small presentational helpers that are too little to deserve their own files.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../../theme';
import { AppText } from './AppText';
import { Button } from './Button';

export function Stat({ label, value, sub, style }: { label: string; value: string; sub?: string; style?: ViewStyle }) {
  return (
    <View style={[{ gap: 2 }, style]}>
      <AppText variant="label" color="textMuted">
        {label}
      </AppText>
      <AppText variant="stat">{value}</AppText>
      {sub ? (
        <AppText variant="caption" color="textSecondary">
          {sub}
        </AppText>
      ) : null}
    </View>
  );
}

export function ProgressBar({ value, color = colors.primary, height = 6 }: { value: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={{ height, backgroundColor: colors.surfaceMuted, borderRadius: height / 2, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height, backgroundColor: color, borderRadius: height / 2 }} />
    </View>
  );
}

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
const toneColors: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary },
  primary: { bg: colors.primarySoft, fg: colors.primaryText },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.accentSoft, fg: colors.accent },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.info },
};

export function Badge({ label, tone = 'neutral', dot }: { label: string; tone?: Tone; dot?: boolean }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      {dot && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.fg }} />}
      <AppText variant="caption" color={c.fg} style={{ fontWeight: '600', fontSize: 12 }}>
        {label}
      </AppText>
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="heading">{title}</AppText>
      {action}
    </View>
  );
}

export function InfoBox({ children, tone = 'info', icon }: { children: React.ReactNode; tone?: 'info' | 'warning' | 'success'; icon?: keyof typeof Ionicons.glyphMap }) {
  const c = tone === 'warning' ? toneColors.warning : tone === 'success' ? toneColors.success : toneColors.info;
  const name = icon ?? (tone === 'warning' ? 'warning-outline' : tone === 'success' ? 'checkmark-circle-outline' : 'information-circle-outline');
  return (
    <View style={[styles.infoBox, { backgroundColor: c.bg }]}>
      <Ionicons name={name} size={18} color={c.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        {typeof children === 'string' ? (
          <AppText variant="caption" color="text">
            {children}
          </AppText>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

export function EmptyState({ icon, title, text, actionLabel, onAction }: { icon: keyof typeof Ionicons.glyphMap; title: string; text?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={colors.primary} />
      </View>
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      {text && (
        <AppText variant="caption" color="textSecondary" align="center">
          {text}
        </AppText>
      )}
      {actionLabel && onAction && <Button label={actionLabel} onPress={onAction} style={{ marginTop: spacing.sm }} />}
    </View>
  );
}

export function Row({ children, style, gap = spacing.sm, align = 'center' }: { children: React.ReactNode; style?: ViewStyle; gap?: number; align?: ViewStyle['alignItems'] }) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap }, style]}>{children}</View>;
}

export function Divider({ vertical }: { vertical?: boolean }) {
  return <View style={vertical ? styles.vDivider : styles.hDivider} />;
}

export function Legend({ items }: { items: { color: string; label: string; dashed?: boolean }[] }) {
  return (
    <View style={styles.legend}>
      {items.map((it) => (
        <View key={it.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: it.dashed ? 'transparent' : it.color, borderWidth: it.dashed ? 1 : 0, borderColor: it.color, borderStyle: it.dashed ? 'dashed' : 'solid' }} />
          <AppText variant="caption" color="textSecondary">
            {it.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoBox: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  hDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, alignSelf: 'stretch' },
  vDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border, alignSelf: 'stretch' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
