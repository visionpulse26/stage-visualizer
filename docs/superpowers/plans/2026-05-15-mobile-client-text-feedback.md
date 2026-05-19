# Mobile Client Text Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the mobile client view around the handoff demo layout, support portrait and landscape phone UX, and add required-name text-only mobile feedback.

**Architecture:** Keep the work scoped to `ClientPage.jsx` because the mobile branch, desktop feedback flow, stage rendering, and feedback repository calls are already local there. Add a separate mobile feedback sheet state instead of reusing desktop `feedbackMode`, so desktop annotation/snapshot behavior stays untouched. Use one shared mobile stage renderer and two shells: portrait stacked layout and landscape stage-dominant layout.

**Tech Stack:** React 18, Vite, inline style system already used by `ClientPage.jsx`, existing Supabase feedback helpers from `src/lib/presentationVersions.js`.

---

## File Structure

- Modify: `src/pages/ClientPage.jsx`
  - Add viewport/orientation state for mobile layout.
  - Replace drawer-based mobile UX with inline tab panels.
  - Add text-only mobile feedback sheet and submit handler.
  - Preserve desktop feedback mode unchanged.
- Verify: `npm run build`
  - There is no test script in `package.json`, so build is the minimum automated verification.

## Task 1: Mobile State And Context Helpers

**Files:**
- Modify: `src/pages/ClientPage.jsx`

- [ ] **Step 1: Replace mobile UI state with viewport-aware state**

Change the current mobile state:

```js
const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
const [activeDrawerTab, setActiveDrawerTab] = useState(null)
```

to:

```js
const [viewport, setViewport] = useState(() => ({
  width: typeof window !== 'undefined' ? window.innerWidth : 1024,
  height: typeof window !== 'undefined' ? window.innerHeight : 768,
}))
const isMobile = viewport.width < 768 || viewport.height < 520
const isMobileLandscape = isMobile && viewport.width > viewport.height
const [activeMobileTab, setActiveMobileTab] = useState('context')
const [mobilePanelCollapsed, setMobilePanelCollapsed] = useState(false)
const [mobileFeedbackSheet, setMobileFeedbackSheet] = useState(null)
const [mobileFeedbackName, setMobileFeedbackName] = useState('')
const [mobileFeedbackComment, setMobileFeedbackComment] = useState('')
```

- [ ] **Step 2: Replace resize effect**

Change the current resize effect:

```js
useEffect(() => {
  const onResize = () => setIsMobile(window.innerWidth < 768)
  window.addEventListener('resize', onResize)
  return () => window.removeEventListener('resize', onResize)
}, [])
```

to:

```js
useEffect(() => {
  const onResize = () => {
    setViewport({
      width: window.innerWidth,
      height: window.innerHeight,
    })
  }
  onResize()
  window.addEventListener('resize', onResize)
  return () => window.removeEventListener('resize', onResize)
}, [])
```

- [ ] **Step 3: Add mobile feedback context opener**

Add this callback after `enterFeedbackMode` / `exitFeedbackMode` and before `enterNoteFocusMode`:

```js
const openMobileFeedbackSheet = useCallback(() => {
  if (isPreviewingVersion || !activeSlide?.id) return

  videoRef.current?.pause()
  setIsPlaying(false)

  const clipTime = videoRef.current?.currentTime ?? currentTime ?? 0
  const camPreset = findPreset(cameraPresets, activePresetId)
  const vLabel = publishedVersion ? `v${publishedVersion.version_number}` : null

  setMobileFeedbackName(reviewerName)
  setMobileFeedbackComment('')
  setSubmitError(null)
  setMobileFeedbackSheet({
    slideTitle: activeSlide?.title ?? null,
    slideId: activeSlide?.id ?? null,
    clipId: activeSlide?.clipId ?? null,
    clipTime,
    camName: camPreset?.name ?? currentCameraRef.current ?? null,
    versionId: publishedVersion?.id ?? null,
    versionLabel: vLabel,
  })
}, [
  activePresetId,
  activeSlide,
  cameraPresets,
  currentTime,
  isPreviewingVersion,
  publishedVersion,
  reviewerName,
])
```

