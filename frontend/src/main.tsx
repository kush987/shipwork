import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { CouriersPage } from './pages/Couriers';
import { DashboardPage } from './pages/Dashboard';
import { ExecutionDetailPage } from './pages/ExecutionDetail';
import { ExecutionsPage } from './pages/Executions';
import { NotFoundPage } from './pages/NotFound';
import { ShipmentsPage } from './pages/Shipments';
import { WorkflowBuilderPage } from './pages/WorkflowBuilder';
import { WarehousesPage } from './pages/Warehouses';
import { EventsPage } from './pages/Events';
import { WorkflowsPage } from './pages/Workflows';
import { CustomNodesPage } from './pages/custom-nodes/CustomNodesPage';
import { CustomNodeEditorPage } from './pages/custom-nodes/CustomNodeEditorPage';
import { BuiltinNodeEditorPage } from './pages/custom-nodes/BuiltinNodeEditorPage';
import { EndpointsPage } from './pages/endpoints/EndpointsPage';
import { EndpointEditorPage } from './pages/endpoints/EndpointEditorPage';
import { ApiKeysPage } from './pages/api-keys/ApiKeysPage';
import { DataPage } from './pages/data/DataPage';
import { MembersPage } from './pages/members/MembersPage';
import { AccessPage } from './pages/access/AccessPage';
import { DatabasePage } from './pages/workspace-database/DatabasePage';
import { SignInPage } from './pages/sign-in/SignInPage';
import { LoginPage } from './pages/auth/LoginPage';
import { SignupPage } from './pages/auth/SignupPage';
import { RequireAuth } from './auth/RequireAuth';
import { PublicOnly } from './auth/PublicOnly';
import { subscribeAuth } from './auth/auth-store';
import { readTheme } from './components/Layout.helpers';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5_000 },
  },
});

// Cached data belongs to one user in one workspace: drop it when either changes.
subscribeAuth((state, previous) => {
  if (state.token !== previous.token || state.activeTenantId !== previous.activeTenantId) queryClient.clear();
});

// The sign-in pages render outside the Layout, which otherwise applies the theme.
document.documentElement.dataset.theme = readTheme();

// Data router (not <BrowserRouter>) so the builder can use useBlocker for unsaved changes.
const router = createBrowserRouter([
  {
    element: <PublicOnly />,
    children: [
      { path: 'login', element: <LoginPage /> },
      { path: 'signup', element: <SignupPage /> },
    ],
  },
  {
    // Every app page needs a signed-in user with a workspace.
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'workflows', element: <WorkflowsPage /> },
          { path: 'workflows/:id', element: <WorkflowBuilderPage /> },
          { path: 'endpoints', element: <EndpointsPage /> },
          { path: 'endpoints/:id', element: <EndpointEditorPage /> },
          { path: 'api-keys', element: <ApiKeysPage /> },
          { path: 'data', element: <DataPage /> },
          { path: 'custom-nodes', element: <CustomNodesPage /> },
          { path: 'events', element: <EventsPage /> },
          { path: 'custom-nodes/builtin/:type', element: <BuiltinNodeEditorPage /> },
          { path: 'custom-nodes/:id', element: <CustomNodeEditorPage /> },
          { path: 'executions', element: <ExecutionsPage /> },
          { path: 'executions/:id', element: <ExecutionDetailPage /> },
          { path: 'shipments', element: <ShipmentsPage /> },
          { path: 'warehouses', element: <WarehousesPage /> },
          { path: 'couriers', element: <CouriersPage /> },
          { path: 'settings/members', element: <MembersPage /> },
          { path: 'settings/access', element: <AccessPage /> },
          { path: 'settings/database', element: <DatabasePage /> },
          { path: 'settings/sign-in', element: <SignInPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
