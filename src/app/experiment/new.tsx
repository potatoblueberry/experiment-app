/**
 * New experiment wizard. The app provides curated protocols with fixed
 * scientific boundaries (run-in, minimum length, washout rule, primary outcome);
 * the user chooses within them: length, secondary metrics, start date.
 * "Start experiment" on the review step creates the phases from the plan.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { PhaseTimeline } from '../../components/charts';
import { ExperimentCard } from '../../components/experiments';
import { AppText, Badge, Button, Card, Chip, InfoBox, Row, Screen, SegmentedControl } from '../../components/ui';
import { useRepository } from '../../data/RepositoryProvider';
import { allowedWeeks, BEHAVIOR_PRESETS, getPreset, suggestedOutcomeMetrics } from '../../domain/behaviors';
import { METRIC_LIST, METRICS, metricProvider, PROVIDER_NAMES } from '../../domain/metrics';
import { buildPhasePlan, DEFAULT_WASHOUT_DAYS, durationExplanation, INTERVENTION_WEEK_OPTIONS, recommendBaselineDays } from '../../domain/phases';
import { ONE_ACTIVE_EXPERIMENT_MESSAGE } from '../../domain/rules';
import { findBaselineContamination } from '../../domain/stats';
import type { CreateExperimentInput, ExperimentPhase, MetricId, OutcomeMetricInput } from '../../domain/types';
import { useActiveExperiments, useExperiments, useReadings, useSources } from '../../hooks/useData';
import { colors, phaseColors, radius, spacing } from '../../theme';
import { addDays, formatRange, formatShort, today, weekdayIndex } from '../../utils/dates';

const STEPS = ['Protocol', 'Adherence', 'Outcomes', 'Duration', 'Review'];

interface Form {
  presetId: string;
  outcomeMetrics: OutcomeMetricInput[];
  weeks: number;
  withWashout: boolean;
  startDate: string;
}

export default function NewExperimentScreen() {
  const { repo, invalidate } = useRepository();
  const readings = useReadings();
  const sources = useSources();
  const active = useActiveExperiments();
  const all = useExperiments();
  const t = today();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form>({ presetId: '', outcomeMetrics: [], weeks: 6, withWashout: false, startDate: t });
  const update = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const preset = getPreset(form.presetId);
  const weekOptions = preset ? allowedWeeks(preset, INTERVENTION_WEEK_OPTIONS) : INTERVENTION_WEEK_OPTIONS;
  const metricIds = useMemo(() => form.outcomeMetrics.map((m) => m.metricId), [form.outcomeMetrics]);
  const primary = form.outcomeMetrics.find((m) => m.isPrimary);

  // Which connected source supplies each metric (null = no data would arrive).
  const providerOf = useMemo(() => {
    const list = sources.data ?? [];
    return Object.fromEntries(METRIC_LIST.map((d) => [d.id, metricProvider(d.id, list)])) as Record<MetricId, ReturnType<typeof metricProvider>>;
  }, [sources.data]);
  const noSourceAtAll = !!sources.data && METRIC_LIST.every((d) => providerOf[d.id] === null);
  const primaryHasSource = primary ? providerOf[primary.metricId] !== null : false;

  const baseline = useMemo(
    () => (readings.data ? recommendBaselineDays(readings.data, metricIds.length ? metricIds : ['hrv'], form.startDate) : null),
    [readings.data, metricIds, form.startDate],
  );

  // Cheap to rebuild each render; the React Compiler memoises it where useful.
  const plan =
    baseline && preset
      ? buildPhasePlan({
          designType: form.withWashout ? 'ABA' : 'AB',
          startDate: form.startDate,
          baselineDays: baseline.days,
          runInDays: preset.runInDays,
          interventionDays: form.weeks * 7,
          washoutDays: DEFAULT_WASHOUT_DAYS,
        })
      : [];

  const previewPhases: ExperimentPhase[] = plan.map((p, i) => ({ id: `preview-${i}`, experimentId: 'preview', ...p }));
  const intervention = plan.find((p) => p.type === 'intervention');

  const contamination = plan[0] ? findBaselineContamination({ from: plan[0].startDate, to: plan[0].endDate }, all.data ?? []) : [];

  // ---- step validity ---------------------------------------------------------
  const canContinue = step === 0 ? !!preset : step === 2 ? form.outcomeMetrics.length > 0 && !!primary : true;
  const canStart = !!baseline && !!preset && primaryHasSource && !saving;

  const chooseProtocol = (id: string) => {
    const p = getPreset(id)!;
    update({ presetId: id, outcomeMetrics: suggestedOutcomeMetrics(id), weeks: p.defaultWeeks, withWashout: p.washout !== 'optional' });
  };

  /** Secondary metrics can be toggled; the primary is fixed by the protocol; metrics without a source cannot be chosen. */
  const toggleMetric = (metricId: MetricId) => {
    if (primary?.metricId === metricId || providerOf[metricId] === null) return;
    const exists = form.outcomeMetrics.find((m) => m.metricId === metricId);
    if (exists) {
      update({ outcomeMetrics: form.outcomeMetrics.filter((m) => m.metricId !== metricId) });
      return;
    }
    const def = METRICS[metricId];
    const suggested = (preset?.suggestedMetrics ?? []).find((m) => m.metricId === metricId);
    update({
      outcomeMetrics: [
        ...form.outcomeMetrics,
        { metricId, isPrimary: false, expectedDirection: suggested?.direction ?? (def.higherIsBetter === null ? 'any' : def.higherIsBetter ? 'increase' : 'decrease') },
      ],
    });
  };

  const start = async () => {
    if (!baseline || !preset) return;
    setSaving(true);
    try {
      const input: CreateExperimentInput = {
        title: preset.title,
        behaviorChange: preset.description,
        behaviorPresetId: preset.id,
        adherenceType: 'daily_boolean',
        designType: form.withWashout ? 'ABA' : 'AB',
        startDate: form.startDate,
        baselineDays: baseline.days,
        runInDays: preset.runInDays,
        interventionDays: form.weeks * 7,
        washoutDays: DEFAULT_WASHOUT_DAYS,
        outcomeMetrics: form.outcomeMetrics,
      };
      const created = await repo.createExperiment(input);
      invalidate();
      router.replace({ pathname: '/experiment/[id]', params: { id: created.id } });
    } finally {
      setSaving(false);
    }
  };

  const nextMonday = addDays(t, (8 - weekdayIndex(t) - 1) % 7 || 7);
  const startOptions = [
    { label: 'Today', value: t },
    { label: 'Tomorrow', value: addDays(t, 1) },
    { label: `Mon ${formatShort(nextMonday).slice(4)}`, value: nextMonday },
  ];

  // ---- render ----------------------------------------------------------------
  const running = active.data?.[0];
  if (running) {
    return (
      <Screen back title="New experiment">
        <InfoBox tone="warning">{ONE_ACTIVE_EXPERIMENT_MESSAGE}</InfoBox>
        <ExperimentCard experiment={running} />
        <Button label="Open the running experiment" icon="arrow-forward" onPress={() => router.replace({ pathname: '/experiment/[id]', params: { id: running.id } })} />
        <AppText variant="caption" color="textMuted" align="center">
          Why only one? If two behaviours change in the same weeks, no analysis can say which one moved your numbers.
        </AppText>
      </Screen>
    );
  }

  return (
    <Screen
      back
      title="New experiment"
      subtitle={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}
      footer={
        <Row>
          {step > 0 && <Button label="Back" variant="secondary" onPress={() => setStep((s) => s - 1)} style={{ flex: 1 }} />}
          {step < STEPS.length - 1 ? (
            <Button label="Continue" onPress={() => setStep((s) => s + 1)} disabled={!canContinue} style={{ flex: 2 }} />
          ) : (
            <Button label="Start experiment" icon="play" onPress={start} loading={saving} disabled={!canStart} style={{ flex: 2 }} />
          )}
        </Row>
      }
    >
      <StepDots count={STEPS.length} current={step} />

      {step === 0 && (
        <>
          <AppText variant="heading">Choose an experiment</AppText>
          <AppText variant="caption" color="textSecondary" style={{ marginTop: -spacing.sm }}>
            Each protocol comes with the boundaries that make the result trustworthy. You decide how long to run it, which extra metrics to watch, and when to start.
          </AppText>
          {noSourceAtAll && (
            <InfoBox tone="warning">No wearable is connected, so no metric would receive data. Connect Oura on the Home screen first; you can still look through the protocols.</InfoBox>
          )}
          {BEHAVIOR_PRESETS.map((p) => (
            <OptionCard key={p.id} title={p.title} text={p.description} rules={p.rules} selected={form.presetId === p.id} onPress={() => chooseProtocol(p.id)} />
          ))}
          <AppText variant="caption" color="textMuted" align="center">
            More protocols are added over time. A behaviour without clear daily yes/no rules cannot be tested honestly, so there is no free-form option.
          </AppText>
        </>
      )}

      {step === 1 && (
        <>
          <AppText variant="heading">How will you track adherence?</AppText>
          <OptionCard title="Daily yes / no" text="Each evening the app asks: did you do it today? One tap, plus an optional note." selected onPress={() => undefined} badge="Available" />
          <OptionCard title="Daily count or duration" text="For example minutes of sunlight or number of coffees. Coming later." selected={false} disabled onPress={() => undefined} />
          <InfoBox>
            Adherence is what makes the analysis honest. Days you skipped are compared separately, so an experiment you only half-did does not get credit for an effect it did not earn.
          </InfoBox>
        </>
      )}

      {step === 2 && preset && (
        <>
          <AppText variant="heading">Which metrics should respond?</AppText>
          <AppText variant="caption" color="textSecondary" style={{ marginTop: -spacing.sm }}>
            {preset.rationale} The primary outcome is set by the protocol; add or remove secondary metrics as you like. Fewer is better: every extra metric adds a chance of a false positive.
          </AppText>
          <Card padding={0}>
            {METRIC_LIST.map((def, i) => {
              const sel = form.outcomeMetrics.find((m) => m.metricId === def.id);
              const provider = providerOf[def.id];
              const locked = sel?.isPrimary === true;
              const unavailable = provider === null;
              return (
                <View key={def.id} style={[styles.metricRow, i > 0 && styles.metricRowBorder, unavailable && { opacity: 0.55 }]}>
                  <Pressable
                    onPress={() => toggleMetric(def.id)}
                    disabled={locked || unavailable}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: !!sel, disabled: locked || unavailable }}
                  >
                    <Ionicons name={sel ? (locked ? 'lock-closed' : 'checkbox') : 'square-outline'} size={22} color={sel ? colors.primary : colors.textMuted} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyStrong">{def.name}</AppText>
                      <AppText variant="caption" color="textSecondary">
                        {sel ? `Expected to ${sel.expectedDirection === 'any' ? 'change' : sel.expectedDirection}` : def.description}
                      </AppText>
                    </View>
                  </Pressable>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    {locked && <Badge label="Primary" tone="primary" />}
                    <Badge label={provider ? PROVIDER_NAMES[provider] : 'No source'} tone={provider ? 'success' : 'neutral'} dot={!!provider} />
                  </View>
                </View>
              );
            })}
          </Card>
          <InfoBox>
            {`Each metric comes from exactly one data source, shown on the right. ${primary && !primaryHasSource ? `The primary outcome (${METRICS[primary.metricId].name}) has no source yet, so the experiment cannot start until a wearable is connected.` : 'The primary outcome is the one the final verdict is based on; the others are reported too, with a grain of salt.'}`}
          </InfoBox>
        </>
      )}

      {step === 3 && baseline && preset && (
        <>
          <AppText variant="heading">How long will you run it?</AppText>
          {preset.runInDays > 0 && (
            <Card tone="muted">
              <Row>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: phaseColors.run_in.fill }} />
                <AppText variant="bodyStrong">{`${preset.runInDays}-day run-in first`}</AppText>
              </Row>
              <AppText variant="caption" color="textSecondary" style={{ marginTop: spacing.xs }}>
                {preset.runInNote}
              </AppText>
            </Card>
          )}
          <Card>
            <AppText variant="label" color="textMuted">
              Intervention length
            </AppText>
            <View style={{ marginTop: spacing.sm }}>
              <SegmentedControl options={weekOptions.map((w) => ({ label: `${w} wk`, value: w }))} value={form.weeks} onChange={(weeks) => update({ weeks })} />
            </View>
            <AppText variant="caption" color="textSecondary" style={{ marginTop: spacing.md }}>
              {`${durationExplanation(form.weeks)} This protocol needs at least ${preset.minWeeks} weeks${preset.runInDays > 0 ? ', counted after the run-in' : ''}.`}
            </AppText>
            <UncertaintyBars weeks={form.weeks} options={weekOptions} />
          </Card>

          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">Add a washout phase</AppText>
                <AppText variant="caption" color="textSecondary">
                  Stop the behaviour for 2 weeks afterwards and keep measuring. If the effect fades, season and coincidence are ruled out.
                </AppText>
              </View>
              <Switch
                value={form.withWashout}
                disabled={preset.washout === 'required'}
                onValueChange={(withWashout) => update({ withWashout })}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={colors.surface}
              />
            </Row>
            {preset.washout !== 'optional' && (
              <View style={{ marginTop: spacing.sm }}>
                <Badge label={preset.washout === 'required' ? 'Required by this protocol' : 'Recommended for this behaviour'} tone="warning" />
              </View>
            )}
          </Card>

          <Card>
            <AppText variant="label" color="textMuted">
              Start date
            </AppText>
            <Row style={{ marginTop: spacing.sm, flexWrap: 'wrap' }}>
              {startOptions.map((o) => (
                <Chip key={o.value} label={o.label} selected={form.startDate === o.value} onPress={() => update({ startDate: o.value })} />
              ))}
            </Row>
            <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
              Starting on a Monday keeps whole weeks inside each phase, which makes the weekday correction cleaner.
            </AppText>
          </Card>

          <Card tone="muted">
            <Row>
              <Ionicons name="analytics-outline" size={18} color={colors.textSecondary} />
              <AppText variant="bodyStrong">Comparison window: {baseline.days / 7} weeks before start</AppText>
            </Row>
            <AppText variant="caption" color="textSecondary" style={{ marginTop: spacing.xs }}>
              {baseline.reason.replace(/^\d+ weeks\. /, '')} The window is chosen automatically from your existing data; no waiting period is needed.
            </AppText>
          </Card>
        </>
      )}

      {step === 4 && baseline && preset && (
        <>
          <AppText variant="heading">Review</AppText>
          <Card>
            <AppText variant="title">{preset.title}</AppText>
            <AppText variant="body" color="textSecondary" style={{ marginTop: 2 }}>
              {preset.description}
            </AppText>
            <View style={{ marginTop: spacing.lg }}>
              <PhaseTimeline phases={previewPhases} />
            </View>
            <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
              {plan.map((p) => (
                <Row key={p.type} style={{ justifyContent: 'space-between' }}>
                  <Row gap={6}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: phaseColors[p.type].fill }} />
                    <AppText variant="caption" style={{ fontWeight: '600' }}>
                      {phaseColors[p.type].label}
                      {p.type === 'run_in' ? ' (not counted)' : ''}
                    </AppText>
                  </Row>
                  <AppText variant="caption" color="textSecondary">
                    {formatRange(p.startDate, p.endDate)}
                  </AppText>
                </Row>
              ))}
            </View>
          </Card>

          <Card>
            <AppText variant="label" color="textMuted">
              Outcome metrics
            </AppText>
            <View style={{ marginTop: spacing.sm, gap: 6 }}>
              {form.outcomeMetrics.map((m) => {
                const provider = providerOf[m.metricId];
                return (
                  <Row key={m.metricId} style={{ justifyContent: 'space-between' }}>
                    <AppText variant="body">{METRICS[m.metricId].name}</AppText>
                    <Row gap={6}>
                      <AppText variant="caption" color="textSecondary">
                        {m.expectedDirection === 'any' ? 'any change' : m.expectedDirection}
                        {provider ? ` · ${PROVIDER_NAMES[provider]}` : ' · no source'}
                      </AppText>
                      {m.isPrimary && <Badge label="Primary" tone="primary" />}
                    </Row>
                  </Row>
                );
              })}
            </View>
            <AppText variant="label" color="textMuted" style={{ marginTop: spacing.lg }}>
              Adherence
            </AppText>
            <AppText variant="body" style={{ marginTop: 4 }}>
              Daily yes / no with optional note
            </AppText>
          </Card>

          {!primaryHasSource && <InfoBox tone="warning">The primary outcome has no connected data source. Connect a wearable on the Home screen, then come back to start.</InfoBox>}

          {contamination.length > 0 ? (
            contamination.map((c) => (
              <InfoBox key={`${c.otherExperimentId}-${c.phaseType}`} tone="warning">
                <AppText variant="caption">
                  <AppText variant="caption" style={{ fontWeight: '700' }}>
                    Baseline not clean:
                  </AppText>{' '}
                  {`${c.overlapDays} of the comparison days fall inside the ${c.phaseType} of “${c.otherTitle}” (ended ${formatShort(c.phaseEndDate)}). Those days may already carry an effect. Starting later, or shortening the comparison window, gives a cleaner baseline.`}
                </AppText>
              </InfoBox>
            ))
          ) : (
            <InfoBox tone="success">The comparison window does not overlap any earlier experiment.</InfoBox>
          )}

          <AppText variant="caption" color="textMuted" align="center">
            {`Starting creates the baseline phase from your existing data and begins daily check-ins on ${formatShort(form.startDate)}.${intervention && intervention.startDate !== form.startDate ? ` Counted intervention days begin ${formatShort(intervention.startDate)}.` : ''}`}
          </AppText>
        </>
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function StepDots({ count, current }: { count: number; current: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= current ? colors.primary : colors.border }} />
      ))}
    </View>
  );
}

