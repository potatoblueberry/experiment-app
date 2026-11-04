/**
 * Seven tiny bars showing how each weekday deviates from the overall mean.
 * Positive bars go up from a centre line, negative bars go down.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { formatMetricDelta } from '../../domain/metrics';
import type { MetricId } from '../../domain/types';
import { WEEKDAY_SHORT } from '../../utils/dates';
import { colors } from '../../theme';
import { AppText } from '../ui/AppText';

interface Props {
  metricId: MetricId;
  effects: number[];
  height?: number;
}

export function WeekdayBars({ metricId, effects, height = 56 }: Props) {
  const maxAbs = Math.max(0.0001, ...effects.map((e) => Math.abs(e)));
  const half = height / 2;
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {effects.map((e, i) => {
        const h = (Math.abs(e) / maxAbs) * (half - 4);
        const positive = e >= 0;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <View style={{ height, width: '100%', justifyContent: 'center' }}>
              <View style={[styles.axis, { top: half }]} />
              <View
                style={{
                  position: 'absolute',
                  left: '15%',
                  right: '15%',
                  height: Math.max(2, h),
                  top: positive ? half - h : half,
                  backgroundColor: positive ? colors.primary : colors.accent,
                  borderRadius: 3,
                }}
              />
            </View>
            <AppText variant="caption" color="textMuted" style={{ fontSize: 10 }}>
              {WEEKDAY_SHORT[i]}
            </AppText>
            <AppText variant="caption" color="textSecondary" style={{ fontSize: 10 }}>
              {formatMetricDelta(metricId, e, false)}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  axis: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border },
});
