// Lockstep playback controller for a multi-mapled clip.
//
// One visual (a song / loop) drives N LED maps from N video files. A single
// "master" video (the first source) owns the timeline and the UI transport —
// the page treats it exactly like the old single video. The followers attach to
// the master's events (play / pause / seek / loop) so every existing transport
// path (play, pause, scrub, jump-to-note) fans out automatically with no change
// to the page's transport code.
//
// Two modes, chosen from the loaded durations:
//   • sync        — durations match (the norm): followers are corrected to the
//                   master's time and reset on the master's loop boundary.
//   • independent — durations differ (rare): each video loops on its own so the
//                   shorter one isn't frozen; the master still drives the UI.

export const DRIFT_TOLERANCE = 0.12          // s — only reseek a follower past this drift
export const DURATION_MATCH_TOLERANCE = 0.3  // s — durations within this count as "same length"

// Pure: decide the sync mode from durations. Exported for tests.
export function decideSyncMode(masterDuration, followerDurations, tol = DURATION_MATCH_TOLERANCE) {
  if (!Number.isFinite(masterDuration) || masterDuration <= 0) return 'sync'
  const allClose = (followerDurations || []).every(
    (d) => Number.isFinite(d) && d > 0 && Math.abs(d - masterDuration) <= tol,
  )
  return allClose ? 'sync' : 'independent'
}

function makeFollowerVideo(url) {
  const v = document.createElement('video')
  v.crossOrigin = 'anonymous'
  v.muted = true
  v.setAttribute('muted', '')
  v.playsInline = true
  v.setAttribute('playsinline', '')
  v.loop = true
  v.preload = 'auto'
  v.src = url
  v.load()
  return v
}

/**
 * @param {HTMLVideoElement} masterVideo  the page-owned video for the first source
 * @param {string} masterTargetId
 * @param {Array<{ targetId: string, url: string }>} followers  the remaining sources (resolved URLs)
 * @returns {{ mediaByTarget: Map, destroy: () => void, getSyncMode: () => string }}
 */
export function createMapledPlaybackController({ masterVideo, masterTargetId, followers = [] }) {
  const followerEls = followers.map(({ targetId, url }) => ({ targetId, video: makeFollowerVideo(url) }))

  const mediaByTarget = new Map()
  mediaByTarget.set(masterTargetId, { videoElement: masterVideo })
  followerEls.forEach((f) => mediaByTarget.set(f.targetId, { videoElement: f.video }))

  let syncMode = 'sync'
  let lastMasterTime = 0

  const recomputeSyncMode = () => {
    syncMode = decideSyncMode(masterVideo.duration, followerEls.map((f) => f.video.duration))
  }

  const onPlay = () => followerEls.forEach((f) => { f.video.play().catch(() => {}) })
  const onPause = () => followerEls.forEach((f) => f.video.pause())
  const onSeeking = () => {
    const mt = masterVideo.currentTime
    followerEls.forEach((f) => {
      if (f.video.readyState < 1) return
      const d = f.video.duration
      const target = syncMode === 'sync' ? mt : (Number.isFinite(d) && d > 0 ? mt % d : mt)
      try { f.video.currentTime = target } catch (_) { /* not seekable yet */ }
    })
  }
  const onTimeUpdate = () => {
    const mt = masterVideo.currentTime
    if (mt + 0.05 < lastMasterTime) {
      // master looped back to the start
      if (syncMode === 'sync') followerEls.forEach((f) => { try { f.video.currentTime = 0 } catch (_) {} })
    } else if (syncMode === 'sync') {
      followerEls.forEach((f) => {
        if (f.video.readyState >= 2 && Math.abs(f.video.currentTime - mt) > DRIFT_TOLERANCE) {
          try { f.video.currentTime = mt } catch (_) {}
        }
      })
    }
    lastMasterTime = mt
  }

  masterVideo.addEventListener('play', onPlay)
  masterVideo.addEventListener('pause', onPause)
  masterVideo.addEventListener('seeking', onSeeking)
  masterVideo.addEventListener('timeupdate', onTimeUpdate)
  masterVideo.addEventListener('loadedmetadata', recomputeSyncMode)
  followerEls.forEach((f) => f.video.addEventListener('loadedmetadata', recomputeSyncMode))

  // If the master is already playing when the controller attaches, start followers.
  if (!masterVideo.paused) onPlay()

  function destroy() {
    masterVideo.removeEventListener('play', onPlay)
    masterVideo.removeEventListener('pause', onPause)
    masterVideo.removeEventListener('seeking', onSeeking)
    masterVideo.removeEventListener('timeupdate', onTimeUpdate)
    masterVideo.removeEventListener('loadedmetadata', recomputeSyncMode)
    followerEls.forEach((f) => {
      f.video.removeEventListener('loadedmetadata', recomputeSyncMode)
      try { f.video.pause(); f.video.removeAttribute('src'); f.video.load() } catch (_) {}
    })
    mediaByTarget.clear()
  }

  return { mediaByTarget, destroy, getSyncMode: () => syncMode }
}
