import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage  from './pages/LoginPage'
import AdminPage  from './pages/AdminPage'
import CollabPage from './pages/CollabPage'
import ClientPage from './pages/ClientPage'
import PrivacyPage from './pages/PrivacyPage'

const EmbedPage             = lazy(() => import('./pages/EmbedPage'))
const PresentationEditorPage = lazy(() => import('./pages/PresentationEditorPage'))

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

        {/* Protected: Presentation Editor — /admin/:projectId/presentation */}
        <Route
          path="/admin/:projectId/presentation"
          element={
            <ProtectedRoute>
              <Suspense fallback={null}>
                <PresentationEditorPage />
              </Suspense>
            </ProtectedRoute>
          }
        />

        {/* Public: Collaborator view — shareable link, no login required */}
        <Route path="/collab/:projectId" element={<CollabPage />} />

        {/* Public: End-client view — no login required */}
        <Route path="/view/:projectId" element={<ClientPage />} />

        {/* Public: Embed by opaque token (P9). Logged-in admins see preview chrome; anon sees canvas only. */}
        <Route
          path="/embed/:embedToken"
          element={
            <Suspense fallback={null}>
              <EmbedPage />
            </Suspense>
          }
        />

        {/* Fallback: unknown paths → login */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
