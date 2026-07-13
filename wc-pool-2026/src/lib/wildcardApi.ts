// Client for the wild-card actions on the same Apps Script web app that
// powers the bracket (VITE_BRACKET_API_URL). Reads go through the API too —
// unlike published CSVs there's no ~5 min cache, so an admin edit shows up
// on the very next fetch.
//
// The admin password is NEVER stored in this repo or the shipped bundle.
// It lives in Apps Script ▸ Project Settings ▸ Script Properties
// (key: ADMIN_PASSWORD) and every write is verified server-side.

const WEBAPP_URL = (import.meta.env.VITE_BRACKET_API_URL as string | undefined) ?? '';

/** False until the env var is set — lets the UI show a local preview. */
export const WILDCARD_API_CONFIGURED = Boolean(WEBAPP_URL);

type Action = 'getWildcards' | 'verifyAdmin' | 'saveWildcard' | 'addWildcard';

async function call<T>(action: Action, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(WEBAPP_URL, {
    method: 'POST',
    // text/plain keeps it a "simple request" — no CORS preflight.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload }),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Wildcard API ${action} failed: ${res.status}`);
  return (await res.json()) as T;
}

export interface WildcardQuestion {
  /** 1-based sheet row, used as the stable id for edits. */
  row: number;
  question: string;
  points: number;
  answer: string;
  status: 'open' | 'settled';
  /** player name -> their pick (players with a blank cell are omitted). */
  picks: Record<string, string>;
  /** False when col E didn't match any Form 1 header (typo check). */
  matched?: boolean;
  /**
   * Players the admin marked correct at settle time (col F). When present,
   * this is authoritative — the answer text is display-only. Cards settled
   * before winners existed fall back to exact answer matching.
   */
  winners?: string[];
}

export interface WildcardsResult {
  ok: boolean;
  players: string[];
  questions: WildcardQuestion[];
  error?: string;
}

export interface VerifyAdminResult { ok: boolean; valid: boolean; }

export interface WildcardSaveResult {
  ok: boolean;
  error?: string; // 'bad_password' | 'not_found' | ...
}

export const wildcardApi = {
  getWildcards: () => call<WildcardsResult>('getWildcards'),
  verifyAdmin: (password: string) => call<VerifyAdminResult>('verifyAdmin', { password }),
  saveWildcard: (
    password: string,
    row: number,
    fields: {
      question?: string;
      points?: number;
      answer?: string;
      status?: 'open' | 'settled';
      winners?: string[];
    },
  ) => call<WildcardSaveResult>('saveWildcard', { password, row, ...fields }),
  addWildcard: (password: string, question: string, points: number) =>
    call<WildcardSaveResult>('addWildcard', { password, question, points }),
};

/** Local preview data so the page renders before the API is wired up. */
export function getMockWildcards(): WildcardsResult {
  return {
    ok: true,
    players: ['Amina', 'Brian', 'Chef', 'Deka'],
    questions: [
      {
        row: 2,
        question: 'Golden Boot — who finishes as top scorer?',
        points: 5,
        answer: '',
        status: 'open',
        picks: { Amina: 'Mbappé', Brian: 'Haaland', Chef: 'Mbappé', Deka: 'Kane' },
      },
      {
        row: 3,
        question: 'Most red cards — which team collects the most?',
        points: 5,
        answer: 'Uruguay',
        status: 'settled',
        picks: { Amina: 'Argentina', Brian: 'Uruguay', Chef: 'Netherlands', Deka: 'Uruguay' },
        winners: ['Brian', 'Deka'],
      },
    ],
  };
}
