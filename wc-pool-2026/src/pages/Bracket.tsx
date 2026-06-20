import { useMemo, useState } from 'react';
import {
  cascade, scoreBracket, slotIsReady, STAGE_ORDER, STAGE_LABEL,
  maxKnockoutScore,
  type BracketPicks, type BracketResults, type BracketStructure,
  type KnockoutStage,
} from '../lib/bracket';
import { buildDummyBracket, buildDummyResults } from '../lib/dummyBracket';

// Column order left→right. 3rd place sits beside the Final.
const COLUMN_STAGES: KnockoutStage[] = ['R32', 'R16', 'QF', 'SF', 'Final'];

export function Bracket() {
  const structure: BracketStructure = useMemo(() => buildDummyBracket(), []);
  const [playedThrough, setPlayedThrough] = useState<'R32' | 'R16' | 'QF' | 'SF' | 'all'>('all');
  const results: BracketResults = useMemo(
    () => buildDummyResults(structure, playedThrough),
    [structure, playedThrough],
  );
  const [picks, setPicks] = useState<BracketPicks>({});
  const [showResults, setShowResults] = useState(false);

  const resolved = useMemo(() => cascade(structure, picks), [structure, picks]);
  const score = useMemo(
    () => scoreBracket(structure, picks, results),
    [structure, picks, results],
  );
  const maxScore = maxKnockoutScore(structure);

  // How many picks made / total slots.
  const picksMade = Object.keys(picks).filter((k) => picks[k]).length;
  const totalSlots = structure.slots.length;

  function choose(slotId: string, team: string) {
    setPicks((prev) => {
      const next = { ...prev, [slotId]: team };
      // Clear any downstream picks that are no longer reachable.
      // (If you change an R32 winner, later picks of the old winner are stale.)
      return pruneStale(structure, next);
    });
  }

  function resetAll() {
    setPicks({});
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b-2 border-pitch-950 pb-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
          Knockout Stage · Test Mode
        </p>
        <h2 className="font-display text-4xl font-black leading-none tracking-tightest text-pitch-950 sm:text-6xl">
          The Bracket
        </h2>
        <p className="mt-3 max-w-2xl font-display text-base italic text-pitch-700 sm:text-lg">
          Pick a winner in every match — your choice advances to the next round automatically. 2 points for each correct pick. This is a dummy bracket for testing; real teams load once the group stage ends.
        </p>
      </div>

      {/* Control bar */}
      <div className="flex flex-wrap items-center gap-4 border-y border-pitch-300/40 py-3">
        <div className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
          {picksMade} / {totalSlots} picked
        </div>
        <button
          onClick={() => setShowResults((v) => !v)}
          className={[
            'border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition',
            showResults
              ? 'border-pitch-950 bg-pitch-950 text-paper'
              : 'border-pitch-950 bg-paper text-pitch-950 hover:bg-pitch-50',
          ].join(' ')}
        >
          {showResults ? 'Hide scoring' : 'Show scoring'}
        </button>
        <button
          onClick={resetAll}
          className="border border-pitch-300 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-pitch-700 transition hover:border-pitch-950 hover:text-pitch-950"
        >
          Reset
        </button>

        {showResults && (
          <select
            value={playedThrough}
            onChange={(e) => setPlayedThrough(e.target.value as typeof playedThrough)}
            className="border border-pitch-950 bg-paper px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-pitch-950"
            title="Simulate how far the tournament has progressed"
          >
            <option value="R32">Played: R32</option>
            <option value="R16">Played: R16</option>
            <option value="QF">Played: QF</option>
            <option value="SF">Played: SF</option>
            <option value="all">Played: all</option>
          </select>
        )}

        {showResults && (
          <div className="ml-auto flex items-baseline gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
              Knockout score
            </span>
            <span className="font-display text-2xl font-black tracking-tightest text-gold-600">
              {score.total}
            </span>
            <span className="font-mono text-xs text-pitch-700">/ {maxScore}</span>
          </div>
        )}
      </div>

      {/* Scoring breakdown */}
      {showResults && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 border border-pitch-300/60 bg-paper p-4">
          {STAGE_ORDER.map((stage) => (
            <div key={stage} className="flex items-baseline gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
                {stage}
              </span>
              <span className="font-mono text-sm font-semibold tabular text-pitch-950">
                {score.byStage[stage]}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bracket — horizontal scroll on small screens */}
      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-[900px] gap-6">
          {COLUMN_STAGES.map((stage) => (
            <BracketColumn
              key={stage}
              stage={stage}
              structure={structure}
              resolved={resolved}
              picks={picks}
              results={results}
              showResults={showResults}
              onChoose={choose}
              // 3rd place rides in the Final column, rendered below it.
              thirdPlace={stage === 'Final'}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BracketColumn({
  stage, structure, resolved, picks, results, showResults, onChoose, thirdPlace,
}: {
  stage: KnockoutStage;
  structure: BracketStructure;
  resolved: Map<string, { a: string | null; b: string | null }>;
  picks: BracketPicks;
  results: BracketResults;
  showResults: boolean;
  onChoose: (slotId: string, team: string) => void;
  thirdPlace: boolean;
}) {
  const slots = structure.slots.filter((s) => s.stage === stage);
  const thirdSlot = thirdPlace
    ? structure.slots.find((s) => s.stage === '3rd')
    : undefined;

  return (
    <div className="flex min-w-[170px] flex-1 flex-col">
      <h3 className="mb-3 border-b border-pitch-950 pb-1 font-mono text-[10px] uppercase tracking-widest text-pitch-700">
        {STAGE_LABEL[stage]}
      </h3>
      <div className="flex flex-1 flex-col justify-around gap-3">
        {slots.map((slot) => (
          <MatchupCard
            key={slot.id}
            slotId={slot.id}
            comp={resolved.get(slot.id)}
            pick={picks[slot.id]}
            realWinner={results[slot.id]}
            showResults={showResults}
            onChoose={onChoose}
          />
        ))}
      </div>

      {thirdSlot && (
        <div className="mt-6">
          <h3 className="mb-3 border-b border-pitch-300 pb-1 font-mono text-[10px] uppercase tracking-widest text-pitch-700">
            {STAGE_LABEL['3rd']}
          </h3>
          <MatchupCard
            slotId={thirdSlot.id}
            comp={resolved.get(thirdSlot.id)}
            pick={picks[thirdSlot.id]}
            realWinner={results[thirdSlot.id]}
            showResults={showResults}
            onChoose={onChoose}
          />
        </div>
      )}
    </div>
  );
}

function MatchupCard({
  slotId, comp, pick, realWinner, showResults, onChoose,
}: {
  slotId: string;
  comp: { a: string | null; b: string | null } | undefined;
  pick: string | undefined;
  realWinner: string | undefined;
  showResults: boolean;
  onChoose: (slotId: string, team: string) => void;
}) {
  const ready = slotIsReady(comp);

  return (
    <div
      className={[
        'border bg-paper transition',
        ready ? 'border-pitch-300' : 'border-pitch-200/50 opacity-50',
      ].join(' ')}
    >
      <TeamButton
        slotId={slotId}
        team={comp?.a ?? null}
        picked={!!pick && pick === comp?.a}
        realWinner={realWinner}
        showResults={showResults}
        disabled={!ready}
        onChoose={onChoose}
        position="top"
      />
      <div className="h-px bg-pitch-200" />
      <TeamButton
        slotId={slotId}
        team={comp?.b ?? null}
        picked={!!pick && pick === comp?.b}
        realWinner={realWinner}
        showResults={showResults}
        disabled={!ready}
        onChoose={onChoose}
        position="bottom"
      />
    </div>
  );
}

function TeamButton({
  slotId, team, picked, realWinner, showResults, disabled, onChoose, position,
}: {
  slotId: string;
  team: string | null;
  picked: boolean;
  realWinner: string | undefined;
  showResults: boolean;
  disabled: boolean;
  onChoose: (slotId: string, team: string) => void;
  position: 'top' | 'bottom';
}) {
  const isRealWinner = showResults && !!realWinner && team === realWinner;
  const isPickedAndCorrect = showResults && picked && isRealWinner;
  const isPickedAndWrong = showResults && picked && !!realWinner && team !== realWinner;

  return (
    <button
      disabled={disabled || !team}
      onClick={() => team && onChoose(slotId, team)}
      className={[
        'flex w-full items-center justify-between px-3 py-2 text-left transition',
        position === 'top' ? 'rounded-t-[1px]' : 'rounded-b-[1px]',
        picked && !showResults ? 'bg-pitch-950 text-paper' : '',
        isPickedAndCorrect ? 'bg-green-500 text-white' : '',
        isPickedAndWrong ? 'bg-red-50 text-pitch-700 line-through' : '',
        !picked && !showResults ? 'text-pitch-950 hover:bg-pitch-50' : '',
        !picked && showResults && isRealWinner ? 'bg-gold-50 text-pitch-950' : '',
        !picked && showResults && !isRealWinner ? 'text-pitch-600' : '',
        disabled || !team ? 'cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <span className="font-display text-sm font-medium">
        {team ?? <span className="italic text-pitch-300">—</span>}
      </span>
      {showResults && isRealWinner && !picked && (
        <span className="font-mono text-[9px] uppercase tracking-widest text-gold-700">
          won
        </span>
      )}
      {isPickedAndCorrect && (
        <span className="font-mono text-[9px] uppercase tracking-widest">✓</span>
      )}
    </button>
  );
}

/**
 * Remove picks for slots whose competitors no longer include the picked
 * team (because an upstream pick changed). Iterates to a fixed point.
 */
function pruneStale(
  structure: BracketStructure,
  picks: BracketPicks,
): BracketPicks {
  let changed = true;
  let current = { ...picks };
  while (changed) {
    changed = false;
    const resolved = cascade(structure, current);
    for (const slot of structure.slots) {
      const pick = current[slot.id];
      if (!pick) continue;
      const comp = resolved.get(slot.id);
      if (!comp || (comp.a !== pick && comp.b !== pick)) {
        delete current[slot.id];
        changed = true;
      }
    }
  }
  return current;
}
