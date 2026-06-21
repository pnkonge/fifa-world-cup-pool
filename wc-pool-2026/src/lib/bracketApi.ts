// Client for the BracketApi.gs web app.
//
// All calls are text/plain POSTs so the browser doesn't CORS-preflight-block
// Apps Script. The deployed web app returns JSON.
//
// The /exec URL comes from an env var so it stays out of the public repo:
//   - local:   .env (gitignored)  ->  VITE_BRACKET_API_URL=https://script.google.com/.../exec
//   - Netlify: Site settings ▸ Environment variables ▸ VITE_BRACKET_API_URL
// Note: VITE_-prefixed vars are still inlined into the shipped browser bundle.
// This keeps the URL out of source control, not out of the browser — anyone
// using the site can still read it. That's fine here; the lock protects the
// post-deadline state and the pool is friendly.

import type { BracketPicks } from './bracket';

const WEBAPP_URL = (import.meta.env.VITE_BRACKET_API_URL as string | undefined) ?? '';

/** False until the env var is set — lets the UI show a local preview. */
export const API_CONFIGURED = Boolean(WEBAPP_URL);

type Action = 'validateEmail' | 'getBracket' | 'saveBracket' | 'getAllBrackets' | 'getLockInfo';

async function call<T>(action: Action, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(WEBAPP_URL, {
    method: 'POST',
    // text/plain keeps it a "simple request" — no preflight.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload }),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Bracket API ${action} failed: ${res.status}`);
  return (await res.json()) as T;
}

export interface ValidateResult {
  ok: boolean;
  email?: string;
  playerName?: string;
  /** false => the player's name has no Config!F match, so picks won't score yet. */
  canonical?: boolean;
}
export interface GetBracketResult { ok: boolean; picks: BracketPicks; }
export interface SaveResult {
  ok: boolean;
  savedCount?: number;
  total?: number;
  playerName?: string;
  canonical?: boolean;
  locked?: boolean;
  error?: string;
}
export interface AllBracketsResult {
  ok: boolean;
  locked: boolean;
  brackets: { playerName: string; picks: BracketPicks }[];
}
export interface LockInfo { ok: boolean; lockMs: number; now: number; locked: boolean; }

export const bracketApi = {
  validateEmail: (email: string) => call<ValidateResult>('validateEmail', { email }),
  getBracket: (email: string) => call<GetBracketResult>('getBracket', { email }),
  saveBracket: (email: string, picks: BracketPicks) =>
    call<SaveResult>('saveBracket', { email, picks }),
  getAllBrackets: () => call<AllBracketsResult>('getAllBrackets'),
  getLockInfo: () => call<LockInfo>('getLockInfo'),
};
