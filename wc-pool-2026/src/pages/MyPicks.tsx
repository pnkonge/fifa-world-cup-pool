import { useMemo, useState, useEffect } from 'react';
import dayjs from 'dayjs';
import type {
  Match, MatchResult, PlayerScore, PredictionsData,
} from '../lib/types';
import { bracketApi, API_CONFIGURED } from '../lib/bracketApi';

// Slot ID -> match number mapping (R32-1=73, R32-2=74, ..., Final=104)
const SLOT_IDS: string[] = [];
for (let i = 1; i <= 16; i++) SLOT_IDS.push(`R32-${i}`);
for (let i = 1; i <= 8; i++) SLOT_IDS.push(`R16-${i}`);
for (let i = 1; i <= 4; i++) SLOT_IDS.push(`QF-${i}`);
for (let i = 1; i <= 2; i++) SLOT_IDS.push(`SF-${i}`);
SLOT_IDS.push('3rd', 'Final');

function slotToMatchNum(slotId: string): number | null {
  const idx = SLOT_IDS.indexOf(slotId);
  return idx >= 0 ? 73 + idx : null;
}

interface MyPicksProps {
  players: PlayerScore[];
  matches: Match[];
  results: MatchResult[];
  predictions: PredictionsData;
}

type TimeFilter = 'all' | 'played' | 'upcoming';
type StageFilter = 'all' | 'group' | 'knockouts';

