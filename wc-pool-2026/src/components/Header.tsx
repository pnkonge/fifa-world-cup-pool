import { NavLink } from 'react-router-dom';
import dayjs from 'dayjs';

interface HeaderProps {
  fetchedAt: Date | null;
  isLoading: boolean;
  onRefresh: () => void;
}

const NAV = [
  { to: '/', label: 'Leaderboard', end: true },
  { to: '/schedule', label: 'Schedule' },
  { to: '/standings', label: 'Standings' },
  { to: '/bracket', label: 'Bracket' },
  { to: '/wild-cards', label: 'Wild Cards' },
  { to: '/my-picks', label: 'My Picks' },
];

export function Header({ fetchedAt, isLoading, onRefresh }: HeaderProps) {
  const stamp = fetchedAt ? dayjs(fetchedAt).format('MMM D, h:mm A') : '—';

  return (
    <header className="border-b-2 border-pitch-950 bg-paper">
      {/* Masthead */}
      <div className="mx-auto max-w-7xl px-5 pt-6 pb-3 sm:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
              Friends Pool · Edition I
            </div>
            <h1 className="font-display text-3xl font-black leading-none tracking-tightest text-pitch-950 sm:text-5xl">
              World Cup <span className="text-gold-500">'26</span>
            </h1>
          </div>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="group hidden items-center gap-2 rounded-full border border-pitch-950 bg-paper px-4 py-2 font-mono text-xs uppercase tracking-widest text-pitch-950 transition hover:bg-pitch-950 hover:text-paper disabled:opacity-50 sm:flex"
            aria-label="Refresh data"
          >
            <RefreshIcon spinning={isLoading} />
            <span>{isLoading ? 'Loading' : 'Refresh'}</span>
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="font-mono text-[11px] text-pitch-700">
            Updated <span className="text-pitch-950">{stamp}</span>
          </p>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-pitch-950 sm:hidden"
            aria-label="Refresh data"
          >
            <RefreshIcon spinning={isLoading} />
            <span>{isLoading ? '…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="border-t border-pitch-300/40">
        <div className="mx-auto max-w-7xl overflow-x-auto px-5 sm:px-8">
          <ul className="flex gap-1 whitespace-nowrap">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    [
                      'inline-block border-b-2 px-3 py-3 font-mono text-[11px] uppercase tracking-widest transition',
                      isActive
                        ? 'border-gold-500 text-pitch-950'
                        : 'border-transparent text-pitch-700 hover:text-pitch-950',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </header>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className={spinning ? 'animate-spin' : ''}
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