function OptionCard({ title, text, rules, selected, onPress, badge, disabled }: { title: string; text: string; rules?: string[]; selected: boolean; onPress: () => void; badge?: string; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="radio" accessibilityState={{ selected, disabled }} style={({ pressed }) => [styles.option, selected && styles.optionSelected, disabled && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? colors.primary : colors.textMuted} />
      <View style={{ flex: 1, gap: 2 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText variant="bodyStrong">{title}</AppText>
          {badge && <Badge label={badge} tone={selected ? 'primary' : 'neutral'} />}
        </Row>
        <AppText variant="caption" color="textSecondary">
          {text}
        </AppText>
        {rules && rules.length > 0 && (
          <View style={{ marginTop: 6, gap: 2 }}>
            {rules.map((r) => (
              <Row key={r} gap={6} style={{ alignItems: 'flex-start' }}>
                <Ionicons name="checkmark" size={14} color={selected ? colors.primary : colors.textMuted} style={{ marginTop: 2 }} />
                <AppText variant="caption" color={selected ? 'text' : 'textMuted'} style={{ flex: 1 }}>
                  {r}
                </AppText>
              </Row>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

/** Visualises how the uncertainty band shrinks with more weeks (∝ 1/√n). */
function UncertaintyBars({ weeks, options }: { weeks: number; options: number[] }) {
  const ref = 1 / Math.sqrt(options[0] * 7);
  return (
    <View style={{ marginTop: spacing.md, gap: 6 }}>
      <AppText variant="label" color="textMuted">
        Width of the uncertainty band
      </AppText>
      {options.map((w) => {
        const rel = 1 / Math.sqrt(w * 7) / ref;
        const active = w === weeks;
        return (
          <Row key={w}>
            <AppText variant="caption" color={active ? 'text' : 'textMuted'} style={{ width: 36, fontWeight: active ? '700' : '400' }}>
              {w} wk
            </AppText>
            <View style={{ flex: 1, height: 8, backgroundColor: colors.surfaceMuted, borderRadius: 4 }}>
              <View style={{ width: `${rel * 100}%`, height: 8, borderRadius: 4, backgroundColor: active ? colors.primary : colors.chartLineSoft }} />
            </View>
            <AppText variant="caption" color={active ? 'text' : 'textMuted'} style={{ width: 40, textAlign: 'right' }}>
              {Math.round(rel * 100)}%
            </AppText>
          </Row>
        );
      })}
      <AppText variant="caption" color="textMuted">
        {`Relative to the shortest allowed trial (${options[0]} weeks). Doubling the length shrinks the band by about 30%.`}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  metricRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