- [ ] **Step 4: Add mobile feedback cancel callback**

Add below `openMobileFeedbackSheet`:

```js
const closeMobileFeedbackSheet = useCallback(() => {
  setMobileFeedbackSheet(null)
  setMobileFeedbackComment('')
  setSubmitError(null)
}, [])
```

- [ ] **Step 5: Add mobile submit callback**

Add below `closeMobileFeedbackSheet`:

```js
const handleSubmitMobileFeedback = useCallback(async () => {
  if (isPreviewingVersion || !mobileFeedbackSheet) return
  const draftReviewerName = mobileFeedbackName.trim()
  const draftComment = mobileFeedbackComment.trim()
  if (!draftReviewerName || !draftComment) return

  setIsSubmitting(true)
  setSubmitError(null)
  try {
    await submitFeedback({
      project_id: projectId,
      presentation_version_id: mobileFeedbackSheet.versionId ?? null,
      slide_id: mobileFeedbackSheet.slideId ?? null,
      clip_id: mobileFeedbackSheet.clipId ?? null,
      clip_time_seconds: mobileFeedbackSheet.clipTime ?? null,
      camera_snapshot_json: mobileFeedbackSheet.camName ? { name: mobileFeedbackSheet.camName } : null,
      annotation_json: null,
      reviewer_name: draftReviewerName,
      comment: draftComment,
      status: 'pending',
    })

    localStorage.setItem(LS_NAME_KEY, draftReviewerName)
    setReviewerName(draftReviewerName)
    setReviewerNameLocked(true)
    await refreshSlideFeedback(mobileFeedbackSheet.slideId)
    closeMobileFeedbackSheet()
  } catch (err) {
    const msg = String(err?.message ?? '')
    if (msg.includes("Could not find the table 'public.client_feedback_items'")) {
      setSubmitError("Feedback table missing. Run `supabase/presentation_versions_schema.sql` on this Supabase project.")
    } else {
      setSubmitError(msg || 'Failed to submit. Please try again.')
    }
  } finally {
    setIsSubmitting(false)
  }
}, [
  LS_NAME_KEY,
  closeMobileFeedbackSheet,
  isPreviewingVersion,
  mobileFeedbackComment,
  mobileFeedbackName,
  mobileFeedbackSheet,
  projectId,
  refreshSlideFeedback,
])
```

- [ ] **Step 6: Run build**

Run: `npm run build`

