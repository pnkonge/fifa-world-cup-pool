// Dummy bracket data for local testing before real group results exist.
//
// Builds the standard 32-team single-elimination structure with FIFA 2026
// match numbering (M73..M104) and wires the feedsFrom relationships.
//
// Crucially, the dummy RESULTS model an independent "truth" tournament:
// a fixed actual-winner for every match, internally consistent (the R16
// winner really did come from the two R32 matches that feed that slot).
// This lets the scoring engine be exercised exactly as it will be with
// real data — your picks are compared slot-by-slot against this truth.

import {
  cascade,
  type BracketPicks, type BracketResults, type BracketSlot,
  type BracketStructure,
} from './bracket';

// 32 placeholder qualified teams (stand-ins until real standings resolve).
const DUMMY_TEAMS_32 = [
  'Mexico', 'Switzerland', 'Brazil', 'Scotland', 'Germany', 'Netherlands',
  'Spain', 'Belgium', 'Uruguay', 'Iran', 'France', 'Norway', 'Argentina',
  'Portugal', 'England', 'Colombia', 'Canada', 'Japan', 'Morocco', 'Ecuador',
  'Senegal', 'Croatia', 'USA', 'Korea Republic', 'Italy', 'Denmark',
  'Australia', 'Poland', 'Cameroon', 'Ghana', 'Serbia', 'Sweden',
];

export function buildDummyBracket(teams: string[] = DUMMY_TEAMS_32): BracketStructure {
  const slots: BracketSlot[] = [];

  // R32 — 16 slots, matches 73..88
  for (let i = 0; i < 16; i++) {
    slots.push({
      id: `R32-${i + 1}`,
      stage: 'R32',
      matchNumber: 73 + i,
      feedsFrom: [null, null],
      seedA: teams[i * 2] ?? null,
      seedB: teams[i * 2 + 1] ?? null,
    });
  }
  // R16 — 8 slots, matches 89..96
  for (let i = 0; i < 8; i++) {
    slots.push({
      id: `R16-${i + 1}`, stage: 'R16', matchNumber: 89 + i,
      feedsFrom: [`R32-${i * 2 + 1}`, `R32-${i * 2 + 2}`],
      seedA: null, seedB: null,
    });
  }
  // QF — 4 slots, matches 97..100
  for (let i = 0; i < 4; i++) {
    slots.push({
      id: `QF-${i + 1}`, stage: 'QF', matchNumber: 97 + i,
      feedsFrom: [`R16-${i * 2 + 1}`, `R16-${i * 2 + 2}`],
      seedA: null, seedB: null,
    });
  }
  // SF — 2 slots, matches 101..102
  for (let i = 0; i < 2; i++) {
    slots.push({
      id: `SF-${i + 1}`, stage: 'SF', matchNumber: 101 + i,
      feedsFrom: [`QF-${i * 2 + 1}`, `QF-${i * 2 + 2}`],
      seedA: null, seedB: null,
    });
  }
  // 3rd place — match 103, fed by the LOSERS of SF-1 and SF-2
  slots.push({
    id: '3rd', stage: '3rd', matchNumber: 103,
    feedsFrom: ['SF-1', 'SF-2'], seedA: null, seedB: null,
  });
  // Final — match 104, fed by the WINNERS of SF-1 and SF-2
  slots.push({
    id: 'Final', stage: 'Final', matchNumber: 104,
    feedsFrom: ['SF-1', 'SF-2'], seedA: null, seedB: null,
  });

  const byId = new Map(slots.map((s) => [s.id, s]));
  return { slots, byId };
}

/**
 * Build an internally-consistent "truth" result set for testing.
 *
 * We define the real winner of each R32 match, then CASCADE that truth
 * through the rest of the bracket exactly as the player's picks cascade —
 * so the R16/QF/SF/Final/3rd winners are guaranteed to be teams that
 * actually reached those slots. Only the rounds we mark as "played" are
 * returned, so you can test partial scoring.
 *
 * playedThrough: how far the tournament has progressed.
 *   'R32' = only R32 done, 'R16' = R32+R16 done, etc. 'all' = everything.
 */
export function buildDummyResults(
  structure: BracketStructure,
  playedThrough: 'R32' | 'R16' | 'QF' | 'SF' | 'all' = 'R16',
): BracketResults {
  // Truth picks: the "left" competitor of each match wins. Deterministic.
  // We compute this by cascading a synthetic pick set where every slot's
  // winner is its seedA (or, for cascaded slots, the winner of its first
  // feeder).
  const truthPicks: BracketPicks = {};

  // R32: winner = seedA of each slot.
  for (const slot of structure.slots) {
    if (slot.stage === 'R32') {
      if (slot.seedA) truthPicks[slot.id] = slot.seedA;
    }
  }
  // Cascade R32 truth so later slots have competitors, then for each later
  // slot pick its first competitor as the truth winner.
  for (const stage of ['R16', 'QF', 'SF', 'Final', '3rd'] as const) {
    const resolved = cascade(structure, truthPicks);
    for (const slot of structure.slots) {
      if (slot.stage !== stage) continue;
      const comp = resolved.get(slot.id);
      const winner = comp?.a ?? comp?.b ?? null;
      if (winner) truthPicks[slot.id] = winner;
    }
  }

  // Decide which stages count as played.
  const order = ['R32', 'R16', 'QF', 'SF', 'Final'];
  const cutoff = playedThrough === 'all' ? order.length - 1 : order.indexOf(playedThrough);

  const results: BracketResults = {};
  for (const slot of structure.slots) {
    const stageIdx =
      slot.stage === '3rd' ? order.indexOf('Final') : order.indexOf(slot.stage);
    if (stageIdx <= cutoff && truthPicks[slot.id]) {
      results[slot.id] = truthPicks[slot.id];
    }
  }
  return results;
}
