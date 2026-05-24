import { lazy, Suspense, Component } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage  from './pages/LoginPage'
import AdminLandingPage from './pages/AdminLandingPage'
import AdminPage  from './pages/AdminPage'
import CollabPage from './pages/CollabPage'
import ClientPage from './pages/ClientPage'
import PrivacyPage from './pages/PrivacyPage'

const EmbedPage             = lazy(() => import('./pages/EmbedPage'))
const PresentationEditorPage = lazy(() => import('./pages/PresentationEditorPage'))
const AdminFeedbackReviewPage = lazy(() => import('./pages/AdminFeedbackReviewPage'))
const AdminDataPage = lazy(() => import('./pages/AdminDataPage'))

const PageLoadingFallback = () => (
  <div style={{ width: '100%', height: '100vh', background: '#080604', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ fontFamily: 'Chakra Petch, sans-serif', fontSize: 11, color: '#5A4E45', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Loading…</div>
  </div>
)

class PageErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) {
    console.error('[PageErrorBoundary]', error, info)
    const message = String(error?.message || error || '')
    const isStaleChunk = /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(message)
    if (!isStaleChunk || typeof window === 'undefined') return

    const retryKey = 'stageviz:stale-chunk-retry'
    const retryValue = window.location.pathname
    if (window.sessionStorage?.getItem(retryKey) === retryValue) return
    try { window.sessionStorage?.setItem(retryKey, retryValue) } catch (_) {}

    const url = new URL(window.location.href)
    url.searchParams.set('appv', String(Date.now()))
    window.location.replace(url.toString())
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ width: '100%', height: '100vh', background: '#080604', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Chakra Petch, sans-serif', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#E8531A', letterSpacing: '0.1em' }}>PAGE FAILED TO LOAD</div>
          <div style={{ fontSize: 11, color: '#8E7E70', maxWidth: 480, textAlign: 'center', lineHeight: 1.6 }}>{this.state.error?.message || 'Unknown error'}</div>
          <button onClick={() => window.location.reload()} style={{ marginTop: 8, padding: '6px 16px', background: 'rgba(232,83,26,0.12)', border: '1px solid rgba(232,83,26,0.3)', borderRadius: 6, color: '#E8531A', fontSize: 11, cursor: 'pointer', fontFamily: 'Chakra Petch, sans-serif' }}>Reload</button>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  return (
    <PageErrorBoundary>
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
              <AdminLandingPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/stage"
          element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/stage/:stageProjectId"
          element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/data"
          element={
            <ProtectedRoute>
              <PageErrorBoundary>
                <Suspense fallback={<PageLoadingFallback />}>
                  <AdminDataPage />
                </Suspense>
              </PageErrorBoundary>
            </ProtectedRoute>
          }
        />

        {/* Protected: Presentation Editor — /admin/:projectId/presentation */}
        <Route
          path="/admin/:projectId/presentation"
          element={
            <ProtectedRoute>
              <PageErrorBoundary>
                <Suspense fallback={<PageLoadingFallback />}>
                  <PresentationEditorPage />
                </Suspense>
              </PageErrorBoundary>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/:projectId/feedback"
          element={
            <ProtectedRoute>
              <PageErrorBoundary>
                <Suspense fallback={<PageLoadingFallback />}>
                  <AdminFeedbackReviewPage />
                </Suspense>
              </PageErrorBoundary>
            </ProtectedRoute>
          }
        />

        {/* Public: Collaborator view — shareable link, no login required */}
        <Route path="/collab/:projectId" element={<PageErrorBoundary><CollabPage /></PageErrorBoundary>} />

        {/* Public: End-client view — no login required */}
        <Route path="/view/:projectId" element={<PageErrorBoundary><ClientPage /></PageErrorBoundary>} />

        {/* Public: Embed by opaque token (P9). Logged-in admins see preview chrome; anon sees canvas only. */}
        <Route
          path="/embed/:embedToken"
          element={
            <Suspense fallback={<PageLoadingFallback />}>
              <EmbedPage />
            </Suspense>
          }
        />

        {/* Fallback: unknown paths → login */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </PageErrorBoundary>
  )
}

export default App
