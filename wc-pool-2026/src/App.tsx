import { useCallback, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { loadSnapshot } from './lib/sheets';
import type { DataSnapshot } from './lib/types';
import { Leaderboard } from './pages/Leaderboard';
import { Schedule } from './pages/Schedule';
import { Standings } from './pages/Standings';
import { MyPicks } from './pages/MyPicks';
import { Bracket } from './pages/Bracket';
import { WildCards } from './pages/WildCards';

export default function App() {
  const [snapshot, setSnapshot] = useState<DataSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const snap = await loadSnapshot();
      setSnapshot(snap);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // World champions: the Final match with a decisive result. Suppress if the
  // schedule still shows a slot label ("Match 103 winner") instead of a team.
  const championTeam = (() => {
    if (!snapshot) return null;
    const final = snapshot.matches.find((m) => m.stage === 'Final');
    if (!final) return null;
    const res = snapshot.results.find(
      (r) => r.matchNumber === final.number && r.played,
    );
    if (!res || (res.outcome !== 'A' && res.outcome !== 'B')) return null;
    const team = res.outcome === 'A' ? final.teamA : final.teamB;
    if (!team || /winner|match\s*\d/i.test(team)) return null;
    return team;
  })();

  return (
    <Layout
      fetchedAt={snapshot?.fetchedAt ?? null}
      isLoading={isLoading}
      onRefresh={refresh}
    >
      {error && (
        <div className="mb-6 border border-gold-500 bg-gold-50 p-4 font-mono text-xs text-pitch-950">
          Could not load data: {error}
        </div>
      )}

      <Routes>
        <Route
          path="/"
          element={
            snapshot ? (
              <Leaderboard
                players={snapshot.players}
                championTeam={championTeam}
              />
            ) : (
              <LoadingState />
            )
          }
        />
        <Route
          path="/schedule"
          element={
            snapshot ? (
              <Schedule matches={snapshot.matches} results={snapshot.results} />
            ) : (
              <LoadingState />
            )
          }
        />
        <Route
          path="/standings"
          element={
            snapshot ? (
              <Standings standings={snapshot.standings} />
            ) : (
              <LoadingState />
            )
          }
        />
        <Route path="/bracket" element={<Bracket />} />
        <Route path="/wild-cards" element={<WildCards />} />
        <Route
          path="/my-picks"
          element={
            snapshot ? (
              <MyPicks
                players={snapshot.players}
                matches={snapshot.matches}
                results={snapshot.results}
                predictions={snapshot.predictions}
              />
            ) : (
              <LoadingState />
            )
          }
        />
      </Routes>
    </Layout>
  );
}

function LoadingState() {
  return (
    <div className="flex h-64 items-center justify-center">
      <p className="font-mono text-xs uppercase tracking-widest text-pitch-700">
        Loading…
      </p>
    </div>
  );
}
