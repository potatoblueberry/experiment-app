/**
 * New Experiment wizard. Five steps held in local state; nothing is saved until
 * "Start experiment" on the review step.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { PhaseTimeline } from '../../components/charts';
import { ExperimentCard } from '../../components/experiments';
import { AppText, Badge, Button, Card, Chip, InfoBox, Row, Screen, SegmentedControl } from '../../components/ui';
import { useRepository } from '../../data/RepositoryProvider';
import { BEHAVIOR_PRESETS, CUSTOM_PRESET_ID, getPreset, suggestedOutcomeMetrics } from '../../domain/behaviors';
import { METRIC_LIST, METRICS } from '../../domain/metrics';
import { buildPhasePlan, DEFAULT_INTERVENTION_WEEKS, DEFAULT_WASHOUT_DAYS, durationExplanation, INTERVENTION_WEEK_OPTIONS, recommendBaselineDays } from '../../domain/phases';
import { ONE_ACTIVE_EXPERIMENT_MESSAGE } from '../../domain/rules';
import { findBaselineContamination } from '../../domain/stats';
import type { CreateExperimentInput, ExperimentPhase, MetricId, OutcomeMetricInput } from '../../domain/types';
import { useActiveExperiments, useExperiments, useReadings } from '../../hooks/useData';
import { colors, phaseColors, radius, spacing } from '../../theme';
import { addDays, formatRange, formatShort, today, weekdayIndex } from '../../utils/dates';

const STEPS = ['Behaviour', 'Adherence', 'Outcomes', 'Duration', 'Review'];

interface Form {
  presetId: string;
  title: string;
  behaviorChange: string;
  outcomeMetrics: OutcomeMetricInput[];
  weeks: number;
  withWashout: boolean;
  startDate: string;
}

export default function NewExperimentScreen() {
  const { repo, invalidate } = useRepository();
  const readings = useReadings();
  const active = useActiveExperiments();
  const all = useExperiments();
  const t = today();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form>({
    presetId: '',
    title: '',
    behaviorChange: '',
    outcomeMetrics: [],
    weeks: DEFAULT_INTERVENTION_WEEKS,
    withWashout: false,
    startDate: t,
  });
  const update = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const preset = getPreset(form.presetId);
  const isCustom = form.presetId === CUSTOM_PRESET_ID;
  const metricIds = useMemo(() => form.outcomeMetrics.map((m) => m.metricId), [form.outcomeMetrics]);

  const baseline = useMemo(
    () => (readings.data ? recommendBaselineDays(readings.data, metricIds.length ? metricIds : ['hrv'], form.startDate) : null),
    [readings.data, metricIds, form.startDate],
  );

  const plan = useMemo(() => {
    if (!baseline) return [];
    return buildPhasePlan({
      designType: form.withWashout ? 'ABA' : 'AB',
      startDate: form.startDate,
      baselineDays: baseline.days,
      interventionDays: form.weeks * 7,
      washoutDays: DEFAULT_WASHOUT_DAYS,
    });
  }, [baseline, form.withWashout, form.startDate, form.weeks]);

  const previewPhases: ExperimentPhase[] = plan.map((p, i) => ({ id: `preview-${i}`, experimentId: 'preview', ...p }));

  const contamination = useMemo(() => {
    const base = plan[0];
    if (!base) return [];
    return findBaselineContamination({ from: base.startDate, to: base.endDate }, all.data ?? []);
  }, [plan, all.data]);

  // ---- step validity ---------------------------------------------------------
  const canContinue =
    step === 0 ? form.title.trim().length > 0 && form.behaviorChange.trim().length > 0 : step === 2 ? form.outcomeMetrics.length > 0 && form.outcomeMetrics.some((m) => m.isPrimary) : true;

  const choosePreset = (id: string) => {
    if (id === CUSTOM_PRESET_ID) {
      update({ presetId: id, title: form.presetId === CUSTOM_PRESET_ID ? form.title : '', behaviorChange: form.presetId === CUSTOM_PRESET_ID ? form.behaviorChange : '', outcomeMetrics: suggestedOutcomeMetrics(null), withWashout: false });
    } else {
      const p = getPreset(id)!;
      update({ presetId: id, title: p.title, behaviorChange: p.description, outcomeMetrics: suggestedOutcomeMetrics(id), withWashout: p.carryOver });
    }
  };

  const toggleMetric = (metricId: MetricId) => {
    const exists = form.outcomeMetrics.find((m) => m.metricId === metricId);
    let next: OutcomeMetricInput[];
    if (exists) {
      next = form.outcomeMetrics.filter((m) => m.metricId !== metricId);
      if (exists.isPrimary && next.length) next[0] = { ...next[0], isPrimary: true };
    } else {
      const def = METRICS[metricId];
      const suggested = (preset?.suggestedMetrics ?? []).find((m) => m.metricId === metricId);
      next = [
        ...form.outcomeMetrics,
        { metricId, isPrimary: form.outcomeMetrics.length === 0, expectedDirection: suggested?.direction ?? (def.higherIsBetter === null ? 'any' : def.higherIsBetter ? 'increase' : 'decrease') },
      ];
    }
    update({ outcomeMetrics: next });
  };

  const makePrimary = (metricId: MetricId) => update({ outcomeMetrics: form.outcomeMetrics.map((m) => ({ ...m, isPrimary: m.metricId === metricId })) });

  const start = async () => {
    if (!baseline) return;
    setSaving(true);
    try {
      const input: CreateExperimentInput = {
        title: form.title.trim(),
        behaviorChange: form.behaviorChange.trim(),
        behaviorPresetId: isCustom ? null : form.presetId,
        adherenceType: 'daily_boolean',
        designType: form.withWashout ? 'ABA' : 'AB',
        startDate: form.startDate,
        baselineDays: baseline.days,
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
            <Button label="Start experiment" icon="play" onPress={start} loading={saving} disabled={!baseline} style={{ flex: 2 }} />
          )}
        </Row>
      }
    >
      <StepDots count={STEPS.length} current={step} />

      {step === 0 && (
        <>
          <AppText variant="heading">What do you want to test?</AppText>
          <AppText variant="caption" color="textSecondary" style={{ marginTop: -spacing.sm }}>
            One behaviour change at a time. The app tracks whether you did it each day and what your body did in response.
          </AppText>
          {BEHAVIOR_PRESETS.map((p) => (
            <OptionCard key={p.id} title={p.title} text={p.description} selected={form.presetId === p.id} onPress={() => choosePreset(p.id)} badge={p.carryOver ? 'Washout advised' : undefined} />
          ))}
          <OptionCard title="Something else" text="Describe your own behaviour change." selected={isCustom} onPress={() => choosePreset(CUSTOM_PRESET_ID)} />
          {isCustom && (
            <Card>
              <AppText variant="label" color="textMuted">
                Short name
              </AppText>
              <TextInput value={form.title} onChangeText={(v) => update({ title: v })} placeholder="e.g. Cold shower" placeholderTextColor={colors.textMuted} style={styles.input} />
              <AppText variant="label" color="textMuted" style={{ marginTop: spacing.md }}>
                What exactly will you do each day?
              </AppText>
              <TextInput
                value={form.behaviorChange}
                onChangeText={(v) => update({ behaviorChange: v })}
                placeholder="Be specific enough that a yes/no answer each day is obvious."
                placeholderTextColor={colors.textMuted}
                multiline
                style={[styles.input, { minHeight: 72 }]}
              />
            </Card>
          )}
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

      {step === 2 && (
        <>
          <AppText variant="heading">Which metrics should respond?</AppText>
          <AppText variant="caption" color="textSecondary" style={{ marginTop: -spacing.sm }}>
            {preset?.rationale ?? 'Pick the metrics you expect to move. Fewer is better: every extra metric adds a chance of a false positive.'}
          </AppText>
          <Card padding={0}>
            {METRIC_LIST.map((def, i) => {
              const sel = form.outcomeMetrics.find((m) => m.metricId === def.id);
              return (
                <View key={def.id} style={[styles.metricRow, i > 0 && styles.metricRowBorder]}>
                  <Pressable onPress={() => toggleMetric(def.id)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }} accessibilityRole="checkbox" accessibilityState={{ checked: !!sel }}>
                    <Ionicons name={sel ? 'checkbox' : 'square-outline'} size={22} color={sel ? colors.primary : colors.textMuted} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyStrong">{def.name}</AppText>
                      <AppText variant="caption" color="textSecondary">
                        {sel ? `Expected to ${sel.expectedDirection === 'any' ? 'change' : sel.expectedDirection}` : def.description}
                      </AppText>
                    </View>
                  </Pressable>
                  {sel && (
                    <Pressable onPress={() => makePrimary(def.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={sel.isPrimary ? 'Primary outcome' : 'Make primary'}>
                      {sel.isPrimary ? <Badge label="Primary" tone="primary" /> : <Ionicons name="star-outline" size={20} color={colors.textMuted} />}
                    </Pressable>
                  )}
                </View>
              );
            })}
          </Card>
          <InfoBox>The primary outcome is the one the final verdict is based on. The others are reported too, but with a grain of salt.</InfoBox>
        </>
      )}

      {step === 3 && baseline && (
        <>
          <AppText variant="heading">How long will you run it?</AppText>
          <Card>
            <AppText variant="label" color="textMuted">
              Intervention length
            </AppText>
            <View style={{ marginTop: spacing.sm }}>
              <SegmentedControl options={INTERVENTION_WEEK_OPTIONS.map((w) => ({ label: `${w} wk`, value: w }))} value={form.weeks} onChange={(weeks) => update({ weeks })} />
            </View>
            <AppText variant="caption" color="textSecondary" style={{ marginTop: spacing.md }}>
              {durationExplanation(form.weeks)}
            </AppText>
            <UncertaintyBars weeks={form.weeks} />
          </Card>

          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">Add a washout phase</AppText>
                <AppText variant="caption" color="textSecondary">
                  Stop the behaviour for 2 weeks afterwards and keep measuring. If the effect fades, season and coincidence are ruled out.
                </AppText>
              </View>
              <Switch value={form.withWashout} onValueChange={(withWashout) => update({ withWashout })} trackColor={{ true: colors.primary, false: colors.border }} thumbColor={colors.surface} />
            </Row>
            {preset?.carryOver && (
              <View style={{ marginTop: spacing.sm }}>
                <Badge label="Recommended for this behaviour" tone="warning" />
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

      {step === 4 && baseline && (
        <>
          <AppText variant="heading">Review</AppText>
          <Card>
            <AppText variant="title">{form.title}</AppText>
            <AppText variant="body" color="textSecondary" style={{ marginTop: 2 }}>
              {form.behaviorChange}
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
              {form.outcomeMetrics.map((m) => (
                <Row key={m.metricId} style={{ justifyContent: 'space-between' }}>
                  <AppText variant="body">{METRICS[m.metricId].name}</AppText>
                  <Row gap={6}>
                    <AppText variant="caption" color="textSecondary">
                      {m.expectedDirection === 'any' ? 'any change' : m.expectedDirection}
                    </AppText>
                    {m.isPrimary && <Badge label="Primary" tone="primary" />}
                  </Row>
                </Row>
              ))}
            </View>
            <AppText variant="label" color="textMuted" style={{ marginTop: spacing.lg }}>
              Adherence
            </AppText>
            <AppText variant="body" style={{ marginTop: 4 }}>
              Daily yes / no with optional note
            </AppText>
          </Card>

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
            Starting creates the baseline phase from your existing data and begins daily check-ins on {formatShort(form.startDate)}.
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

function OptionCard({ title, text, selected, onPress, badge, disabled }: { title: string; text: string; selected: boolean; onPress: () => void; badge?: string; disabled?: boolean }) {
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
      </View>
    </Pressable>
  );
}

/** Visualises how the uncertainty band shrinks with more weeks (∝ 1/√n). */
function UncertaintyBars({ weeks }: { weeks: number }) {
  const ref = 1 / Math.sqrt(2 * 7);
  return (
    <View style={{ marginTop: spacing.md, gap: 6 }}>
      <AppText variant="label" color="textMuted">
        Width of the uncertainty band
      </AppText>
      {INTERVENTION_WEEK_OPTIONS.map((w) => {
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
        Relative to a 2-week trial. Doubling the length shrinks the band by about 30%, which is why 6 weeks is the default.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  input: { marginTop: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 15, color: colors.text, backgroundColor: colors.background, textAlignVertical: 'top' },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  metricRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
