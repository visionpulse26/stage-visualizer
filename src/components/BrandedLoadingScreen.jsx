import { useState, useEffect, useRef } from 'react'

const FADE_MS    = 700
const MIN_SHOW   = 3000  // minimum display time — 3 seconds

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
      {/* Breathing container — text + logo fade in/out slowly */}
      <div className="flex flex-col items-center" style={{ animation: 'breathe 2.5s ease-in-out infinite' }}>
        <p
          className="text-[15px] tracking-[0.35em] uppercase mb-6 font-medium"
          style={{ color: 'rgba(0,0,0,0.5)' }}
        >
          powered by
        </p>

        <img
          src="https://visual.tooawake.online/logo_tooawake.png"
          alt="Too:Awake Studio"
          className="h-14 object-contain mb-12"
          draggable={false}
        />
      </div>

      {/* Pulsating dots — 35% bigger */}
      <div className="flex items-center gap-3">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="block w-2 h-2 rounded-full"
            style={{
              backgroundColor: 'rgba(0,0,0,0.35)',
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
        @keyframes breathe {
          0%, 100% { opacity: .55; }
          50%      { opacity:  1; }
        }
      `}</style>
    </div>
  )
}

export default BrandedLoadingScreen
