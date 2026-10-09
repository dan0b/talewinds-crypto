import { Dec } from '@talewinds/core';
import { Fragment, useState } from 'react';
import type { HoldingsView } from '../../lib/api.ts';
import { formatChangeUsd, formatShare, formatUsd, shareFraction } from '../../lib/format.ts';
import { Donut, type DonutSegment } from '../charts/Donut.tsx';
import { Badge, Button, Card, EmptyState, Segmented, Stat } from '../ui.tsx';
import { ChangePct, ChangeSummaryCell } from './cells.tsx';
import { TagEditor, TagManager } from './Tags.tsx';

type Overview = HoldingsView['overview'];
type Row = Overview['byAsset'][number];
type Dimension = 'asset' | 'category' | 'theme' | 'wallet' | 'chain';

/** Slices drawn in color (the palette has five, validated as neighbors in order). */
const NAMED_SLICES = 5;
const SERIES = [
  'var(--color-series-1)',
  'var(--color-series-2)',
  'var(--color-series-3)',
  'var(--color-series-4)',
  'var(--color-series-5)',
];
const OTHER = 'var(--color-series-other)';
const OTHER_KEY = '__other';

function rowLabel(row: Row, dimension?: Dimension): string {
  if (row.kind === 'small') return 'Small balances';
  if (row.kind === 'untagged') return dimension === 'theme' ? 'No theme' : 'Uncategorized';
  if (row.kind === 'wallet') return row.label ?? 'Unnamed wallet';
  return row.label ?? 'Unknown token';
}

/**
 * Colors by rank within this chart, largest first. The palette only passes the color-blind checks
 * as neighbors in slot order, so slots are never reassigned to follow an asset across charts;
 * the table beside the donut always names each color.
 */
function colorsOf(rows: Row[]): Map<string, string> {
  const colors = new Map<string, string>();
  let slot = 0;
  for (const row of rows) {
    const named =
      row.kind !== 'small' &&
      row.kind !== 'untagged' &&
      slot < NAMED_SLICES &&
      shareFraction(row.share) > 0;
    colors.set(row.key, named ? (SERIES[slot++] as string) : OTHER);
  }
  return colors;
}

/** The named slices, then everything else as one "Other" slice. */
function segmentsOf(rows: Row[], colors: Map<string, string>): DonutSegment[] {
  const segments: DonutSegment[] = [];
  const rest: Row[] = [];
  for (const row of rows) {
    const color = colors.get(row.key) ?? OTHER;
    if (color === OTHER) {
      if (shareFraction(row.share) > 0) rest.push(row);
      continue;
    }
    segments.push({
      key: row.key,
      label: rowLabel(row),
      fraction: shareFraction(row.share),
      color,
      shareText: formatShare(row.share),
      valueText: formatUsd(row.valueUsd),
    });
  }
  if (rest.length > 0) {
    // Exact sums for display; the fraction is only for drawing.
    const share = rest.reduce((s, r) => s.plus(r.share), new Dec(0)).toFixed(6);
    const value = rest.reduce((s, r) => s.plus(r.valueUsd), new Dec(0)).toFixed(2);
    segments.push({
      key: OTHER_KEY,
      label: rest.length === 1 && rest[0] ? rowLabel(rest[0]) : `Other (${rest.length})`,
      fraction: shareFraction(share),
      color: OTHER,
      shareText: formatShare(share),
      valueText: formatUsd(value),
    });
  }
  return segments;
}

