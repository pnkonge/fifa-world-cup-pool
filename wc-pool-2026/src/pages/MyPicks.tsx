import { useMemo, useState } from 'react';
import type {
  Match, MatchResult, PlayerScore, PredictionsData,
} from '../lib/types';

interface MyPicksProps {
  players: PlayerScore[];
  matches: Match[];
  results: MatchResult[];
  predictions: PredictionsData;
}

type TimeFilter = 'all' | 'played' | 'upcoming';
type StageFilter = 'all' | 'group' | 'knockouts';

export function MyPicks({ players, matches, results, predictions }: MyPicksProps) {
  const names = useMemo(() => {
    const set = new Map<string, string>();
    for (const p of predictions.byPlayer.values()) {
      set.set(p.name.toLowerCase(), p.name);
    }
    if (set.size === 0) {
      for (const p of players) set.set(p.name.toLowerCase(), p.name);
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b));
  }, [predictions, players]);

  const [selected, setSelected] = useState<string>(names[0] ?? '');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');

  if (predictions.totalPlayers === 0) {
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

  const playerPicks = predictions.byPlayer.get(selected.toLowerCase());
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
        if (timeFilter === 'played' && !r?.played) return false;
        if (timeFilter === 'upcoming' && r?.played) return false;
      }
      return true;
    });
  }, [matches, stageFilter, groupFilter, timeFilter, resultMap]);

  const sections = useMemo(() => {
    type Section = { title: string; matches: Match[] };
    const groups = new Map<string, Section>();
    const ko: Section = { title: 'Knockouts', matches: [] };

    for (const m of filtered) {
      if (m.stage === 'Group' && m.group) {
        const key = `Group ${m.group}`;
        if (!groups.has(key)) groups.set(key, { title: key, matches: [] });
        groups.get(key)!.matches.push(m);
      } else {
        ko.matches.push(m);
      }
    }
    for (const s of groups.values()) s.matches.sort((a, b) => a.number - b.number);
    ko.matches.sort((a, b) => a.number - b.number);

    return [
      ...[...groups.values()].sort((a, b) => a.title.localeCompare(b.title)),
      ...(ko.matches.length ? [ko] : []),
    ];
  }, [filtered]);

  const summary = useMemo(() => {
    if (!playerPicks) return null;
    let correct = 0, wrong = 0, pending = 0;
    for (const m of matches) {
      const pick = playerPicks.picks.get(m.number);
      if (!pick) continue;
      const r = resultMap.get(m.number);
      if (!r?.played) { pending++; continue; }
      if (r.outcome && pick.trim().toUpperCase() === r.outcome) correct++;
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
            consensus={predictions.consensus}
            totalPlayers={predictions.totalPlayers}
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
  return (
    <section>
      <header className="mb-3 border-b-2 border-pitch-950 pb-2">
        <h3 className="font-display text-2xl font-bold tracking-tightest text-pitch-950">
          {title}
        </h3>
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
  const played = !!result?.played;
  const myPickLabel = pickToLabel(myPick, match);
  const actualOutcome = result?.outcome;
  const normalizedPick = myPick?.trim().toUpperCase();
  const myPickCorrect = played && !!normalizedPick && !!actualOutcome && normalizedPick === actualOutcome;
  const myPickWrong = played && !!normalizedPick && !!actualOutcome && normalizedPick !== actualOutcome;

  const cardBase = 'border border-pitch-300/60 p-4 transition';
  const cardTint =
    myPickCorrect
      ? 'border-l-4 border-l-gold-500 bg-gold-50/60'
      : myPickWrong
        ? 'border-l-4 border-l-pitch-400 bg-pitch-50/70'
        : 'bg-paper';

  const consensusEntries = consensus
    ? [...consensus.entries()].sort((a, b) => b[1] - a[1])
    : [];
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
            <span className="bg-pitch-200 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-pitch-700">
              ✗ Missed
            </span>
          )}
          <p
            className={[
              'whitespace-nowrap font-mono text-base tabular sm:text-lg',
              played ? 'font-semibold text-pitch-950' : 'text-pitch-300',
            ].join(' ')}
          >
            {played && result.scoreA != null && result.scoreB != null
              ? `${result.scoreA}–${result.scoreB}`
              : '—'}
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
            const isMine = pick === myPick;
            const isWinner = played && pick.trim().toUpperCase() === actualOutcome;
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

function pickToLabel(pick: string | undefined, match: Match): string {
  if (!pick) return '—';
  const p = pick.trim().toUpperCase();
  if (p === 'A') return match.teamA;
  if (p === 'B') return match.teamB;
  if (p === 'D') return 'Draw';
  return pick;
}
