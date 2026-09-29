import { findChainById } from '@talewinds/core';
import { useQuery } from '@tanstack/react-query';
import { Card, EmptyState, PageHeader } from '../components/ui.tsx';
import { api } from '../lib/api.ts';

export function PortfolioPage() {
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await api.accounts.$get()).json(),
  });

  const owned = accounts.data?.accounts.filter((a) => a.ownership === 'owned') ?? [];

  return (
    <>
      <PageHeader title="Portfolio" subtitle="What do I own? Balances and values arrive in V0a." />
      <Card title="Your accounts">
        {accounts.isPending && <EmptyState>Loading…</EmptyState>}
        {accounts.isError && <EmptyState>Could not reach the API.</EmptyState>}
        {accounts.isSuccess && owned.length === 0 && (
          <EmptyState>
            No owned accounts yet. Add one with{' '}
            <code className="font-mono text-fg">pnpm tw account add --help</code>
          </EmptyState>
        )}
        {owned.length > 0 && (
          <ul className="divide-y divide-border">
            {owned.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                <span>
                  <span className="font-medium">{a.label ?? '—'}</span>
                  <span className="ml-2 text-muted">
                    {a.venue ?? (a.chainId ? (findChainById(a.chainId)?.name ?? a.chainId) : '')}
                  </span>
                </span>
                <span className="truncate font-mono text-xs text-muted">{a.address ?? ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
