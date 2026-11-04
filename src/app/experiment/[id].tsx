/**
 * Experiment detail: phase timeline, adherence calendar (tap a day to edit),
 * journal notes, and one chart per outcome metric with the intervention start
 * marked and a preliminary/final effect estimate.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AdherenceCalendar, MetricLineChart, PhaseTimeline, type ChartBand } from '../../components/charts';
import { adherenceRate, CheckInCard, EffectSummary, experimentProgress } from '../../components/experiments';
import { AppText, Badge, Button, Card, InfoBox, Legend, Row, Screen, SectionHeader, Stat } from '../../components/ui';
import { useRepository } from '../../data/RepositoryProvider';
import { METRICS } from '../../domain/metrics';
import { baselinePhase, interventionPhase } from '../../domain/phases';
import { estimateEffect, findConfounds, mean, toPoints } from '../../domain/stats';
import type { ExperimentStatus, ISODate } from '../../domain/types';
import { useActiveExperiments, useAdherenceLogs, useExperimentDetail, useReadings } from '../../hooks/useData';
import { colors, phaseColors, spacing } from '../../theme';
import { formatMedium, formatRange, formatShort, today } from '../../utils/dates';

export default function ExperimentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, invalidate } = useRepository();
  const detail = useExperimentDetail(id);
  const logs = useAdherenceLogs(id);
  const active = useActiveExperiments();
  const e = detail.data;
  const metricIds = useMemo(() => e?.outcomeMetrics.map((m) => m.metricId) ?? [], [e]);
  const readings = useReadings(metricIds.length ? metricIds : undefined, e ? baselinePhase(e.phases)?.startDate : undefined, e?.endDate);
  const [selectedDay, setSelectedDay] = useState<ISODate | null>(null);
  const [confirm, setConfirm] = useState<ExperimentStatus | null>(null);
  const t = today();

  const logMap = useMemo(() => new Map((logs.data ?? []).map((l) => [l.date, l] as const)), [logs.data]);
  const notes = useMemo(() => (logs.data ?? []).filter((l) => l.note).sort((a, b) => (a.date < b.date ? 1 : -1)), [logs.data]);
  const adheredDates = useMemo(() => new Set((logs.data ?? []).filter((l) => l.adhered).map((l) => l.date)), [logs.data]);

  if (!e) {
    return (
      <Screen back title="Experiment">
        {detail.loading ? <ActivityIndicator color={colors.primary} /> : <AppText color="textSecondary">This experiment could not be found.</AppText>}
      </Screen>
    );
  }

  const intv = interventionPhase(e.phases)!;
  const base = baselinePhase(e.phases)!;
  const washout = e.phases.find((p) => p.type === 'washout');
  const progress = experimentProgress(e);
  const adh = adherenceRate(logs.data);
  const isActive = e.status === 'active';
  const finished = !isActive || t > e.endDate;
  const confounds = findConfounds(
    { id: e.id, startDate: e.startDate, endDate: e.endDate, metricIds },
    (active.data ?? []).map((x) => ({ id: x.id, title: x.title, startDate: x.startDate, endDate: x.endDate, metricIds: x.outcomeMetrics.map((m) => m.metricId) })),
  );
  const bands: ChartBand[] = e.phases.map((p) => ({ from: p.startDate, to: p.endDate, color: phaseColors[p.type].soft, label: p.type === 'intervention' ? undefined : phaseColors[p.type].label }));

  const setStatus = async (status: ExperimentStatus) => {
    await repo.updateExperimentStatus(e.id, status);
    setConfirm(null);
    invalidate();
  };

  const statusTone = e.status === 'active' ? 'primary' : e.status === 'completed' ? 'success' : 'neutral';
  const statusLabel = e.status === 'active' ? (progress.phase ? phaseColors[progress.phase.type].label : 'Active') : e.status === 'completed' ? 'Completed' : 'Abandoned';

  return (
    <Screen back title={e.title} subtitle={e.behaviorChange} right={<Badge label={statusLabel} tone={statusTone} />}>
      {/* Timeline */}
      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: spacing.md }}>
          <AppText variant="heading">{progress.label || `${e.designType} design`}</AppText>
          <AppText variant="caption" color="textSecondary">
            {formatRange(base.startDate, e.endDate)}
          </AppText>
        </Row>
        <PhaseTimeline phases={e.phases} />
        <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.md }}>
          Baseline is taken from data you already had before {formatShort(e.startDate)}. {washout ? 'The washout phase checks whether the effect disappears when you stop.' : ''}
        </AppText>
      </Card>

      {/* Adherence */}
      <SectionHeader title="Adherence" />
      <Card>
        <Row style={{ gap: spacing.xl, marginBottom: spacing.md }}>
          <Stat label="Done" value={adh.logged ? `${Math.round(adh.rate * 100)}%` : '–'} sub={`${adh.done} of ${adh.logged} logged days`} />
          <Stat label="Journal" value={String(notes.length)} sub="notes" />
        </Row>
        <AdherenceCalendar from={intv.startDate} to={intv.endDate} secondaryRange={washout ? { from: washout.startDate, to: washout.endDate } : undefined} logs={logMap} selected={selectedDay ?? undefined} onSelectDay={(d) => setSelectedDay((cur) => (cur === d ? null : d))} />
        <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
          Tap a day to log or edit it.{washout ? ' Amber days belong to the washout phase: the answer should be "No".' : ''}
        </AppText>
      </Card>
      {selectedDay && <CheckInCard experiment={e} date={selectedDay} log={logMap.get(selectedDay)} />}

      {/* Confounds */}
      {confounds.map((c) => (
        <InfoBox key={c.otherExperimentId} tone="warning">
          <AppText variant="caption">
            {`Overlaps ${c.overlapDays} days with “${c.otherTitle}” on ${c.sharedMetrics.map((m) => METRICS[m].shortName).join(', ')}. Changes in those metrics cannot be attributed to one behaviour alone.`}
          </AppText>
        </InfoBox>
      ))}

      {/* Outcomes */}
      <SectionHeader title={finished ? 'Results' : 'Outcomes so far'} />
      {finished && (
        <InfoBox tone="info">
          Final numbers compare intervention days against what your baseline trend and weekday pattern predicted. Illness and travel days are excluded.
        </InfoBox>
      )}
      {e.outcomeMetrics
        .slice()
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .map((om) => {
          const def = METRICS[om.metricId];
          const pts = readings.data ? toPoints(readings.data, om.metricId) : [];
          const basePts = pts.filter((p) => p.date >= base.startDate && p.date <= base.endDate);
          const baseMean = basePts.length ? mean(basePts.map((p) => p.value)) : NaN;
          const est = readings.data ? estimateEffect(readings.data, om.metricId, e.phases, { upTo: t }) : null;
          const perProtocol = readings.data && adheredDates.size > 0 && adh.done < adh.logged ? estimateEffect(readings.data, om.metricId, e.phases, { upTo: t, onlyInterventionDates: adheredDates }) : null;
          return (
            <Card key={om.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <AppText variant="heading">{def.name}</AppText>
                  <AppText variant="caption" color="textSecondary">
                    Expected to {om.expectedDirection === 'any' ? 'change' : om.expectedDirection}
                  </AppText>
                </View>
                {om.isPrimary && <Badge label="Primary" tone="primary" />}
              </Row>
              <View style={{ marginTop: spacing.md }}>
                <MetricLineChart
                  metricId={om.metricId}
                  points={pts}
                  from={base.startDate}
                  to={e.endDate}
                  bands={bands}
                  markers={[{ date: e.startDate, label: 'Start', color: colors.primary }]}
                  referenceLine={Number.isFinite(baseMean) ? { value: baseMean, label: 'baseline avg' } : undefined}
                  height={190}
                />
              </View>
              <View style={{ marginTop: spacing.sm }}>
                <Legend items={[{ color: colors.chartLine, label: '7-day avg' }, { color: colors.chartLineSoft, label: 'daily' }, { color: colors.textMuted, label: 'baseline avg', dashed: true }]} />
              </View>
              <View style={styles.effect}>{est ? <EffectSummary estimate={est} expectedDirection={om.expectedDirection} perProtocol={perProtocol} /> : null}</View>
            </Card>
          );
        })}

      {/* Journal */}
      {notes.length > 0 && (
        <>
          <SectionHeader title="Journal" />
          <Card padding={0}>
            {notes.map((n, i) => (
              <View key={n.id} style={[styles.note, i > 0 && styles.noteBorder]}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <AppText variant="caption" color="textSecondary">
                    {formatMedium(n.date)}
                  </AppText>
                  <Ionicons name={n.adhered ? 'checkmark-circle' : 'close-circle'} size={16} color={n.adhered ? colors.primary : colors.danger} />
                </Row>
                <AppText variant="body" style={{ marginTop: 2 }}>
                  {n.note}
                </AppText>
              </View>
            ))}
          </Card>
        </>
      )}

      {/* Actions */}
      {isActive && (
        <Card tone="muted">
          {confirm ? (
            <>
              <AppText variant="bodyStrong">{confirm === 'completed' ? 'Mark this experiment as completed?' : 'Abandon this experiment?'}</AppText>
              <AppText variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
                {confirm === 'completed' ? 'Check-ins stop and the current numbers become the final report.' : 'It stays in your history with the data collected so far.'}
              </AppText>
              <Row style={{ marginTop: spacing.md }}>
                <Button label="Cancel" variant="secondary" onPress={() => setConfirm(null)} style={{ flex: 1 }} />
                <Button label={confirm === 'completed' ? 'Complete' : 'Abandon'} variant={confirm === 'completed' ? 'primary' : 'danger'} onPress={() => setStatus(confirm)} style={{ flex: 1 }} />
              </Row>
            </>
          ) : (
            <Row>
              <Button label="Complete early" variant="secondary" size="sm" icon="flag-outline" onPress={() => setConfirm('completed')} />
              <Button label="Abandon" variant="ghost" size="sm" onPress={() => setConfirm('abandoned')} />
            </Row>
          )}
        </Card>
      )}
      {!isActive && (
        <Button label="Design a follow-up experiment" variant="secondary" icon="add" onPress={() => router.push('/experiment/new')} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  effect: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  note: { padding: spacing.md },
  noteBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
