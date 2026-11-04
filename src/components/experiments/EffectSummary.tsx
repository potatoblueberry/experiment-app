/**
 * Plain-language readout of an EffectEstimate: the adjusted effect, its
 * uncertainty band, and an honest one-line verdict. Optionally also shows the
 * "per-protocol" estimate that only counts days the behaviour was actually done.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { formatMetricDelta, formatMetricValue, METRICS } from '../../domain/metrics';
import type { EffectEstimate } from '../../domain/stats';
import type { ExpectedDirection } from '../../domain/types';
import { AppText, Badge } from '../ui';

interface Props {
  estimate: EffectEstimate;
  expectedDirection: ExpectedDirection;
  /** Same estimate restricted to adhered days. Shown when it differs from the main one. */
  perProtocol?: EffectEstimate | null;
}

function verdictFor(e: EffectEstimate, expectedDirection: ExpectedDirection) {
  const eff = e.adjustedEffect;
  const favourable = expectedDirection === 'any' ? null : expectedDirection === 'increase' ? eff > 0 : eff < 0;
  const tone = e.verdict === 'likely_effect' ? (favourable === false ? 'warning' : 'success') : 'neutral';
  const label = e.verdict === 'likely_effect' ? (favourable === false ? 'Opposite effect' : 'Likely effect') : 'No clear effect';
  return { tone, label } as const;
}

export function EffectSummary({ estimate, expectedDirection, perProtocol }: Props) {
  const def = METRICS[estimate.metricId];
  if (estimate.verdict === 'insufficient' || Number.isNaN(estimate.adjustedEffect)) {
    return (
      <View style={styles.row}>
        <Badge label="Too early" tone="neutral" />
        <AppText variant="caption" color="textSecondary" style={{ flex: 1 }}>
          {estimate.interventionN} intervention days so far. A first estimate appears after 14 days; trust it after 4 weeks.
        </AppText>
      </View>
    );
  }
  const { tone, label } = verdictFor(estimate, expectedDirection);
  const showPerProtocol = perProtocol && perProtocol.verdict !== 'insufficient' && !Number.isNaN(perProtocol.adjustedEffect) && perProtocol.interventionN < estimate.interventionN;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.row}>
        <Badge label={label} tone={tone} />
        <AppText variant="bodyStrong" style={{ flex: 1 }}>
          {formatMetricDelta(estimate.metricId, estimate.adjustedEffect)}{' '}
          <AppText variant="caption" color="textSecondary">
            ± {formatMetricValue(estimate.metricId, estimate.ci95, true)}
          </AppText>
        </AppText>
      </View>
      <AppText variant="caption" color="textSecondary">
        Intervention days vs. what your baseline trend and weekday pattern predicted for the same days. Raw difference of averages:{' '}
        {formatMetricDelta(estimate.metricId, estimate.rawDiff)} ({estimate.baselineN} baseline, {estimate.interventionN} intervention days). Unit: {def.unit || 'score'}.
      </AppText>
      {showPerProtocol && perProtocol && (
        <AppText variant="caption" color="textSecondary">
          <AppText variant="caption" style={{ fontWeight: '700' }}>
            Only the {perProtocol.interventionN} days you did it:
          </AppText>{' '}
          {formatMetricDelta(perProtocol.metricId, perProtocol.adjustedEffect)} ± {formatMetricValue(perProtocol.metricId, perProtocol.ci95, true)}. If this is clearly larger than the number above, missed days are diluting the result.
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
