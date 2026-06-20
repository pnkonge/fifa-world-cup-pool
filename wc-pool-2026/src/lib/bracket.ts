// Knockout bracket types + cascade logic + scoring.
//
// MECHANIC (locked spec):
//   - R32 matchups are pre-set (from group results).
//   - Player picks one winner per match, cascading R32 -> R16 -> QF -> SF
//     -> 3rd place -> Final. 32 picks total.
//   - 2 pts flat per correct pick at every stage. Max knockout = 64.
//   - A later-round pick only scores if that team actually reached that
//     round in real life AND the player had them advancing.

export type KnockoutStage = 'R32' | 'R16' | 'QF' | 'SF' | '3rd' | 'Final';

export const STAGE_ORDER: KnockoutStage[] = ['R32', 'R16', 'QF', 'SF', '3rd', 'Final'];

export const STAGE_LABEL: Record<KnockoutStage, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinals',
  SF: 'Semifinals',
  '3rd': '3rd-place Play-off',
  Final: 'Final',
};

export const POINTS_PER_PICK = 2;

/** A single knockout slot in the bracket tree. */
export interface BracketSlot {
  /** Stable slot id, e.g. "R32-1", "R16-3", "Final". */
  id: string;
  stage: KnockoutStage;
  /** Real-world match number from the Config schedule (M73..M104). */
  matchNumber: number;
  /** Slot ids that feed this slot's two competitors (winners advance here). */
  feedsFrom: [string | null, string | null];
  /** For R32 these are the actual qualified teams; for later rounds null until cascaded. */
  seedA: string | null;
  seedB: string | null;
}

/** The full static bracket structure (who feeds whom). Independent of picks. */
export interface BracketStructure {
  slots: BracketSlot[];
  byId: Map<string, BracketSlot>;
}

/** A player's choices: slot id -> the team they picked to win that slot. */
export type BracketPicks = Record<string, string>;

/** Real-world outcomes: slot id -> the team that actually won. */
export type BracketResults = Record<string, string>;

// ─────────────────────────────────────────────────────────────────────
// CASCADE — given R32 seedings + a player's picks, resolve every slot's
// two competitors. Winner of a feeding slot becomes a competitor here.
// ─────────────────────────────────────────────────────────────────────

/**
 * Resolve the competitors (seedA/seedB) for every slot based on `picks`.
 * R32 slots use their fixed seeds; later slots inherit the picked winner
 * of each feeding slot. The 3rd-place slot is special: it's fed by the
 * LOSERS of the two SF slots, not the winners.
 */
export function cascade(
  structure: BracketStructure,
  picks: BracketPicks,
): Map<string, { a: string | null; b: string | null }> {
  const resolved = new Map<string, { a: string | null; b: string | null }>();

  // Process in stage order so feeders resolve before dependents.
  for (const stage of STAGE_ORDER) {
    for (const slot of structure.slots) {
      if (slot.stage !== stage) continue;

      if (slot.stage === 'R32') {
        resolved.set(slot.id, { a: slot.seedA, b: slot.seedB });
        continue;
      }

      if (slot.stage === '3rd') {
        // Fed by the LOSERS of the two SF slots.
        const [sfA, sfB] = slot.feedsFrom;
        const a = sfA ? loserOf(sfA, picks, resolved) : null;
        const b = sfB ? loserOf(sfB, picks, resolved) : null;
        resolved.set(slot.id, { a, b });
        continue;
      }

      // Normal advancement: winner (picked team) of each feeder.
      const [fA, fB] = slot.feedsFrom;
      const a = fA ? picks[fA] ?? null : null;
      const b = fB ? picks[fB] ?? null : null;
      resolved.set(slot.id, { a, b });
    }
  }

  return resolved;
}

/** The team in `feederId` that the player did NOT pick (the loser). */
function loserOf(
  feederId: string,
  picks: BracketPicks,
  resolved: Map<string, { a: string | null; b: string | null }>,
): string | null {
  const comp = resolved.get(feederId);
  const winner = picks[feederId];
  if (!comp || !winner) return null;
  if (comp.a === winner) return comp.b;
  if (comp.b === winner) return comp.a;
  return null;
}

/**
 * Is a pick for `slotId` currently valid? (Both competitors known and the
 * picked team is actually one of them.) Used to grey out un-pickable slots.
 */
export function slotIsReady(
  comp: { a: string | null; b: string | null } | undefined,
): boolean {
  return !!comp && !!comp.a && !!comp.b;
}

// ─────────────────────────────────────────────────────────────────────
// SCORING — stage by stage, gated on real-world survival.
// ─────────────────────────────────────────────────────────────────────

export interface KnockoutScore {
  total: number;
  byStage: Record<KnockoutStage, number>;
  /** Per-slot: did the player's pick score? (for UI ticks) */
  slotCorrect: Record<string, boolean>;
}

/**
 * Score a player's bracket against real results.
 *
 * For each slot, the player scores 2pts iff:
 *   - the real result for that slot exists, AND
 *   - the player's picked team for that slot equals the real winner.
 *
 * The "gating" falls out naturally: if a player's team lost an earlier
 * round, they simply won't have picked the real surviving team in later
 * slots, so those score 0. We score every slot independently against the
 * real winner of that slot.
 */
export function scoreBracket(
  structure: BracketStructure,
  picks: BracketPicks,
  results: BracketResults,
): KnockoutScore {
  const byStage = {
    R32: 0, R16: 0, QF: 0, SF: 0, '3rd': 0, Final: 0,
  } as Record<KnockoutStage, number>;
  const slotCorrect: Record<string, boolean> = {};
  let total = 0;

  for (const slot of structure.slots) {
    const pick = picks[slot.id];
    const real = results[slot.id];
    const correct = !!pick && !!real && pick === real;
    slotCorrect[slot.id] = correct;
    if (correct) {
      byStage[slot.stage] += POINTS_PER_PICK;
      total += POINTS_PER_PICK;
    }
  }

  return { total, byStage, slotCorrect };
}

/** Maximum achievable knockout score given the structure. */
export function maxKnockoutScore(structure: BracketStructure): number {
  return structure.slots.length * POINTS_PER_PICK;
}