/** Headline numbers for the scope: value, 24h change, and concentration. */
export function OverviewStats({ view }: { view: HoldingsView }) {
  const o = view.overview;
  const all = view.scope.walletId === null;
  const change = o.change24h;
  const largest = o.concentration.largest;
  const top3 = o.byCoin.filter((r) => r.kind === 'coin').slice(0, 3);
  // The same coin on two chains (ETH, ETH) needs its chain to be told apart.
  const top3Names = top3.map((r) => rowLabel(r));
  const top3Hint = top3
    .map((r, i) =>
      top3Names.filter((n) => n === top3Names[i]).length > 1 && r.detail
        ? `${top3Names[i]} (${r.detail})`
        : top3Names[i],
    )
    .join(', ');
  const assets = view.holdings.filter((h) => h.visible).length;
  const chains = view.wallets[0]?.chains.length ?? 0;

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label={all ? 'Total value' : 'Wallet value'}
        value={formatUsd(view.totals.valueUsd)}
        hint={`${all ? `${view.wallets.length} wallets` : `${chains} ${chains === 1 ? 'chain' : 'chains'}`} · ${assets} assets · verified and priced only`}
      />
      <Stat
        label="24h change"
        value={
          change.pct === null ? (
            '—'
          ) : (
            <span className="flex items-baseline gap-2">
              {formatChangeUsd(change.usd)}
              <span className="text-sm font-medium">
                <ChangePct pct={change.pct} />
              </span>
            </span>
          )
        }
        hint={
          change.pct === null
            ? 'No prices from 24 hours ago yet'
            : change.uncoveredCount > 0
              ? `On ${formatUsd(change.coveredValueUsd)} of ${formatUsd(o.totalUsd)}. ${change.uncoveredCount} ${change.uncoveredCount === 1 ? 'holding has' : 'holdings have'} no price from 24h ago yet.`
              : 'Price move of what you hold now (not P&L)'
        }
      />
      <Stat
        label="Largest position"
        value={largest ? formatShare(largest.share) : '—'}
        hint={
          largest
            ? `${largest.label ?? 'Unknown token'}${largest.detail ? ` on ${largest.detail}` : ''}`
            : 'No priced holdings'
        }
      />
      <Stat
        label="Top 3 positions"
        value={o.concentration.top3Share ? formatShare(o.concentration.top3Share) : '—'}
        hint={top3.length > 0 ? top3Hint : 'No priced holdings'}
      />
    </div>
  );
}

const DIMENSION_HEADING: Record<Dimension, string> = {
  asset: 'Asset',
  category: 'Category',
  theme: 'Theme',
  wallet: 'Wallet',
  chain: 'Chain',
};

