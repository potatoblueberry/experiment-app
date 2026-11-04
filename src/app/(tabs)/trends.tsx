import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { MetricLineChart, WeekdayBars, type ChartBand, type ChartFlag, type ChartMarker } from '../../components/charts';
import { AppText, Card, Chip, InfoBox, Legend, Row, Screen, SegmentedControl, Stat } from '../../components/ui';
import { formatMetricDelta, formatMetricValue, METRIC_IDS, METRICS } from '../../domain/metrics';
import { buildBaselineModel, toPoints } from '../../domain/stats';
import type { MetricId } from '../../domain/types';
import { useExperiments, useReadings } from '../../hooks/useData';
import { colors, phaseColors, spacing } from '../../theme';
import { addDays, today } from '../../utils/dates';

const RANGES = [
  { label: '1M', value: 30 },
  { label: '3M', value: 91 },
  { label: '6M', value: 182 },
  { label: '1Y', value: 365 },
];

export default function TrendsScreen() {
  const params = useLocalSearchParams<{ metric?: string }>();
  const [metricId, setMetricId] = useState<MetricId>('hrv');
  const [rangeDays, setRangeDays] = useState(91);
  const [showRaw, setShowRaw] = useState(true);
  const [showRolling, setShowRolling] = useState(true);

  // When Home deep-links to a metric, adopt it once per param change (React's "adjust state while rendering" pattern).
  const [seenParam, setSeenParam] = useState(params.metric);
  if (params.metric !== seenParam) {
    setSeenParam(params.metric);
    if (params.metric && METRIC_IDS.includes(params.metric as MetricId)) setMetricId(params.metric as MetricId);
  }

  const readings = useReadings([metricId]);
  const experiments = useExperiments();
  const def = METRICS[metricId];
  const t = today();
  const from = addDays(t, -(rangeDays - 1));

  const points = useMemo(() => (readings.data ? toPoints(readings.data, metricId) : []), [readings.data, metricId]);
  const model = useMemo(() => (readings.data ? buildBaselineModel(readings.data, metricId) : null), [readings.data, metricId]);
  const flagged = useMemo<ChartFlag[]>(() => (readings.data ?? []).filter((r) => r.flags.length > 0).map((r) => ({ date: r.date, flags: r.flags })), [readings.data]);

  const { bands, markers } = useMemo(() => {
    const bands: ChartBand[] = [];
    const markers: ChartMarker[] = [];
    for (const e of experiments.data ?? []) {
      if (!e.outcomeMetrics.some((m) => m.metricId === metricId)) continue;
      for (const p of e.phases) {
        if (p.type === 'baseline') continue;
        bands.push({ from: p.startDate, to: p.endDate, color: phaseColors[p.type].soft, label: p.type === 'intervention' ? e.title : 'Washout' });
      }
      markers.push({ date: e.startDate, label: '', color: colors.primary });
    }
    return { bands, markers };
  }, [experiments.data, metricId]);

  const recent = model ? model.mean + model.recentDelta : NaN;
  const goodDelta = model && def.higherIsBetter !== null ? (def.higherIsBetter ? model.recentDelta >= 0 : model.recentDelta <= 0) : null;

  return (
    <Screen title="Trends" subtitle="One metric at a time, with the 7-day average smoothing out night-to-night noise.">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }} style={{ marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg }}>
        {METRIC_IDS.map((id) => (
          <Chip key={id} label={METRICS[id].shortName} selected={id === metricId} onPress={() => setMetricId(id)} />
        ))}
        <View style={{ width: spacing.lg }} />
      </ScrollView>

      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <AppText variant="heading">{def.name}</AppText>
            <AppText variant="caption" color="textSecondary">
              {def.description}
            </AppText>
          </View>
        </Row>
        <Row style={{ marginTop: spacing.md, gap: spacing.xl }}>
          <Stat label="7-day avg" value={Number.isFinite(recent) ? formatMetricValue(metricId, recent) : '–'} />
          {model && (
            <Stat label="vs. baseline" value={formatMetricDelta(metricId, model.recentDelta)} sub={goodDelta === null ? 'neutral' : goodDelta ? 'favourable' : 'unfavourable'} />
          )}
        </Row>
        <View style={{ marginTop: spacing.md }}>
          <SegmentedControl options={RANGES} value={rangeDays} onChange={setRangeDays} />
        </View>
        <View style={{ marginTop: spacing.md }}>
          <MetricLineChart
            metricId={metricId}
            points={points}
            from={from}
            to={t}
            showRaw={showRaw}
            showRolling={showRolling}
            bands={bands}
            markers={markers}
            flagged={flagged}
            referenceLine={model && Number.isFinite(model.mean) ? { value: model.mean, label: 'year avg' } : undefined}
            height={220}
          />
        </View>
        <Row style={{ marginTop: spacing.sm, justifyContent: 'space-between' }}>
          <Legend items={[{ color: colors.chartLine, label: '7-day average' }, { color: colors.chartLineSoft, label: 'daily' }, { color: colors.textMuted, label: 'year avg', dashed: true }, { color: colors.accent, label: 'flagged day' }]} />
        </Row>
        <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.xs }}>
          Hover or drag across the chart to read single days.
        </AppText>
        <Row style={{ marginTop: spacing.sm }}>
          <Chip label="Daily" selected={showRaw} tone="neutral" onPress={() => setShowRaw((v) => (v && showRolling ? false : true))} />
          <Chip label="7-day avg" selected={showRolling} tone="neutral" onPress={() => setShowRolling((v) => (v && showRaw ? false : true))} />
        </Row>
        {bands.length > 0 && (
          <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
            Shaded areas are intervention phases of experiments that track this metric.
          </AppText>
        )}
      </Card>

      {model && model.n > 0 && (
        <Card>
          <AppText variant="heading">Your personal baseline</AppText>
          <AppText variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
            Built from all {model.n} days of history. Experiments are judged against this, not against population averages.
          </AppText>
          <View style={styles.grid}>
            <Stat label="Typical" value={formatMetricValue(metricId, model.median)} sub="median" style={styles.gridCell} />
            <Stat label="Usual range" value={`${formatMetricValue(metricId, model.p10, false)}–${formatMetricValue(metricId, model.p90, false)}`} sub="10th–90th percentile" style={styles.gridCell} />
            <Stat label="Night-to-night noise" value={`±${formatMetricValue(metricId, model.sd)}`} sub="standard deviation" style={styles.gridCell} />
            <Stat
              label="Trend"
              value={`${formatMetricDelta(metricId, model.trendPer30Days)}`}
              sub="per month, over the year"
              style={styles.gridCell}
            />
          </View>
          <AppText variant="label" color="textMuted" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
            Weekday pattern
          </AppText>
          <WeekdayBars metricId={metricId} effects={model.weekdayEffects} />
          <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
            Difference from your average on each weekday. The experiment analysis corrects for this so a weekend lie-in is not mistaken for an effect.
          </AppText>
          <View style={{ marginTop: spacing.md }}>
            <InfoBox tone={model.flaggedDays > 0 ? 'warning' : 'info'}>
              {`${Math.round(model.coverage * 100)}% of days have a reading. ${model.flaggedDays} days are flagged (illness or travel) and are excluded from baseline statistics.`}
            </InfoBox>
          </View>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md, rowGap: spacing.lg },
  gridCell: { width: '50%' },
});
