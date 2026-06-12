import type { ReactNode } from 'react';
import { Header } from './Header';

interface LayoutProps {
  children: ReactNode;
  fetchedAt: Date | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export function Layout({ children, fetchedAt, isLoading, onRefresh }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header
        fetchedAt={fetchedAt}
        isLoading={isLoading}
        onRefresh={onRefresh}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 sm:px-8 sm:py-12">
        {children}
      </main>
      <footer className="border-t border-pitch-300/40 px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between font-mono text-[10px] uppercase tracking-widest text-pitch-700">
          <span>WC '26 Friends Pool</span>
          <span>Built for the group chat</span>
        </div>
      </footer>
    </div>
  );
}
