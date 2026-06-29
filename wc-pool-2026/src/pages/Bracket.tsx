import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cascade, scoreBracket, STAGE_ORDER, STAGE_LABEL, maxKnockoutScore,
  displayOrder,
  type BracketPicks, type BracketResults, type BracketStructure, type KnockoutStage,
  type ResolvedSlot,
} from '../lib/bracket';
import { buildDummyBracket } from '../lib/dummyBracket';
import { bracketApi, API_CONFIGURED } from '../lib/bracketApi';

// Column order left→right. 3rd place sits beside the Final.
const COLUMN_STAGES: KnockoutStage[] = ['R32', 'R16', 'QF', 'SF', 'Final'];

// Mirrors LOCK_MS in BracketApi.gs (3:00 PM real Eastern clock time on
// June 28 2026 = 19:00 UTC under EDT). Only used until getLockInfo answers;
// the server time is authoritative. Keep these two in sync.
const LOCK_FALLBACK_MS = Date.UTC(2026, 5, 28, 19, 0, 0);

// Remembers the signed-in email across reloads (no password — identity only).
const EMAIL_KEY = 'wc2026.bracket.email';

type Identity = { email: string; playerName: string };

// Real knockout results are fetched from the Results tab via getResults.

export function Bracket() {
  // Real knockout teams from Config!J6:J37 (via the web app). They come back
  // blank while the group stage is still running, so the bracket shows TBD
  // slots until "Update Standings" fills them in (~June 27).
  const [teams, setTeams] = useState<string[] | null>(null);
  useEffect(() => {
    if (!API_CONFIGURED) { setTeams(null); return; } // preview uses sample teams
    bracketApi.getTeams()
      .then((r) => setTeams(r.ok ? r.teams : []))
      .catch(() => setTeams([]));
  }, []);
  const teamsReady = !!teams && teams.some((t) => !!t && !!t.trim());

  const structure: BracketStructure = useMemo(() => {
    if (!API_CONFIGURED) return buildDummyBracket(); // local preview only
    // `teams` now arrives already resolved into R32 match order by the backend
    // (Match 73 A,B, Match 74 A,B, …), so seeds[2i]/seeds[2i+1] are match i's
    // two teams — correct pairings, not raw standings order. Third-place slots
    // stay blank until narrowed in the schedule sheet.
    const seeds = Array.from({ length: 32 }, (_, i) => (teams && teams[i] ? teams[i].trim() : ''));
    const s = buildDummyBracket(seeds);
    s.slots.forEach((slot) => {
      if (slot.seedA === '') slot.seedA = null;
      if (slot.seedB === '') slot.seedB = null;
    });
    return s;
  }, [teams]);

  // ── Lock state ───────────────────────────────────────────────────
  const [lockMs, setLockMs] = useState(LOCK_FALLBACK_MS);
  const [now, setNow] = useState(() => Date.now());
  const locked = now >= lockMs;

  useEffect(() => {
    if (!API_CONFIGURED) return;
    bracketApi.getLockInfo().then((r) => {
      if (r.ok) { setLockMs(r.lockMs); setNow(r.now); }
    }).catch(() => {});
  }, []);

  // Tick the countdown once a second while we're still pre-lock.
  useEffect(() => {
    if (locked) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [locked]);

  // ── Identity ─────────────────────────────────────────────────────
  const [identity, setIdentity] = useState<Identity | null>(null);

  // Re-identify a remembered email on load (skips the gate on return visits).
  useEffect(() => {
    if (!API_CONFIGURED) return;
    const saved = localStorage.getItem(EMAIL_KEY);
    if (!saved) return;
    bracketApi.validateEmail(saved).then((r) => {
      if (r.ok && r.email) setIdentity({ email: r.email, playerName: r.playerName ?? r.email });
      else localStorage.removeItem(EMAIL_KEY);
    }).catch(() => {});
  }, []);

  function signOut() {
    localStorage.removeItem(EMAIL_KEY);
    setIdentity(null);
    setPicks({});
  }

  // ── Picks ────────────────────────────────────────────────────────
  const [picks, setPicks] = useState<BracketPicks>({});
  const resolved = useMemo(() => cascade(structure, picks), [structure, picks]);
  const picksMade = useMemo(
    () => structure.slots.filter((s) => picks[s.id]).length,
    [structure, picks],
  );
  const totalSlots = structure.slots.length;

  // Load this player's saved bracket once identified.
  useEffect(() => {
    if (!identity || !API_CONFIGURED) return;
    bracketApi.getBracket(identity.email).then((r) => {
      if (r.ok) setPicks(r.picks ?? {});
    }).catch(() => {});
  }, [identity]);

  const choose = useCallback((slotId: string, team: string) => {
    setPicks((prev) => pruneStale(structure, { ...prev, [slotId]: team }));
  }, [structure]);

  // The screens.
  if (!API_CONFIGURED) {
    return <Shell><PreviewNotice /><Editor
      structure={structure} resolved={resolved} picks={picks}
      picksMade={picksMade} totalSlots={totalSlots} onChoose={choose}
      lockMs={lockMs} now={now} preview identity={{ email: '', playerName: 'Preview' }}
      onSignOut={signOut} onClear={() => setPicks({})} teamsReady
    /></Shell>;
  }

  if (locked) {
    return <Shell><Reveal structure={structure} lockMs={lockMs} /></Shell>;
  }

  if (!identity) {
    return <Shell><Gate onIdentified={(id) => {
      localStorage.setItem(EMAIL_KEY, id.email);
      setIdentity(id);
    }} /></Shell>;
  }

  return (
    <Shell>
      <Editor
        structure={structure} resolved={resolved} picks={picks}
        picksMade={picksMade} totalSlots={totalSlots} onChoose={choose}
        lockMs={lockMs} now={now} identity={identity} onSignOut={signOut}
        onClear={() => setPicks({})} teamsReady={teamsReady}
      />
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shell + header
// ─────────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="space-y-8">{children}</div>;
}

function Header({ kicker, sub }: { kicker: string; sub: string }) {
  return (
    <div className="border-b-2 border-pitch-950 pb-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">{kicker}</p>
      <h2 className="font-display text-4xl font-black leading-none tracking-tightest text-pitch-950 sm:text-6xl">
        The Bracket
      </h2>
      <p className="mt-3 max-w-2xl font-display text-base italic text-pitch-700 sm:text-lg">{sub}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Gate — email entry
// ─────────────────────────────────────────────────────────────────────

function Gate({ onIdentified }: { onIdentified: (id: Identity) => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const e = email.trim();
    if (!e) return;
    setBusy(true); setError('');
    try {
      const r = await bracketApi.validateEmail(e);
      if (r.ok && r.email) {
        onIdentified({ email: r.email, playerName: r.playerName ?? r.email });
      } else {
        setError("We don't recognize that email. Use the one you registered with.");
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header
        kicker="Knockout Stage · Your bracket"
        sub="Sign in with your email to fill out your knockout picks. Your bracket stays private until everyone's locks on deadline day — then they all go public at once."
      />
      <div className="max-w-md border border-pitch-300/60 bg-paper p-6">
        <label className="block font-mono text-[10px] uppercase tracking-widest text-pitch-700">
          Your email
        </label>
        <input
          type="email"
          value={email}
          autoFocus
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="you@example.com"
          className="mt-2 w-full border border-pitch-950 bg-paper px-3 py-2 font-display text-base text-pitch-950 outline-none placeholder:text-pitch-300 focus:bg-pitch-50"
        />
        {error && (
          <p className="mt-2 font-mono text-[11px] text-red-700">{error}</p>
        )}
        <button
          onClick={submit}
          disabled={busy || !email.trim()}
          className="mt-4 w-full border border-pitch-950 bg-pitch-950 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-paper transition hover:bg-pitch-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Checking…' : 'Open my bracket'}
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Editor — pick + save, pre-lock
// ─────────────────────────────────────────────────────────────────────

function Editor({
  structure, resolved, picks, picksMade, totalSlots, onChoose,
  lockMs, now, identity, onSignOut, onClear, teamsReady, preview = false,
}: {
  structure: BracketStructure;
  resolved: Map<string, ResolvedSlot>;
  picks: BracketPicks;
  picksMade: number;
  totalSlots: number;
  onChoose: (slotId: string, team: string) => void;
  lockMs: number;
  now: number;
  identity: Identity;
  onSignOut: () => void;
  onClear: () => void;
  teamsReady: boolean;
  preview?: boolean;
}) {
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMsg, setSaveMsg] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const complete = picksMade === totalSlots;
  const remaining = totalSlots - picksMade;

  // Any edit clears a stale "saved" badge.
  const lastPicks = useRef(picks);
  useEffect(() => {
    if (lastPicks.current !== picks && saveState === 'saved') setSaveState('idle');
    lastPicks.current = picks;
  }, [picks, saveState]);

  async function save() {
    if (preview) return;
    setSaveState('saving'); setSaveMsg('');
    try {
      const r = await bracketApi.saveBracket(identity.email, picks);
      if (r.ok) {
        setSaveState('saved');
        setSaveMsg(
          (r.savedCount ?? picksMade) === totalSlots
            ? `Complete bracket saved — edit anytime before ${lockLabel(lockMs)}.`
            : `Saved ${r.savedCount}/${r.total} — finish your picks before ${lockLabel(lockMs)}.`,
        );
      } else if (r.locked) {
        setSaveState('error'); setSaveMsg('Picks are locked — the deadline has passed.');
      } else if (r.error === 'name_not_in_roster') {
        setSaveState('error'); setSaveMsg("Your name isn't on the player list yet. Check with the pool admin.");
      } else {
        setSaveState('error'); setSaveMsg('Could not save. Try again in a moment.');
      }
    } catch {
      setSaveState('error'); setSaveMsg('Network error. Your picks are still here — try saving again.');
    }
  }

  return (
    <>
      <Header
        kicker={`Knockout Stage · ${identity.playerName}`}
        sub="Pick a winner in every match — your choice advances to the next round automatically. 2 points for each correct pick."
      />

      {/* Control bar: identity, countdown, progress, save */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-pitch-300/40 py-3">
        <div className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
          {identity.playerName}
          {!preview && (
            <button onClick={onSignOut} className="ml-2 underline decoration-pitch-300 underline-offset-2 hover:text-pitch-950">
              not you?
            </button>
          )}
        </div>

        <Countdown lockMs={lockMs} now={now} />

        <div className="ml-auto flex items-center gap-4">
          <span className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
            <span className={complete ? 'text-pitch-950' : ''}>{picksMade}</span> / {totalSlots} picked
          </span>

          {confirmClear ? (
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-pitch-700">
              Clear all?
              <button
                onClick={() => { onClear(); setConfirmClear(false); setSaveState('idle'); setSaveMsg(''); }}
                className="border border-red-300 px-2 py-1.5 text-red-700 transition hover:border-red-500 hover:bg-red-50"
              >
                yes, clear
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="border border-pitch-300 px-2 py-1.5 transition hover:border-pitch-950 hover:text-pitch-950"
              >
                keep
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              disabled={preview || picksMade === 0}
              className="border border-pitch-300 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-pitch-700 transition hover:border-pitch-950 hover:text-pitch-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear picks
            </button>
          )}

          <button
            onClick={save}
            disabled={preview || saveState === 'saving' || picksMade === 0}
            className="border border-pitch-950 bg-pitch-950 px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest text-paper transition hover:bg-pitch-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saveState === 'saving' ? 'Saving…' : complete ? 'Submit bracket' : 'Save progress'}
          </button>
        </div>
      </div>

      {/* Save / completeness feedback */}
      {(saveMsg || (!complete && picksMade > 0)) && (
        <div
          className={[
            'flex items-center gap-2 border px-4 py-2 font-mono text-[11px]',
            saveState === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : saveState === 'saved'
                ? 'border-green-200 bg-green-50 text-green-900'
                : 'border-pitch-300/60 bg-paper text-pitch-700',
          ].join(' ')}
        >
          {saveState === 'saved' && <CheckIcon className="text-green-700" />}
          <span>
            {saveMsg ||
              `You've picked ${picksMade} of ${totalSlots} — ${remaining} to go before you can submit.`}
          </span>
        </div>
      )}

      {!teamsReady && (
        <div className="border border-gold-600/40 bg-gold-50 px-4 py-2 font-mono text-[11px] text-gold-800">
          Knockout teams aren't set yet — they fill in automatically as the group stage finishes, before picks lock {lockLabel(lockMs)}. The matchups below stay greyed until then.
        </div>
      )}

      <BracketGrid structure={structure} resolved={resolved} picks={picks} onChoose={onChoose} />
    </>
  );
}

function Countdown({ lockMs, now }: { lockMs: number; now: number }) {
  const left = Math.max(0, lockMs - now);
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">Picks lock in</span>
      <span className="font-display text-2xl font-black tracking-tightest text-gold-600 tabular-nums">
        {fmtCountdown(left)}
      </span>
      <span className="font-mono text-[10px] text-pitch-700">· {lockLabel(lockMs)}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Reveal — post-lock, all brackets public
// ─────────────────────────────────────────────────────────────────────

function Reveal({ structure, lockMs }: { structure: BracketStructure; lockMs: number }) {
  const [brackets, setBrackets] = useState<{ playerName: string; picks: BracketPicks }[] | null>(null);
  const [results, setResults] = useState<BracketResults>({});
  const [sel, setSel] = useState(0);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!API_CONFIGURED) return;
    bracketApi.getAllBrackets().then((r) => {
      if (r.ok && r.locked) setBrackets(r.brackets);
      else setErr('Brackets are not available yet.');
    }).catch(() => setErr('Could not load brackets. Refresh to try again.'));
  }, []);

  // Fetch real knockout results and auto-refresh every 2 minutes
  // so scores update live as matches finish.
  useEffect(() => {
    if (!API_CONFIGURED) return;
    function fetchResults() {
      bracketApi.getResults().then((r) => {
        if (r.ok) setResults(r.results);
      }).catch(() => {});
    }
    fetchResults();
    const id = setInterval(fetchResults, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const hasResults = Object.keys(results).length > 0;
  const current = brackets?.[sel];
  const resolved = useMemo(
    () => (current ? cascade(structure, current.picks) : new Map()),
    [structure, current],
  );
  const score = useMemo(
    () => (current ? scoreBracket(structure, current.picks, results) : null),
    [structure, current, results],
  );

  return (
    <>
      <Header
        kicker="Knockout Stage · Locked"
        sub={`Picks locked ${lockLabel(lockMs)}. Every bracket is now public — pick a player to see their run through the knockouts.`}
      />

      {err && <p className="font-mono text-[11px] text-red-700">{err}</p>}
      {!brackets && !err && <p className="font-mono text-[11px] text-pitch-700">Loading brackets…</p>}

      {brackets && brackets.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2 border-y border-pitch-300/40 py-3">
            {brackets.map((b, i) => (
              <button
                key={b.playerName + i}
                onClick={() => setSel(i)}
                className={[
                  'border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition',
                  i === sel
                    ? 'border-pitch-950 bg-pitch-950 text-paper'
                    : 'border-pitch-300 text-pitch-700 hover:border-pitch-950 hover:text-pitch-950',
                ].join(' ')}
              >
                {b.playerName}
              </button>
            ))}
          </div>

          {hasResults && score && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-pitch-300/60 bg-paper p-4">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">Knockout score</span>
                <span className="font-display text-2xl font-black tracking-tightest text-gold-600">{score.total}</span>
                <span className="font-mono text-xs text-pitch-700">/ {maxKnockoutScore(structure)}</span>
              </div>
              {STAGE_ORDER.map((stage) => (
                <div key={stage} className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">{stage}</span>
                  <span className="font-mono text-sm font-semibold text-pitch-950">{score.byStage[stage]}</span>
                </div>
              ))}
            </div>
          )}

          {current && (
            <BracketGrid
              structure={structure} resolved={resolved} picks={current.picks}
              results={results} showResults={hasResults} readOnly
              onChoose={() => {}}
            />
          )}
        </>
      )}

      {brackets && brackets.length === 0 && (
        <p className="font-mono text-[11px] text-pitch-700">No brackets were submitted.</p>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Bracket grid (shared by editor + reveal)
// ─────────────────────────────────────────────────────────────────────

function BracketGrid({
  structure, resolved, picks, results = {}, showResults = false, readOnly = false, onChoose,
}: {
  structure: BracketStructure;
  resolved: Map<string, ResolvedSlot>;
  picks: BracketPicks;
  results?: BracketResults;
  showResults?: boolean;
  readOnly?: boolean;
  onChoose: (slotId: string, team: string) => void;
}) {
  const order = useMemo(() => displayOrder(structure), [structure]);
  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex min-w-[900px] gap-6">
        {COLUMN_STAGES.map((stage) => (
          <BracketColumn
            key={stage}
            stage={stage}
            structure={structure}
            slotOrder={order.get(stage) ?? []}
            resolved={resolved}
            picks={picks}
            results={results}
            showResults={showResults}
            readOnly={readOnly}
            onChoose={onChoose}
            thirdPlace={stage === 'Final'}
          />
        ))}
      </div>
    </div>
  );
}

function PreviewNotice() {
  return (
    <div className="border border-gold-600/40 bg-gold-50 px-4 py-2 font-mono text-[11px] text-gold-800">
      Backend not connected. Paste your Web App /exec URL into <span className="font-semibold">lib/bracketApi.ts</span> to enable sign-in, saving, and the reveal. This is a local preview — picks won't be saved.
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Presentational pieces (carried over, with read-only support)
// ─────────────────────────────────────────────────────────────────────

function BracketColumn({
  stage, structure, slotOrder, resolved, picks, results, showResults, readOnly, onChoose, thirdPlace,
}: {
  stage: KnockoutStage;
  structure: BracketStructure;
  slotOrder: string[];
  resolved: Map<string, ResolvedSlot>;
  picks: BracketPicks;
  results: BracketResults;
  showResults: boolean;
  readOnly: boolean;
  onChoose: (slotId: string, team: string) => void;
  thirdPlace: boolean;
}) {
  // Use tree-walk order so adjacent matches feed the same next-round match.
  const slots = slotOrder
    .map((id) => structure.byId.get(id))
    .filter((s): s is NonNullable<typeof s> => !!s);
  const thirdSlot = thirdPlace ? structure.slots.find((s) => s.stage === '3rd') : undefined;

  return (
    <div className="flex min-w-[170px] flex-1 flex-col">
      <h3 className="mb-3 border-b border-pitch-950 pb-1 font-mono text-[10px] uppercase tracking-widest text-pitch-700">
        {STAGE_LABEL[stage]}
      </h3>
      <div className="flex flex-1 flex-col justify-around gap-3">
        {slots.map((slot) => (
          <MatchupCard
            key={slot.id}
            slotId={slot.id}
            comp={resolved.get(slot.id)}
            pick={picks[slot.id]}
            realWinner={results[slot.id]}
            showResults={showResults}
            readOnly={readOnly}
            onChoose={onChoose}
          />
        ))}
      </div>

      {thirdSlot && (
        <div className="mt-6">
          <h3 className="mb-3 border-b border-pitch-300 pb-1 font-mono text-[10px] uppercase tracking-widest text-pitch-700">
            {STAGE_LABEL['3rd']}
          </h3>
          <MatchupCard
            slotId={thirdSlot.id}
            comp={resolved.get(thirdSlot.id)}
            pick={picks[thirdSlot.id]}
            realWinner={results[thirdSlot.id]}
            showResults={showResults}
            readOnly={readOnly}
            onChoose={onChoose}
          />
        </div>
      )}
    </div>
  );
}

function MatchupCard({
  slotId, comp, pick, realWinner, showResults, readOnly, onChoose,
}: {
  slotId: string;
  comp: ResolvedSlot | undefined;
  pick: string | undefined;
  realWinner: string | undefined;
  showResults: boolean;
  readOnly: boolean;
  onChoose: (slotId: string, team: string) => void;
}) {
  const pickable = comp?.pickable ?? false;
  const aPicked = !!pick && pick === comp?.a;
  const bPicked = !!pick && pick === comp?.b;
  const hasPick = aPicked || bPicked;

  return (
    <div
      className={[
        'overflow-hidden rounded-[2px] border bg-paper transition',
        pickable ? 'border-pitch-300' : 'border-pitch-200/50 opacity-50',
      ].join(' ')}
    >
      <TeamButton
        slotId={slotId} team={comp?.a ?? null} picked={aPicked}
        otherPicked={hasPick && !aPicked} realWinner={realWinner}
        showResults={showResults} readOnly={readOnly} disabled={!pickable} onChoose={onChoose}
      />
      <div className="h-px bg-pitch-200" />
      <TeamButton
        slotId={slotId} team={comp?.b ?? null} picked={bPicked}
        otherPicked={hasPick && !bPicked} realWinner={realWinner}
        showResults={showResults} readOnly={readOnly} disabled={!pickable} onChoose={onChoose}
      />
    </div>
  );
}

function TeamButton({
  slotId, team, picked, otherPicked, realWinner, showResults, readOnly, disabled, onChoose,
}: {
  slotId: string;
  team: string | null;
  picked: boolean;
  otherPicked: boolean;
  realWinner: string | undefined;
  showResults: boolean;
  readOnly: boolean;
  disabled: boolean;
  onChoose: (slotId: string, team: string) => void;
}) {
  const isRealWinner = showResults && !!realWinner && team === realWinner;
  const correct = showResults && picked && isRealWinner;
  const wrong = showResults && picked && !!realWinner && team !== realWinner;
  const interactive = !disabled && !readOnly && !!team && !showResults;

  const classes = [
    'flex w-full items-center justify-between px-3 py-2 text-left transition',
    'border-l-[3px]',
  ];
  classes.push(picked ? 'border-l-gold-600' : 'border-l-transparent');
  classes.push(picked ? 'font-semibold' : 'font-medium');
  if (otherPicked && !showResults) classes.push('text-pitch-400/60');

  if (correct) {
    classes.push('bg-green-50 text-green-900');
  } else if (wrong) {
    classes.push('bg-red-50 text-red-800 line-through');
    classes.push('border-l-red-400');
  } else if (showResults && isRealWinner && !picked) {
    classes.push('bg-gold-50 text-gold-800');
  } else if (showResults && otherPicked) {
    classes.push('text-pitch-400/60');
  } else {
    classes.push('text-pitch-950');
  }

  if (interactive) classes.push('hover:bg-pitch-50 cursor-pointer');
  else classes.push('cursor-default');

  return (
    <button
      disabled={disabled || !team || readOnly || showResults}
      onClick={() => interactive && team && onChoose(slotId, team)}
      className={classes.join(' ')}
    >
      <span className="font-display text-sm">
        {team ?? <span className="italic text-pitch-300 no-underline">—</span>}
      </span>

      {!showResults && picked && <CheckIcon className="text-gold-600" />}
      {correct && (
        <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-green-700 no-underline">
          <CheckIcon className="text-green-700" /> got it
        </span>
      )}
      {wrong && (
        <span className="font-mono text-[9px] uppercase tracking-widest text-red-700 no-underline">your pick</span>
      )}
      {showResults && isRealWinner && !picked && (
        <span className="font-mono text-[9px] uppercase tracking-widest text-gold-700">won</span>
      )}
    </button>
  );
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="3" strokeLinecap="round"
      strokeLinejoin="round" className={className} aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function fmtCountdown(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

// Renders the lock moment in Toronto wall-clock time (the pool's timezone).
function lockLabel(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    timeZone: 'America/Toronto',
    month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}

/**
 * Remove picks for slots whose competitors no longer include the picked team
 * (because an upstream pick changed). Iterates to a fixed point.
 */
function pruneStale(structure: BracketStructure, picks: BracketPicks): BracketPicks {
  let changed = true;
  const current = { ...picks };
  while (changed) {
    changed = false;
    const resolved = cascade(structure, current);
    for (const slot of structure.slots) {
      const pick = current[slot.id];
      if (!pick) continue;
      const comp = resolved.get(slot.id);
      if (!comp || (comp.a !== pick && comp.b !== pick)) {
        delete current[slot.id];
        changed = true;
      }
    }
  }
  return current;
}
