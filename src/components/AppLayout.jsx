import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { LayoutDashboard, ListMusic, LogOut, Menu, Mic, Upload, WifiOff, X } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import { useNetworkStatus } from '../hooks/useMisc';
import { UploadProvider } from './UploadDialog';
import { useUploadDialog } from './uploadContext';
import { GlobalSearch } from './GlobalSearch';
import { Button } from './ui';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/record', label: 'New recording', icon: Mic },
  { to: '/recordings', label: 'Recordings', icon: ListMusic },
];

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 text-slate-900" aria-label="Buzytech AI Recorder home">
      <img src="/logo.png" alt="" className="h-9 w-9 rounded-lg" />
      <span className="leading-tight">
        <span className="block text-base font-bold tracking-tight">Buzytech</span>
        <span className="block text-xs font-medium text-brand-600">AI Recorder</span>
      </span>
    </Link>
  );
}

function Sidebar({ onNavigate }) {
  const { user, logout } = useAuth();
  const openUpload = useUploadDialog();
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-1">
        <Logo />
      </div>
      <nav className="flex flex-col gap-1" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
            }
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            openUpload();
          }}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <Upload className="h-4 w-4" aria-hidden /> Upload audio
        </button>
      </nav>
      <div className="mt-auto rounded-lg border border-slate-200 p-3">
        <p className="truncate text-sm font-medium text-slate-900">{user?.name}</p>
        <p className="truncate text-xs text-slate-500">{user?.email}</p>
        <Button variant="ghost" size="sm" className="mt-2 w-full justify-start px-2" onClick={logout}>
          <LogOut className="h-4 w-4" aria-hidden /> Log out
        </Button>
      </div>
    </div>
  );
}

function Shell() {
  const navigate = useNavigate();
  const online = useNetworkStatus();
  const [mobileOpen, setMobileOpen] = useState(false);
  useRealtimeEvents({ onNavigate: navigate });

  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <Button variant="ghost" size="icon" className="absolute right-2 top-3" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </Button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <GlobalSearch />
          <Button size="sm" className="ml-auto hidden sm:inline-flex" onClick={() => navigate('/record')}>
            <Mic className="h-4 w-4" aria-hidden /> Record
          </Button>
        </header>
        {!online && (
          <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-sm text-amber-900" role="status">
            <WifiOff className="h-4 w-4" aria-hidden /> You're offline. Recordings continue locally and sync when you reconnect.
          </div>
        )}
        <main id="main" className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AppLayout() {
  return (
    <UploadProvider>
      <Shell />
    </UploadProvider>
  );
}
