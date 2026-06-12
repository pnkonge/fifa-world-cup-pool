import { useMemo } from 'react';
import type { GroupStanding } from '../lib/types';

interface StandingsProps {
  standings: GroupStanding[];
}

export function Standings({ standings }: StandingsProps) {
  const byGroup = useMemo(() => {
    const groups = new Map<string, GroupStanding[]>();
    for (const s of standings) {
      const arr = groups.get(s.group) ?? [];
      arr.push(s);
      groups.set(s.group, arr);
    }
    // Sort within each group by points desc → GD desc → wins desc.
    for (const arr of groups.values()) {
      arr.sort(
        (a, b) =>
          b.points - a.points ||
          b.goalDifference - a.goalDifference ||
          b.wins - a.wins,
      );
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [standings]);

  return (
    <div className="space-y-8">
      {/* Section header */}
      <div className="border-b-2 border-pitch-950 pb-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
          The Groups
        </p>
        <h2 className="font-display text-4xl font-black leading-none tracking-tightest text-pitch-950 sm:text-6xl">
          Standings
        </h2>
        <p className="mt-3 max-w-xl font-display text-base italic text-pitch-700 sm:text-lg">
          Top 2 from each group auto-advance. Best 8 third-place finishers join them in the Round of 32.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 font-mono text-[10px] uppercase tracking-widest text-pitch-700">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 bg-gold-300 ring-1 ring-gold-500" />
          Auto-qualifies
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 bg-pitch-100 ring-1 ring-pitch-300" />
          Best-third contender
        </span>
      </div>

      {/* Group grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {byGroup.map(([letter, teams]) => (
          <GroupCard key={letter} group={letter} teams={teams} />
        ))}
      </div>
    </div>
  );
}

function GroupCard({
  group,
  teams,
}: {
  group: string;
  teams: GroupStanding[];
}) {
  return (
    <article className="border border-pitch-950 bg-paper">
      <header className="flex items-baseline justify-between border-b border-pitch-950 bg-pitch-950 px-4 py-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-pitch-300">
            Group
          </p>
          <h3 className="font-display text-3xl font-black leading-none tracking-tightest text-gold-300">
            {group}
          </h3>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-pitch-300">
          {teams.length} teams
        </p>
      </header>

      <table className="w-full">
        <thead>
          <tr className="border-b border-pitch-300/40 font-mono text-[9px] uppercase tracking-widest text-pitch-700">
            <th className="py-2 pl-3 pr-2 text-left">Team</th>
            <th className="py-2 px-1 text-right">P</th>
            <th className="py-2 px-1 text-right">W</th>
            <th className="py-2 px-1 text-right">D</th>
            <th className="py-2 px-1 text-right">L</th>
            <th className="py-2 px-1 text-right">GD</th>
            <th className="py-2 pl-2 pr-3 text-right">Pts</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => {
            const tier =
              i < 2 ? 'qualify' : i === 2 ? 'maybe' : 'out';
            return (
              <tr
                key={t.team}
                className={[
                  'border-b border-pitch-300/20 last:border-0',
                  tier === 'qualify' && 'bg-gold-50',
                  tier === 'maybe' && 'bg-pitch-50',
                  tier === 'out' && 'opacity-70',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <td className="py-2 pl-3 pr-2">
                  <span className="mr-2 font-mono text-[10px] tabular text-pitch-700">
                    {i + 1}
                  </span>
                  <span className="font-display text-sm font-medium text-pitch-950">
                    {t.team}
                  </span>
                </td>
                <Td>{t.played}</Td>
                <Td>{t.wins}</Td>
                <Td>{t.draws}</Td>
                <Td>{t.losses}</Td>
                <Td>{formatGD(t.goalDifference)}</Td>
                <td className="py-2 pl-2 pr-3 text-right font-mono text-sm font-semibold tabular text-pitch-950">
                  {t.points}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="py-2 px-1 text-right font-mono text-sm tabular text-pitch-800">
      {children}
    </td>
  );
}

function formatGD(gd: number): string {
  if (gd === 0) return '0';
  return gd > 0 ? `+${gd}` : `${gd}`;
}
