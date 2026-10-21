import { useEffect, useState } from 'react';
import type { Metrics } from '../types';
import { api } from './api';

export type StreamStatus = 'connecting' | 'live' | 'reconnecting';

/**
 * Subscribes to the dashboard metrics over Server-Sent Events (`/api/metrics/stream`).
 * The server pushes freshly computed KPIs every `intervalMs` (2 s by default); EventSource reconnects on its own.
 */
export function useMetricsStream(range: number, region: string, intervalMs = 2000) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [receivedAt, setReceivedAt] = useState<number | null>(null);

  useEffect(() => {
    setStatus('connecting');
    const source = new EventSource(api.metricsStreamUrl(range, region, intervalMs));
    source.addEventListener('metrics', (e) => {
      setMetrics(JSON.parse((e as MessageEvent<string>).data) as Metrics);
      setReceivedAt(Date.now());
      setStatus('live');
    });
    source.onerror = () => setStatus('reconnecting');
    return () => source.close();
  }, [range, region, intervalMs]);

  return { metrics, status, receivedAt };
}
