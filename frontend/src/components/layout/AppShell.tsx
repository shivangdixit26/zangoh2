import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { connectLive, useLive } from '../../store/live';
import { Spinner, Toasts } from '../ui';
import { MobileNav, Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell() {
  const { pathname } = useLocation();
  const ready = useLive((s) => s.ready);
  useEffect(() => connectLive(), []);

  return (
    <div className="min-h-full">
      <TopBar />
      <div className="mx-auto flex max-w-[1680px] gap-5 px-3 pb-20 pt-5 sm:px-5 md:pb-5">
        <div className="hidden md:block"><Sidebar expanded={pathname === '/'} /></div>
        <main className="min-w-0 flex-1">
          {ready ? <Outlet /> : (
            <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-sm text-muted">
              <Spinner className="size-7" />
              Connecting to the live supervision feed…
            </div>
          )}
        </main>
      </div>
      <MobileNav />
      <Toasts />
    </div>
  );
}