export function MyPicks({ players, matches, results, predictions }: MyPicksProps) {
  // Fetch knockout brackets (public after lock) and merge into predictions
  const [koPredictions, setKoPredictions] = useState<PredictionsData | null>(null);

  useEffect(() => {
    if (!API_CONFIGURED) return;
    bracketApi.getAllBrackets().then((r) => {
      if (!r.ok || !r.locked || !r.brackets.length) return;

      const byPlayer = new Map<string, { name: string; picks: Map<number, string> }>();
      const consensus = new Map<number, Map<string, number>>();

      for (const b of r.brackets) {
        const playerPicks = new Map<number, string>();
        for (const [slotId, team] of Object.entries(b.picks)) {
          const matchNum = slotToMatchNum(slotId);
          if (matchNum == null || !team) continue;
          const pickValue = team + ' Win'; // match group stage format
          playerPicks.set(matchNum, pickValue);

          // Build consensus
          if (!consensus.has(matchNum)) consensus.set(matchNum, new Map());
          const votes = consensus.get(matchNum)!;
          votes.set(pickValue, (votes.get(pickValue) ?? 0) + 1);
        }
        byPlayer.set(b.playerName.toLowerCase(), { name: b.playerName, picks: playerPicks });
      }

      setKoPredictions({ byPlayer, consensus, totalPlayers: r.brackets.length });
    }).catch(() => {});
  }, []);

  // Merge group predictions with knockout predictions
  const mergedPredictions = useMemo((): PredictionsData => {
    if (!koPredictions) return predictions;

    const byPlayer = new Map(predictions.byPlayer);
    for (const [key, koPlayer] of koPredictions.byPlayer) {
      const existing = byPlayer.get(key);
      if (existing) {
        // Merge picks: knockout picks added to existing group picks
        const merged = new Map(existing.picks);
        for (const [matchNum, pick] of koPlayer.picks) {
          merged.set(matchNum, pick);
        }
        byPlayer.set(key, { name: existing.name, picks: merged });
      } else {
        byPlayer.set(key, koPlayer);
      }
    }

    const consensus = new Map(predictions.consensus);
    for (const [matchNum, votes] of koPredictions.consensus) {
      consensus.set(matchNum, votes);
    }

    return {
      byPlayer,
      consensus,
      totalPlayers: Math.max(predictions.totalPlayers, koPredictions.totalPlayers),
    };
  }, [predictions, koPredictions]);
  const names = useMemo(() => {
    const set = new Map<string, string>();
    for (const p of mergedPredictions.byPlayer.values()) {
      set.set(p.name.toLowerCase(), p.name);
    }
    if (set.size === 0) {
      for (const p of players) set.set(p.name.toLowerCase(), p.name);
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b));
  }, [mergedPredictions, players]);

  const [selected, setSelected] = useState<string>(names[0] ?? '');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');

  if (mergedPredictions.totalPlayers === 0) {
    return (
      <div className="border border-pitch-300 bg-paper p-8 sm:p-12">
        <p className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
          Picks &amp; Consensus
        </p>
        <h2 className="mt-2 font-display text-4xl font-black leading-none tracking-tightest text-pitch-950 sm:text-5xl">
          My Picks
        </h2>
        <p className="mt-4 max-w-xl font-display text-lg italic text-pitch-700">
          Connect the Predictions-Group tab to see your picks alongside the pool's consensus on every match.
        </p>
      </div>
    );
  }

  const playerPicks = mergedPredictions.byPlayer.get(selected.toLowerCase());
  const resultMap = useMemo(
    () => new Map(results.map((r) => [r.matchNumber, r])),
    [results],
  );

  const groupLetters = useMemo(() => {
    const set = new Set<string>();
    matches.forEach((m) => m.group && set.add(m.group));
    return [...set].sort();
  }, [matches]);

  const filtered = useMemo(() => {
    return matches.filter((m) => {
      if (stageFilter === 'group' && m.stage !== 'Group') return false;
      if (stageFilter === 'knockouts' && m.stage === 'Group') return false;
      if (groupFilter !== 'all' && m.group !== groupFilter) return false;
      if (timeFilter !== 'all') {
        const r = resultMap.get(m.number);
        const rp = !!r?.played && !isUnresolvedTeam(m.teamA) && !isUnresolvedTeam(m.teamB);
        if (timeFilter === 'played' && !rp) return false;
        if (timeFilter === 'upcoming' && rp) return false;
      }
      return true;
    });
  }, [matches, stageFilter, groupFilter, timeFilter, resultMap]);

  // Sections = one per match day, chronological — mirrors the Schedule page.
  const sections = useMemo(() => {
    type Section = { title: string; date: string; matches: Match[] };
    const byDate = new Map<string, Section>();

    for (const m of filtered) {
      const key = m.date || 'TBD';
      if (!byDate.has(key)) {
        byDate.set(key, { title: key, date: key, matches: [] });
      }
      byDate.get(key)!.matches.push(m);
    }
    const byKickoff = (a: Match, b: Match) => {
      if (a.time !== b.time) return a.time.localeCompare(b.time);
      return a.number - b.number;
    };
    for (const s of byDate.values()) s.matches.sort(byKickoff);

    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  const summary = useMemo(() => {
    if (!playerPicks) return null;
    let correct = 0, wrong = 0, pending = 0;
    for (const m of matches) {
      const pick = playerPicks.picks.get(m.number);
      if (!pick) continue;
      const r = resultMap.get(m.number);
      if (!r?.played || isUnresolvedTeam(m.teamA) || isUnresolvedTeam(m.teamB)) { pending++; continue; }
      const norm = normalizePick(pick, m);
      if (r.outcome && norm === r.outcome) correct++;
      else wrong++;
    }
    return { correct, wrong, pending };
  }, [playerPicks, matches, resultMap]);

  return (
    <div className="space-y-8">
      <div className="border-b-2 border-pitch-950 pb-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
          Picks &amp; Consensus
        </p>
        <h2 className="font-display text-4xl font-black leading-none tracking-tightest text-pitch-950 sm:text-6xl">
          My Picks
        </h2>
        <p className="mt-3 max-w-xl font-display text-base italic text-pitch-700 sm:text-lg">
          Pick your name to see every pick against the actual result, with the pool's consensus on each match.
        </p>
      </div>

      <div className="flex flex-wrap items-baseline gap-3">
        <label className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
          Player
        </label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="border border-pitch-950 bg-paper px-3 py-1.5 font-display text-base text-pitch-950"
        >
          {names.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        {summary && (
          <p className="ml-auto font-mono text-[10px] uppercase tracking-widest text-pitch-700">
            <span className="text-gold-700">✓ {summary.correct}</span>
            <span className="mx-2 opacity-50">·</span>
            <span>✗ {summary.wrong}</span>
            <span className="mx-2 opacity-50">·</span>
            <span>{summary.pending} pending</span>
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-y border-pitch-300/40 py-3">
        <div className="flex border border-pitch-950">
          {(['all', 'played', 'upcoming'] as TimeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTimeFilter(t)}
              className={[
                'px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition',
                timeFilter === t
                  ? 'bg-pitch-950 text-paper'
                  : 'bg-paper text-pitch-700 hover:bg-pitch-50',
              ].join(' ')}
            >
              {t}
            </button>
          ))}
        </div>

        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as StageFilter)}
          className="border border-pitch-950 bg-paper px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-pitch-950"
        >
          <option value="all">All stages</option>
          <option value="group">Group stage</option>
          <option value="knockouts">Knockouts</option>
        </select>

        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          className="border border-pitch-950 bg-paper px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-pitch-950"
        >
          <option value="all">All groups</option>
          {groupLetters.map((g) => (
            <option key={g} value={g}>Group {g}</option>
          ))}
        </select>

        <p className="ml-auto font-mono text-[10px] uppercase tracking-widest text-pitch-700">
          {filtered.length} {filtered.length === 1 ? 'match' : 'matches'}
        </p>
      </div>

      {sections.length === 0 ? (
        <p className="border border-pitch-300 bg-paper p-8 text-center font-display text-base italic text-pitch-700">
          No matches match these filters.
        </p>
      ) : (
        sections.map((section) => (
          <Section
            key={section.title}
            title={section.title}
            matches={section.matches}
            resultMap={resultMap}
            playerPicks={playerPicks}
            consensus={mergedPredictions.consensus}
            totalPlayers={mergedPredictions.totalPlayers}
          />
        ))
      )}
    </div>
  );
}

