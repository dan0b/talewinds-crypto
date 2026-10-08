import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { api, type ChainGroup, okJson, type WalletGroup } from '../../lib/api.ts';
import { formatAmount, formatUsd, shortAddress, timeAgo } from '../../lib/format.ts';
import { Badge, Button, EmptyState } from '../ui.tsx';
import { SyncBadge } from './AccountsList.tsx';
import { AssetCell, MarketCapCell, PriceCell, StatusActions, ValueCell } from './cells.tsx';

function useRefreshHoldings() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['holdings'] });
}

function WalletName({ wallet }: { wallet: WalletGroup }) {
  const refresh = useRefreshHoldings();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(wallet.name ?? '');
  const rename = useMutation({
    mutationFn: async (name: string) =>
      okJson(
        await api.wallets[':id'].$patch({
          param: { id: wallet.walletId },
          json: { name: name.trim() || null },
        }),
      ),
    onSuccess: async () => {
      await refresh();
      setEditing(false);
    },
  });

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold">{wallet.name ?? 'Unnamed wallet'}</h3>
        <button
          type="button"
          className="text-xs text-muted hover:text-fg"
          onClick={() => {
            setDraft(wallet.name ?? '');
            setEditing(true);
          }}
        >
          Rename
        </button>
      </div>
    );
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        rename.mutate(draft);
      }}
    >
      <input
        // biome-ignore lint/a11y/noAutofocus: the user just asked to rename; focus is where they'll type.
        autoFocus
        aria-label="Wallet name"
        value={draft}
        maxLength={64}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        className="rounded-md border border-border bg-canvas px-2 py-1 text-sm"
        placeholder="e.g. Trading"
      />
      <Button type="submit" variant="primary" disabled={rename.isPending}>
        Save
      </Button>
      <Button onClick={() => setEditing(false)}>Cancel</Button>
      {rename.isError && <span className="text-xs text-bad">{rename.error.message}</span>}
    </form>
  );
}

function TrackChain({
  wallet,
  chain,
}: {
  wallet: WalletGroup;
  chain: { key: string; name: string };
}) {
  const refresh = useRefreshHoldings();
  const track = useMutation({
    mutationFn: async () =>
      okJson(
        await api.wallets.$post({
          json: {
            address: wallet.address,
            chains: [chain.key as 'ethereum' | 'robinhood' | 'solana'],
          },
        }),
        201,
      ),
    onSuccess: refresh,
  });
  return (
    <span className="flex items-center gap-2 text-xs text-muted">
      Not tracked on {chain.name}
      <Button
        className="px-2 py-0.5 text-xs"
        disabled={track.isPending}
        onClick={() => track.mutate()}
      >
        {track.isPending ? 'Adding…' : 'Track'}
      </Button>
      {track.isError && <span className="text-bad">{track.error.message}</span>}
    </span>
  );
}

function ChainSection({ chain, showHidden }: { chain: ChainGroup; showHidden: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const run = chain.sync.lastRun;
  return (
    <section className="mt-3 rounded-md border border-border/70">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{chain.chainName}</span>
          <SyncBadge account={chain.sync} />
          <span className="text-xs text-muted">
            balances from {timeAgo(chain.sync.lastUsableAt)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {!showHidden && chain.hiddenCount > 0 && (
            <span className="text-xs text-muted">{chain.hiddenCount} hidden</span>
          )}
          <span className="font-medium tabular-nums">{formatUsd(chain.valueUsd)}</span>
        </div>
      </div>
      {(run?.error || (run?.notes.length ?? 0) > 0) && (
        <div className="space-y-1 border-b border-border/70 px-3 py-2 text-xs">
          {run?.error && <p className="text-bad">{run.error}</p>}
          {run?.notes.map((n) => (
            <p key={n.code} className="text-muted">
              {n.message}
            </p>
          ))}
        </div>
      )}
      {chain.positions.length === 0 ? (
        <div className="px-3 py-3">
          <EmptyState>
            {chain.sync.lastRun ? 'No holdings to show on this chain.' : 'Not synced yet.'}
          </EmptyState>
        </div>
      ) : (
        <div className="overflow-x-auto px-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 pr-3 font-normal">Asset</th>
                <th className="py-2 pr-3 text-right font-normal">Amount</th>
                <th className="py-2 pr-3 text-right font-normal">Price</th>
                <th className="py-2 pr-3 text-right font-normal">Market cap</th>
                <th className="py-2 pr-3 text-right font-normal">Value</th>
                <th className="py-2 text-right font-normal">
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {chain.positions.map((p) => {
                const expanded = open === p.assetId;
                return (
                  <Fragment key={p.assetId}>
                    <tr
                      className={`border-t border-border/60 align-top ${p.visible ? '' : 'opacity-70'}`}
                    >
                      <td className="py-2 pr-3">
                        <AssetCell asset={p} showChain={false} />
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatAmount(p.amount)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <PriceCell asset={p} />
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <MarketCapCell asset={p} />
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <ValueCell asset={p} />
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          className="rounded px-2 py-1 text-xs text-muted hover:text-fg"
                          aria-expanded={expanded}
                          aria-label={`${expanded ? 'Hide' : 'Show'} details for ${p.symbol ?? 'token'}`}
                          onClick={() => setOpen(expanded ? null : p.assetId)}
                        >
                          {expanded ? '▾' : '▸'}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-canvas/40">
                        <td colSpan={6} className="px-3 py-3">
                          <div
                            className="mb-2 truncate font-mono text-[11px] text-muted"
                            title={p.ref}
                          >
                            {p.ref}
                          </div>
                          <StatusActions asset={p} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Holdings grouped wallet → chain (the default view). */
export function WalletGroups({
  wallets,
  showHidden,
}: {
  wallets: WalletGroup[];
  showHidden: boolean;
}) {
  if (wallets.length === 0) {
    return <EmptyState>No wallets yet. Use “Add wallet” above.</EmptyState>;
  }
  return (
    <div className="space-y-4">
      {wallets.map((w) => (
        <section key={w.walletId} className="rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <WalletName wallet={w} />
              <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                <Badge>{w.family === 'evm' ? 'EVM' : 'Solana'}</Badge>
                <span className="font-mono" title={w.address}>
                  {shortAddress(w.address)}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold tabular-nums">{formatUsd(w.valueUsd)}</div>
              {!showHidden && w.hiddenCount > 0 && (
                <div className="text-xs text-muted">{w.hiddenCount} hidden</div>
              )}
            </div>
          </div>
          {w.untrackedChains.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-3">
              {w.untrackedChains.map((c) => (
                <TrackChain key={c.key} wallet={w} chain={c} />
              ))}
            </div>
          )}
          {w.chains.map((c) => (
            <ChainSection key={c.accountId} chain={c} showHidden={showHidden} />
          ))}
        </section>
      ))}
    </div>
  );
}
