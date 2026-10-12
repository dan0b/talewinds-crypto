import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { AddWalletForm } from '../components/portfolio/AddWallet.tsx';
import { HoldingsTable } from '../components/portfolio/HoldingsTable.tsx';
import { AllocationCard, OverviewStats } from '../components/portfolio/Overview.tsx';
import { ValueHistoryCard } from '../components/portfolio/ValueHistory.tsx';
import { familyLabel, WalletGroups } from '../components/portfolio/WalletGroups.tsx';
import { Button, Card, EmptyState, Notice, PageHeader, Segmented } from '../components/ui.tsx';
import { api, type HoldingsView, ok, okJson } from '../lib/api.ts';
import { formatUsd, timeAgo } from '../lib/format.ts';
import { parseStringRecord, parseStrings, useStoredState } from '../lib/storage.ts';

/** Stop waiting for a requested sync after this long. */
const SYNC_WAIT_MS = 3 * 60_000;

type View = 'wallet' | 'asset';

/** True while a requested sync hasn't finished for every syncable account. */
function syncInProgress(view: HoldingsView | undefined, requestedAt: number | null): boolean {
  if (!view || requestedAt === null || Date.now() - requestedAt > SYNC_WAIT_MS) return false;
  return view.accounts
    .filter((a) => a.syncSupported)
    .some(
      (a) =>
        !a.lastRun ||
        a.lastRun.status === 'running' ||
        Date.parse(a.lastRun.startedAt) < requestedAt - 5_000,
    );
}

type NoticeItem = {
  key: string;
  tone: 'neutral' | 'warn' | 'bad';
  text: string;
  /**
   * What the notice is about, without the parts that drift every sync (prices, dollar amounts).
   * A hidden notice comes back when this changes, e.g. when another chain fails.
   */
  signature: string;
  action?: 'toggle-hidden';
};

/** Integer digits of a USD amount: a hidden notice about it returns when it grows tenfold. */
const magnitude = (usd: string) => usd.replace(/^-/, '').split('.')[0]?.length ?? 0;

