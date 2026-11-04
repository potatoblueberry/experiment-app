import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { CheckInCard, ExperimentCard, SourceCard } from '../../components/experiments';
import { AppText, Button, Card, EmptyState, InfoBox, Row, Screen, SectionHeader } from '../../components/ui';
import { useRepository } from '../../data/RepositoryProvider';
import { formatMetricDelta, formatMetricValue, METRICS } from '../../domain/metrics';
import { buildBaselineModel } from '../../domain/stats';
import type { MetricId } from '../../domain/types';
import { experimentsNeedingCheckIn, useActiveExperiments, useAdherenceIndex, useAllAdherenceLogs, useReadings, useSources } from '../../hooks/useData';
import { colors, spacing } from '../../theme';
import { formatMedium, today } from '../../utils/dates';

const SNAPSHOT_METRICS: MetricId[] = ['hrv', 'sleep_duration', 'resting_hr'];

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const t = today();
  const { repo, invalidate } = useRepository();
  const auth = useAuth();
  const cloud = auth.status === 'signed_in';
  const sources = useSources();
  const readings = useReadings();
  const experiments = useActiveExperiments();
  const logs = useAllAdherenceLogs();
  const logIndex = useAdherenceIndex(logs.data);
  const [resetting, setResetting] = useState(false);
  const [confirmLoad, setConfirmLoad] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const readingDays = useMemo(() => new Set((readings.data ?? []).map((r) => r.date)).size, [readings.data]);
  const dueToday = useMemo(() => experimentsNeedingCheckIn(experiments.data, t), [experiments.data, t]);
  const pending = dueToday.filter((e) => !logIndex.get(e.id)?.get(t));

  const snapshot = useMemo(() => {
    if (!readings.data) return [];
    return SNAPSHOT_METRICS.map((id) => ({ id, model: buildBaselineModel(readings.data!, id) }));
  }, [readings.data]);

  const reset = async () => {
    setResetting(true);
    setResetError(null);
    setConfirmLoad(false);
    try {
      await repo.resetToSeed();
      invalidate();
    } catch (e) {
      setResetError(e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  };

  return (
    <Screen title={greeting()} subtitle={formatMedium(t)}>
      {/* Today's check-in */}
      <SectionHeader title="Today's check-in" />
      {experiments.loading && !experiments.data ? null : dueToday.length === 0 ? (
        <Card tone="muted">
          <AppText variant="body" color="textSecondary">
            No experiment needs a check-in today. Start one to begin the daily loop.
          </AppText>
        </Card>
      ) : pending.length === 0 ? (
        <Card tone="primary">
          <Row>
            <Ionicons name="checkmark-circle" size={22} color={colors.primaryText} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" color="primaryText">
                All logged for today
              </AppText>
              <AppText variant="caption" color="primaryText">
                {dueToday.length === 1 ? '1 experiment' : `${dueToday.length} experiments`} checked in. You can edit notes in the Check-in tab.
              </AppText>
            </View>
          </Row>
        </Card>
      ) : (
        pending.map((e) => <CheckInCard key={e.id} experiment={e} date={t} log={logIndex.get(e.id)?.get(t)} />)
      )}

      {/* Active experiments */}
      <SectionHeader
        title="Active experiments"
        action={
          <Pressable onPress={() => router.push('/experiment/new')} hitSlop={8} accessibilityRole="button">
            <Row gap={4}>
              <Ionicons name="add-circle" size={18} color={colors.primary} />
              <AppText variant="caption" color="primaryText" style={{ fontWeight: '600' }}>
                New
              </AppText>
            </Row>
          </Pressable>
        }
      />
      {experiments.data && experiments.data.length === 0 ? (
        <Card>
          <EmptyState icon="flask-outline" title="No active experiments" text="Pick one behaviour change, and the app will set up a proper baseline and intervention phase around it." actionLabel="Design an experiment" onAction={() => router.push('/experiment/new')} />
        </Card>
      ) : (
        experiments.data?.map((e) => <ExperimentCard key={e.id} experiment={e} logs={logs.data?.filter((l) => l.experimentId === e.id)} />)
      )}

      {/* Baseline snapshot */}
      <SectionHeader
        title="Your baseline"
        action={
          <Pressable onPress={() => router.push('/trends')} hitSlop={8} accessibilityRole="button">
            <AppText variant="caption" color="primaryText" style={{ fontWeight: '600' }}>
              Trends →
            </AppText>
          </Pressable>
        }
      />
      {readings.data && readingDays === 0 ? (
        <Card tone="muted">
          <AppText variant="body" color="textSecondary">
            No readings yet. Your personal baseline appears here once a wearable has synced or demo data is loaded.
          </AppText>
        </Card>
      ) : (
        <Card padding={0}>
          <View style={styles.snapshotRow}>
            {snapshot.map(({ id, model }, i) => {
              const def = METRICS[id];
              const good = def.higherIsBetter === null ? null : def.higherIsBetter ? model.recentDelta >= 0 : model.recentDelta <= 0;
              return (
                <Pressable key={id} onPress={() => router.push({ pathname: '/trends', params: { metric: id } })} style={[styles.snapshotCell, i > 0 && styles.snapshotBorder]}>
                  <AppText variant="label" color="textMuted">
                    {def.shortName}
                  </AppText>
                  <AppText variant="stat" style={{ fontSize: 20, lineHeight: 24 }}>
                    {Number.isFinite(model.mean) ? formatMetricValue(id, model.mean + model.recentDelta, false) : '–'}
                  </AppText>
                  <AppText variant="caption" color={good === null ? 'textSecondary' : good ? 'success' : 'accent'} style={{ fontSize: 12 }}>
                    {formatMetricDelta(id, model.recentDelta)} vs. year
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.snapshotFoot}>
            <AppText variant="caption" color="textSecondary">
              7-day average compared with your {readingDays}-day personal baseline.
            </AppText>
          </View>
        </Card>
      )}

      {/* Sources */}
      <SectionHeader title="Data sources" />
      {sources.data?.map((s) => (
        <SourceCard key={s.id} source={s} readingDays={readingDays} />
      ))}
      {sources.data && sources.data.length === 0 && (
        <Card tone="muted">
          <AppText variant="body" color="textSecondary">
            No wearable connected yet. Connecting an Oura ring is the next step; until then you can load the demo data set below.
          </AppText>
        </Card>
      )}
      {cloud ? (
        <InfoBox>Your data is stored in your own account and only you can read it. Oura sync is not connected yet.</InfoBox>
      ) : (
        <InfoBox>Demo mode: generated data that imitates a year of Oura readings, stored only on this device.</InfoBox>
      )}

      {/* Account */}
      <Card padding={14}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">{cloud ? 'Signed in' : 'Demo mode'}</AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {cloud ? auth.user?.email : auth.configured ? 'Sign in to keep your data in your account.' : 'Add Supabase keys to .env to enable accounts.'}
            </AppText>
          </View>
          {cloud ? (
            <Button label="Sign out" variant="ghost" size="sm" icon="log-out-outline" onPress={() => auth.signOut()} />
          ) : auth.configured ? (
            <Button label="Sign in" variant="secondary" size="sm" icon="log-in-outline" onPress={() => auth.leaveDemo()} />
          ) : null}
        </Row>
      </Card>

      {resetError && <InfoBox tone="warning">{`Could not load demo data: ${resetError}`}</InfoBox>}
      {confirmLoad ? (
        <Card tone="warning">
          <AppText variant="bodyStrong">Replace everything in your account with the demo data set?</AppText>
          <AppText variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
            All your experiments, check-ins and readings are deleted first. This cannot be undone.
          </AppText>
          <Row style={{ marginTop: spacing.md }}>
            <Button label="Cancel" variant="secondary" size="sm" onPress={() => setConfirmLoad(false)} style={{ flex: 1 }} />
            <Button label="Load demo data" variant="danger" size="sm" onPress={reset} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : (
        <View style={{ alignItems: 'center', marginTop: spacing.sm }}>
          <Button
            label={resetting ? (cloud ? 'Loading…' : 'Resetting…') : cloud ? 'Load demo data into my account' : 'Reset demo data'}
            variant="ghost"
            size="sm"
            icon="refresh"
            onPress={cloud ? () => setConfirmLoad(true) : reset}
            disabled={resetting}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  snapshotRow: { flexDirection: 'row' },
  snapshotCell: { flex: 1, padding: spacing.md, gap: 2 },
  snapshotBorder: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
  snapshotFoot: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, paddingTop: 2 },
});
