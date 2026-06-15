// Mock data that mirrors the shape of what the published Google Sheet
// will return. Used until the real CSV URLs are wired up via .env.
//
// Designed to look like ~6 group-stage matchdays have already happened,
// so the leaderboard, schedule, and standings views all have something
// real to render.

import type {
  DataSnapshot,
  GroupStanding,
  Match,
  MatchResult,
  PlayerScore,
} from './types';

const PLAYER_NAMES = [
  'Alex Chen', 'Sam Rivera', 'Jordan Park', 'Taylor Quinn', 'Morgan Lee',
  'Casey Patel', 'Drew Nakamura', 'Reese Okonkwo', 'Avery Singh', 'Riley Costa',
  'Jamie Foster', 'Quinn Abebe', 'Hayden Choi', 'Logan Bauer', 'Skylar Romano',
  'Parker Yusuf', 'Charlie Dvorak', 'Emerson Khan', 'Finley Mendez', 'Sage Volkov',
  'Blake Tanaka', 'Cameron Diaz', 'Dakota Reyes', 'Elliot Vance', 'Frankie Holm',
];

const TEAMS_BY_GROUP: Record<string, string[]> = {
  A: ['Mexico', 'Canada', 'Morocco', 'Saudi Arabia'],
  B: ['USA', 'Ecuador', 'Senegal', 'Portugal'],
  C: ['Canada', 'Switzerland', 'Tunisia', 'Japan'],
  D: ['England', 'Iran', 'Wales', 'Croatia'],
  E: ['Brazil', 'Serbia', 'South Korea', 'Ghana'],
  F: ['Argentina', 'Mexico', 'Poland', 'Australia'],
  G: ['France', 'Denmark', 'Cameroon', 'Tunisia'],
  H: ['Spain', 'Germany', 'Costa Rica', 'Japan'],
  I: ['Belgium', 'Morocco', 'Croatia', 'Canada'],
  J: ['Netherlands', 'Ecuador', 'Senegal', 'Qatar'],
  K: ['Portugal', 'Uruguay', 'South Korea', 'Ghana'],
  L: ['Italy', 'Switzerland', 'Costa Rica', 'New Zealand'],
};

