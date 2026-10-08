import type { AccountSyncStatus } from '../../lib/api.ts';
import { shortAddress, timeAgo } from '../../lib/format.ts';
import { Badge } from '../ui.tsx';

export function SyncBadge({ account }: { account: AccountSyncStatus }) {
  if (!account.syncSupported) return <Badge>sync arrives in step 02</Badge>;
  const run = account.lastRun;
  if (!run) return <Badge tone="warn">never synced</Badge>;
  if (run.status === 'running') return <Badge tone="accent">syncing…</Badge>;
  if (run.status === 'failed') return <Badge tone="bad">last sync failed</Badge>;
  if (account.incomplete) return <Badge tone="warn">incomplete</Badge>;
  if (account.stale) return <Badge tone="warn">stale</Badge>;
  return <Badge tone="ok">synced</Badge>;
}

export function AccountsList({ accounts }: { accounts: AccountSyncStatus[] }) {
  return (
    <ul className="divide-y divide-border">
      {accounts.map((a) => (
        <li key={a.id} className="py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="font-medium">{a.label ?? 'Unlabeled'}</span>
              <span className="text-muted">{a.chainName ?? a.venue}</span>
              <span className="font-mono text-xs text-muted" title={a.address ?? undefined}>
                {shortAddress(a.address)}
              </span>
            </span>
            <span className="flex items-center gap-2 text-xs text-muted">
              {a.syncSupported && `balances from ${timeAgo(a.lastUsableAt)}`}
              <SyncBadge account={a} />
            </span>
          </div>
          {a.lastRun?.error && <p className="mt-1 text-xs text-bad">{a.lastRun.error}</p>}
          {a.lastRun?.notes.map((n) => (
            <p key={n.code} className="mt-1 text-xs text-muted">
              {n.message}
            </p>
          ))}
        </li>
      ))}
    </ul>
  );
}
