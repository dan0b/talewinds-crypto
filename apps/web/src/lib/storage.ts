import { useEffect, useState } from 'react';

/**
 * Per-viewer conveniences remembered in this browser: collapsed wallets, hidden notices, a chart's
 * range. Storage can be missing or blocked (private windows, cleared site data), so every read and
 * write is guarded and the page works the same without it. Never keep data that matters here.
 */
export function readStored<T>(key: string, parse: (raw: unknown) => T | null, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (parse(JSON.parse(raw)) ?? fallback);
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Without storage the choice just isn't remembered.
  }
}

/** `useState`, remembered in this browser under `key`. `parse` checks what was stored. */
export function useStoredState<T>(key: string, parse: (raw: unknown) => T | null, fallback: T) {
  const [value, setValue] = useState<T>(() => readStored(key, parse, fallback));
  useEffect(() => writeStored(key, value), [key, value]);
  return [value, setValue] as const;
}

/** Stored-value checks (what's in storage was written by any version of this page). */
export const parseStrings = (raw: unknown): string[] | null =>
  Array.isArray(raw) && raw.every((x) => typeof x === 'string') ? raw : null;

export const parseStringRecord = (raw: unknown): Record<string, string> | null =>
  raw !== null &&
  typeof raw === 'object' &&
  !Array.isArray(raw) &&
  Object.values(raw).every((x) => typeof x === 'string')
    ? (raw as Record<string, string>)
    : null;