function rand(seed: number): () => number {
  // Mulberry32 — deterministic pseudo-random so mock data is stable.
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildMatches(): Match[] {
  const matches: Match[] = [];
  const rng = rand(42);
  const startDate = new Date('2026-06-11T00:00:00Z');

  let num = 1;
  const groups = Object.keys(TEAMS_BY_GROUP);

  // 6 matches per group × 12 groups = 72 group matches
  for (const g of groups) {
    const [t1, t2, t3, t4] = TEAMS_BY_GROUP[g];
    const fixtures: [string, string][] = [
      [t1, t2], [t3, t4],
      [t1, t3], [t2, t4],
      [t1, t4], [t2, t3],
    ];
    fixtures.forEach((fx, i) => {
      const dayOffset = Math.floor((num - 1) / 4) + i; // rough spread
      const d = new Date(startDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      matches.push({
        number: num++,
        date: d.toISOString().slice(0, 10),
        time: ['12:00', '15:00', '18:00', '21:00'][Math.floor(rng() * 4)],
        stage: 'Group',
        group: g,
        teamA: fx[0],
        teamB: fx[1],
        venue: ['MetLife', 'SoFi', 'Mercedes-Benz', 'Lumen', 'Arrowhead', 'Hard Rock'][Math.floor(rng() * 6)],
      });
    });
  }

  // 32 knockout matches (M73..M104), slot labels
  const ko: Array<[string, string, string]> = [
    // R32 — 16 matches (M73..M88) — placeholders for now
    ...Array.from({ length: 16 }, (_, i) => [
      'R32',
      `1st Group ${groups[i % 12]}`,
      `2nd Group ${groups[(i + 6) % 12]}`,
    ] as [string, string, string]),
    // R16 — 8 matches
    ...Array.from({ length: 8 }, (_, i) => [
      'R16',
      `M${73 + i * 2} winner`,
      `M${74 + i * 2} winner`,
    ] as [string, string, string]),
    // QF — 4 matches
    ...Array.from({ length: 4 }, (_, i) => [
      'QF',
      `M${89 + i * 2} winner`,
      `M${90 + i * 2} winner`,
    ] as [string, string, string]),
    // SF — 2 matches
    ...Array.from({ length: 2 }, (_, i) => [
      'SF',
      `M${97 + i * 2} winner`,
      `M${98 + i * 2} winner`,
    ] as [string, string, string]),
    // 3rd place
    ['3rd', 'M101 loser', 'M102 loser'],
    // Final
    ['Final', 'M101 winner', 'M102 winner'],
  ];

  ko.forEach(([stage, a, b], i) => {
    const d = new Date(startDate.getTime() + (16 + i) * 24 * 60 * 60 * 1000);
    matches.push({
      number: num++,
      date: d.toISOString().slice(0, 10),
      time: ['15:00', '18:00', '21:00'][Math.floor(rng() * 3)],
      stage: stage as Match['stage'],
      group: null,
      teamA: a,
      teamB: b,
      venue: ['MetLife', 'SoFi', 'AT&T'][Math.floor(rng() * 3)],
    });
  });

  return matches;
}

function buildResults(matches: Match[]): MatchResult[] {
  const rng = rand(7);
  // Simulate first 24 group matches played.
  return matches.map((m) => {
    if (m.number <= 24) {
      const sA = Math.floor(rng() * 4);
      const sB = Math.floor(rng() * 4);
      return {
        matchNumber: m.number,
        scoreA: sA,
        scoreB: sB,
        outcome: sA > sB ? 'A' : sA < sB ? 'B' : 'D',
        played: true,
      };
    }
    return {
      matchNumber: m.number,
      scoreA: null,
      scoreB: null,
      outcome: null,
      played: false,
    };
  });
}

function buildPlayers(): PlayerScore[] {
  const rng = rand(99);
  const players = PLAYER_NAMES.map((name) => {
    const gp = Math.floor(rng() * 15) + 3; // 3..17 group points so far
    const kp = 0;
    const wc = Math.floor(rng() * 3) * 5;
    const tb = Math.floor(rng() * 30);
    return {
      name,
      groupTotal: gp,
      knockoutTotal: kp,
      wildcardTotal: wc,
      tiebreakerDelta: tb,
      grandTotal: gp + kp + wc,
      rank: 0,
      previousRank: 0,
    };
  });

  // Sort & assign rank.
  players.sort((a, b) => {
    if (b.grandTotal !== a.grandTotal) return b.grandTotal - a.grandTotal;
    return a.tiebreakerDelta - b.tiebreakerDelta;
  });
  players.forEach((p, i) => {
    p.rank = i + 1;
    // Random trend for visual variety
    const delta = Math.floor(rng() * 5) - 2;
    p.previousRank = Math.max(1, Math.min(players.length, p.rank + delta));
  });
  return players;
}

function buildStandings(results: MatchResult[], matches: Match[]): GroupStanding[] {
  const standings = new Map<string, GroupStanding>();
  for (const g of Object.keys(TEAMS_BY_GROUP)) {
    for (const t of TEAMS_BY_GROUP[g]) {
      standings.set(`${g}-${t}`, {
        group: g, team: t, played: 0, wins: 0, draws: 0, losses: 0,
        goalDifference: 0, points: 0,
      });
    }
  }
  for (const m of matches) {
    if (m.stage !== 'Group' || !m.group) continue;
    const r = results.find((x) => x.matchNumber === m.number);
    if (!r?.played) continue;
    const a = standings.get(`${m.group}-${m.teamA}`)!;
    const b = standings.get(`${m.group}-${m.teamB}`)!;
    a.played++; b.played++;
    a.goalDifference += (r.scoreA ?? 0) - (r.scoreB ?? 0);
    b.goalDifference += (r.scoreB ?? 0) - (r.scoreA ?? 0);
    if (r.outcome === 'A') { a.wins++; b.losses++; a.points += 3; }
    else if (r.outcome === 'B') { b.wins++; a.losses++; b.points += 3; }
    else { a.draws++; b.draws++; a.points++; b.points++; }
  }
  return [...standings.values()].sort((x, y) =>
    x.group.localeCompare(y.group) ||
    y.points - x.points ||
    y.goalDifference - x.goalDifference
  );
}

export function getMockSnapshot(): DataSnapshot {
  const matches = buildMatches();
  const results = buildResults(matches);
  return {
    players: buildPlayers(),
    matches,
    results,
    standings: buildStandings(results, matches),
    predictions: {
      byPlayer: new Map(),
      consensus: new Map(),
      totalPlayers: 0,
    },
    fetchedAt: new Date(),
  };
}
