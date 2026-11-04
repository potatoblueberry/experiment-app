import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../../theme';
import { AppText } from './AppText';

interface Props {
  children: React.ReactNode;
  /** Large title at the top. */
  title?: string;
  subtitle?: string;
  /** Show a back chevron that pops the navigation stack. */
  back?: boolean;
  /** Something to render on the right of the header row. */
  right?: React.ReactNode;
  /** Sticky content below the scroll area, e.g. wizard buttons. */
  footer?: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
}

export function Screen({ children, title, subtitle, back, right, footer, scroll = true, contentStyle }: Props) {
  const insets = useSafeAreaInsets();
  const header = (title || back || right) && (
    <View style={styles.header}>
      {back && (
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        {title && <AppText variant={back ? 'title' : 'display'}>{title}</AppText>}
        {subtitle && (
          <AppText variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
            {subtitle}
          </AppText>
        )}
      </View>
      {right}
    </View>
  );

  const body = (
    <>
      {header}
      {children}
    </>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.content, contentStyle]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {body}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }, contentStyle]}>{body}</View>
      )}
      {footer && <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>{footer}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  backButton: { marginLeft: -6, padding: 2 },
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
});