Expected: exit code 0. Warnings from Vite are acceptable only if they already existed and do not indicate a syntax/runtime compile failure.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/pages/ClientPage.jsx
git commit -m "feat: add mobile viewport feedback state"
```

## Task 2: Inline Portrait Mobile Shell

**Files:**
- Modify: `src/pages/ClientPage.jsx`

- [ ] **Step 1: Replace mobile render branch with portrait/landscape shell dispatch**

Replace the body of `if (isMobile) { return (...) }` with:

```jsx
if (isMobile) {
  const commonMobileProps = {
    projectName,
    versionBadge: vBadge,
    previewVersion,
    isPreviewingVersion,
    sceneReady,
    progress,
    status,
    stageProps: {
      modelUrl,
      loadingManager: modelUrl ? loadingManager : null,
      videoElement,
      activeImageUrl,
      onLedMaterialStatus: () => {},
      sunPosition,
      sunIntensity,
      gridCellSize,
      modelLoaded: !!modelUrl,
      cameraControlsRef,
      cameraTargetPresetRef,
      cameraFlyDurationSeconds,
      hdriPreset,
      customHdriUrl,
      hdriFileExt,
      onHdriLoading: () => {},
      onHdriLoadError: handleHdriLoadError,
      onHdriClearRequest: handleClearAllHdri,
      envIntensity,
      bgBlur,
      showHdriBackground,
      bloomStrength,
      bloomThreshold,
      protectLed,
      transparentLedConfig,
      onImageTextureLoaded: handleImageTextureLoaded,
      freezeRenderLoop: !!noteFocusNote,
    },
    activeSlide,
    activeDuration,
    activeMobileTab,
    setActiveMobileTab,
    displayClips,
    slideFeedback,
    hasSnapshot,
    cameraPresets,
    activePresetId,
    noteFocusNote,
    mobileFeedbackSheet,
    mobileFeedbackName,
    mobileFeedbackComment,
    reviewerNameLocked,
    isSubmitting,
    submitError,
    stageViewportRef,
    isPlaying,
    currentTime,
    onPlayPause: isPlaying ? handlePause : handlePlay,
    onClipSelect: (id) => {
      if (hasSnapshot) activateSlide(id)
      else {
        const c = videoPlaylist.find(v => String(v.id) === String(id))
        if (c) activateRawClip(c)
      }
    },
    onCameraSelect: handleCameraPresetSelect,
    onOpenReference: openReferenceViewer,
    onOpenFeedback: openMobileFeedbackSheet,
    onCloseFeedback: closeMobileFeedbackSheet,
    onFeedbackNameChange: setMobileFeedbackName,
    onFeedbackCommentChange: setMobileFeedbackComment,
    onSubmitFeedback: handleSubmitMobileFeedback,
    onNoteClick: enterNoteFocusMode,
    onExitNoteFocus: exitNoteFocusMode,
    referenceViewer,
    closeReferenceViewer,
    stepReferenceViewer,
  }

  return isMobileLandscape ? (
    <MobileLandscapeShell
      {...commonMobileProps}
      panelCollapsed={mobilePanelCollapsed}
      onTogglePanel={() => setMobilePanelCollapsed(v => !v)}
    />
  ) : (
    <MobilePortraitShell {...commonMobileProps} />
  )
}
```

- [ ] **Step 2: Add `MobilePortraitShell` component**

Add before `MobileTopBar`:

```jsx
function MobilePortraitShell(props) {
  return (
    <div style={{
      width: '100%', height: '100svh', background: T.bg, color: T.text,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: 'Chakra Petch, sans-serif', position: 'relative',
    }}>
      <MobileFontLinks />
      <BrandedLoadingScreen isLoaded={props.sceneReady} progress={props.progress} status={props.status} />
      <MobileTopBar
        projectName={props.projectName}
        versionBadge={props.versionBadge}
        slideCount={props.displayClips.length}
        activeSlideIndex={props.displayClips.findIndex(s => s.id === props.activeSlide?.id)}
      />
      {props.isPreviewingVersion && <VersionPreviewBanner version={props.previewVersion} />}
      <MobileStageViewport {...props} />
      <MobileBottomTabBar
        activeTab={props.activeMobileTab}
        onTabChange={props.setActiveMobileTab}
        clipCount={props.displayClips.length}
        feedbackCount={props.slideFeedback.length}
        refCount={(props.activeSlide?.references ?? []).filter(r => r.visibleToClient).length}
      />
      <MobileTabPanel {...props} />
      <MobileFeedbackSheet {...props} />
      <ReferenceViewerModal viewer={props.referenceViewer} onClose={props.closeReferenceViewer} onStep={props.stepReferenceViewer} />
    </div>
  )
}
```

- [ ] **Step 3: Add `MobileFontLinks` component**

```jsx
function MobileFontLinks() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
    </>
  )
}
```

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/pages/ClientPage.jsx
git commit -m "feat: add inline mobile portrait shell"
```

## Task 3: Mobile Stage, Tabs, And Landscape Shell

**Files:**
- Modify: `src/pages/ClientPage.jsx`

- [ ] **Step 1: Add shared stage viewport component**

Add `MobileStageViewport` before mobile components:

```jsx
function MobileStageViewport(props) {
  return (
    <div ref={props.stageViewportRef} style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      <StageCanvas {...props.stageProps} />
      {props.activeSlide?.title && <StageTitleBadge title={props.activeSlide.title} />}
      {!props.noteFocusNote && props.cameraPresets.length > 0 && (
        <MobileCameraPresetDock
          presets={props.cameraPresets}
          activePresetId={props.activePresetId}
          onSelect={props.onCameraSelect}
        />
      )}
      {props.noteFocusNote?.annotation && (
        <AnnotationLayer
          annotation={props.noteFocusNote.annotation}
          activeTool={null}
          onAnnotationChange={() => {}}
          readOnly
        />
      )}
      {props.noteFocusNote && (
        <StageLockBadge camName="Center" clipTime={props.noteFocusNote.clipTimeSeconds} />
      )}
      <MobileTransportBar
        isPlaying={props.isPlaying}
        currentTime={props.currentTime}
        activeDuration={props.activeDuration}
        onPlayPause={props.onPlayPause}
      />
    </div>
  )
}
```

