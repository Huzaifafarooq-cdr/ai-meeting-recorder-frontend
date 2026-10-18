import { Navigate, Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { Button, Spinner } from './ui';

function FullPageSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

export function GuestOnly() {
  const { status } = useAuth();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}

export function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-5xl font-bold text-slate-300">404</p>
      <p className="text-slate-600">This page doesn't exist.</p>
      <Link to="/">
        <Button>Go to dashboard</Button>
      </Link>
    </div>
  );
}

export function RouteError() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-lg font-semibold text-slate-900">Something went wrong</p>
      <p className="max-w-md text-sm text-slate-600">An unexpected error occurred while showing this page. Reloading usually fixes it.</p>
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </div>
  );
}
