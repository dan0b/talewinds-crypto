import { Fragment, useState } from 'react';
import type { Holding, HoldingsView } from '../../lib/api.ts';
import { formatAmount, formatUsd, timeAgo } from '../../lib/format.ts';
import {
  AssetCell,
  ChangeCell,
  MarketCapCell,
  PriceCell,
  SmallBalancesRow,
  StatusActions,
  ValueCell,
} from './cells.tsx';

const COLUMNS = 7;

/** Every asset across the wallets in scope, merged (the "By asset" view). */
export function HoldingsTable({
  holdings,
  showSmall,
  small,
}: {
  holdings: Holding[];
  showSmall: boolean;
  small: HoldingsView['small'];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [smallOpen, setSmallOpen] = useState(false);
  const listed = showSmall ? holdings : holdings.filter((h) => !h.small);
  const folded = showSmall ? [] : holdings.filter((h) => h.small);

  const row = (h: Holding) => {
    const expanded = open === h.assetId;
    return (
      <Fragment key={h.assetId}>
        <tr className={`border-b border-border/60 align-top ${h.visible ? '' : 'opacity-70'}`}>
          <td className="py-2 pr-3">
            <AssetCell asset={h} />
          </td>
          <td className="py-2 pr-3 text-right tabular-nums">{formatAmount(h.amount)}</td>
          <td className="py-2 pr-3 text-right">
            <PriceCell asset={h} />
          </td>
          <td className="py-2 pr-3 text-right">
            <ChangeCell asset={h} />
          </td>
          <td className="py-2 pr-3 text-right">
            <MarketCapCell asset={h} />
          </td>
          <td className="py-2 pr-3 text-right">
            <ValueCell asset={h} />
          </td>
          <td className="py-2 text-right">
            <button
              type="button"
              className="rounded px-2 py-1 text-xs whitespace-nowrap text-muted hover:text-fg"
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Hide' : 'Show'} details for ${h.symbol ?? 'token'}`}
              onClick={() => setOpen(expanded ? null : h.assetId)}
            >
              {h.accounts.length} {h.accounts.length === 1 ? 'wallet' : 'wallets'}{' '}
              {expanded ? '▾' : '▸'}
            </button>
          </td>
        </tr>
        {expanded && (
          <tr className="border-b border-border/60 bg-canvas/40">
            <td colSpan={COLUMNS} className="px-3 py-3">
              <ul className="mb-3 space-y-1">
                {h.accounts.map((a) => (
                  <li key={a.accountId} className="flex justify-between gap-4 text-xs">
                    <span>
                      {a.accountLabel ?? 'Unnamed wallet'}{' '}
                      <span className="text-muted">· balance read {timeAgo(a.observedAt)}</span>
                    </span>
                    <span className="tabular-nums">
                      {formatAmount(a.amount)} {h.symbol ?? ''}
                      {a.valueUsd && (
                        <span className="ml-2 text-muted">{formatUsd(a.valueUsd)}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mb-2 truncate font-mono text-[11px] text-muted" title={h.ref}>
                {h.ref}
              </div>
              <StatusActions asset={h} />
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        {/* Only small balances here: the folded row stands alone, without column headers. */}
        {listed.length > 0 && (
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="py-2 pr-3 font-normal">Asset</th>
              <th className="py-2 pr-3 text-right font-normal">Amount</th>
              <th className="py-2 pr-3 text-right font-normal">Price</th>
              <th className="py-2 pr-3 text-right font-normal">24h</th>
              <th className="py-2 pr-3 text-right font-normal">Market cap</th>
              <th className="py-2 pr-3 text-right font-normal">Value</th>
              <th className="py-2 text-right font-normal">
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
        )}
        <tbody>
          {listed.map(row)}
          {folded.length > 0 && (
            <SmallBalancesRow
              count={small.count}
              valueUsd={small.valueUsd}
              thresholdUsd={small.thresholdUsd}
              open={smallOpen}
              onToggle={() => setSmallOpen((o) => !o)}
              colSpan={COLUMNS}
            />
          )}
          {folded.length > 0 && smallOpen && folded.map(row)}
        </tbody>
      </table>
    </div>
  );
}