/** Share of the total by asset, wallet, or chain: a donut plus a table of exact values. */
export function AllocationCard({ view }: { view: HoldingsView }) {
  const all = view.scope.walletId === null;
  const [chosen, setChosen] = useState<Dimension>('asset');
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [tagging, setTagging] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  // A single wallet has no by-wallet breakdown.
  const dimension: Dimension = !all && chosen === 'wallet' ? 'asset' : chosen;
  const o = view.overview;
  // "By asset" counts each coin once, wherever and however it's held (ADR 0019).
  const rows = {
    asset: o.byCoin,
    category: o.byCategory,
    theme: o.byTheme,
    wallet: o.byWallet,
    chain: o.byChain,
  }[dimension];
  // Themes overlap (a coin can have several), so they get bars, never a part-to-whole donut.
  const overlapping = dimension === 'theme';
  const colors = colorsOf(rows);
  const segments = segmentsOf(rows, colors);
  const hasTags = view.tags.categories.length + view.tags.themes.length > 0;
  const sliceOf = (row: Row) => (colors.get(row.key) === OTHER ? OTHER_KEY : row.key);

  const options: { value: Dimension; label: string }[] = [
    { value: 'asset', label: 'Asset' },
    { value: 'category', label: 'Category' },
    { value: 'theme', label: 'Theme' },
    ...(all ? [{ value: 'wallet' as const, label: 'Wallet' }] : []),
    { value: 'chain', label: 'Chain' },
  ];

  return (
    <Card
      title="Allocation"
      aside={
        <div className="flex flex-wrap items-center gap-2">
          {hasTags && (
            <Button className="px-2 py-1 text-xs" onClick={() => setManaging((m) => !m)}>
              {managing ? 'Close tags' : 'Manage tags'}
            </Button>
          )}
          <Segmented
            label="Break the total down by"
            options={options}
            value={dimension}
            onChange={(d) => {
              setChosen(d);
              setActive(null);
            }}
          />
        </div>
      }
    >
      {managing && <TagManager all={view.tags} onClose={() => setManaging(false)} />}
      {(dimension === 'category' || dimension === 'theme') && !hasTags && (
        <p className="mb-3 text-xs text-muted">
          No categories or themes yet. Switch to Asset and use “Tag” on a coin to add some.
        </p>
      )}
      {segments.length === 0 ? (
        <EmptyState>No priced holdings to break down yet.</EmptyState>
      ) : (
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
          {!overlapping && (
            <Donut
              segments={segments}
              label={`Allocation by ${DIMENSION_HEADING[dimension].toLowerCase()}`}
              centerLabel={all ? 'Total' : 'Wallet'}
              centerValue={formatUsd(o.totalUsd)}
              active={active}
              onActiveChange={setActive}
            />
          )}
          <div className="w-full min-w-0 flex-1 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-normal">{DIMENSION_HEADING[dimension]}</th>
                  <th className="py-2 pr-3 text-right font-normal">Value</th>
                  <th className="py-2 pr-3 text-right font-normal">Share</th>
                  <th className="py-2 text-right font-normal">24h</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const color = colors.get(row.key) ?? OTHER;
                  const highlighted = active !== null && active === sliceOf(row);
                  const parts = row.parts && row.parts.length > 1 ? row.parts : null;
                  const expanded = parts !== null && open === row.key;
                  const editingTags =
                    row.kind === 'coin' && row.tags !== null && tagging === row.key;
                  return (
                    <Fragment key={row.key}>
                      <tr
                        className={`border-t border-border/60 align-top ${highlighted ? 'bg-canvas/50' : ''}`}
                        onMouseEnter={() => setActive(sliceOf(row))}
                        onMouseLeave={() => setActive(null)}
                      >
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <span
                              aria-hidden
                              className="inline-block size-2.5 shrink-0 rounded-sm"
                              style={{ background: color }}
                            />
                            <span className="font-medium">{rowLabel(row, dimension)}</span>
                            {row.detail && <Badge>{row.detail}</Badge>}
                            {parts && (
                              <button
                                type="button"
                                className="rounded px-1 text-xs text-muted hover:text-fg"
                                aria-expanded={expanded}
                                aria-label={`${expanded ? 'Hide' : 'Show'} where ${rowLabel(row)} is held`}
                                onClick={() => setOpen(expanded ? null : row.key)}
                              >
                                {parts.length} {expanded ? '▾' : '▸'}
                              </button>
                            )}
                          </div>
                          {row.kind === 'coin' && row.tags && (
                            <div className="mt-1 flex flex-wrap items-center gap-1 pl-4.5">
                              {row.tags.category && (
                                <Badge tone="accent">{row.tags.category.name}</Badge>
                              )}
                              {row.tags.themes.map((t) => (
                                <Badge key={t.id}>{t.name}</Badge>
                              ))}
                              <button
                                type="button"
                                className="text-xs text-muted hover:text-fg"
                                aria-expanded={editingTags}
                                onClick={() => setTagging(editingTags ? null : row.key)}
                              >
                                {editingTags
                                  ? 'Done'
                                  : row.tags.category || row.tags.themes.length
                                    ? 'Edit tags'
                                    : 'Tag'}
                              </button>
                            </div>
                          )}
                          {row.kind === 'small' && row.count !== null && (
                            <div className="mt-0.5 pl-4.5 text-xs text-muted">
                              {row.count} {row.count === 1 ? 'holding' : 'holdings'}, each under{' '}
                              {formatUsd(view.small.thresholdUsd)}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatUsd(row.valueUsd)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatShare(row.share)}
                          <div className="mt-1 ml-auto h-1 w-16 rounded-full bg-border/50">
                            <div
                              className="h-1 rounded-full"
                              style={{
                                width: `${(shareFraction(row.share) * 100).toFixed(2)}%`,
                                background: color,
                              }}
                            />
                          </div>
                        </td>
                        <td className="py-2 text-right">
                          <ChangeSummaryCell change={row.change24h} />
                        </td>
                      </tr>
                      {editingTags && row.tags && (
                        <tr>
                          <td colSpan={4} className="bg-canvas/40 px-3 py-3">
                            <TagEditor
                              coinKey={row.key}
                              coinLabel={rowLabel(row)}
                              tags={row.tags}
                              all={view.tags}
                            />
                          </td>
                        </tr>
                      )}
                      {expanded &&
                        parts.map((part) => (
                          <tr key={part.assetId} className="text-xs text-muted">
                            <td className="py-1 pr-3 pl-4.5">
                              {part.label ?? 'Unknown token'}{' '}
                              <span className="text-muted/80">· {part.detail}</span>
                            </td>
                            <td className="py-1 pr-3 text-right tabular-nums">
                              {formatUsd(part.valueUsd)}
                            </td>
                            <td className="py-1 pr-3 text-right tabular-nums">
                              {formatShare(part.share)}
                            </td>
                            <td />
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {overlapping && (
              <p className="mt-2 text-xs text-muted">
                A coin with several themes counts in each, so these shares can add up to more than
                100%.
              </p>
            )}
            {o.unpricedCount > 0 && (
              <p className="mt-2 text-xs text-muted">
                {o.unpricedCount} verified {o.unpricedCount === 1 ? 'holding has' : 'holdings have'}{' '}
                no price, so {o.unpricedCount === 1 ? "it isn't" : "they aren't"} in any share.
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
