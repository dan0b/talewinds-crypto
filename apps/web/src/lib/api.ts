import type { AppType } from '@talewinds/api';
import { hc } from 'hono/client';

/**
 * Typed API client. Route paths, params, and response shapes come straight
 * from the API's route definitions — no hand-written types, no codegen.
 * Usage: `await (await api.health.$get()).json()`
 */
export const api = hc<AppType>(window.location.origin).api;
