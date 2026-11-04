import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable } from 'react-native';

import { ExperimentCard } from '../../components/experiments';
import { ONE_ACTIVE_EXPERIMENT_MESSAGE } from '../../domain/rules';
import { AppText, Button, Card, EmptyState, Screen, SectionHeader } from '../../components/ui';
import { useAllAdherenceLogs, useExperiments } from '../../hooks/useData';
import { colors } from '../../theme';

export default function ExperimentsScreen() {
  const experiments = useExperiments();
  const logs = useAllAdherenceLogs();
  const active = experiments.data?.filter((e) => e.status === 'active') ?? [];
  const past = experiments.data?.filter((e) => e.status !== 'active') ?? [];

  return (
    <Screen
      title="Experiments"
      right={
        active.length === 0 ? (
          <Pressable onPress={() => router.push('/experiment/new')} hitSlop={8} accessibilityRole="button" accessibilityLabel="New experiment">
            <Ionicons name="add-circle" size={32} color={colors.primary} />
          </Pressable>
        ) : undefined
      }
    >
      {experiments.data && experiments.data.length === 0 && (
        <Card>
          <EmptyState icon="flask-outline" title="No experiments yet" text="Each experiment tests one behaviour change against your own baseline." actionLabel="Design your first" onAction={() => router.push('/experiment/new')} />
        </Card>
      )}

      {active.length > 0 && (
        <>
          <SectionHeader title="Running now" />
          {active.map((e) => (
            <ExperimentCard key={e.id} experiment={e} logs={logs.data?.filter((l) => l.experimentId === e.id)} />
          ))}
        </>
      )}

      {past.length > 0 && (
        <>
          <SectionHeader title="Finished" />
          {past.map((e) => (
            <ExperimentCard key={e.id} experiment={e} logs={logs.data?.filter((l) => l.experimentId === e.id)} />
          ))}
        </>
      )}

      {experiments.data && experiments.data.length > 0 && active.length === 0 && (
        <Button label="New experiment" icon="add" onPress={() => router.push('/experiment/new')} variant="secondary" />
      )}
      {active.length > 0 && (
        <AppText variant="caption" color="textMuted" align="center">
          {ONE_ACTIVE_EXPERIMENT_MESSAGE}
        </AppText>
      )}
    </Screen>
  );
}
