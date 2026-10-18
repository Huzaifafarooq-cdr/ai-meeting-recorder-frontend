import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { GuestOnly, NotFound, RequireAuth, RouteError } from './components/RouteGuards';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { RecordPage } from './pages/RecordPage';
import { RecordingsPage } from './pages/RecordingsPage';
import { RecordingDetailPage } from './pages/RecordingDetailPage';

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/', element: <DashboardPage /> },
              { path: '/record', element: <RecordPage /> },
              { path: '/recordings', element: <RecordingsPage /> },
              { path: '/recordings/:id', element: <RecordingDetailPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
