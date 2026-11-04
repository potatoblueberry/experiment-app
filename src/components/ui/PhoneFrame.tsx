/**
 * In the browser, keeps the app inside a phone-width column so the layout is
 * honest about mobile sizing. On native it renders children as-is.
 */
import React from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { colors, PHONE_WIDTH } from '../../theme';

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  if (Platform.OS !== 'web') return <>{children}</>;
  const framed = width > PHONE_WIDTH + 40;
  return (
    <View style={styles.outer}>
      <View style={[styles.inner, framed ? { width: PHONE_WIDTH, borderLeftWidth: 1, borderRightWidth: 1 } : { width: '100%' }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: '#D9DFE5', alignItems: 'center' },
  inner: { flex: 1, backgroundColor: colors.background, borderColor: '#C3CBD3', overflow: 'hidden' },
});
