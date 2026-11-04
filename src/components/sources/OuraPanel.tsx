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
import { SourceCard } from '../experiments';
import { AppText, Button, Card, InfoBox, Row } from '../ui';

interface Job {
  key: string;
  full: boolean;
  status: 'running' | 'done' | 'failed';
  message?: string;
}

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
    if (paramKey && params.oura === 'connected') setJob({ key: paramKey, full: true, status: 'running' });
    else if (paramKey && params.oura === 'error') setJob({ key: paramKey, full: false, status: 'failed', message: reasonText(params.reason) });
  }

  const started = useRef<string | null>(null);
  useEffect(() => {
    if (!job || job.status !== 'running' || started.current === job.key) return;
    started.current = job.key;
    let cancelled = false;
    if (paramKey) router.replace('/');
    syncOura({ full: job.full })
      .then((r) => {
        if (cancelled) return;
        setJob({ ...job, status: 'done', message: `Imported ${r.readings} readings from ${r.from} to ${r.to}.` });
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
            {oura?.syncedThrough ? `Synced through ${oura.syncedThrough}.` : 'Not synced yet.'}
          </AppText>
          <Button label={running ? 'Syncing…' : 'Sync now'} variant="secondary" size="sm" icon="sync-outline" loading={running} onPress={() => setJob({ key: `manual-${Date.now()}`, full: !oura?.syncedThrough, status: 'running' })} />
        </Row>
      )}

      {job?.status === 'running' && <InfoBox>{job.full ? 'Importing your Oura history. The first import can take a minute.' : 'Fetching the latest days from Oura…'}</InfoBox>}
      {job?.status === 'done' && <InfoBox tone="success">{job.message}</InfoBox>}
      {job?.status === 'failed' && <InfoBox tone="warning">{job.message}</InfoBox>}
      {oura?.lastError && job?.status !== 'failed' && <InfoBox tone="warning">{`Last sync problem: ${oura.lastError}`}</InfoBox>}
    </View>
  );
}
