import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { METRICS } from '../../domain/metrics';
import { firstActivePhase, interventionPhase, phaseFor, phaseLengthDays } from '../../domain/phases';
import type { AdherenceLog, ExperimentDetail } from '../../domain/types';
import { diffDays, today } from '../../utils/dates';
import { colors, phaseColors } from '../../theme';
import { AppText, Badge, Card, ProgressBar } from '../ui';

interface Props {
  experiment: ExperimentDetail;
  logs?: AdherenceLog[];
}

/** Where the experiment is today, in words and as a 0–1 progress. */
export function experimentProgress(e: ExperimentDetail) {
  const t = today();
  const first = firstActivePhase(e.phases);
  const current = phaseFor(e.phases, t);
  if (!first) return { label: '', progress: 0, phase: current };
  if (t < first.startDate) return { label: `Starts in ${diffDays(t, first.startDate)} d`, progress: 0, phase: current };
  const total = diffDays(first.startDate, e.endDate) + 1;
  const day = Math.min(total, diffDays(first.startDate, t) + 1);
  if (e.status !== 'active' || t > e.endDate) return { label: 'Finished', progress: 1, phase: current };
  const phaseLabel = current && current.type !== 'intervention' ? ` · ${phaseColors[current.type].label}` : '';
  return { label: `Day ${day} of ${total}${phaseLabel}`, progress: day / total, phase: current };
}

export function adherenceRate(logs: AdherenceLog[] | undefined, upToToday = true): { rate: number; done: number; logged: number } {
  const t = today();
  const list = (logs ?? []).filter((l) => !upToToday || l.date <= t);
  const done = list.filter((l) => l.adhered).length;
  return { rate: list.length ? done / list.length : 0, done, logged: list.length };
}

export function ExperimentCard({ experiment: e, logs }: Props) {
  const { label, progress, phase } = experimentProgress(e);
  const adh = adherenceRate(logs);
  const primary = e.outcomeMetrics.find((m) => m.isPrimary) ?? e.outcomeMetrics[0];
  const statusTone = e.status === 'active' ? 'primary' : e.status === 'completed' ? 'success' : 'neutral';
  const statusLabel = e.status === 'active' ? phaseColors[phase?.type ?? 'intervention'].label : e.status === 'completed' ? 'Completed' : 'Abandoned';
  return (
    <Card onPress={() => router.push({ pathname: '/experiment/[id]', params: { id: e.id } })}>
      <View style={styles.top}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading">{e.title}</AppText>
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {primary ? `Primary: ${METRICS[primary.metricId].name}` : e.behaviorChange}
          </AppText>
        </View>
        <Badge label={statusLabel} tone={statusTone} />
      </View>
      <View style={{ marginTop: 14, gap: 6 }}>
        <ProgressBar value={progress} color={e.status === 'active' ? colors.primary : colors.textMuted} />
        <View style={styles.meta}>
          <AppText variant="caption" color="text" style={{ fontWeight: '600' }}>
            {label}
          </AppText>
          {adh.logged > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
              <AppText variant="caption" color="textSecondary">
                {Math.round(adh.rate * 100)}% adherence
              </AppText>
            </View>
          )}
        </View>
      </View>
    </Card>
  );
}

export function interventionDays(e: ExperimentDetail): number {
  const p = interventionPhase(e.phases);
  return p ? phaseLengthDays(p) : 0;
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
