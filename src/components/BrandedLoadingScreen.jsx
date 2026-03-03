import { useState, useEffect, useRef } from 'react'

const FADE_MS = 700
const NEON_ORANGE = '#FF5F1F'

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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center select-none"
      style={{
        backgroundColor: '#000000',
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms cubic-bezier(.4,0,.2,1)`,
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <div className="w-full max-w-md px-10 flex flex-col items-center">
        <div
          className="mb-10"
          style={{
            fontFamily: "'Chakra Petch', sans-serif",
            animation: 'loadingPulse 2s ease-in-out infinite',
          }}
        >
          <img
            src="https://visual.tooawake.online/logo_tooawake.png"
            alt="TOO:AWAKE"
            className="h-16 object-contain"
            draggable={false}
          />
        </div>

        <p
          className="text-sm tracking-[0.2em] uppercase mb-4"
          style={{
            fontFamily: "'Chakra Petch', sans-serif",
            fontWeight: 600,
            color: NEON_ORANGE,
            textShadow: `0 0 12px ${NEON_ORANGE}66`,
          }}
        >
          LOADING SYSTEM: {Math.round(displayProgress)}%
        </p>

        <p
          className="text-xs tracking-widest uppercase mb-6 text-white/50"
          style={{ fontFamily: "'Chakra Petch', sans-serif" }}
        >
          {status}
        </p>

        <div
          className="w-full h-1.5 rounded-full overflow-hidden"
          style={{ backgroundColor: 'rgba(255,95,31,0.15)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${displayProgress}%`,
              backgroundColor: NEON_ORANGE,
              boxShadow: `0 0 12px ${NEON_ORANGE}`,
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes loadingPulse {
          0%, 100% { opacity: 0.7; transform: scale(0.98); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

export default BrandedLoadingScreen
