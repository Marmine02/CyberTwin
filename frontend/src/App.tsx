import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { RouterProvider, createBrowserRouter } from 'react-router'
import { AppShell } from './components/shell/AppShell'
import { GlassPanel } from './components/ui/GlassPanel'
import { Overview } from './pages/Overview'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5_000 } },
})

/** Pages that are built in phase 8 show only their title until then. */
function PageFrame({ k }: { k: string }) {
  const { t } = useTranslation()
  return <GlassPanel title={t(`ui.nav.${k}`)} className="min-h-[200px]"><div /></GlassPanel>
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Overview /> },
      { path: 'map', element: <PageFrame k="map" /> },
      { path: 'assets', element: <PageFrame k="assets" /> },
      { path: 'attack', element: <PageFrame k="attack" /> },
      { path: 'vulnerabilities', element: <PageFrame k="vulns" /> },
      { path: 'assistant', element: <PageFrame k="assistant" /> },
      { path: 'remediation', element: <PageFrame k="remediation" /> },
      { path: 'reports', element: <PageFrame k="reports" /> },
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
