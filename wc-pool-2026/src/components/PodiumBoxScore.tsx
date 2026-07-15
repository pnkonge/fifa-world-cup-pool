import { useState } from 'react';

interface PodiumBoxScoreProps {
  group: number;
  ko: number;
  wild: number;
  tbDelta: number | null;
  total: number;
  /** 1st-place card is dark pitch green — invert to paper/gold. */
  dark?: boolean;
  defaultOpen?: boolean;
}

export function PodiumBoxScore({
  group,
  ko,
  wild,
  tbDelta,
  total,
  dark = false,
  defaultOpen = false,
}: PodiumBoxScoreProps) {
  const [open, setOpen] = useState(defaultOpen);

  const ink = dark ? 'text-paper' : 'text-pitch-950';
  const faint = dark ? 'text-pitch-300' : 'text-pitch-700';
  const rule = dark ? 'border-paper' : 'border-pitch-950';
  const hairline = dark ? 'border-paper/25' : 'border-pitch-300/40';
  const totalAccent = dark ? 'text-gold-300' : '';

  const rows: Array<[string, number]> = [
    ['Group stage', group],
    ['Knockouts', ko],
    ['Wild cards', wild],
  ];

  return (
    <div className={`mt-4 border-t ${rule}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex w-full items-baseline justify-between pt-2 font-mono text-[10px] font-semibold uppercase tracking-widest ${ink}`}
      >
        <span>Box score</span>
        <span
          aria-hidden="true"
          className={`transition-transform motion-reduce:transition-none ${
            open ? 'rotate-90' : ''
          }`}
        >
          ▸
        </span>
      </button>

      {open && (
        <div className="pt-2">
          <table className={`w-full font-mono text-xs ${ink}`}>
            <tbody>
              {rows.map(([label, pts]) => (
                <tr key={label} className={`border-t ${hairline}`}>
                  <td
                    className={`py-1 pr-2 text-[10px] uppercase tracking-widest ${faint}`}
                  >
                    {label}
                  </td>
                  <td className="py-1 text-right font-semibold tabular-nums">
                    {pts}
                  </td>
                </tr>
              ))}
              <tr className={`border-t ${rule}`}>
                <td
                  className={`py-1 pr-2 text-[10px] font-semibold uppercase tracking-widest ${totalAccent}`}
                >
                  Total
                </td>
                <td
                  className={`py-1 text-right font-semibold tabular-nums ${totalAccent}`}
                >
                  {total}
                </td>
              </tr>
            </tbody>
          </table>

          {tbDelta !== null && (
            <p className={`mt-1.5 font-mono text-[10px] italic ${faint}`}>
              † TB Δ {tbDelta} — closest prediction breaks ties, not added to
              total
            </p>
          )}
        </div>
      )}
    </div>
  );
}
