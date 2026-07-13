import { useEffect, useRef } from 'react';
import type { PlayerScore } from '../lib/types';

// Shown on the Leaderboard once the Final has a result: the world champions
// (team) and the pool champion (leaderboard #1) share one gold masthead.
// Confetti is a small canvas — no dependency — and respects
// prefers-reduced-motion.

interface ChampionsBannerProps {
  championTeam: string;
  poolChampion: PlayerScore | null;
}

export function ChampionsBanner({ championTeam, poolChampion }: ChampionsBannerProps) {
  return (
    <section className="relative overflow-hidden border-2 border-gold-500 bg-pitch-950 px-5 py-8 text-paper sm:px-10 sm:py-12">
      <Confetti />

      <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:gap-10">
        <TrophyIcon />

        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-gold-300">
            Full time · The tournament is decided
          </p>
          <h2 className="mt-2 font-display text-4xl font-black leading-none tracking-tightest text-paper sm:text-6xl">
            {championTeam}{' '}
            <span className="text-gold-300">are world champions</span>
          </h2>

          {poolChampion && (
            <p className="mt-4 border-t border-pitch-700 pt-4 font-display text-base italic text-pitch-300 sm:text-lg">
              And in this pool, the crown goes to{' '}
              <span className="not-italic font-bold text-gold-300">
                {poolChampion.name}
              </span>{' '}
              —{' '}
              <span className="not-italic font-semibold text-paper">
                {poolChampion.grandTotal} points
              </span>
              . Bragging rights until 2030.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function TrophyIcon() {
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-gold-300"
    >
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3" />
      <path d="M9 4V2.5" />
      <path d="M15 4V2.5" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Confetti — gold, paper and pitch flecks falling for a few seconds.
// ─────────────────────────────────────────────────────────────────────

const COLORS = ['#dcbb5f', '#d4a038', '#faf7f2', '#90b09e', '#bd8624'];
const DURATION_MS = 7000;
const PIECES = 110;

function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function size() {
      if (!canvas || !parent) return;
      canvas.width = parent.clientWidth * dpr;
      canvas.height = parent.clientHeight * dpr;
    }
    size();
    window.addEventListener('resize', size);

    const pieces = Array.from({ length: PIECES }, () => ({
      x: Math.random(),
      y: -Math.random() * 1.2,
      w: 4 + Math.random() * 5,
      h: 7 + Math.random() * 7,
      speed: 0.00015 + Math.random() * 0.00025,
      sway: 20 + Math.random() * 40,
      swaySpeed: 0.001 + Math.random() * 0.002,
      rot: Math.random() * Math.PI,
      rotSpeed: (Math.random() - 0.5) * 0.12,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));

    const start = performance.now();

    function frame(now: number) {
      if (!canvas || !ctx) return;
      const t = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Fade everything out over the last second.
      const fade = t > DURATION_MS - 1000 ? Math.max(0, (DURATION_MS - t) / 1000) : 1;
      ctx.globalAlpha = fade;

      for (const p of pieces) {
        const y = (p.y + t * p.speed) % 1.3;
        const x = p.x * canvas.width + Math.sin(t * p.swaySpeed + p.rot * 7) * p.sway * dpr;
        ctx.save();
        ctx.translate(x, y * canvas.height);
        ctx.rotate(p.rot + t * 0.001 * (p.rotSpeed * 60));
        ctx.fillStyle = p.color;
        ctx.fillRect((-p.w / 2) * dpr, (-p.h / 2) * dpr, p.w * dpr, p.h * dpr);
        ctx.restore();
      }

      if (t < DURATION_MS) {
        raf = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