function collectNotices(view: HoldingsView, showingHidden: boolean): NoticeItem[] {
  const notices: NoticeItem[] = [];
  const failed = view.accounts.filter((a) => a.syncSupported && a.lastRun?.status === 'failed');
  if (failed.length > 0) {
    notices.push({
      key: 'failed',
      tone: 'bad',
      text: `${failed.length} ${failed.length === 1 ? 'chain' : 'chains'} failed to sync; showing the last good balances. Details in the wallet below.`,
      signature: failed
        .map((a) => a.id)
        .sort()
        .join(','),
    });
  }
  // One notice per distinct reason something is incomplete (e.g. a network not enabled for a key).
  const reasons = new Map<string, { message: string; count: number }>();
  for (const a of view.accounts.filter((x) => x.incomplete)) {
    for (const n of a.lastRun?.notes ?? []) {
      const r = reasons.get(n.message) ?? { message: n.message, count: 0 };
      r.count++;
      reasons.set(n.message, r);
    }
  }
  for (const [message, r] of reasons) {
    notices.push({
      key: `incomplete-${message}`,
      tone: 'warn',
      text: `Incomplete (${r.count}): ${r.message}`,
      signature: String(r.count),
    });
  }
  if (view.quality.staleAccounts > 0) {
    notices.push({
      key: 'stale',
      tone: 'warn',
      text: `${view.quality.staleAccounts} chains haven't synced successfully recently.`,
      signature: String(view.quality.staleAccounts),
    });
  }
  if (view.quality.neverSynced > 0) {
    notices.push({
      key: 'never',
      tone: 'neutral',
      text: `${view.quality.neverSynced} chains haven't synced yet. Use Refresh.`,
      signature: String(view.quality.neverSynced),
    });
  }
  if (view.totals.disagreementCount > 0) {
    notices.push({
      key: 'disagree',
      tone: 'warn',
      text: `${view.totals.disagreementCount} ${view.totals.disagreementCount === 1 ? 'token' : 'tokens'}: price sources disagree by more than 25%. The on-chain market price is used; hover “sources disagree” for details.`,
      signature: String(view.totals.disagreementCount),
    });
  }
  if (view.totals.illiquidCount > 0) {
    notices.push({
      key: 'illiquid',
      tone: 'warn',
      text: `${view.totals.illiquidCount} positions are worth more than 10% of their pool's liquidity; selling would move the price a lot.`,
      signature: String(view.totals.illiquidCount),
    });
  }
  if (view.totals.unpricedCount > 0) {
    notices.push({
      key: 'unpriced',
      tone: 'neutral',
      text: `${view.totals.unpricedCount} verified assets have no price and aren't counted in the total.`,
      signature: String(view.totals.unpricedCount),
    });
  }
  if (view.totals.stalePriceCount > 0) {
    notices.push({
      key: 'stale-prices',
      tone: 'warn',
      text: `${view.totals.stalePriceCount} prices are more than an hour old.`,
      signature: String(view.totals.stalePriceCount),
    });
  }
  if (view.totals.lowConfidenceValueUsd !== '0.00') {
    notices.push({
      key: 'low',
      tone: 'warn',
      text: `${formatUsd(view.totals.lowConfidenceValueUsd)} of the total rests on low-confidence prices or thin liquidity.`,
      signature: String(magnitude(view.totals.lowConfidenceValueUsd)),
    });
  }
  if (view.hidden.count > 0) {
    const largest = view.hidden.largest
      .map((h) => `${h.symbol ?? 'Unknown token'} ≈ ${formatUsd(h.valueUsd)}`)
      .join(', ');
    notices.push({
      key: 'hidden',
      tone: 'neutral',
      text: showingHidden
        ? `Showing ${view.hidden.count} hidden tokens below (dimmed, not counted). Open a row and use Mark verified for any you hold on purpose.`
        : `${view.hidden.count} unverified or spam tokens are hidden and not counted${view.hidden.estimatedValueUsd !== '0.00' ? ` (unverified ones ≈ ${formatUsd(view.hidden.estimatedValueUsd)})` : ''}.${largest ? ` Largest: ${largest}.` : ''}`,
      // A new token arriving changes the count; reviewing them doesn't bring the notice back.
      signature: String(view.hidden.count),
      action: 'toggle-hidden',
    });
  }
  return notices;
}

/**
 * Data notices, each of which can be hidden. A hidden notice leaves a count behind (so nothing
 * disappears silently) and returns by itself when its signature changes. Remembered in this
 * browser only.
 */
