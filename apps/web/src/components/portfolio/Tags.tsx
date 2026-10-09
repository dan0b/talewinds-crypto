import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useState } from 'react';
import { api, type HoldingsView, okJson } from '../../lib/api.ts';
import { Button } from '../ui.tsx';

type TagRef = HoldingsView['tags']['categories'][number];
type CoinTags = { category: TagRef | null; themes: TagRef[] };
type Kind = 'category' | 'theme';

/** Offered while you have no categories yet; clicking one creates it. */
const SUGGESTED_CATEGORIES = ['Major', 'Speculative', 'Stable'];

function Chip({
  selected,
  dashed,
  onClick,
  disabled,
  children,
}: {
  selected?: boolean;
  dashed?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const look = selected
    ? 'border-accent bg-canvas text-fg'
    : dashed
      ? 'border-dashed border-border text-muted hover:text-fg'
      : 'border-border text-muted hover:text-fg';
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-xs disabled:opacity-50 ${look}`}
    >
      {children}
    </button>
  );
}

/** A name field that creates a tag on Enter. */
function NewTag({ kind, onCreate }: { kind: Kind; onCreate: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  if (!open) {
    return (
      <Chip dashed onClick={() => setOpen(true)}>
        + New {kind}
      </Chip>
    );
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onCreate(name.trim());
    setName('');
    setOpen(false);
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <input
        // biome-ignore lint/a11y/noAutofocus: the field opens because you asked to type a name.
        autoFocus
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        placeholder={kind === 'category' ? 'e.g. Major' : 'e.g. V4 Hooks'}
        aria-label={`New ${kind} name`}
        className="w-36 rounded-md border border-border bg-canvas px-2 py-0.5 text-xs text-fg"
      />
    </form>
  );
}

/** Pick a coin's category and themes; new ones can be created inline. */
export function TagEditor({
  coinKey,
  coinLabel,
  tags,
  all,
}: {
  coinKey: string;
  coinLabel: string;
  tags: CoinTags;
  all: HoldingsView['tags'];
}) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['holdings'] });

  const setCategory = useMutation({
    mutationFn: async (tagId: string | null) =>
      okJson(await api['coin-tags'].category.$put({ json: { coinKey, tagId } })),
    onSuccess: refresh,
  });
  const setThemes = useMutation({
    mutationFn: async (tagIds: string[]) =>
      okJson(await api['coin-tags'].themes.$put({ json: { coinKey, tagIds } })),
    onSuccess: refresh,
  });
  const create = useMutation({
    mutationFn: async ({ kind, name }: { kind: Kind; name: string }) =>
      (await okJson(await api.tags.$post({ json: { kind, name } }), 201)).tag,
    onSuccess: async (tag) => {
      // A new tag is meant for this coin: assign it right away.
      if (tag.kind === 'category') await setCategory.mutateAsync(tag.id);
      else await setThemes.mutateAsync([...tags.themes.map((t) => t.id), tag.id]);
    },
  });

  const busy = setCategory.isPending || setThemes.isPending || create.isPending;
  const error = setCategory.error ?? setThemes.error ?? create.error;
  const themeIds = new Set(tags.themes.map((t) => t.id));
  const toggleTheme = (id: string) =>
    setThemes.mutate(themeIds.has(id) ? [...themeIds].filter((x) => x !== id) : [...themeIds, id]);

  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 text-muted">Category</span>
        {all.categories.map((t) => (
          <Chip
            key={t.id}
            selected={tags.category?.id === t.id}
            disabled={busy}
            onClick={() => setCategory.mutate(tags.category?.id === t.id ? null : t.id)}
          >
            {t.name}
          </Chip>
        ))}
        {all.categories.length === 0 &&
          SUGGESTED_CATEGORIES.map((name) => (
            <Chip
              key={name}
              dashed
              disabled={busy}
              onClick={() => create.mutate({ kind: 'category', name })}
            >
              {name}
            </Chip>
          ))}
        <NewTag kind="category" onCreate={(name) => create.mutate({ kind: 'category', name })} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 text-muted">Themes</span>
        {all.themes.map((t) => (
          <Chip
            key={t.id}
            selected={themeIds.has(t.id)}
            disabled={busy}
            onClick={() => toggleTheme(t.id)}
          >
            {t.name}
          </Chip>
        ))}
        <NewTag kind="theme" onCreate={(name) => create.mutate({ kind: 'theme', name })} />
      </div>
      <p className="text-muted">
        Tags apply to {coinLabel} everywhere you hold it. Click a selected category again to clear
        it.
      </p>
      {error && <p className="text-bad">{error.message}</p>}
    </div>
  );
}

/** Rename or delete categories and themes; deleting removes a tag from every coin. */
export function TagManager({ all, onClose }: { all: HoldingsView['tags']; onClose: () => void }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['holdings'] });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) =>
      okJson(await api.tags[':id'].$patch({ param: { id }, json: { name } })),
    onSuccess: async () => {
      await refresh();
      setEditing(null);
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => okJson(await api.tags[':id'].$delete({ param: { id } })),
    onSuccess: refresh,
  });

  const section = (title: string, list: TagRef[]) => (
    <div>
      <h4 className="mb-1 text-xs font-medium text-muted">{title}</h4>
      {list.length === 0 && <p className="text-xs text-muted">None yet.</p>}
      <ul className="space-y-1">
        {list.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-sm">
            {editing === t.id ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim()) rename.mutate({ id: t.id, name: draft.trim() });
                }}
              >
                <input
                  // biome-ignore lint/a11y/noAutofocus: you just asked to rename this tag.
                  autoFocus
                  value={draft}
                  maxLength={40}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                  aria-label={`New name for ${t.name}`}
                  className="w-40 rounded-md border border-border bg-canvas px-2 py-0.5 text-xs text-fg"
                />
                <Button type="submit" className="px-2 py-0.5 text-xs" disabled={rename.isPending}>
                  Save
                </Button>
              </form>
            ) : (
              <>
                <span>{t.name}</span>
                <button
                  type="button"
                  className="text-xs text-muted hover:text-fg"
                  onClick={() => {
                    setDraft(t.name);
                    setEditing(t.id);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="text-xs text-muted hover:text-bad"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete "${t.name}"? It's removed from every coin.`))
                      remove.mutate(t.id);
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="mb-4 rounded-md border border-border/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">Categories and themes</span>
        <Button className="px-2 py-0.5 text-xs" onClick={onClose}>
          Done
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {section('Categories (one per coin)', all.categories)}
        {section('Themes (any number per coin)', all.themes)}
      </div>
      {(rename.error ?? remove.error) && (
        <p className="mt-2 text-xs text-bad">{(rename.error ?? remove.error)?.message}</p>
      )}
    </div>
  );
}
