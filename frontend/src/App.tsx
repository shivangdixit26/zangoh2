import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import AgentConfigPage from './pages/AgentConfig';
import Conversations from './pages/Conversations';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Templates from './pages/Templates';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'conversations', element: <Conversations /> },
      { path: 'conversations/:id', element: <Conversations /> },
      { path: 'agents', element: <Navigate to="/agents/csr-returns" replace /> },
      { path: 'agents/:agentId', element: <AgentConfigPage /> },
      { path: 'templates', element: <Templates /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
