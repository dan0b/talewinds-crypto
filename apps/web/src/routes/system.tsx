import { useQuery } from '@tanstack/react-query';
import { Badge, Card, PageHeader, StatusDot } from '../components/ui.tsx';
import { api, okJson } from '../lib/api.ts';
import { timeAgo } from '../lib/format.ts';

const CHAIN_NAMES: Record<string, string> = {
  ethereum: 'Ethereum',
  robinhood: 'Robinhood Chain',
  solana: 'Solana',
};

const DISCOVERY: Record<string, string> = {
  blockscout: 'Blockscout (keyless)',
  alchemy: 'Alchemy',
  'solana-rpc': 'Solana RPC',
  unavailable: 'Unavailable: set ALCHEMY_API_KEY',
};

export function SystemPage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => (await api.health.$get()).json(),
    refetchInterval: 5_000,
  });
  const sources = useQuery({
    queryKey: ['sources'],
    queryFn: async () => okJson(await api.system.sources.$get()),
  });

  const data = health.data;
  const apiReachable = !health.isError;

  return (
    <>
      <PageHeader
        title="System"
        subtitle="Is everything running, and how is each chain being read?"
      />
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
            <p className="mt-2 text-xs text-muted">
              Last heartbeat {timeAgo(data.worker.lastSeenAt)}
            </p>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Data sources">
          {sources.isError && (
            <p className="text-sm text-bad">Could not load source configuration.</p>
          )}
          {sources.data && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-normal">Chain</th>
                  <th className="py-2 pr-3 font-normal">Balances (RPC)</th>
                  <th className="py-2 font-normal">Token discovery</th>
                </tr>
              </thead>
              <tbody>
                {sources.data.sources.map((s) => (
                  <tr key={s.chain} className="border-b border-border/60">
                    <td className="py-2 pr-3">{CHAIN_NAMES[s.chain] ?? s.chain}</td>
                    <td className="py-2 pr-3 text-muted">
                      {s.rpc === 'public' ? 'Public endpoint' : s.rpc}
                    </td>
                    <td className="py-2">
                      {s.tokenDiscovery === 'unavailable' ? (
                        <Badge tone="warn">{DISCOVERY.unavailable}</Badge>
                      ) : (
                        <span className="text-muted">
                          {DISCOVERY[s.tokenDiscovery] ?? s.tokenDiscovery}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {sources.data && (
            <p className="mt-3 text-xs text-muted">
              Coinbase:{' '}
              {sources.data.venues.coinbase
                ? 'API key detected. Each sync first checks with Coinbase that it is view-only.'
                : 'no API key set. Add a view-only key to .env (see .env.example) to sync Coinbase.'}
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
