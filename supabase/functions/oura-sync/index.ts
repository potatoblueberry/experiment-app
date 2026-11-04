/**
 * POST /functions/v1/oura-sync   (signed-in user)
 * body: { full?: boolean }
 *
 * Pulls sleep, readiness and activity documents from Oura and upserts them as
 * metric_readings. A full sync reaches back two years (the API simply returns
 * nothing for days before the account existed); an incremental sync restarts a
 * week before the last synced day because Oura revises recent days.
 */
import { addDaysISO, corsHeaders, fetchCollection, freshAccessToken, isoDate, json, NotConnectedError, OuraAuthError, requireUser, serviceClient } from '../_shared/oura.ts';
import { mapOuraToReadings, type OuraDailyActivity, type OuraDailyReadiness, type OuraSleepPeriod } from '../_shared/mapReadings.ts';

const FULL_BACKFILL_DAYS = 730;
const OVERLAP_DAYS = 7;
const CHUNK_DAYS = 120;
const INSERT_CHUNK = 500;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: 'Not signed in' }, 401);
  const { full } = (await req.json().catch(() => ({}))) as { full?: boolean };
  const db = serviceClient();

  const setConnection = (patch: Record<string, unknown>) =>
    db.from('data_source_connections').upsert({ user_id: user.id, provider: 'oura', ...patch }, { onConflict: 'user_id,provider' });

  try {
    const accessToken = await freshAccessToken(db, user.id);

    const { data: conn } = await db.from('data_source_connections').select('synced_through').eq('user_id', user.id).eq('provider', 'oura').maybeSingle();
    const today = isoDate(new Date());
    const from = !full && conn?.synced_through ? addDaysISO(conn.synced_through, -OVERLAP_DAYS) : addDaysISO(today, -FULL_BACKFILL_DAYS);

    let inserted = 0;
    for (let start = from; start <= today; start = addDaysISO(start, CHUNK_DAYS)) {
      const end = addDaysISO(start, CHUNK_DAYS - 1) < today ? addDaysISO(start, CHUNK_DAYS - 1) : today;
      const [sleep, dailyReadiness, dailyActivity] = await Promise.all([
        fetchCollection<OuraSleepPeriod>(accessToken, 'sleep', start, end),
        fetchCollection<OuraDailyReadiness>(accessToken, 'daily_readiness', start, end),
        fetchCollection<OuraDailyActivity>(accessToken, 'daily_activity', start, end),
      ]);
      const rows = mapOuraToReadings({ sleep, dailyReadiness, dailyActivity }).map((r) => ({ ...r, user_id: user.id, synced_at: new Date().toISOString() }));
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const { error } = await db.from('metric_readings').upsert(rows.slice(i, i + INSERT_CHUNK), { onConflict: 'user_id,metric_id,date' });
        if (error) throw new Error(`save readings: ${error.message}`);
      }
      inserted += rows.length;
    }

    const { error } = await setConnection({ status: 'connected', last_sync_at: new Date().toISOString(), synced_through: today, last_error: null });
    if (error) throw new Error(`update connection: ${error.message}`);
    return json({ ok: true, from, to: today, readings: inserted });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('oura-sync', message);
    if (e instanceof NotConnectedError) return json({ error: message }, 409);
    const status = e instanceof OuraAuthError ? 'error' : 'connected';
    await setConnection({ status, last_error: message });
    return json({ error: message }, 500);
  }
});
