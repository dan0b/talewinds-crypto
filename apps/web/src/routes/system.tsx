import { useQuery } from '@tanstack/react-query';
import { Card, PageHeader, StatusDot } from '../components/ui.tsx';
import { api } from '../lib/api.ts';

const ago = (iso: string | null) =>
  iso ? `${Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))}s ago` : 'never';

export function SystemPage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => (await api.health.$get()).json(),
    refetchInterval: 5_000,
  });

  const data = health.data;
  const apiReachable = !health.isError;

  return (
    <>
      <PageHeader title="System" subtitle="Is everything running?" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="API">
          <p className="flex items-center gap-2">
            <StatusDot ok={health.isPending ? undefined : apiReachable} />
            {health.isPending ? 'Checking…' : apiReachable ? 'Reachable' : 'Unreachable'}
          </p>
        </Card>
        <Card title="Database">
          <p className="flex items-center gap-2">
            <StatusDot ok={data?.database.ok} />
            {data ? (data.database.ok ? `Connected · ${data.database.latencyMs}ms` : 'Down') : '—'}
          </p>
          {data?.database.error && <p className="mt-2 text-xs text-bad">{data.database.error}</p>}
        </Card>
        <Card title="Worker">
          <p className="flex items-center gap-2">
            <StatusDot ok={data?.worker.ok} />
            {data ? (data.worker.ok ? 'Alive' : 'Not responding') : '—'}
          </p>
          {data && (
            <p className="mt-2 text-xs text-muted">Last heartbeat {ago(data.worker.lastSeenAt)}</p>
          )}
        </Card>
      </div>
    </>
  );
}
