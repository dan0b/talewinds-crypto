import { Fragment, type MouseEvent, useEffect, useRef, useState } from 'react';
import type { HoldingsView } from '../../lib/api.ts';
import { formatChangeUsd, formatShare, formatUsd, shareFraction } from '../../lib/format.ts';
import { Donut, type DonutSegment } from '../charts/Donut.tsx';
import { Badge, Button, Card, EmptyState, Segmented, Stat } from '../ui.tsx';
import { ChangePct, ChangeSummaryCell } from './cells.tsx';
import { TagEditor, TagManager } from './Tags.tsx';

type Overview = HoldingsView['overview'];
type Row = Overview['byCoin'][number];
type Dimension = 'asset' | 'category' | 'theme' | 'wallet' | 'chain';

/** The palette's eight, validated as neighbors in this order (see styles.css). */
const SERIES = [
  'var(--color-series-1)',
  'var(--color-series-2)',
  'var(--color-series-3)',
  'var(--color-series-4)',
  'var(--color-series-5)',
  'var(--color-series-6)',
  'var(--color-series-7)',
  'var(--color-series-8)',
];
const OTHER = 'var(--color-series-other)';
/** Rows that stand for several things (or for none) are always gray. */
const GRAY: ReadonlySet<Row['kind']> = new Set(['other', 'untagged', 'small']);

function rowLabel(row: Row, dimension: Dimension): string {
  if (row.kind === 'other') return 'Other';
  if (row.kind === 'small') return 'Small balances';
  if (row.kind === 'untagged') return dimension === 'theme' ? 'No theme' : 'Uncategorized';
  if (row.kind === 'wallet') return row.label ?? 'Unnamed wallet';
  return row.label ?? 'Unknown token';
}

const NOUNS: Partial<Record<Row['kind'], [string, string]>> = {
  coin: ['coin', 'coins'],
  holding: ['holding', 'holdings'],
  category: ['category', 'categories'],
  theme: ['theme', 'themes'],
  wallet: ['wallet', 'wallets'],
  chain: ['chain', 'chains'],
};

/** "10 coins, each under 0.1%". */
function otherDetail(row: Row, threshold: string): string {
  const [one, many] = NOUNS[row.breakdown?.[0]?.kind ?? 'coin'] ?? ['row', 'rows'];
  const n = row.count ?? 0;
  return `${n} ${n === 1 ? one : many}, each under ${formatShare(threshold)}`;
}

/**
 * Colors by rank within this chart, largest first, then gray. The palette only passes the
 * color-blind checks as neighbors in slot order, so slots are never reassigned to follow a coin
 * across charts; the table beside the donut names every color. A ring closes on itself, and series
 * 7 fails next to series 1, so a chart never ends on series 7.
 */
function colorsOf(rows: Row[]): Map<string, string> {
  const drawn = rows.filter((r) => shareFraction(r.share) > 0);
  const named = drawn.filter((r) => !GRAY.has(r.kind));
  const slots = named.length === 7 && drawn.length === 7 ? 6 : SERIES.length;
  const colors = new Map<string, string>();
  let slot = 0;
  for (const row of rows) {
    const colored = !GRAY.has(row.kind) && slot < slots && shareFraction(row.share) > 0;
    colors.set(row.key, colored ? (SERIES[slot++] as string) : OTHER);
  }
  return colors;
}

/** One slice per row: the server already folded the rows too small to see into Other. */
function segmentsOf(rows: Row[], colors: Map<string, string>, dimension: Dimension) {
  return rows.map(
    (row): DonutSegment => ({
      key: row.key,
      label: rowLabel(row, dimension),
      fraction: shareFraction(row.share),
      color: colors.get(row.key) ?? OTHER,
      shareText: formatShare(row.share),
      valueText: formatUsd(row.valueUsd),
      selectable: row.breakdown !== null,
    }),
  );
}

/** Follow `path` (row keys) down the breakdowns, as far as it still exists. */
function follow(top: Row[], path: string[]): { trail: Row[]; rows: Row[] } {
  const trail: Row[] = [];
  let rows = top;
  for (const key of path) {
    const next = rows.find((r) => r.key === key);
    if (!next?.breakdown) break;
    trail.push(next);
    rows = next.breakdown;
  }
  return { trail, rows };
}

