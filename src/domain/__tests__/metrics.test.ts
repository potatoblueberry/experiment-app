import { METRIC_IDS, metricProvider, PROVIDER_METRICS } from '../metrics';

describe('metricProvider', () => {
  it('names the connected source that supplies the metric', () => {
    const sources = [{ provider: 'oura' as const, status: 'connected' as const }];
    for (const id of METRIC_IDS) expect(metricProvider(id, sources)).toBe('oura');
  });

  it('returns null when no connected source provides it', () => {
    expect(metricProvider('hrv', [])).toBeNull();
    expect(metricProvider('hrv', [{ provider: 'oura', status: 'disconnected' }])).toBeNull();
    expect(metricProvider('hrv', [{ provider: 'manual', status: 'connected' }])).toBeNull();
  });

  it('every metric is listed under at most the providers that really deliver it', () => {
    expect(PROVIDER_METRICS.manual).toEqual([]);
    expect(new Set(PROVIDER_METRICS.oura).size).toBe(PROVIDER_METRICS.oura.length);
  });
});
