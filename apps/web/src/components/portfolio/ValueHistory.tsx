import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, okJson, type ValueHistory } from '../../lib/api.ts';
import { chartNumber, formatChangeUsd, formatTickUsd, formatUsd } from '../../lib/format.ts';
import { useStoredState } from '../../lib/storage.ts';
import { type SeriesPoint, TimeSeries } from '../charts/TimeSeries.tsx';
import { Button, Card, EmptyState, Notice, Segmented } from '../ui.tsx';
import { ChangePct } from './cells.tsx';

type Range = ValueHistory['range'];

const RANGES: { value: Range; label: string }[] = [
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: 'all', label: 'All' },
];
const PHRASE: Record<Range, string> = {
  '1d': 'Past day',
  '1w': 'Past week',
  '1m': 'Past month',
  all: 'Since tracking began',
};
const parseRange = (raw: unknown): Range | null =>
  RANGES.find((r) => r.value === raw)?.value ?? null;

const when = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const at = (iso: string) => when.format(new Date(iso));
const day = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/** A hollow ring, like the chart's marker for an added wallet. */
const AddedKey = () => (
  <svg aria-hidden width="10" height="10" className="mr-1 inline-block shrink-0 align-[-1px]">
    <circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);
/** A short dashed stroke, like the chart's incomplete stretches. */
const DashedKey = () => (
  <svg aria-hidden width="18" height="6" className="mr-1 inline-block shrink-0 align-middle">
    <line
      x1="1"
      y1="3"
      x2="17"
      y2="3"
      stroke="var(--color-series-1)"
      strokeWidth="2"
      strokeDasharray="4 4"
      strokeLinecap="round"
    />
  </svg>
);

/** For each addition, the first point that includes it (where its marker goes). */
function additionsByPoint(data: ValueHistory) {
  const byPoint = new Map<number, ValueHistory['additions']>();
  for (const a of data.additions) {
    const i = data.points.findIndex((p) => Date.parse(p.at) >= Date.parse(a.at));
    if (i !== -1) byPoint.set(i, [...(byPoint.get(i) ?? []), a]);
  }
  return byPoint;
}

/** Why the range's change isn't shown, when it isn't. */
function noChangeReason(data: ValueHistory): string {
  const n = data.additions.length;
  if (n > 0)
    return `${n} ${n === 1 ? 'wallet was' : 'wallets were'} added in this range, so its rise isn't a gain and no change is shown.`;
  return "Some balances weren't visible at the start or end of this range, so no change is shown.";
}

/**
 * The scope's total value over time (step 02f), replayed from stored syncs and prices: gaps where
 * nothing synced, dashed where a sync was incomplete, and a ring where a wallet was added.
 */
