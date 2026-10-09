import type { AccountSyncStatus } from '../../lib/api.ts';
import { Badge } from '../ui.tsx';

/** One account's sync state, as a badge. */
export function SyncBadge({ account }: { account: AccountSyncStatus }) {
  if (!account.syncSupported) return <Badge>not set up</Badge>;
  const run = account.lastRun;
  if (!run) return <Badge tone="warn">never synced</Badge>;
  if (run.status === 'running') return <Badge tone="accent">syncing…</Badge>;
  if (run.status === 'failed') return <Badge tone="bad">last sync failed</Badge>;
  if (account.incomplete) return <Badge tone="warn">incomplete</Badge>;
  if (account.stale) return <Badge tone="warn">stale</Badge>;
  return <Badge tone="ok">synced</Badge>;
}
