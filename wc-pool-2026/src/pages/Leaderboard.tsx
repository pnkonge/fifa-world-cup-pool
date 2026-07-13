import type { PlayerScore } from '../lib/types';
import { ChampionsBanner } from '../components/ChampionsBanner';

interface LeaderboardProps {
  players: PlayerScore[];
  /** Set once the Final has a result — turns on the champions treatment. */
  championTeam?: string | null;
}

export function Leaderboard({ players, championTeam = null }: LeaderboardProps) {
  if (!players.length) {
    return <p className="font-mono text-sm text-pitch-700">No standings yet.</p>;
  }

  const leader = players[0];
  const podium = players.slice(0, 3);
  const pack = players.slice(3);
  const complete = Boolean(championTeam);

  return (
    <div className="space-y-12">
      {complete && (
        <ChampionsBanner championTeam={championTeam!} poolChampion={leader} />
      )}

      {/* Section header */}
      <div className="border-b-2 border-pitch-950 pb-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
          The Standings
        </p>
        <h2 className="font-display text-4xl font-black leading-none tracking-tightest text-pitch-950 sm:text-6xl">
          Leaderboard
        </h2>
        <p className="mt-3 max-w-xl font-display text-base italic text-pitch-700 sm:text-lg">
          {leader.name} leads with{' '}
          <span className="not-italic font-semibold text-pitch-950">
            {leader.grandTotal} points
          </span>
          {complete
            ? ' — final. The pool is decided.'
            : ". It isn't over until the final whistle."}
        </p>
      </div>

      {/* Podium */}
      <section className="grid gap-4 sm:grid-cols-3">
        {podium.map((p, i) => (
          <PodiumCard key={p.name} player={p} place={i + 1} complete={complete} />
        ))}
      </section>

      {/* Full table */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="font-display text-2xl font-bold tracking-tightest text-pitch-950">
            Full table
          </h3>
          <p className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
            {players.length} players
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-pitch-950 text-left font-mono text-[10px] uppercase tracking-widest text-pitch-700">
                <th className="w-12 py-3 pr-2">#</th>
                <th className="py-3 pr-2">Player</th>
                <th className="hidden py-3 pr-2 text-right sm:table-cell">Group</th>
                <th className="hidden py-3 pr-2 text-right sm:table-cell">KO</th>
                <th className="hidden py-3 pr-2 text-right sm:table-cell">Wild</th>
                <th className="hidden py-3 pr-2 text-right sm:table-cell">TB Δ</th>
                <th className="py-3 pl-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {pack.map((p) => (
                <tr
                  key={p.name}
                  className="group border-b border-pitch-300/30 transition hover:bg-pitch-50"
                >
                  <td className="py-3 pr-2 font-mono text-xs text-pitch-700">
                    {p.rank.toString().padStart(2, '0')}
                  </td>
                  <td className="py-3 pr-2 font-display text-base font-medium text-pitch-950">
                    <div className="flex items-center gap-2">
                      <span>{p.name}</span>
                      <TrendIndicator
                        rank={p.rank}
                        previousRank={p.previousRank}
                      />
                    </div>
                  </td>
                  <td className="hidden py-3 pr-2 text-right font-mono text-sm text-pitch-800 sm:table-cell">
                    {p.groupTotal}
                  </td>
                  <td className="hidden py-3 pr-2 text-right font-mono text-sm text-pitch-800 sm:table-cell">
                    {p.knockoutTotal}
                  </td>
                  <td className="hidden py-3 pr-2 text-right font-mono text-sm text-pitch-800 sm:table-cell">
                    {p.wildcardTotal}
                  </td>
                  <td className="hidden py-3 pr-2 text-right font-mono text-sm text-pitch-700 sm:table-cell">
                    {p.tiebreakerDelta}
                  </td>
                  <td className="py-3 pl-2 text-right font-mono text-base font-semibold text-pitch-950">
                    {p.grandTotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ScoringLegend />
    </div>
  );
}

function PodiumCard({
  player,
  place,
  complete,
}: {
  player: PlayerScore;
  place: number;
  complete: boolean;
}) {
  const placement = place === 1 ? '1st' : place === 2 ? '2nd' : '3rd';
  const isLeader = place === 1;

  return (
    <article
      className={[
        'relative flex flex-col gap-3 border p-5 transition',
        isLeader
          ? 'border-pitch-950 bg-pitch-950 text-paper sm:translate-y-[-4px]'
          : 'border-pitch-300 bg-paper text-pitch-950 hover:border-pitch-950',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span
          className={[
            'font-mono text-[10px] uppercase tracking-widest',
            isLeader ? 'text-gold-300' : 'text-pitch-700',
          ].join(' ')}
        >
          {placement} place
        </span>
        {isLeader && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-gold-300">
            {complete ? '🏆 Champion' : '★ Leader'}
          </span>
        )}
      </div>
      <div>
        <p
          className={[
            'font-display text-3xl font-bold leading-tight tracking-tightest sm:text-4xl',
            isLeader ? 'text-paper' : 'text-pitch-950',
          ].join(' ')}
        >
          {player.name}
        </p>
      </div>
      <div className="mt-auto flex items-baseline justify-between gap-2">
        <span
          className={[
            'font-mono text-[10px] uppercase tracking-widest',
            isLeader ? 'text-pitch-300' : 'text-pitch-700',
          ].join(' ')}
        >
          Points
        </span>
        <span
          className={[
            'font-display text-5xl font-black tracking-tightest sm:text-6xl',
            isLeader ? 'text-gold-300' : 'text-pitch-950',
          ].join(' ')}
        >
          {player.grandTotal}
        </span>
      </div>
    </article>
  );
}

function TrendIndicator({
  rank,
  previousRank,
}: {
  rank: number;
  previousRank?: number;
}) {
  if (previousRank == null) return null;
  const diff = previousRank - rank;
  if (diff === 0) {
    return (
      <span aria-label="No change" className="font-mono text-xs text-pitch-300">
        —
      </span>
    );
  }
  if (diff > 0) {
    return (
      <span
        aria-label={`Up ${diff}`}
        className="font-mono text-xs text-pitch-600"
      >
        ▲{diff}
      </span>
    );
  }
  return (
    <span
      aria-label={`Down ${-diff}`}
      className="font-mono text-xs text-gold-700"
    >
      ▼{-diff}
    </span>
  );
}

function ScoringLegend() {
  return (
    <aside className="border-t border-pitch-300/40 pt-6">
      <p className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
        Scoring
      </p>
      <dl className="mt-2 grid gap-2 font-display text-sm text-pitch-950 sm:grid-cols-4">
        <div>
          <dt className="inline font-semibold">Group</dt>
          <dd className="inline"> · 1 pt per correct outcome</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Knockout</dt>
          <dd className="inline"> · 2 pts per correct team</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Wild card</dt>
          <dd className="inline"> · 5 pts each</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Tiebreaker</dt>
          <dd className="inline"> · closest total goals wins</dd>
        </div>
      </dl>
    </aside>
  );
}
