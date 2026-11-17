import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createBrowserRouter } from 'react-router'
import { AppShell } from './components/shell/AppShell'
import { Assets } from './pages/Assets'
import { Assistant } from './pages/Assistant'
import { Attack } from './pages/Attack'
import { NetworkMap } from './pages/NetworkMap'
import { Overview } from './pages/Overview'
import { Remediation } from './pages/Remediation'
import { Reports } from './pages/Reports'
import { Vulnerabilities } from './pages/Vulnerabilities'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5_000 } },
})

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Overview /> },
      { path: 'map', element: <NetworkMap /> },
      { path: 'assets', element: <Assets /> },
      { path: 'attack', element: <Attack /> },
      { path: 'vulnerabilities', element: <Vulnerabilities /> },
      { path: 'assistant', element: <Assistant /> },
      { path: 'remediation', element: <Remediation /> },
      { path: 'reports', element: <Reports /> },
      { path: '*', element: <Overview /> },
    ],
  },
])

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
