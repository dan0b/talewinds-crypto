import { CHAINS, type ChainKey, chainsOfFamily, detectChainFamily } from '@talewinds/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, okJson } from '../../lib/api.ts';
import { Button, Card } from '../ui.tsx';

/**
 * Add a wallet by address. The chain family is detected from the address; EVM wallets are
 * tracked on every supported EVM chain unless you deselect some. Adding a known address again is
 * safe: it only adds chains that weren't tracked yet.
 */
export function AddWalletForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [deselected, setDeselected] = useState<Set<ChainKey>>(new Set());

  const family = useMemo(() => detectChainFamily(address), [address]);
  const chains = family ? chainsOfFamily(family) : [];
  const selected = chains.filter((c) => !deselected.has(c));

  const add = useMutation({
    mutationFn: async () =>
      okJson(
        await api.wallets.$post({
          json: { address: address.trim(), name: name.trim() || null, chains: selected },
        }),
        201,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['holdings'] });
      onClose();
    },
  });

  const toggle = (key: ChainKey) =>
    setDeselected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const invalid = address.trim().length > 0 && !family;

  return (
    <Card title="Add wallet">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (family && selected.length > 0) add.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <label className="text-xs text-muted">
            Address
            <input
              // biome-ignore lint/a11y/noAutofocus: the form opens because the user wants to type an address.
              autoFocus
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x… (EVM) or a Solana address"
              spellCheck={false}
              className="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2 font-mono text-sm text-fg placeholder:text-muted"
            />
          </label>
          <label className="text-xs text-muted">
            Name (optional)
            <input
              value={name}
              maxLength={64}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Trading"
              className="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-fg placeholder:text-muted"
            />
          </label>
        </div>

        {invalid && (
          <p className="text-xs text-bad">That doesn't look like an EVM (0x…) or Solana address.</p>
        )}
        {family && (
          <fieldset className="flex flex-wrap items-center gap-4 text-sm">
            <legend className="mb-1 text-xs text-muted">
              {family === 'evm' ? 'EVM wallet: track it on' : 'Solana wallet: tracked on'}
            </legend>
            {chains.map((key) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={!deselected.has(key)}
                  disabled={chains.length === 1}
                  onChange={() => toggle(key)}
                />
                {CHAINS[key].name}
              </label>
            ))}
          </fieldset>
        )}

        <div className="flex items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            disabled={!family || selected.length === 0 || add.isPending}
          >
            {add.isPending ? 'Adding…' : 'Add wallet'}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
          {add.isError && <span className="text-xs text-bad">{add.error.message}</span>}
          <span className="text-xs text-muted">Read-only: only the public address is stored.</span>
        </div>
      </form>
    </Card>
  );
}
