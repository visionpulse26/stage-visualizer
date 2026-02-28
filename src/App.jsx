import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage  from './pages/LoginPage'
import AdminPage  from './pages/AdminPage'
import CollabPage from './pages/CollabPage'
import ClientPage from './pages/ClientPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public: Landing / Login */}
        <Route path="/" element={<LoginPage />} />

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

        {/* Fallback: unknown paths → login */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
