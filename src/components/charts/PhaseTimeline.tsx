/**
 * Horizontal bar showing the experiment's phases proportional to their length,
 * with a "today" marker. Labels underneath give the phase name and duration.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { phaseLengthDays } from '../../domain/phases';
import type { ExperimentPhase } from '../../domain/types';
import { diffDays, today } from '../../utils/dates';
import { colors, phaseColors } from '../../theme';
import { AppText } from '../ui/AppText';

interface Props {
  phases: ExperimentPhase[];
}

export function PhaseTimeline({ phases }: Props) {
  if (phases.length === 0) return null;
  const sorted = [...phases].sort((a, b) => a.order - b.order);
  const first = sorted[0].startDate;
  const last = sorted[sorted.length - 1].endDate;
  const total = diffDays(first, last) + 1;
  const t = today();
  const todayPct = Math.max(0, Math.min(1, (diffDays(first, t) + 0.5) / total));
  const showToday = t >= first && t <= last;

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.track}>
        {sorted.map((p) => (
          <View key={p.id} style={{ flex: phaseLengthDays(p), backgroundColor: phaseColors[p.type].fill, opacity: p.type === 'baseline' ? 0.55 : 1 }} />
        ))}
        {showToday && (
          <View pointerEvents="none" style={[styles.todayMarker, { left: `${todayPct * 100}%` }]}>
            <View style={styles.todayLine} />
          </View>
        )}
      </View>
      {showToday && (
        <View style={{ position: 'relative', height: 14 }}>
          <AppText variant="caption" color="text" style={[styles.todayLabel, { left: `${todayPct * 100}%` }]}>
            Today
          </AppText>
        </View>
      )}
      <View style={styles.labels}>
        {sorted.map((p) => (
          <View key={p.id} style={{ flex: phaseLengthDays(p), minWidth: 70 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: phaseColors[p.type].fill }} />
              <AppText variant="caption" style={{ fontWeight: '600' }}>
                {phaseColors[p.type].label}
              </AppText>
            </View>
            <AppText variant="caption" color="textSecondary">
              {Math.round(phaseLengthDays(p) / 7)} wk
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: colors.surfaceMuted, position: 'relative' },
  todayMarker: { position: 'absolute', top: -2, bottom: -2, width: 0, alignItems: 'center' },
  todayLine: { width: 2, flex: 1, backgroundColor: colors.text, borderRadius: 1 },
  todayLabel: { position: 'absolute', transform: [{ translateX: -16 }], fontSize: 11, fontWeight: '600' },
  labels: { flexDirection: 'row', gap: 8 },
});