- [ ] **Step 2: Add tab panel**

```jsx
function MobileTabPanel(props) {
  return (
    <div style={{
      height: props.landscape ? '100%' : 220,
      minHeight: props.landscape ? 0 : 180,
      overflowY: 'auto',
      padding: '12px 14px calc(14px + env(safe-area-inset-bottom))',
      background: 'rgba(10,7,5,0.98)',
      borderTop: props.landscape ? 'none' : `1px solid ${T.border}`,
      flexShrink: 0,
    }}>
      {props.activeMobileTab === 'clips' && (
        <MobileClipList
          clips={props.displayClips}
          activeId={props.activeSlide?.id ?? null}
          onSelect={props.onClipSelect}
        />
      )}
      {props.activeMobileTab === 'context' && (
        <MobileContextContent
          slide={props.activeSlide}
          feedbackItems={props.slideFeedback}
          readOnly={props.isPreviewingVersion}
          onLeaveFeedback={props.onOpenFeedback}
          onNoteClick={props.onNoteClick}
        />
      )}
      {props.activeMobileTab === 'refs' && (
        <MobileReferencesContent
          slide={props.activeSlide}
          onOpenReference={props.onOpenReference}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add landscape shell**

```jsx
function MobileLandscapeShell(props) {
  return (
    <div style={{
      width: '100%', height: '100svh', background: T.bg, color: T.text,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: 'Chakra Petch, sans-serif', position: 'relative',
    }}>
      <MobileFontLinks />
      <BrandedLoadingScreen isLoaded={props.sceneReady} progress={props.progress} status={props.status} />
      <MobileTopBar
        compact
        projectName={props.projectName}
        versionBadge={props.versionBadge}
        slideCount={props.displayClips.length}
        activeSlideIndex={props.displayClips.findIndex(s => s.id === props.activeSlide?.id)}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <MobileStageViewport {...props} />
        </div>
        {props.panelCollapsed ? (
          <button onClick={props.onTogglePanel} style={mobilePanelRailStyle()}>☰</button>
        ) : (
          <aside style={{
            width: 'clamp(280px, 30vw, 340px)',
            flexShrink: 0,
            borderLeft: `1px solid ${T.border}`,
            background: 'rgba(8,6,4,0.96)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}>
            <button onClick={props.onTogglePanel} style={mobilePanelCollapseButtonStyle()}>Hide Panel</button>
            <MobileBottomTabBar
              activeTab={props.activeMobileTab}
              onTabChange={props.setActiveMobileTab}
              clipCount={props.displayClips.length}
              feedbackCount={props.slideFeedback.length}
              refCount={(props.activeSlide?.references ?? []).filter(r => r.visibleToClient).length}
            />
            <MobileTabPanel {...props} landscape />
          </aside>
        )}
      </div>
      <MobileFeedbackSheet {...props} landscape />
      <ReferenceViewerModal viewer={props.referenceViewer} onClose={props.closeReferenceViewer} onStep={props.stepReferenceViewer} />
    </div>
  )
}
```

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/pages/ClientPage.jsx
git commit -m "feat: add mobile stage tabs and landscape shell"
```

## Task 4: Text-Only Mobile Feedback Sheet

**Files:**
- Modify: `src/pages/ClientPage.jsx`

- [ ] **Step 1: Add feedback sheet component**

```jsx
function MobileFeedbackSheet(props) {
  if (!props.mobileFeedbackSheet) return null
  const canSubmit = props.mobileFeedbackName.trim() && props.mobileFeedbackComment.trim() && !props.isSubmitting
  const ctx = props.mobileFeedbackSheet
  return (
    <div style={{
      position: 'fixed',
      inset: props.landscape ? '44px 0 0 auto' : 'auto 0 0 0',
      width: props.landscape ? 'min(360px, 42vw)' : '100%',
      zIndex: 60,
      background: 'rgba(8,5,3,0.98)',
      borderTop: props.landscape ? 'none' : `1px solid ${T.border}`,
      borderLeft: props.landscape ? `1px solid ${T.border}` : 'none',
      boxShadow: props.landscape ? '-12px 0 30px rgba(0,0,0,0.45)' : '0 -12px 30px rgba(0,0,0,0.55)',
      padding: '14px 16px calc(16px + env(safe-area-inset-bottom))',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      maxHeight: props.landscape ? 'calc(100svh - 44px)' : '72svh',
      overflowY: 'auto',
    }}>
      <Row gap={8}>
        <Col gap={2} style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Leave Feedback</span>
          <span style={{ fontSize: 10, color: T.text3 }}>
            {[ctx.slideTitle, ctx.camName, ctx.clipTime != null ? formatDuration(ctx.clipTime) : null, ctx.versionLabel].filter(Boolean).join(' · ')}
          </span>
        </Col>
        <button onClick={props.onCloseFeedback} style={mobileGhostButtonStyle()}>Cancel</button>
      </Row>
      <label style={mobileFieldLabelStyle()}>
        Your name
        <input
          value={props.mobileFeedbackName}
          onChange={e => props.onFeedbackNameChange(e.target.value)}
          placeholder="Enter your name"
          style={mobileInputStyle()}
        />
      </label>
      <label style={mobileFieldLabelStyle()}>
        Feedback
        <textarea
          value={props.mobileFeedbackComment}
          onChange={e => props.onFeedbackCommentChange(e.target.value)}
          placeholder="Write objective feedback for this clip"
          rows={4}
          style={{ ...mobileInputStyle(), minHeight: 104, resize: 'vertical', lineHeight: 1.5 }}
        />
      </label>
      {props.submitError && (
        <span style={{ fontSize: 11, color: '#FF9B75', lineHeight: 1.45 }}>{props.submitError}</span>
      )}
      <button
        onClick={props.onSubmitFeedback}
        disabled={!canSubmit}
        style={mobilePrimaryButtonStyle(Boolean(canSubmit))}
      >
        {props.isSubmitting ? 'Submitting...' : 'Submit Feedback'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Hide edit/delete controls from mobile feedback history**

Change the mobile call to `FeedbackHistoryList` inside `MobileContextContent` to pass no update/delete handlers:

```jsx
<FeedbackHistoryList items={feedbackItems} />
```

This is already the current behavior; keep it unchanged unless a refactor accidentally passes desktop handlers.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 4: Commit Task 4**

```bash
git add src/pages/ClientPage.jsx
git commit -m "feat: add text-only mobile feedback sheet"
```

## Task 5: Polish And Verification

**Files:**
- Modify: `src/pages/ClientPage.jsx`

- [ ] **Step 1: Verify portrait and landscape layout manually**

Run: `npm run dev -- --host 127.0.0.1`

Open:

- portrait mobile viewport around `390x844`,
- landscape mobile viewport around `844x390`.

Expected:

- portrait shows top bar, stage, transport, inline tabs, content panel;
- landscape shows stage-dominant row and compact side panel;
- context tab is default;
- feedback sheet requires name and comment;
- version preview hides `Leave Feedback`.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 3: Commit polish if any changes were needed**

```bash
git add src/pages/ClientPage.jsx
git commit -m "fix: polish mobile client feedback layout"
```

Skip this commit if Task 5 required no file changes.

---

## Self-Review

- Spec coverage:
  - Handoff demo portrait layout: Task 2 and Task 3.
  - Landscape stage-dominant layout: Task 3.
  - Text-only mobile feedback: Task 4.
  - Required reviewer name: Task 4.
  - Feedback context data: Task 1 and Task 4.
  - No annotation/snapshot on mobile: Task 4.
  - Desktop preservation: all tasks avoid desktop `feedbackMode` behavior.
- Placeholder scan: no `TBD`, `TODO`, or open-ended implementation steps.
- Type consistency:
  - Mobile sheet state uses `mobileFeedbackSheet`.
  - Active tab state uses `activeMobileTab`.
  - Orientation flag uses `isMobileLandscape`.
