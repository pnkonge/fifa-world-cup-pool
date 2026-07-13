import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  WILDCARD_API_CONFIGURED,
  getMockWildcards,
  wildcardApi,
  type WildcardQuestion,
} from '../lib/wildcardApi';

// Session-only stash so the admin doesn't retype the password on every save.
// Cleared when the tab closes. The real check always happens server-side.
const PASS_KEY = 'wc-admin-pass';

export function WildCards() {
  const [players, setPlayers] = useState<string[]>([]);
  const [questions, setQuestions] = useState<WildcardQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adminPass, setAdminPass] = useState<string | null>(() =>
    sessionStorage.getItem(PASS_KEY),
  );
  const isAdmin = adminPass != null;

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = WILDCARD_API_CONFIGURED
        ? await wildcardApi.getWildcards()
        : getMockWildcards();
      if (!data.ok) throw new Error(data.error ?? 'unknown error');
      setPlayers(data.players);
      setQuestions(data.questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const settledCount = questions.filter((q) => q.status === 'settled').length;

  return (
    <div className="space-y-10">
      {/* Section header */}
      <div className="border-b-2 border-pitch-950 pb-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
          The Side Bets
        </p>
        <h2 className="font-display text-4xl font-black leading-none tracking-tightest text-pitch-950 sm:text-6xl">
          Wild Cards
        </h2>
        <p className="mt-3 max-w-xl font-display text-base italic text-pitch-700 sm:text-lg">
          Bonus calls made before a ball was kicked.{' '}
          <span className="not-italic font-semibold text-pitch-950">
            {settledCount} of {questions.length}
          </span>{' '}
          settled so far.
        </p>
      </div>

      {!WILDCARD_API_CONFIGURED && (
        <p className="border border-gold-500 bg-gold-50 p-3 font-mono text-[11px] text-pitch-950">
          Preview data — set VITE_BRACKET_API_URL to load the real wild cards.
        </p>
      )}
      {error && (
        <p className="border border-gold-500 bg-gold-50 p-3 font-mono text-[11px] text-pitch-950">
          Could not load wild cards: {error}
        </p>
      )}

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <p className="font-mono text-xs uppercase tracking-widest text-pitch-700">
            Loading…
          </p>
        </div>
      ) : (
        <section className="space-y-6">
          {questions.length === 0 && !error && (
            <p className="font-mono text-sm text-pitch-700">
              No wild cards yet — add a WildCards tab to the Sheet to get started.
            </p>
          )}
          {questions.map((q, i) => (
            <WildcardCard
              key={q.row}
              index={i + 1}
              q={q}
              players={players}
              adminPass={adminPass}
              onSaved={load}
            />
          ))}
        </section>
      )}

      <AdminPanel
        isAdmin={isAdmin}
        onUnlock={(pass) => {
          sessionStorage.setItem(PASS_KEY, pass);
          setAdminPass(pass);
        }}
        onLock={() => {
          sessionStorage.removeItem(PASS_KEY);
          setAdminPass(null);
        }}
        adminPass={adminPass}
        onAdded={load}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// One wild card
// ─────────────────────────────────────────────────────────────────────

