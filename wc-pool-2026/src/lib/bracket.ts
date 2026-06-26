// Knockout bracket types + cascade logic + scoring.
//
// MECHANIC (locked spec):
//   - R32 matchups are pre-set (from group results).
//   - Player picks one winner per match, cascading R32 -> R16 -> QF -> SF
//     -> 3rd place -> Final. 32 picks total.
//   - 2 pts flat per correct pick at every stage. Max knockout = 64.
//   - A later-round pick only scores if that team actually reached that
//     round in real life AND the player had them advancing.
//
// ONE ROUND OF LOOKAHEAD: a slot can be picked with only ONE competitor
// known (the other still TBD) at R32 and R16 only — e.g. a real seed
// hasn't arrived yet, or the sibling match hasn't been picked yet. This
// lets a player lock in a team one round ahead of full certainty. It is
// capped at exactly one round: a pick made on a still-partial R16 slot
// never forwards into QF, so QF/SF/3rd/Final always require both real
// competitors to be genuinely resolved, exactly as before.

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

/** A slot's resolved competitors, plus whether it can currently be picked. */
export interface ResolvedSlot {
  a: string | null;
  b: string | null;
  /** Can the player pick a winner here right now? See file header re: lookahead. */
  pickable: boolean;
}

/**
 * Resolve the competitors (seedA/seedB) for every slot based on `picks`.
 * R32 slots use their fixed seeds; later slots inherit the picked winner
 * of each feeding slot. The 3rd-place slot is special: it's fed by the
 * LOSERS of the two SF slots, not the winners.
 */
export function cascade(
  structure: BracketStructure,
  picks: BracketPicks,
): Map<string, ResolvedSlot> {
  const resolved = new Map<string, ResolvedSlot>();

  // Process in stage order so feeders resolve before dependents.
  for (const stage of STAGE_ORDER) {
    for (const slot of structure.slots) {
      if (slot.stage !== stage) continue;

      if (slot.stage === 'R32') {
        const { seedA: a, seedB: b } = slot;
        resolved.set(slot.id, { a, b, pickable: !!a || !!b });
        continue;
      }

      if (slot.stage === '3rd') {
        // Fed by the LOSERS of the two SF slots.
        const [sfA, sfB] = slot.feedsFrom;
        const a = sfA ? loserOf(sfA, structure, picks, resolved) : null;
        const b = sfB ? loserOf(sfB, structure, picks, resolved) : null;
        resolved.set(slot.id, { a, b, pickable: !!a && !!b });
        continue;
      }

      // Normal advancement: winner (picked team) of each feeder.
      const [fA, fB] = slot.feedsFrom;
      const a = fA ? forwardedWinner(fA, structure, picks, resolved) : null;
      const b = fB ? forwardedWinner(fB, structure, picks, resolved) : null;
      // R16 gets the one-round lookahead exception; later stages stay strict.
      const pickable = slot.stage === 'R16' ? (!!a || !!b) : (!!a && !!b);
      resolved.set(slot.id, { a, b, pickable });
    }
  }

  return resolved;
}

/**
 * The team the player picked to win `feederId`, but only if that pick is
 * "grounded" — the feeder is R32 (the bracket's root, always safe to
 * forward) or the feeder itself had both competitors known. A pick made on
 * a still-partial slot (the lookahead exception) is NOT forwarded, which is
 * what caps the exception at exactly one round.
 */
function forwardedWinner(
  feederId: string,
  structure: BracketStructure,
  picks: BracketPicks,
  resolved: Map<string, ResolvedSlot>,
): string | null {
  const feederSlot = structure.byId.get(feederId);
  const feederComp = resolved.get(feederId);
  if (!feederSlot || !feederComp) return null;
  const grounded = feederSlot.stage === 'R32' || (!!feederComp.a && !!feederComp.b);
  return grounded ? picks[feederId] ?? null : null;
}

/** The team in `feederId` that the player did NOT pick (the loser). */
function loserOf(
  feederId: string,
  structure: BracketStructure,
  picks: BracketPicks,
  resolved: Map<string, ResolvedSlot>,
): string | null {
  const comp = resolved.get(feederId);
  const winner = forwardedWinner(feederId, structure, picks, resolved);
  if (!comp || !winner) return null;
  if (comp.a === winner) return comp.b;
  if (comp.b === winner) return comp.a;
  return null;
}

/**
 * Is a pick for `slotId` currently valid? (Both competitors known and the
 * picked team is actually one of them.) Kept for callers that need "fully
 * decided" specifically; UI gating uses `ResolvedSlot.pickable` instead.
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

// ─────────────────────────────────────────────────────────────────────
// DISPLAY ORDER — tree-walk so visually adjacent matches feed each other.
// ─────────────────────────────────────────────────────────────────────

/**
 * Compute the correct visual display order for each stage column by walking
 * the bracket tree from the Final backward. Adjacent matches in each column
 * are guaranteed to feed the same match in the next column — critical for
 * the FIFA 2026 bracket where feedsFrom is not a simple binary tree.
 */
export function displayOrder(structure: BracketStructure): Map<KnockoutStage, string[]> {
  function collect(rootId: string, targetStage: KnockoutStage, out: string[]): void {
    const slot = structure.byId.get(rootId);
    if (!slot) return;
    if (slot.stage === targetStage) { out.push(slot.id); return; }
    const [fA, fB] = slot.feedsFrom;
    if (fA) collect(fA, targetStage, out);
    if (fB) collect(fB, targetStage, out);
  }

  const result = new Map<KnockoutStage, string[]>();
  for (const stage of ['R32', 'R16', 'QF', 'SF'] as KnockoutStage[]) {
    const order: string[] = [];
    collect('Final', stage, order);
    result.set(stage, order);
  }
  result.set('Final', ['Final']);
  result.set('3rd', ['3rd']);
  return result;
}