function Notices({
  view,
  showingHidden,
  onToggleHidden,
}: {
  view: HoldingsView;
  showingHidden: boolean;
  onToggleHidden: () => void;
}) {
  const [hidden, setHidden] = useStoredState<Record<string, string>>(
    'tw.portfolio.hiddenNotices',
    parseStringRecord,
    {},
  );
  const notices = collectNotices(view, showingHidden);
  if (notices.length === 0) return null;
  const shown = notices.filter((n) => hidden[n.key] !== n.signature);
  const hiddenCount = notices.length - shown.length;
  const hide = (items: NoticeItem[]) =>
    setHidden((h) => ({ ...h, ...Object.fromEntries(items.map((n) => [n.key, n.signature])) }));
  const showAgain = () =>
    setHidden((h) =>
      Object.fromEntries(Object.entries(h).filter(([key]) => !notices.some((n) => n.key === key))),
    );
  return (
    <div className="mb-4 space-y-2">
      {shown.map((n) => (
        <Notice
          key={n.key}
          tone={n.tone}
          onDismiss={() => hide([n])}
          action={
            n.action === 'toggle-hidden' ? (
              <Button onClick={onToggleHidden} className="shrink-0 text-xs">
                {showingHidden ? 'Hide again' : 'Review'}
              </Button>
            ) : undefined
          }
        >
          {n.text}
        </Notice>
      ))}
      {(hiddenCount > 0 || shown.length > 1) && (
        <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted">
          <span>
            {hiddenCount > 0 && (
              <>
                {hiddenCount} {hiddenCount === 1 ? 'notice' : 'notices'} hidden ·{' '}
                <button type="button" className="underline hover:text-fg" onClick={showAgain}>
                  Show
                </button>
              </>
            )}
          </span>
          {shown.length > 1 && (
            <button type="button" className="hover:text-fg" onClick={() => hide(shown)}>
              Hide all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Which wallets the whole page covers: all of them, or one. */
function ScopePicker({
  view,
  walletId,
  onChange,
}: {
  view: HoldingsView;
  walletId: string | null;
  onChange: (walletId: string | null) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">Showing</span>
      <select
        value={walletId ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg"
      >
        <option value="">All wallets</option>
        {view.walletOptions.map((w) => (
          <option key={w.walletId} value={w.walletId}>
            {w.name ?? 'Unnamed wallet'} ({familyLabel(w.family)}) · {formatUsd(w.valueUsd)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PortfolioPage() {
  const { wallet } = useSearch({ from: '/' });
  const navigate = useNavigate({ from: '/' });
  const walletId = wallet ?? null;
  const setScope = (id: string | null) => void navigate({ search: id ? { wallet: id } : {} });

  const [showHidden, setShowHidden] = useState(false);
  const [showSmall, setShowSmall] = useState(false);
  const [view, setView] = useState<View>('wallet');
  const [adding, setAdding] = useState(false);
  const [syncRequestedAt, setSyncRequestedAt] = useState<number | null>(null);
  const [collapsedIds, setCollapsedIds] = useStoredState<string[]>(
    'tw.portfolio.collapsedWallets',
    parseStrings,
    [],
  );

  const holdings = useQuery({
    queryKey: ['holdings', showHidden, walletId],
    queryFn: async () =>
      okJson(
        await api.portfolio.holdings.$get({
          query: {
            ...(showHidden ? { hidden: '1' as const } : {}),
            ...(walletId ? { wallet: walletId } : {}),
          },
        }),
      ),
    // Keep showing the previous scope (dimmed) while the next one loads.
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (syncInProgress(q.state.data, syncRequestedAt) ? 3_000 : 60_000),
  });

  // The value chart's last point is the total: refresh it whenever the holdings refresh.
  const queryClient = useQueryClient();
  const holdingsUpdatedAt = useRef(0);
  useEffect(() => {
    if (holdingsUpdatedAt.current !== 0 && holdings.dataUpdatedAt !== holdingsUpdatedAt.current)
      void queryClient.invalidateQueries({ queryKey: ['history'] });
    holdingsUpdatedAt.current = holdings.dataUpdatedAt;
  }, [holdings.dataUpdatedAt, queryClient]);

  // A wallet in the URL that no longer exists (or a stale link): fall back to all wallets.
  const missingWallet = holdings.isError && holdings.error.message === 'wallet not found';
  useEffect(() => {
    if (missingWallet) void navigate({ search: {} });
  }, [missingWallet, navigate]);

  const sync = useMutation({
    mutationFn: async () => (await ok(await api.portfolio.sync.$post())).json(),
    onSuccess: () => {
      setSyncRequestedAt(Date.now());
      void holdings.refetch();
    },
  });

  const data = holdings.data;
  const syncing = sync.isPending || syncInProgress(data, syncRequestedAt);
  useEffect(() => {
    if (syncRequestedAt !== null && !syncInProgress(data, syncRequestedAt))
      setSyncRequestedAt(null);
  }, [data, syncRequestedAt]);

  // Wallet cards folded to their headers, remembered in this browser (removed wallets drop out).
  const collapsed = new Set(collapsedIds);
  const known = (ids: string[]) =>
    ids.filter((id) => data?.walletOptions.some((w) => w.walletId === id) ?? true);
  const toggleWallet = (id: string) =>
    setCollapsedIds((ids) => known(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const shownIds = data?.wallets.map((w) => w.walletId) ?? [];
  const allCollapsed = shownIds.length > 0 && shownIds.every((id) => collapsed.has(id));
  const collapseAll = (fold: boolean) =>
    setCollapsedIds((ids) =>
      known(
        fold ? [...new Set([...ids, ...shownIds])] : ids.filter((id) => !shownIds.includes(id)),
      ),
    );

  const syncable = data?.accounts.filter((a) => a.syncSupported) ?? [];
  const lastSync = syncable
    .map((a) => a.lastUsableAt)
    .filter((t): t is string => Boolean(t))
    .sort()
    .at(-1);

  return (
    <>
      <PageHeader
        title="Portfolio"
        subtitle="What do I own? Wallets on Ethereum, Robinhood Chain, and Solana, plus Coinbase."
        actions={
          <>
            <span className="text-xs text-muted">
              {lastSync ? `Synced ${timeAgo(lastSync)}` : 'Not synced yet'}
            </span>
            <Button onClick={() => setAdding((a) => !a)}>{adding ? 'Close' : 'Add wallet'}</Button>
            <Button
              variant="primary"
              onClick={() => sync.mutate()}
              disabled={syncing || syncable.length === 0}
            >
              {syncing ? 'Syncing…' : 'Refresh'}
            </Button>
          </>
        }
      />

      {adding && (
        <div className="mb-4">
          <AddWalletForm
            onClose={() => {
              setAdding(false);
              // A new wallet's sync was queued by the API; poll until it lands.
              setSyncRequestedAt(Date.now());
            }}
          />
        </div>
      )}

      {holdings.isPending && <EmptyState>Loading…</EmptyState>}
      {holdings.isError && (
        <Notice tone="bad">
          Could not load holdings: {holdings.error.message}. Is the API running?
        </Notice>
      )}
      {sync.isSuccess && !sync.data.queued && !syncing && (
        <div className="mb-4">
          <Notice>A sync was already queued; it will pick up your request.</Notice>
        </div>
      )}

      {data && (
        <div className={holdings.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
          <div className="mb-4">
            <ScopePicker view={data} walletId={walletId} onChange={setScope} />
          </div>

          <OverviewStats view={data} />

          <div className="mb-4">
            <ValueHistoryCard walletId={walletId} />
          </div>

          <Notices
            view={data}
            showingHidden={showHidden}
            onToggleHidden={() => setShowHidden((s) => !s)}
          />

          <div className="mb-6">
            <AllocationCard view={data} />
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-medium text-muted">Holdings</h2>
              <Segmented
                label="Group holdings"
                options={[
                  { value: 'wallet', label: 'By wallet' },
                  { value: 'asset', label: 'By asset' },
                ]}
                value={view}
                onChange={setView}
              />
              {view === 'wallet' && data.wallets.length > 1 && (
                <Button className="px-2 py-1 text-xs" onClick={() => collapseAll(!allCollapsed)}>
                  {allCollapsed ? 'Expand all' : 'Collapse all'}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={showSmall}
                  onChange={(e) => setShowSmall(e.target.checked)}
                  className="accent-accent"
                />
                Show small balances ({data.small.count})
              </label>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={showHidden}
                  onChange={(e) => setShowHidden(e.target.checked)}
                  className="accent-accent"
                />
                Show hidden ({data.hidden.count})
              </label>
            </div>
          </div>

          {view === 'wallet' ? (
            <WalletGroups
              wallets={data.wallets}
              showHidden={showHidden}
              showSmall={showSmall}
              smallThresholdUsd={data.small.thresholdUsd}
              showShare={walletId === null}
              collapsed={collapsed}
              onToggle={toggleWallet}
            />
          ) : (
            <Card title={walletId ? 'Assets in this wallet' : 'All assets'}>
              {data.holdings.length === 0 ? (
                <EmptyState>No holdings to show yet. Use Refresh to sync.</EmptyState>
              ) : (
                <HoldingsTable holdings={data.holdings} showSmall={showSmall} small={data.small} />
              )}
            </Card>
          )}
        </div>
      )}
    </>
  );
}
