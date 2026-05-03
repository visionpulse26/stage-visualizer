import { BrowserRouter, Routes, Route, Navigate, lazy, Suspense } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage  from './pages/LoginPage'
import AdminPage  from './pages/AdminPage'
import CollabPage from './pages/CollabPage'
import ClientPage from './pages/ClientPage'
import PrivacyPage from './pages/PrivacyPage'

const EmbedPage = lazy(() => import('./pages/EmbedPage'))

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public: Landing / Login */}
        <Route path="/" element={<LoginPage />} />

        <Route path="/privacy" element={<PrivacyPage />} />

        {/* Protected: Admin — requires active Supabase session */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          }
        />

        {/* Public: Collaborator view — shareable link, no login required */}
        <Route path="/collab/:projectId" element={<CollabPage />} />

        {/* Public: End-client view — no login required */}
        <Route path="/view/:projectId" element={<ClientPage />} />

        {/* Protected: Embed preview — admin-only for V1; will be made public when embed-token API ships */}
        <Route
          path="/embed/:projectId"
          element={
            <ProtectedRoute>
              <Suspense fallback={null}>
                <EmbedPage />
              </Suspense>
            </ProtectedRoute>
          }
        />

        {/* Fallback: unknown paths → login */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
