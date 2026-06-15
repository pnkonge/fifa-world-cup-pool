// Domain types for the World Cup 2026 pool.
// Mirrors the Google Sheet structure described in the project spec.

export type Stage =
  | 'Group'
  | 'R32'
  | 'R16'
  | 'QF'
  | 'SF'
  | '3rd'
  | 'Final';

export type Outcome = 'A' | 'B' | 'D' | null; // home / away / draw

export interface Match {
  number: number; // 1..104
  date: string; // ISO yyyy-mm-dd
  time: string; // HH:mm local kickoff
  stage: Stage;
  group: string | null; // 'A'..'L' for group stage, null for knockouts
  teamA: string; // can be a slot label for KO ("Match 74 winner")
  teamB: string;
  venue: string;
}

export interface MatchResult {
  matchNumber: number;
  scoreA: number | null;
  scoreB: number | null;
  outcome: Outcome;
  played: boolean;
}

export interface PlayerScore {
  name: string;
  groupTotal: number;
  knockoutTotal: number;
  wildcardTotal: number;
  tiebreakerDelta: number; // smaller is better
  grandTotal: number;
  rank: number;
  previousRank?: number; // for trend arrows
}

export interface GroupStanding {
  group: string; // 'A'..'L'
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalDifference: number;
  points: number;
}

export interface PlayerPick {
  matchNumber: number;
  pick: 'A' | 'B' | 'D';
}

export interface DataSnapshot {
  players: PlayerScore[];
  matches: Match[];
  results: MatchResult[];
  standings: GroupStanding[];
  predictions: PredictionsData;
  fetchedAt: Date;
}

export interface PlayerPicks {
  name: string;
  /** Map of matchNumber -> pick value ('A' | 'B' | 'D' typically) */
  picks: Map<number, string>;
}

export interface PredictionsData {
  /** Lookup by lowercased player name */
  byPlayer: Map<string, PlayerPicks>;
  /** For each match number, pick value -> count */
  consensus: Map<number, Map<string, number>>;
  /** Number of distinct players with at least one pick */
  totalPlayers: number;
}
