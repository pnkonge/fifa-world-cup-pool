import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import type { Match, MatchResult } from '../lib/types';

interface ScheduleProps {
  matches: Match[];
  results: MatchResult[];
}

type TimeFilter = 'all' | 'upcoming' | 'past';
type StageFilter = 'all' | 'group' | 'knockouts';

const TODAY = dayjs().startOf('day');

export function Schedule({ matches, results }: ScheduleProps) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');

  const resultMap = useMemo(
    () => new Map(results.map((r) => [r.matchNumber, r])),
    [results],
  );

  const filtered = useMemo(() => {
    return matches.filter((m) => {
      if (groupFilter !== 'all' && m.group !== groupFilter) return false;
      if (stageFilter === 'group' && m.stage !== 'Group') return false;
      if (stageFilter === 'knockouts' && m.stage === 'Group') return false;
      if (timeFilter !== 'all') {
        const d = dayjs(m.date);
        if (timeFilter === 'upcoming' && d.isBefore(TODAY)) return false;
        if (timeFilter === 'past' && d.isAfter(TODAY)) return false;
      }
      return true;
    });
  }, [matches, timeFilter, stageFilter, groupFilter]);

  const byDate = useMemo(() => {
    const groups = new Map<string, Match[]>();
    for (const m of filtered) {
      const arr = groups.get(m.date) ?? [];
      arr.push(m);
      groups.set(m.date, arr);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => a.time.localeCompare(b.time) || a.number - b.number);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const groupLetters = useMemo(() => {
    const set = new Set<string>();
    matches.forEach((m) => m.group && set.add(m.group));
    return [...set].sort();
  }, [matches]);

  return (
    <div className="space-y-8">
      {/* Section header */}
      <div className="border-b-2 border-pitch-950 pb-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
          The Fixtures
        </p>
        <h2 className="font-display text-4xl font-black leading-none tracking-tightest text-pitch-950 sm:text-6xl">
          Schedule
        </h2>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex border border-pitch-950">
          {(['all', 'upcoming', 'past'] as TimeFilter[]).map((t) => (
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
            <option key={g} value={g}>
              Group {g}
            </option>
          ))}
        </select>

        <p className="ml-auto font-mono text-[10px] uppercase tracking-widest text-pitch-700">
          {filtered.length} {filtered.length === 1 ? 'match' : 'matches'}
        </p>
      </div>

      {/* Match list */}
      {byDate.length === 0 ? (
        <p className="border border-pitch-300 bg-paper p-8 text-center font-display text-base italic text-pitch-700">
          No matches match these filters.
        </p>
      ) : (
        <div className="space-y-10">
          {byDate.map(([date, list]) => (
            <DateSection
              key={date}
              date={date}
              matches={list}
              resultMap={resultMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DateSection({
  date,
  matches,
  resultMap,
}: {
  date: string;
  matches: Match[];
  resultMap: Map<number, MatchResult>;
}) {
  const d = dayjs(date);
  const isToday = d.isSame(TODAY, 'day');
  return (
    <section>
      <header className="mb-3 flex items-baseline justify-between border-b-2 border-pitch-950 pb-2">
        <h3 className="font-display text-2xl font-bold tracking-tightest text-pitch-950">
          {d.format('dddd')} · {d.format('MMMM D')}
          {isToday && (
            <span className="ml-3 inline-block bg-gold-400 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-pitch-950">
              Today
            </span>
          )}
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
          {matches.length}
        </span>
      </header>
      <div>
        {matches.map((m) => (
          <MatchRow key={m.number} match={m} result={resultMap.get(m.number)} />
        ))}
      </div>
    </section>
  );
}

function MatchRow({ match, result }: { match: Match; result?: MatchResult }) {
  // A score is shown only for a real, played match. A match whose teams are
  // still slot labels ("Group A 2nd") hasn't happened, so never show a score
  // for it — this guards against phantom results in the upstream data.
  const showScore =
    !!result?.played &&
    result.scoreA != null &&
    result.scoreB != null &&
    !isUnresolvedTeam(match.teamA) &&
    !isUnresolvedTeam(match.teamB);
  const pens = showScore && result?.decidedByPenalties;
  return (
    <article className="grid grid-cols-[3.5rem_1fr_auto] items-baseline gap-x-3 border-b border-pitch-300/30 py-3 sm:gap-x-5">
      <span className="font-mono text-xs tabular text-pitch-700">
        {match.time}
      </span>

      <div className="min-w-0">
        <p className="font-display text-base text-pitch-950 sm:text-lg">
          <TeamName name={match.teamA} won={pens && result?.outcome === 'A'} />
          <span className="mx-2 font-sans text-sm font-normal text-pitch-500">vs</span>
          <TeamName name={match.teamB} won={pens && result?.outcome === 'B'} />
        </p>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-pitch-700">
          {match.stage === 'Group' ? `Group ${match.group}` : stageLabel(match.stage)}
          <span className="mx-1.5 opacity-60">·</span>
          {match.venue}
        </p>
      </div>

      <span
        className={[
          'whitespace-nowrap font-mono text-base tabular sm:text-lg',
          showScore
            ? 'font-semibold text-pitch-950'
            : 'text-pitch-300',
        ].join(' ')}
      >
        {showScore ? `${result!.scoreA}–${result!.scoreB}` : '—'}
        {pens && (
          <span className="ml-1.5 font-sans text-[10px] font-normal uppercase tracking-wide text-pitch-500">
            pens
          </span>
        )}
      </span>
    </article>
  );
}

function TeamName({ name, won }: { name: string; won?: boolean }) {
  // Slot labels (e.g. "M73 winner", "1st Group A") rendered in italic mono
  // to signal they're placeholders not yet resolved.
  // Match real placeholder formats only — must start with digit(s) followed by
  // st/nd/rd/th word, or contain "winner"/"loser"/"TBD" / "Match X" pattern.
  // Bug history: old regex /^\dst|nd|rd|th\b/ matched "nd"/"rd"/"th" anywhere,
  // so countries like Netherlands, England, Jordan were mis-rendered as placeholders.
  const isPlaceholder =
    /\b(winner|loser|TBD)\b/i.test(name) ||
    /^\d+(?:st|nd|rd|th)\b/i.test(name) ||
    /^M\d+\b/i.test(name);
  if (isPlaceholder) {
    return (
      <span className="font-mono text-sm italic text-pitch-600">{name}</span>
    );
  }
  return <span className={won ? 'font-bold' : 'font-medium'}>{name}</span>;
}

function stageLabel(stage: string): string {
  switch (stage) {
    case 'R32': return 'Round of 32';
    case 'R16': return 'Round of 16';
    case 'QF': return 'Quarterfinal';
    case 'SF': return 'Semifinal';
    case '3rd': return '3rd-place play-off';
    case 'Final': return 'Final';
    default: return stage;
  }
}

/**
 * True if a "team" is still an unresolved slot label rather than a real team —
 * e.g. "Group A 2nd", "Match 73 winner", "M101 loser", "TBD". Requires a digit
 * before the ordinal so real countries (Netherlands, England, Jordan) are safe.
 */
function isUnresolvedTeam(name: string): boolean {
  return /\b(winner|loser|tbd)\b/i.test(name)
      || /\d(?:st|nd|rd|th)\b/i.test(name)
      || /^M\d+\b/i.test(name);
}
