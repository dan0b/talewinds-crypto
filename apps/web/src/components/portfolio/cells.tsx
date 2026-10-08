import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Holding, okJson } from '../../lib/api.ts';
import {
  formatCompactUsd,
  formatPrice,
  formatUsd,
  shortAddress,
  timeAgo,
} from '../../lib/format.ts';
import { Badge, Button } from '../ui.tsx';

/** Fields shared by by-asset holdings and per-wallet positions. */
export type Priced = Pick<
  Holding,
  | 'assetId'
  | 'symbol'
  | 'name'
  | 'address'
  | 'chainName'
  | 'status'
  | 'statusSource'
  | 'visible'
  | 'price'
  | 'market'
  | 'valueUsd'
  | 'illiquid'
  | 'amount'
  | 'ref'
>;

export function AssetCell({ asset, showChain = true }: { asset: Priced; showChain?: boolean }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="font-medium">{asset.symbol ?? 'Unknown token'}</span>
        {showChain && <Badge>{asset.chainName}</Badge>}
        {asset.status !== 'verified' && (
          <Badge tone={asset.status === 'spam' ? 'bad' : 'warn'}>{asset.status}</Badge>
        )}
      </div>
      <div className="max-w-56 truncate text-xs text-muted" title={asset.name ?? undefined}>
        {asset.name ?? shortAddress(asset.address)}
      </div>
    </>
  );
}

export function PriceCell({ asset }: { asset: Priced }) {
  const p = asset.price;
  if (!p) return <span className="text-muted">no price</span>;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="tabular-nums">{formatPrice(p.usd)}</span>
      <span
        className="flex flex-wrap items-center justify-end gap-1 text-[11px] text-muted"
        title={`Priced at ${p.pricedAt}`}
      >
        {p.source} · {timeAgo(p.pricedAt)}
        {p.stale && <Badge tone="warn">stale</Badge>}
        {p.crossCheck ? (
          <Badge
            tone="warn"
            title={`${p.crossCheck.source} says ${formatPrice(p.crossCheck.priceUsd)}; the on-chain price is used`}
          >
            sources disagree
          </Badge>
        ) : (
          p.confidence === 'low' && (
            <Badge tone="warn" title="Thin liquidity or a weak source: treat this value as rough">
              low confidence
            </Badge>
          )
        )}
      </span>
    </div>
  );
}

export function MarketCapCell({ asset }: { asset: Priced }) {
  const m = asset.market;
  if (!m?.marketCapUsd && !m?.fdvUsd) return <span className="text-muted">—</span>;
  const cap = m.marketCapUsd ?? m.fdvUsd;
  // Second line: FDV when it differs from market cap (or when it's all we have), then liquidity.
  const details = [
    m.fdvUsd && m.marketCapUsd && m.fdvUsd !== m.marketCapUsd
      ? `FDV ${formatCompactUsd(m.fdvUsd)}`
      : null,
    !m.marketCapUsd ? 'FDV' : null,
    m.liquidityUsd ? `liq ${formatCompactUsd(m.liquidityUsd)}` : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-col items-end gap-0.5" title={`Source: ${m.source}`}>
      <span className="tabular-nums">{cap ? formatCompactUsd(cap) : '—'}</span>
      <span className="text-[11px] text-muted">{details.join(' · ')}</span>
    </div>
  );
}

export function ValueCell({ asset }: { asset: Priced }) {
  if (!asset.valueUsd) return <span className="text-muted">—</span>;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-medium tabular-nums">{formatUsd(asset.valueUsd)}</span>
      {asset.illiquid && (
        <Badge
          tone="warn"
          title="Worth more than 10% of its pool's liquidity: selling would move the price a lot"
        >
          thin liquidity
        </Badge>
      )}
    </div>
  );
}

type Status = 'verified' | 'unverified' | 'spam';

export function StatusActions({ asset }: { asset: Priced }) {
  const queryClient = useQueryClient();
  const setStatus = useMutation({
    mutationFn: async (status: Status) =>
      okJson(
        await api.assets[':id'].status.$put({ param: { id: asset.assetId }, json: { status } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['holdings'] }),
  });
  const busy = setStatus.isPending;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted">
        {asset.statusSource === 'manual' ? 'You marked this' : 'Automatically'} {asset.status}.
      </span>
      {asset.status !== 'verified' && (
        <Button disabled={busy} onClick={() => setStatus.mutate('verified')}>
          Mark verified
        </Button>
      )}
      {asset.status !== 'spam' && (
        <Button disabled={busy} onClick={() => setStatus.mutate('spam')}>
          Mark spam
        </Button>
      )}
      {asset.status === 'spam' && (
        <Button disabled={busy} onClick={() => setStatus.mutate('unverified')}>
          Not spam
        </Button>
      )}
      {setStatus.isError && (
        <span className="text-bad">Couldn't update: {setStatus.error.message}</span>
      )}
    </div>
  );
}
