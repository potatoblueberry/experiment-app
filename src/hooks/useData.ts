/**
 * Thin, named hooks over the repository so screens read like prose:
 *   const { data: experiments } = useActiveExperiments();
 */
import { useMemo } from 'react';

import { useRepoQuery } from '../data/RepositoryProvider';
import type { AdherenceLog, ExperimentDetail, ExperimentStatus, ISODate, MetricId, UUID } from '../domain/types';

export function useSources() {
  return useRepoQuery((repo) => repo.getSources(), []);
}

export function useReadings(metricIds?: MetricId[], from?: ISODate, to?: ISODate) {
  const key = metricIds?.join(',') ?? '*';
  return useRepoQuery((repo) => repo.getReadings({ metricIds, from, to }), [key, from, to]);
}

export function useExperiments(status?: ExperimentStatus[]) {
  const key = status?.join(',') ?? '*';
  return useRepoQuery((repo) => repo.listExperimentDetails(status ? { status } : undefined), [key]);
}

export function useActiveExperiments() {
  return useExperiments(['active']);
}

export function useExperimentDetail(id: UUID | undefined) {
  return useRepoQuery(async (repo) => (id ? repo.getExperiment(id) : null), [id]);
}

export function useAdherenceLogs(experimentId: UUID | undefined) {
  return useRepoQuery(async (repo) => (experimentId ? repo.getAdherenceLogs(experimentId) : []), [experimentId]);
}

export function useAllAdherenceLogs() {
  return useRepoQuery((repo) => repo.getAllAdherenceLogs(), []);
}

/** Map experimentId -> date -> log, handy for calendars and check-in. */
export function useAdherenceIndex(logs: AdherenceLog[] | undefined) {
  return useMemo(() => {
    const idx = new Map<UUID, Map<ISODate, AdherenceLog>>();
    for (const l of logs ?? []) {
      if (!idx.has(l.experimentId)) idx.set(l.experimentId, new Map());
      idx.get(l.experimentId)!.set(l.date, l);
    }
    return idx;
  }, [logs]);
}

/** Experiments whose intervention (or washout) phase covers `date`, i.e. ones that need a check-in. */
export function experimentsNeedingCheckIn(experiments: ExperimentDetail[] | undefined, date: ISODate): ExperimentDetail[] {
  return (experiments ?? []).filter((e) =>
    e.status === 'active' && e.phases.some((p) => p.type !== 'baseline' && date >= p.startDate && date <= p.endDate),
  );
}
