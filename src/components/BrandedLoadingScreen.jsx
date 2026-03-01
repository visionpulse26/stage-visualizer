import { useState, useEffect, useRef } from 'react'

const FADE_MS    = 700
const MIN_SHOW   = 1800  // minimum display time so it doesn't just flash

function BrandedLoadingScreen({ isLoaded }) {
  const [visible, setVisible] = useState(true)
  const [fading,  setFading]  = useState(false)
  const mountedAt = useRef(Date.now())

  useEffect(() => {
    if (!isLoaded || fading) return

    const elapsed = Date.now() - mountedAt.current
    const delay   = Math.max(0, MIN_SHOW - elapsed)

    const t1 = setTimeout(() => {
      setFading(true)
      const t2 = setTimeout(() => setVisible(false), FADE_MS)
      return () => clearTimeout(t2)
    }, delay)

    return () => clearTimeout(t1)
  }, [isLoaded, fading])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center select-none"
      style={{
        backgroundColor: '#ff5500',
        opacity:         fading ? 0 : 1,
        transition:      `opacity ${FADE_MS}ms cubic-bezier(.4,0,.2,1)`,
        pointerEvents:   fading ? 'none' : 'auto',
      }}
    >
      <p
        className="text-[11px] tracking-[0.35em] uppercase mb-5 font-medium"
        style={{ color: 'rgba(0,0,0,0.45)' }}
      >
        powered by
      </p>

      <img
        src="https://visual.tooawake.online/logo_tooawake.png"
        alt="Too:Awake Studio"
        className="h-10 object-contain mb-10"
        draggable={false}
      />

      {/* Pulsating dots */}
      <div className="flex items-center gap-2">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="block w-[6px] h-[6px] rounded-full"
            style={{
              backgroundColor: 'rgba(0,0,0,0.3)',
              animation: `loadPulse 1.4s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes loadPulse {
          0%, 80%, 100% { opacity: .25; transform: scale(.8); }
          40%           { opacity:   1; transform: scale(1.3); }
        }
      `}</style>
    </div>
  )
}

export default BrandedLoadingScreen