function Section({
  title, matches, resultMap, playerPicks, consensus, totalPlayers,
}: {
  title: string;
  matches: Match[];
  resultMap: Map<number, MatchResult>;
  playerPicks: { picks: Map<number, string> } | undefined;
  consensus: Map<number, Map<string, number>>;
  totalPlayers: number;
}) {
  const headline = formatDateHeadline(title);
  return (
    <section>
      <header className="mb-3 flex items-baseline justify-between border-b-2 border-pitch-950 pb-2">
        <h3 className="font-display text-2xl font-bold tracking-tightest text-pitch-950">
          {headline.main}
          {headline.isToday && (
            <span className="ml-3 inline-block bg-gold-400 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-pitch-950">
              Today
            </span>
          )}
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
          {matches.length}
        </span>
      </header>
      <div className="space-y-3">
        {matches.map((m) => (
          <MatchPicksRow
            key={m.number}
            match={m}
            result={resultMap.get(m.number)}
            myPick={playerPicks?.picks.get(m.number)}
            consensus={consensus.get(m.number)}
            totalPlayers={totalPlayers}
          />
        ))}
      </div>
    </section>
  );
}

function MatchPicksRow({
  match, result, myPick, consensus, totalPlayers,
}: {
  match: Match;
  result?: MatchResult;
  myPick?: string;
  consensus?: Map<string, number>;
  totalPlayers: number;
}) {
  const played = !!result?.played
    && !isUnresolvedTeam(match.teamA)
    && !isUnresolvedTeam(match.teamB);
  const showScore = played && result?.scoreA != null && result?.scoreB != null;
  const myPickLabel = pickToLabel(myPick, match);
  const actualOutcome = result?.outcome;
  const normalizedPick = normalizePick(myPick, match);
  const myPickCorrect = played && !!normalizedPick && !!actualOutcome && normalizedPick === actualOutcome;
  // Wrong if: pick doesn't match the winner, OR picked team didn't even make it to this match
  const myPickWrong = played && !!myPick && (
    (!!normalizedPick && !!actualOutcome && normalizedPick !== actualOutcome) ||
    (!normalizedPick && match.stage !== 'Group')
  );

  const cardBase = 'p-4 transition';
  const cardTint =
    myPickCorrect
      ? 'border border-gold-300 border-l-4 border-l-gold-500 bg-gold-50/60'
      : myPickWrong
        ? 'border border-red-200 border-l-4 border-l-red-300 bg-red-50/40'
        : 'border border-pitch-300/60 bg-paper';

  // Merge consensus entries that normalize to the same outcome (e.g.
  // "Mexico Win" and "A" are the same pick) so bars don't fragment.
  const merged = new Map<string, number>();
  if (consensus) {
    for (const [pick, count] of consensus) {
      const norm = normalizePick(pick, match);
      const key = norm ?? pick.replace(/\s+win$/i, '').trim();
      merged.set(key, (merged.get(key) ?? 0) + count);
    }
  }
  const consensusEntries = [...merged.entries()].sort((a, b) => b[1] - a[1]);
  const consensusTotal = consensusEntries.reduce((s, [, n]) => s + n, 0);

  return (
    <article className={[cardBase, cardTint].join(' ')}>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="font-display text-base font-medium text-pitch-950 sm:text-lg">
            {match.teamA} <span className="mx-1 font-sans text-sm font-normal text-pitch-500">vs</span> {match.teamB}
          </p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-pitch-700">
            M{match.number} · {match.stage === 'Group' ? `Group ${match.group}` : match.stage} · {match.date || '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {myPickCorrect && (
            <span className="bg-gold-400 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-pitch-950">
              ★ Got it
            </span>
          )}
          {myPickWrong && (
            <span className="bg-red-100 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-red-700">
              ✗ Missed
            </span>
          )}
          <p
            className={[
              'whitespace-nowrap font-mono text-base tabular sm:text-lg',
              showScore ? 'font-semibold text-pitch-950' : 'text-pitch-300',
            ].join(' ')}
          >
            {showScore
              ? `${result!.scoreA}–${result!.scoreB}`
              : '—'}
            {showScore && result?.decidedByPenalties && (
              <span className="ml-1.5 font-sans text-[10px] font-normal uppercase tracking-wide text-pitch-500">
                pens
              </span>
            )}
          </p>
        </div>
      </header>

      <div className="mb-3 flex items-baseline gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
          Your pick
        </span>
        {myPick ? (
          <>
            <span
              className={[
                'font-display text-base font-medium',
                myPickWrong ? 'text-pitch-700 line-through' : 'text-pitch-950',
              ].join(' ')}
            >
              {myPickLabel}
            </span>
            {myPickWrong && actualOutcome && (
              <span className="font-mono text-[10px] uppercase tracking-widest text-pitch-500">
                · {pickToLabel(actualOutcome, match)} won
              </span>
            )}
          </>
        ) : (
          <span className="font-display text-sm italic text-pitch-500">
            no pick submitted
          </span>
        )}
      </div>

      {consensusEntries.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
            Pool consensus · {consensusTotal} of {totalPlayers}
          </p>
          {consensusEntries.map(([pick, count]) => {
            const pct = consensusTotal > 0 ? Math.round((count / consensusTotal) * 100) : 0;
            const normKey = normalizePick(pick, match) ?? pick;
            const isMine = normalizedPick != null
              ? normKey === normalizedPick
              : pick === myPick;
            const isWinner = played && !!actualOutcome && normKey === actualOutcome;
            return (
              <div key={pick} className="flex items-center gap-2">
                <span
                  className={[
                    'w-24 shrink-0 font-display text-sm sm:w-32',
                    isWinner ? 'font-semibold text-pitch-950' : 'text-pitch-700',
                  ].join(' ')}
                >
                  {pickToLabel(pick, match)}
                  {isMine && <span className="ml-1 font-mono text-[9px] uppercase tracking-widest text-gold-700">you</span>}
                </span>
                <div className="relative h-3 flex-1 overflow-hidden bg-pitch-100">
                  <div
                    className={[
                      'h-full transition-all',
                      isWinner ? 'bg-gold-400' : isMine ? 'bg-pitch-700' : 'bg-pitch-300',
                    ].join(' ')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-xs tabular text-pitch-700">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}


function formatDateHeadline(date: string): { main: string; isToday: boolean } {
  if (!date || date === 'TBD') return { main: 'Date TBD', isToday: false };
  const d = dayjs(date);
  if (!d.isValid()) return { main: date, isToday: false };
  return {
    main: `${d.format('dddd')} · ${d.format('MMMM D')}`,
    isToday: d.isSame(dayjs(), 'day'),
  };
}

/**
 * Map any pick format to a canonical outcome letter.
 * Handles: 'A'/'B'/'D' letters, 'Draw', '<Team Name> Win', bare team names.
 * Returns null if the pick can't be interpreted for this match.
 */
function normalizePick(pick: string | undefined, match: Match): 'A' | 'B' | 'D' | null {
  if (!pick) return null;
  let p = pick.trim();
  if (/^[ABD]$/i.test(p)) return p.toUpperCase() as 'A' | 'B' | 'D';
  if (/^draw$/i.test(p)) return 'D';
  // Strip a trailing " Win" (the Google Form answer format).
  p = p.replace(/\s+win$/i, '').trim();
  if (p.toLowerCase() === match.teamA.trim().toLowerCase()) return 'A';
  if (p.toLowerCase() === match.teamB.trim().toLowerCase()) return 'B';
  if (/^draw$/i.test(p)) return 'D';
  return null;
}

function pickToLabel(pick: string | undefined, match: Match): string {
  if (!pick) return '—';
  const norm = normalizePick(pick, match);
  if (norm === 'A') return match.teamA;
  if (norm === 'B') return match.teamB;
  if (norm === 'D') return 'Draw';
  // Unknown format — display cleaned-up raw value.
  return pick.replace(/\s+win$/i, '').trim();
}

/**
 * True if a "team" is still an unresolved slot label (e.g. "Group A 2nd",
 * "Match 73 winner", "TBD") rather than a real team. Requires a digit before
 * the ordinal so countries like Netherlands/England/Jordan are never flagged.
 */
function isUnresolvedTeam(name: string): boolean {
  return /\b(winner|loser|tbd)\b/i.test(name)
      || /\d(?:st|nd|rd|th)\b/i.test(name)
      || /^M\d+\b/i.test(name);
}
