/**
 * Data-source section for a signed-in account: lists connections, offers
 * "Connect Oura" or "Sync now", and runs the first import automatically when
 * the browser comes back from Oura with ?oura=connected.
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useRepository } from '../../data/RepositoryProvider';
import type { DataSourceConnection } from '../../domain/types';
import { startOuraConnect, syncOura } from '../../lib/oura';
import { spacing } from '../../theme';
import { formatShort } from '../../utils/dates';
import { SourceCard } from '../experiments';
import { AppText, Button, Card, InfoBox, Row } from '../ui';

interface Job {
  key: string;
  status: 'running' | 'done' | 'failed';
  message?: string;
  /** Readings imported so far across the calls of this job. */
  imported: number;
  /** How many calls this job has made; each call imports as much as fits its time budget. */
  calls: number;
}

/** Safety stop: 40 calls × up to ~15 months each is far more history than any ring has. */
const MAX_CALLS = 40;

function reasonText(reason?: string): string {
  switch (reason) {
    case 'access_denied':
      return 'You cancelled on the Oura page. Nothing was connected.';
    case 'expired':
      return 'The sign-in attempt took too long. Please try again.';
    case 'exchange_failed':
      return 'Oura accepted the login but the server could not finish the connection. Check the Edge Function logs in Supabase.';
    default:
      return `Oura connection failed${reason ? ` (${reason})` : ''}.`;
  }
}

export function OuraPanel({ sources, readingDays }: { sources: DataSourceConnection[] | undefined; readingDays: number }) {
  const { invalidate } = useRepository();
  const params = useLocalSearchParams<{ oura?: string; reason?: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Coming back from Oura: react once per distinct URL parameter (state adjusted during render, no effect).
  const paramKey = params.oura ? `${params.oura}:${params.reason ?? ''}` : null;
  const [seenParam, setSeenParam] = useState<string | null>(null);
  if (paramKey !== seenParam) {
    setSeenParam(paramKey);
    if (paramKey && params.oura === 'connected') setJob({ key: paramKey, status: 'running', imported: 0, calls: 0 });
    else if (paramKey && params.oura === 'error') setJob({ key: paramKey, status: 'failed', message: reasonText(params.reason), imported: 0, calls: 0 });
  }

  // One sync call per (job, call number). While the server reports more history, the
  // job increments `calls`, which re-runs this effect for the next call.
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const callKey = `${job.key}#${job.calls}`;
    if (started.current === callKey) return;
    started.current = callKey;
    let cancelled = false;
    if (paramKey) router.replace('/');
    syncOura()
      .then((r) => {
        if (cancelled) return;
        const imported = job.imported + r.readings;
        const range = r.syncedFrom && r.syncedThrough ? `${formatShort(r.syncedFrom)} – ${formatShort(r.syncedThrough)}` : '';
        if (!r.backfillDone && job.calls + 1 < MAX_CALLS) {
          setJob({ ...job, calls: job.calls + 1, imported, message: `${imported} readings so far, back to ${r.syncedFrom ? formatShort(r.syncedFrom) : '…'}. Looking for older data…` });
        } else {
          setJob({ ...job, status: 'done', imported, message: `Imported ${imported} readings. History covers ${range}.` });
        }
        invalidate();
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setJob({ ...job, status: 'failed', message: e instanceof Error ? e.message : String(e) });
        invalidate();
      });
    return () => {
      cancelled = true;
    };
  }, [job, paramKey, invalidate]);

  const oura = sources?.find((s) => s.provider === 'oura');
  const connected = oura?.status === 'connected';
  const running = job?.status === 'running';

  const connect = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      await startOuraConnect(); // navigates away on success
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : String(e));
      setConnecting(false);
    }
  };

  return (
    <View style={{ gap: spacing.md }}>
      {sources?.map((s) => <SourceCard key={s.id} source={s} readingDays={readingDays} />)}

      {sources && !connected && (
        <Card>
          <AppText variant="bodyStrong">Connect your Oura ring</AppText>
          <AppText variant="caption" color="textSecondary" style={{ marginTop: 2, marginBottom: spacing.md }}>
            You will sign in on Oura&apos;s own page and allow read access to sleep, readiness and activity. The app then imports your full history to build
            your personal baseline. Tokens stay on the server.
          </AppText>
          <Button label={connecting ? 'Opening Oura…' : oura ? 'Reconnect Oura' : 'Connect Oura'} icon="link-outline" onPress={connect} loading={connecting} />
          {connectError && (
            <View style={{ marginTop: spacing.sm }}>
              <InfoBox tone="warning">{connectError}</InfoBox>
            </View>
          )}
        </Card>
      )}

      {connected && (
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText variant="caption" color="textSecondary" style={{ flex: 1 }}>
            {oura?.syncedThrough
              ? `History ${oura.syncedFrom ? formatShort(oura.syncedFrom) : '?'} – ${formatShort(oura.syncedThrough)}${oura.backfillDone ? '' : ' (older data still importing)'}`
              : 'Not synced yet.'}
          </AppText>
          <Button label={running ? 'Syncing…' : 'Sync now'} variant="secondary" size="sm" icon="sync-outline" loading={running} onPress={() => setJob({ key: `manual-${Date.now()}`, status: 'running', imported: 0, calls: 0 })} />
        </Row>
      )}

      {job?.status === 'running' && <InfoBox>{job.message ?? 'Fetching your Oura data. A long history is imported in rounds and can take a few minutes.'}</InfoBox>}
      {job?.status === 'done' && <InfoBox tone="success">{job.message}</InfoBox>}
      {job?.status === 'failed' && <InfoBox tone="warning">{job.message}</InfoBox>}
      {oura?.lastError && job?.status !== 'failed' && <InfoBox tone="warning">{`Last sync problem: ${oura.lastError}`}</InfoBox>}
    </View>
  );
}