/** Headline numbers for the scope: value, 24h change, and concentration. */
export function OverviewStats({ view }: { view: HoldingsView }) {
  const o = view.overview;
  const all = view.scope.walletId === null;
  const change = o.change24h;
  const largest = o.concentration.largest;
  const top3 = o.byCoin.filter((r) => r.kind === 'coin').slice(0, 3);
  // The same coin on two chains (ETH, ETH) needs its chain to be told apart.
  const top3Names = top3.map((r) => rowLabel(r, 'asset'));
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

/** The top of the breadcrumb: "All assets", "All categories", … */
const DIMENSION_ALL: Record<Dimension, string> = {
  asset: 'All assets',
  category: 'All categories',
  theme: 'All themes',
  wallet: 'All wallets',
  chain: 'All chains',
};

/** What the first column lists, by the kind of rows in it. */
const COLUMN_HEADING: Partial<Record<Row['kind'], string>> = {
  coin: 'Asset',
  holding: 'Held as',
  category: 'Category',
  theme: 'Theme',
  wallet: 'Wallet',
  chain: 'Chain',
};

/** Clicks on a row's own buttons and fields don't also open the row. */
const fromControl = (e: MouseEvent) =>
  e.target instanceof Element && e.target.closest('button, a, input, select, textarea, label');

/**
 * The total broken down by asset, category, theme, wallet, or chain: a donut plus a table of exact
 * values. Any slice or row with something inside opens to show it (Back returns).
 */
export function AllocationCard({ view }: { view: HoldingsView }) {
  const all = view.scope.walletId === null;
  const [chosen, setChosen] = useState<Dimension>('asset');
  const [path, setPath] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [tagging, setTagging] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  // A single wallet has no by-wallet breakdown.
  const dimension: Dimension = !all && chosen === 'wallet' ? 'asset' : chosen;
  const o = view.overview;
  // "By asset" counts each coin once, wherever and however it's held (ADR 0019).
  const top = {
    asset: o.byCoin,
    category: o.byCategory,
    theme: o.byTheme,
    wallet: o.byWallet,
    chain: o.byChain,
  }[dimension];
  const { trail, rows } = follow(top, path);
  const group = trail.at(-1) ?? null;
  const colors = colorsOf(rows);
  const segments = segmentsOf(rows, colors, dimension);
  const hasTags = view.tags.categories.length + view.tags.themes.length > 0;
  const heading =
    (group && COLUMN_HEADING[rows.find((r) => !GRAY.has(r.kind))?.kind ?? 'coin']) ||
    DIMENSION_HEADING[dimension];

  // After opening a level, focus Back: the button that opened it is gone.
  const back = useRef<HTMLButtonElement>(null);
  const focusBack = useRef(false);
  const go = (next: string[]) => {
    setPath(next);
    setActive(null);
    setTagging(null);
    focusBack.current = next.length > 0;
  };
  useEffect(() => {
    if (!focusBack.current) return;
    focusBack.current = false;
    back.current?.focus({ preventScroll: true });
  });
  const keysTo = (depth: number) => trail.slice(0, depth).map((r) => r.key);
  const openRow = (row: Row) => {
    if (row.breakdown) go([...keysTo(trail.length), row.key]);
  };

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
              go([]);
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
      {group && (
        <nav
          aria-label="Where you are in the allocation"
          className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
        >
          <Button
            ref={back}
            className="px-2 py-1 text-xs"
            onClick={() => go(keysTo(trail.length - 1))}
          >
            ← Back
          </Button>
          <button type="button" className="text-muted hover:text-fg" onClick={() => go([])}>
            {DIMENSION_ALL[dimension]}
          </button>
          {trail.map((r, i) => (
            <Fragment key={r.key}>
              <span aria-hidden className="text-muted">
                ›
              </span>
              {i === trail.length - 1 ? (
                <span aria-current="location" className="font-medium">
                  {rowLabel(r, dimension)}
                </span>
              ) : (
                <button
                  type="button"
                  className="text-muted hover:text-fg"
                  onClick={() => go(keysTo(i + 1))}
                >
                  {rowLabel(r, dimension)}
                </button>
              )}
            </Fragment>
          ))}
          <span className="ml-auto text-xs text-muted tabular-nums">
            {formatUsd(group.valueUsd)} · {formatShare(group.totalShare)} of{' '}
            {all ? 'the total' : 'this wallet'}
          </span>
        </nav>
      )}
      {segments.every((s) => s.fraction === 0) ? (
        <EmptyState>No priced holdings to break down yet.</EmptyState>
      ) : (
        <div
          key={`${dimension}/${keysTo(trail.length).join('/')}`}
          className="fade-in flex flex-col items-center gap-6 md:flex-row md:items-start"
        >
          <div className="flex shrink-0 flex-col items-center gap-2">
            <Donut
              segments={segments}
              label={
                group
                  ? `What ${rowLabel(group, dimension)} is made of`
                  : `Allocation by ${DIMENSION_HEADING[dimension].toLowerCase()}`
              }
              centerLabel={group ? rowLabel(group, dimension) : all ? 'Total' : 'Wallet'}
              centerValue={formatUsd(group ? group.valueUsd : o.totalUsd)}
              active={active}
              onActiveChange={setActive}
              onSelect={(key) => {
                const row = rows.find((r) => r.key === key);
                if (row) openRow(row);
              }}
            />
            {!group && rows.some((r) => r.breakdown) && (
              <p className="text-[11px] text-muted">Click a slice or row to see inside</p>
            )}
          </div>
          <div className="relative w-full min-w-0 flex-1 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-normal">{heading}</th>
                  <th className="py-2 pr-3 text-right font-normal">Value</th>
                  <th className="py-2 pr-3 text-right font-normal">Share</th>
                  <th className="py-2 pr-3 text-right font-normal">24h</th>
                  <th className="w-4 py-2 font-normal">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const color = colors.get(row.key) ?? OTHER;
                  const highlighted = active === row.key;
                  const openable = row.breakdown !== null;
                  const name = rowLabel(row, dimension);
                  const editingTags =
                    row.kind === 'coin' && row.tags !== null && tagging === row.key;
                  return (
                    <Fragment key={row.key}>
                      <tr
                        className={`border-t border-border/60 align-top ${highlighted ? 'bg-canvas/50' : ''} ${openable ? 'cursor-pointer' : ''}`}
                        onMouseEnter={() => setActive(row.key)}
                        onMouseLeave={() => setActive(null)}
                        onClick={(e) => {
                          if (openable && !fromControl(e)) openRow(row);
                        }}
                      >
                        <td className="py-2 pr-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              aria-hidden
                              className="inline-block size-2.5 shrink-0 rounded-sm"
                              style={{ background: color }}
                            />
                            {openable ? (
                              <button
                                type="button"
                                className="font-medium hover:underline"
                                aria-label={`${name}: show what's inside`}
                                onClick={() => openRow(row)}
                              >
                                {name}
                              </button>
                            ) : (
                              <span className="font-medium">{name}</span>
                            )}
                            {(row.kind === 'coin' || row.kind === 'holding') && row.detail && (
                              <Badge>{row.detail}</Badge>
                            )}
                          </div>
                          {(row.kind === 'category' ||
                            row.kind === 'theme' ||
                            row.kind === 'untagged') &&
                            row.detail && (
                              <div className="mt-0.5 pl-4.5 text-xs text-muted">{row.detail}</div>
                            )}
                          {row.kind === 'other' && (
                            <div className="mt-0.5 pl-4.5 text-xs text-muted">
                              {otherDetail(row, o.otherBelowShare)}: {row.detail}
                            </div>
                          )}
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
                          {group && (
                            <div className="mt-1 text-[11px] whitespace-nowrap text-muted">
                              {formatShare(row.totalShare)} of total
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <ChangeSummaryCell change={row.change24h} />
                        </td>
                        <td aria-hidden className="py-2 text-right text-muted">
                          {openable ? '›' : ''}
                        </td>
                      </tr>
                      {editingTags && row.tags && (
                        <tr>
                          <td colSpan={5} className="bg-canvas/40 px-3 py-3">
                            <TagEditor
                              coinKey={row.key}
                              coinLabel={name}
                              tags={row.tags}
                              all={view.tags}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {dimension === 'theme' && !group && hasTags && (
              <p className="mt-2 text-xs text-muted">
                Each coin counts once: a coin with several themes is listed under all of them
                together, so the shares add up to 100%.
              </p>
            )}
            {!group && o.unpricedCount > 0 && (
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
