import { Fragment, useState } from 'react';
import type { Holding } from '../../lib/api.ts';
import { formatAmount, formatUsd, timeAgo } from '../../lib/format.ts';
import { AssetCell, MarketCapCell, PriceCell, StatusActions, ValueCell } from './cells.tsx';

/** Every asset across all wallets, merged (the "By asset" view). */
export function HoldingsTable({ holdings }: { holdings: Holding[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
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
          {holdings.map((h) => {
            const expanded = open === h.assetId;
            return (
              <Fragment key={h.assetId}>
                <tr
                  className={`border-b border-border/60 align-top ${h.visible ? '' : 'opacity-70'}`}
                >
                  <td className="py-2 pr-3">
                    <AssetCell asset={h} />
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatAmount(h.amount)}</td>
                  <td className="py-2 pr-3 text-right">
                    <PriceCell asset={h} />
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
                    <td colSpan={6} className="px-3 py-3">
                      <ul className="mb-3 space-y-1">
                        {h.accounts.map((a) => (
                          <li key={a.accountId} className="flex justify-between gap-4 text-xs">
                            <span>
                              {a.accountLabel ?? 'Unnamed wallet'}{' '}
                              <span className="text-muted">
                                · balance read {timeAgo(a.observedAt)}
                              </span>
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
          })}
        </tbody>
      </table>
    </div>
  );
}