export function ValueHistoryCard({ walletId }: { walletId: string | null }) {
  const [range, setRange] = useStoredState<Range>('tw.portfolio.valueRange', parseRange, '1d');
  const [table, setTable] = useState(false);
  const history = useQuery({
    queryKey: ['history', range, walletId],
    queryFn: async () =>
      okJson(
        await api.portfolio.history.$get({
          query: { range, ...(walletId ? { wallet: walletId } : {}) },
        }),
      ),
    // Keep the previous range or scope on screen (dimmed) while the next one loads.
    placeholderData: keepPreviousData,
  });
  const data = history.data;

  return (
    <Card
      title="Value over time"
      aside={<Segmented label="Time range" options={RANGES} value={range} onChange={setRange} />}
    >
      {history.isError ? (
        <Notice tone="bad">Could not load the value history: {history.error.message}</Notice>
      ) : !data ? (
        <div className="h-[200px]">
          <EmptyState>Loading…</EmptyState>
        </div>
      ) : (
        <div className={history.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
          <Chart data={data} table={table} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>
              Value, not performance: deposits, withdrawals, and added wallets move it too.
            </span>
            <Button className="px-2 py-1 text-xs" onClick={() => setTable((t) => !t)}>
              {table ? 'Hide table' : 'Show table'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Chart({ data, table }: { data: ValueHistory; table: boolean }) {
  const drawn = data.points.filter((p) => p.valueUsd !== null);
  if (drawn.length < 2) {
    return (
      <div className="flex h-[200px] items-center">
        <EmptyState>
          Not enough history for this range yet. It fills in as the worker syncs (every 15 minutes
          while it runs).
        </EmptyState>
      </div>
    );
  }
  const s = data.summary;
  const added = additionsByPoint(data);
  const last = data.points.length - 1;
  // Nothing exists before tracking began: when that's inside the range, the axis starts there.
  const since = data.trackedSince ? Date.parse(data.trackedSince) : null;
  const begins = since !== null && since > Date.parse(data.from) ? since : null;
  const skip = begins === null ? 0 : data.points.findIndex((p) => Date.parse(p.at) >= begins);
  const series: SeriesPoint[] = data.points.slice(skip).map((p, i) => ({
    t: Date.parse(p.at),
    y: p.valueUsd === null ? null : chartNumber(p.valueUsd),
    uncertain: p.incomplete,
    marked: added.has(i + skip),
  }));
  const anyIncomplete = drawn.some((p) => p.incomplete);
  const phrase = PHRASE[data.range];

  return (
    <>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        {s.changeUsd !== null && s.changePct !== null ? (
          <>
            <span className="text-muted">{phrase}</span>
            <span className="text-lg font-semibold">{formatChangeUsd(s.changeUsd)}</span>
            <ChangePct pct={s.changePct} />
          </>
        ) : (
          <span className="text-xs text-muted">{noChangeReason(data)}</span>
        )}
        {s.highUsd && s.lowUsd && (
          <span className="ml-auto text-xs text-muted tabular-nums">
            {begins !== null && data.range !== 'all' && (
              <>History starts {day.format(begins)}, when tracking began · </>
            )}
            High {formatUsd(s.highUsd)} · Low {formatUsd(s.lowUsd)}
          </span>
        )}
      </div>
      <TimeSeries
        points={series}
        domain={[begins ?? Date.parse(data.from), Date.parse(data.to)]}
        label={`Portfolio value, ${phrase.toLowerCase()}: from ${formatUsd(s.startUsd ?? '0')} to ${formatUsd(s.endUsd ?? '0')}; high ${formatUsd(s.highUsd ?? '0')}, low ${formatUsd(s.lowUsd ?? '0')}. The table below lists every value.`}
        formatY={formatTickUsd}
        tooltip={(k) => {
          const i = k + skip;
          const p = data.points[i];
          if (!p) return null;
          return (
            <>
              <div className="text-sm font-semibold tabular-nums">
                {p.valueUsd === null ? 'No sync' : formatUsd(p.valueUsd)}
              </div>
              <div className="text-muted">
                {at(p.at)}
                {i === last ? ' · now' : ''}
              </div>
              {p.incomplete && (
                <div className="mt-1 text-muted">
                  <DashedKey /> Incomplete: some balances weren't visible
                </div>
              )}
              {added.get(i)?.map((a) => (
                <div key={a.walletId} className="mt-1">
                  <AddedKey /> {a.name ?? 'Unnamed wallet'} added
                  {a.valueUsd ? ` (${formatUsd(a.valueUsd)})` : ''}
                </div>
              ))}
            </>
          );
        }}
      />
      {(data.additions.length > 0 || anyIncomplete) && (
        <div className="mt-2 space-y-1 text-xs text-muted">
          {data.additions.length > 0 && (
            <p>
              <AddedKey />
              Added in this range (a step up, not a gain):{' '}
              {data.additions
                .map(
                  (a) =>
                    `${a.name ?? 'Unnamed wallet'} (${at(a.at)}${a.valueUsd ? `, ${formatUsd(a.valueUsd)}` : ''})`,
                )
                .join(', ')}
            </p>
          )}
          {anyIncomplete && (
            <p>
              <DashedKey />
              Dashed: a sync couldn't see every balance then (for example, a chain not yet enabled
              at the provider), so the value reads low.
            </p>
          )}
        </div>
      )}
      {table && (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-border/70">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-left text-muted">
                <th className="px-3 py-1.5 font-normal">Time</th>
                <th className="px-3 py-1.5 text-right font-normal">Value</th>
                <th className="px-3 py-1.5 font-normal">Note</th>
              </tr>
            </thead>
            <tbody>
              {data.points
                .map((p, i) => ({ p, i }))
                .filter(({ p }) => p.valueUsd !== null)
                .reverse()
                .map(({ p, i }) => (
                  <tr key={p.at} className="border-t border-border/60">
                    <td className="px-3 py-1.5">
                      {at(p.at)}
                      {i === last ? ' (now)' : ''}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatUsd(p.valueUsd as string)}
                    </td>
                    <td className="px-3 py-1.5 text-muted">
                      {[
                        p.incomplete ? 'incomplete' : null,
                        ...(added.get(i) ?? []).map((a) => `${a.name ?? 'Unnamed wallet'} added`),
                      ]
                        .filter(Boolean)
                        .join('; ')}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="px-3 py-1.5 text-[11px] text-muted">
            Times when nothing synced are left out.
          </p>
        </div>
      )}
    </>
  );
}
