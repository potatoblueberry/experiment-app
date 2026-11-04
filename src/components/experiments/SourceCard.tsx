import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { DataSourceConnection } from '../../domain/types';
import { colors, radius } from '../../theme';
import { AppText, Badge, Card } from '../ui';

const providerMeta: Record<DataSourceConnection['provider'], { name: string; icon: keyof typeof Ionicons.glyphMap }> = {
  oura: { name: 'Oura Ring', icon: 'ellipse-outline' },
  manual: { name: 'Manual entry', icon: 'create-outline' },
};

export function SourceCard({ source, readingDays }: { source: DataSourceConnection; readingDays?: number }) {
  const meta = providerMeta[source.provider];
  const synced = source.lastSyncAt ? `Synced ${formatDistanceToNow(new Date(source.lastSyncAt), { addSuffix: true })}` : 'Never synced';
  return (
    <Card padding={14}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Ionicons name={meta.icon} size={22} color={colors.text} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong">{meta.name}</AppText>
          <AppText variant="caption" color="textSecondary">
            {synced}
            {readingDays ? ` · ${readingDays} days of history` : ''}
          </AppText>
        </View>
        <Badge label={source.status === 'connected' ? 'Connected' : source.status === 'error' ? 'Error' : 'Off'} tone={source.status === 'connected' ? 'success' : source.status === 'error' ? 'danger' : 'neutral'} dot />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
});
