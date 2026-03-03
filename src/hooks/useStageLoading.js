import { useState, useCallback, useRef, useEffect } from 'react'
import * as THREE from 'three'

const POST_LOAD_DELAY_MS = 500

/**
 * Global LoadingManager for GLB, HDRI, Textures.
 * Tracks progress via onProgress, triggers "ready" only after onLoad + 500ms post-render.
 */
export function useStageLoading() {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('INITIALIZING...')
  const [loaded, setLoaded] = useState(false)
  const [allAssetsLoaded, setAllAssetsLoaded] = useState(false)
  const managerRef = useRef(null)
  const postLoadTimerRef = useRef(null)

  const loadingManager = useRef(null)
  if (!loadingManager.current) {
    loadingManager.current = new THREE.LoadingManager()
  }
  const manager = loadingManager.current

  useEffect(() => {
    const onProgress = (url, itemsLoaded, itemsTotal) => {
      const pct = itemsTotal > 0 ? Math.round((itemsLoaded / itemsTotal) * 100) : 0
      setProgress(pct)
      if (pct < 30) setStatus('INITIALIZING STAGE...')
      else if (pct < 70) setStatus('LOADING ENVIRONMENT...')
      else if (pct < 100) setStatus('FINALIZING RENDER...')
    }

    const onLoad = () => {
      setProgress(100)
      setStatus('READY')
      setAllAssetsLoaded(true)
      if (postLoadTimerRef.current) clearTimeout(postLoadTimerRef.current)
      postLoadTimerRef.current = setTimeout(() => {
        postLoadTimerRef.current = null
        setLoaded(true)
      }, POST_LOAD_DELAY_MS)
    }

    manager.onProgress = onProgress
    manager.onLoad = onLoad
    managerRef.current = manager

    return () => {
      if (postLoadTimerRef.current) clearTimeout(postLoadTimerRef.current)
    }
  }, [manager])

  const onFirstFrameRendered = useCallback(() => {
    // Reserved for future use (first-frame gate)
  }, [])

  const reset = useCallback(() => {
    setProgress(0)
    setStatus('INITIALIZING...')
    setLoaded(false)
    setAllAssetsLoaded(false)
  }, [])

  return {
    loadingManager: manager,
    progress,
    status,
    loaded,
    allAssetsLoaded,
    onFirstFrameRendered,
    reset,
    setStatus,
  }
}