function WildcardCard({
  index,
  q,
  players,
  adminPass,
  onSaved,
}: {
  index: number;
  q: WildcardQuestion;
  players: string[];
  adminPass: string | null;
  onSaved: () => void;
}) {
  const settled = q.status === 'settled';
  const answerNorm = q.answer.trim().toLowerCase();
  // Winners chosen by the admin win over string matching; the fallback keeps
  // cards settled before the winners column existed rendering correctly.
  const winnerSet = useMemo(
    () => new Set((q.winners ?? []).map((w) => w.trim())),
    [q.winners],
  );

  const pickedPlayers = players.filter((p) => q.picks[p]);
  const distinctPicks = useMemo(
    () => Array.from(new Set(Object.values(q.picks).map((v) => v.trim()))).sort(),
    [q.picks],
  );

  return (
    <article className="relative border border-pitch-300 bg-paper p-5 transition hover:border-pitch-950 sm:p-6">
      {/* Settled stamp — the ledger's signature mark */}
      {settled && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-4 -rotate-6 border-2 border-gold-500 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-gold-600"
        >
          Settled
        </span>
      )}

      <p className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
        Wild card {index.toString().padStart(2, '0')} · {q.points} pts
        {!settled && <span className="text-pitch-400"> · open</span>}
      </p>

      <h3 className="mt-2 max-w-2xl font-display text-xl font-bold leading-snug tracking-tightest text-pitch-950 sm:text-2xl">
        {q.question}
      </h3>

      {settled && q.answer && (
        <p className="mt-2 font-display text-base italic text-pitch-700">
          Answer:{' '}
          <span className="not-italic font-semibold text-gold-700">{q.answer}</span>
        </p>
      )}

      {/* Picks */}
      {pickedPlayers.length > 0 ? (
        <ul className="mt-4 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {pickedPlayers.map((p) => {
            const pick = q.picks[p];
            const correct =
              settled &&
              (winnerSet.size > 0
                ? winnerSet.has(p)
                : pick.trim().toLowerCase() === answerNorm);
            return (
              <li
                key={p}
                className="flex items-baseline justify-between gap-3 border-b border-pitch-300/30 py-1.5"
              >
                <span className="font-display text-sm font-medium text-pitch-950">
                  {p}
                </span>
                <span
                  className={[
                    'font-mono text-xs',
                    correct
                      ? 'font-semibold text-gold-700'
                      : settled
                        ? 'text-pitch-400 line-through decoration-pitch-300'
                        : 'text-pitch-800',
                  ].join(' ')}
                >
                  {pick}
                  {correct && ' ✓'}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 font-mono text-xs text-pitch-400">No picks entered yet.</p>
      )}

      {adminPass != null && q.matched === false && (
        <p className="mt-3 border border-gold-500 bg-gold-50 p-2 font-mono text-[11px] text-pitch-950">
          No Form 1 column matches this question's "Form question match" (col E in the
          WildCards tab) — fix the fragment so picks show up.
        </p>
      )}
      {adminPass != null && (
        <AdminEditor q={q} distinctPicks={distinctPicks} adminPass={adminPass} onSaved={onSaved} />
      )}
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Admin: per-card editor
// ─────────────────────────────────────────────────────────────────────

// Accent- and case-insensitive compare so typing "Mbappe" pre-checks a
// "Mbappé" pick. Judgment calls (typos, partial names) stay manual.
function normalizePick(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function AdminEditor({
  q,
  distinctPicks,
  adminPass,
  onSaved,
}: {
  q: WildcardQuestion;
  distinctPicks: string[];
  adminPass: string;
  onSaved: () => void;
}) {
  const [answer, setAnswer] = useState(q.answer);
  const [points, setPoints] = useState(String(q.points));
  // Manual checkbox toggles. Players without an entry follow the baseline:
  // saved winners if the card has them, otherwise whatever matches the
  // answer text — so retyping the answer never clobbers a manual call.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const pickers = Object.keys(q.picks);
  const savedWinners = q.winners ?? [];
  const baselineWinner = (p: string) =>
    savedWinners.length > 0
      ? savedWinners.includes(p)
      : normalizePick(answer) !== '' && normalizePick(q.picks[p]) === normalizePick(answer);
  const isWinner = (p: string) => overrides[p] ?? baselineWinner(p);
  const winners = pickers.filter(isWinner);

  async function save(status: 'open' | 'settled') {
    setBusy(true);
    setMsg(null);
    try {
      const res = await wildcardApi.saveWildcard(adminPass, q.row, {
        answer: answer.trim(),
        points: Number(points) || 0,
        status,
        winners,
      });
      if (!res.ok) {
        setMsg(res.error === 'bad_password' ? 'Wrong password — lock and unlock again.' : `Save failed: ${res.error ?? 'unknown'}`);
        return;
      }
      setMsg(status === 'settled' ? 'Settled ✓' : 'Saved ✓');
      onSaved();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const listId = `picks-${q.row}`;

  return (
    <div className="mt-5 border-t border-dashed border-pitch-300 pt-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-gold-700">
        Admin · edit this wild card
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
            Correct answer
          </span>
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            list={listId}
            placeholder="e.g. Mbappé"
            className="w-48 border border-pitch-300 bg-paper px-3 py-2 font-mono text-sm text-pitch-950 focus:border-pitch-950 focus:outline-none"
          />
          <datalist id={listId}>
            {distinctPicks.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
            Points
          </span>
          <input
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            inputMode="numeric"
            className="w-20 border border-pitch-300 bg-paper px-3 py-2 font-mono text-sm text-pitch-950 focus:border-pitch-950 focus:outline-none"
          />
        </label>
      </div>

      {/* The admin is the judge: points go to checked players, not to whoever
          exactly matches the answer string. Typing the answer pre-checks the
          obvious matches; typos like "Micheal" get checked by hand. */}
      {pickers.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
            Who got it right · {winners.length} selected
          </p>
          <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {pickers.map((p) => (
              <li key={p}>
                <label className="flex cursor-pointer items-center justify-between gap-3 border-b border-pitch-300/30 py-1.5">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isWinner(p)}
                      onChange={(e) =>
                        setOverrides((o) => ({ ...o, [p]: e.target.checked }))
                      }
                      className="accent-pitch-950"
                    />
                    <span className="font-display text-sm font-medium text-pitch-950">
                      {p}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-pitch-800">{q.picks[p]}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => save('settled')}
          disabled={busy || !answer.trim()}
          className="border border-pitch-950 bg-pitch-950 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-paper transition hover:bg-pitch-800 disabled:opacity-40"
        >
          {q.status === 'settled' ? 'Update answer' : 'Settle'}
        </button>
        {q.status === 'settled' ? (
          <button
            onClick={() => save('open')}
            disabled={busy}
            className="border border-pitch-950 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-pitch-950 transition hover:bg-pitch-50 disabled:opacity-40"
          >
            Reopen
          </button>
        ) : (
          <button
            onClick={() => save('open')}
            disabled={busy}
            className="border border-pitch-950 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-pitch-950 transition hover:bg-pitch-50 disabled:opacity-40"
          >
            Save without settling
          </button>
        )}
      </div>
      {msg && <p className="mt-2 font-mono text-[11px] text-pitch-700">{msg}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Admin: unlock + add-question panel (bottom of page, deliberately quiet)
// ─────────────────────────────────────────────────────────────────────

function AdminPanel({
  isAdmin,
  adminPass,
  onUnlock,
  onLock,
  onAdded,
}: {
  isAdmin: boolean;
  adminPass: string | null;
  onUnlock: (pass: string) => void;
  onLock: () => void;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [newQ, setNewQ] = useState('');
  const [newPts, setNewPts] = useState('5');

  async function unlock() {
    if (!pass.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      if (!WILDCARD_API_CONFIGURED) {
        setMsg('API not configured — admin needs VITE_BRACKET_API_URL.');
        return;
      }
      const res = await wildcardApi.verifyAdmin(pass);
      if (res.ok && res.valid) {
        onUnlock(pass);
        setPass('');
        setMsg(null);
      } else {
        setMsg('Wrong password.');
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function addQuestion() {
    if (!adminPass || !newQ.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await wildcardApi.addWildcard(adminPass, newQ.trim(), Number(newPts) || 0);
      if (!res.ok) {
        setMsg(res.error === 'bad_password' ? 'Wrong password — lock and unlock again.' : `Add failed: ${res.error ?? 'unknown'}`);
        return;
      }
      setNewQ('');
      setMsg('Added ✓ — enter friends’ picks in the Sheet.');
      onAdded();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="border-t border-pitch-300/40 pt-6">
      {!isAdmin ? (
        <div>
          <button
            onClick={() => setOpen((v) => !v)}
            className="font-mono text-[10px] uppercase tracking-widest text-pitch-400 transition hover:text-pitch-950"
          >
            Admin
          </button>
          {open && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && unlock()}
                placeholder="Admin password"
                autoComplete="current-password"
                className="w-56 border border-pitch-300 bg-paper px-3 py-2 font-mono text-sm text-pitch-950 focus:border-pitch-950 focus:outline-none"
              />
              <button
                onClick={unlock}
                disabled={busy || !pass.trim()}
                className="border border-pitch-950 bg-pitch-950 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-paper transition hover:bg-pitch-800 disabled:opacity-40"
              >
                {busy ? '…' : 'Unlock'}
              </button>
            </div>
          )}
          {msg && <p className="mt-2 font-mono text-[11px] text-pitch-700">{msg}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-widest text-gold-700">
              Admin mode — edits save straight to the Sheet
            </p>
            <button
              onClick={onLock}
              className="font-mono text-[10px] uppercase tracking-widest text-pitch-700 transition hover:text-pitch-950"
            >
              Lock
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-md">
              <span className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
                New wild card question
              </span>
              <input
                value={newQ}
                onChange={(e) => setNewQ(e.target.value)}
                placeholder="e.g. Which keeper saves the most penalties?"
                className="border border-pitch-300 bg-paper px-3 py-2 font-mono text-sm text-pitch-950 focus:border-pitch-950 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
                Points
              </span>
              <input
                value={newPts}
                onChange={(e) => setNewPts(e.target.value)}
                inputMode="numeric"
                className="w-20 border border-pitch-300 bg-paper px-3 py-2 font-mono text-sm text-pitch-950 focus:border-pitch-950 focus:outline-none"
              />
            </label>
            <button
              onClick={addQuestion}
              disabled={busy || !newQ.trim()}
              className="border border-pitch-950 bg-pitch-950 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-paper transition hover:bg-pitch-800 disabled:opacity-40"
            >
              Add question
            </button>
          </div>
          {msg && <p className="font-mono text-[11px] text-pitch-700">{msg}</p>}
        </div>
      )}
    </aside>
  );
}
