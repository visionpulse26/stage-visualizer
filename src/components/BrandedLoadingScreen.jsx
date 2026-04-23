import { useState, useEffect, useRef } from 'react'

const FADE_MS = 700

function BrandedLoadingScreen({ isLoaded, progress = 0, status = 'INITIALIZING...' }) {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)
  const [displayProgress, setDisplayProgress] = useState(0)
  const progressRef = useRef(0)

  useEffect(() => {
    progressRef.current = progress
    setDisplayProgress(prev => {
      if (progress >= prev) return progress
      return prev
    })
  }, [progress])

  useEffect(() => {
    if (!isLoaded || fading) return

    const t1 = setTimeout(() => {
      setFading(true)
      const t2 = setTimeout(() => setVisible(false), FADE_MS)
      return () => clearTimeout(t2)
    }, 100)

    return () => clearTimeout(t1)
  }, [isLoaded, fading])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-50 select-none"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        width: '100vw',
        height: '100vh',
        backgroundColor: '#FF5F1F',
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms cubic-bezier(.4,0,.2,1)`,
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontFamily: "'Chakra Petch', sans-serif",
            fontWeight: 600,
            fontSize: '11px',
            letterSpacing: '0.2em',
            color: '#000000',
            textTransform: 'uppercase',
            margin: 0,
          }}
        >
          POWERED BY
        </p>

        <div style={{ height: 20 }} />

        <img
          src="https://visual.tooawake.mov/logo_tooawake.png"
          alt="TOO:AWAKE"
          className="loading-logo-pulse"
          style={{
            margin: '0 auto',
            display: 'block',
            height: 56,
            objectFit: 'contain',
          }}
        />

        <div style={{ height: 40 }} />

        <p
          style={{
            fontFamily: "'Chakra Petch', sans-serif",
            fontWeight: 600,
            fontSize: '14px',
            letterSpacing: '0.15em',
            color: '#000000',
            margin: 0,
          }}
        >
          LOADING SYSTEM: {Math.round(displayProgress)}%
        </p>

        <div style={{ height: 10 }} />

        <p
          style={{
            fontFamily: "'Chakra Petch', sans-serif",
            fontWeight: 500,
            fontSize: '12px',
            letterSpacing: '0.1em',
            color: '#000000',
            margin: 0,
          }}
        >
          {status}
        </p>

        <div style={{ height: 20 }} />

        <div
          style={{
            width: 'min(320px, 80vw)',
            height: 6,
            borderRadius: 3,
            overflow: 'hidden',
            backgroundColor: 'rgba(0,0,0,0.25)',
          }}
        >
          <div
            style={{
              width: `${displayProgress}%`,
              height: '100%',
              borderRadius: 3,
              backgroundColor: '#000000',
              transition: 'width 300ms ease-out',
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .loading-logo-pulse {
          animation: pulse 1s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}

export default BrandedLoadingScreen
