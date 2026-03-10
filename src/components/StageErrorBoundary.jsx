import { Component } from 'react'

/**
 * Error Boundary for the 3D Canvas. Catches:
 * - WebGL initialization failures
 * - GLTF model loading errors
 * - Fetch/network failures
 * Prevents blank white screens; shows a graceful fallback UI.
 */
class StageErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[StageErrorBoundary]', error, info)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || 'Unknown error'
      const isWebgl = /webgl|context|gpu/i.test(msg)
      const isNetwork = /fetch|network|cors|failed to load/i.test(msg)

      let hint = 'Try reloading the page.'
      if (isWebgl) hint = 'WebGL may be disabled or unsupported in your browser.'
      else if (isNetwork) hint = 'Check your connection and try again.'

      return (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0c]"
          style={{ fontFamily: "'Chakra Petch', sans-serif" }}
        >
          <div className="flex flex-col items-center gap-4 text-center px-6 max-w-md">
            <p
              className="text-xl sm:text-2xl font-bold tracking-widest"
              style={{ color: '#FF5F1F' }}
            >
              STAGE FAILED TO LOAD
            </p>
            <p className="text-white/60 text-sm font-mono break-all">
              {msg}
            </p>
            <p className="text-white/40 text-xs">
              {hint}
            </p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={this.handleRetry}
                className="px-5 py-2.5 rounded-xl border font-medium transition-all hover:bg-[#FF5F1F]/20"
                style={{
                  color: '#FF5F1F',
                  borderColor: '#FF5F1F',
                }}
              >
                RETRY
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-xl border font-medium transition-all hover:bg-white/10"
                style={{
                  color: '#ffffff',
                  borderColor: 'rgba(255,255,255,0.3)',
                }}
              >
                RELOAD PAGE
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default StageErrorBoundary
