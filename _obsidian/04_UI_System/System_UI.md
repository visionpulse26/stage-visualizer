---
title: System UI
type: ui-system
tags: [ui, design-system, tailwind, three-js, overlays, styling, stage-visualizer]
related: ["[[01_Product/Core_Concept]]", "[[02_Architecture/System_Architecture]]"]
---

# Stage Visualizer — UI System

> Extracted strictly from source: `tailwind.config.js`, `postcss.config.js`, `src/index.css`, `src/components/UIPanel.jsx`, `src/components/TopBar.jsx`, `src/components/ProjectsDashboard.jsx`, `src/components/FeedbackDraftPanel.jsx`, `src/components/StageCanvas.jsx`, `src/components/PovFpsRig.jsx`, `src/components/PovSimpleRig.jsx`, and `package.json`.

> **There is no `src/components/ui/` or `src/components/common/` directory** — no shared component library exists. Reusable primitives are defined inline within the components that use them.

---

## 1. Design System & Theming

### Tailwind configuration (`tailwind.config.js`)
The config is minimal — only the `colors` theme is extended; **no custom spacing, breakpoints, fonts, or extended scales are defined** (Tailwind defaults apply for everything else):
- `content`: `./index.html`, `./src/**/*.{js,ts,jsx,tsx}`
- `theme.extend.colors`:
  | Token | Value |
  |-------|-------|
  | `dark.900` | `#0a0a0f` |
  | `dark.800` | `#12121a` |
  | `dark.700` | `#1a1a25` |
  | `dark.600` | `#252533` |
  | `accent.purple` | `#8b5cf6` |
  | `accent.blue` | `#3b82f6` |
  | `accent.cyan` | `#06b6d4` |
- `plugins: []` — none.
- **PostCSS (`postcss.config.js`):** `tailwindcss` + `autoprefixer` only.

> In practice the admin UI mostly uses Tailwind's *default* palette opacity utilities (`violet-*`, `cyan-*`, `white/10`, `black/60`) rather than the custom `dark`/`accent` tokens above.

### Global CSS variables & resets (`src/index.css`)
- Imports `@tailwind base/components/utilities`.
- **`:root` brand variables:** `--tooawake-orange: #FF5F1F`, `--tooawake-orange-glow: #FF5F1F66`, `--font-brand: 'Chakra Petch', sans-serif`.
- **Global reset:** `* { margin:0; padding:0; box-sizing:border-box }`.
- **App shell lock:** `html, body, #root { width/height:100%; overflow:hidden; background:#0a0a0f; font-family: var(--font-brand) }` — the app is a fixed, non-scrolling full-viewport surface (matching the canvas-first UX of [[01_Product/Core_Concept#1. Core Problem & Objectives|the platform]]).
- **`.tooawake-footer`:** fixed bottom-right brand mark, orange with text-shadow glow, `pointer-events:none`.
- **Custom scrollbars:** WebKit (`::-webkit-scrollbar` 7px, orange `#ff5a1f` thumb) + Firefox (`scrollbar-width:thin; scrollbar-color`).
- **Custom form controls:** `input[type="range"]` (track `rgba(255,255,255,0.1)`, 12px white thumb with hover scale) and `select` (inline SVG chevron data-URI in `#8b5cf6`, `option` background `#12121a`).
- **Keyframe:** `@keyframes sv-pulse` (opacity+scale pulse).

### Secondary "Hi-Fi v2" ember theme (inline token object)
Client/collab/feedback surfaces do **not** use Tailwind; they share a hand-maintained JS design-token object named `T`, duplicated across `FeedbackDraftPanel.jsx`, `PresentationEditorPage.jsx`, and mirrored in `ClientPage`:
```js
const T = {
  bg:'#080604', glass:'rgba(255,255,255,0.045)', glass2:'rgba(255,255,255,0.07)',
  glassDark:'rgba(8,6,4,0.65~0.75)', border:'rgba(220,100,30,0.20)', border2:'rgba(220,100,30,0.32)',
  ember:'#E8531A', ember2:'#FF6B2B', emberDim:'rgba(232,83,26,0.15)',
  emberGlow:'0 0 14px rgba(232,83,26,0.45), 0 0 2px rgba(232,83,26,0.8)',
  cam:'#1FA0EE', camDim:'rgba(31,160,238,0.15)', camGlow:'0 0 10px rgba(31,160,238,0.35)',
  green:'#2BC782', amber:'#E89518',
  text:'#F4ECE2', text2:'#C8B8A8', text3:'#8E7E70', text4:'#5A4E45',
}
```
`Chakra Petch` is the universal font across both systems. The **ember/orange** family is the brand accent for client-facing work; **cam blue (`#1FA0EE`)** denotes camera context; **amber/green** encode `pending`/`resolved` feedback status (see [[01_Product/Core_Concept#`client_feedback_items`|feedback status]]).

---

## 2. Core Component Library

No external UI library and **no `clsx`/`tailwind-merge`/styled-components** (absent from `package.json`). Styling is applied two ways:
1. **Template-literal `className` concatenation** with Tailwind utilities (admin chrome) — e.g. `` `... ${BADGE_COLORS[color] || BADGE_COLORS.cyan}` ``.
2. **Inline `style={{}}` objects** built from the `T` token map (client/feedback surfaces).

### Reusable primitives (all defined inline, not shared)
| Primitive | Location | Notes |
|-----------|----------|-------|
| `Section` | `UIPanel.jsx` | icon + uppercase title + optional badge, `border-t` divider |
| `Slider` | `UIPanel.jsx` | range input, `accent-violet-400`, fires `onChange` + `onChangeEnd` (mouse/touch up) |
| `Spinner` | `ProjectsDashboard.jsx` | dual-ring, `border-t-orange-400 animate-spin` |
| `ErrorBanner` | `ProjectsDashboard.jsx` | `bg-red-500/10 border-red-500/20` |
| `Toast` | `ProjectsDashboard.jsx` | `error`/`success` variants, dismissible |
| `Row` / `Col` / `Divider` / `SLabel` | `FeedbackDraftPanel.jsx` | flex layout helpers + uppercase micro-label |
| `Avatar` | `FeedbackDraftPanel.jsx` | initials, ember gradient circle |
| `StatusTag` | `FeedbackDraftPanel.jsx` | `pending` (amber) / `resolved` (green) pill |
| `DraftInput` | `FeedbackDraftPanel.jsx` | text/`textarea`, focus ring + error border states |
| `ToolBtn` / `miniBtnStyle()` | `FeedbackDraftPanel.jsx` | toggle button + shared button-style factory |
| `RoleBadge` | `AdminPage.jsx` | role pill, `colorMap` (violet/blue/emerald/amber) |

### Icon system — **two coexisting approaches**
- **Hand-rolled inline SVG components** are the dominant pattern: `UIPanel.jsx` defines `IconUpload, IconVideo, IconSun, IconCamera, IconPlay, IconPause, IconLoop, IconTrash, IconLink, IconFolder, IconCopy, IconGrid, IconGlobe, IconSparkle, IconEye, IconCloud, IconServer`; `ProjectsDashboard.jsx` defines `IconX, IconCopy, IconEdit, IconTrash, IconClone, IconLock, IconUnlock, IconChevron, IconRefresh`. All are `stroke="currentColor"` `viewBox="0 0 24 24"` SVGs sized with Tailwind `w-_/h-_`.
- **`lucide-react`** (the only icon dependency in `package.json`) is imported in `PresentationEditorPage.jsx`: `AlertTriangle, Check, Copy, Eye, EyeOff, MoreHorizontal, Plus, RotateCcw, Trash2, Volume2, VolumeX`.

### Styling strategy summary
Utility-class Tailwind for the admin authoring chrome; inline token-object styles for the brand-themed client/feedback surfaces. Conditional styling is done with ternaries inside template literals or style objects (no merge helper). This split aligns with the [[02_Architecture/System_Architecture#Admin component architecture container presentational split|container ↔ presentational split]]: containers pass values/callbacks, presentational components own the className/style.

---

## 3. Layout System & Admin UI Patterns

### `UIPanel` — the admin control surface (`UIPanel.jsx`)
- Root: `<div data-ui-panel className="absolute top-4 left-4 z-10 flex flex-col gap-2" style={{ width: 280 }}>` — a **fixed-width 280px floating panel** anchored top-left over the canvas.
- Inner card: `bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 space-y-4 max-h-[calc(100vh-8rem)] overflow-y-auto scrollbar-thin` — glass card that scrolls internally, capped to viewport height minus 8rem.
- Content is organized into `<Section>` blocks (Model, Media, Sun/Grid, Camera, HDRI/Environment, Publish, Embed, POV colliders…), each a labeled group of `Slider`s, file inputs (`type="file" className="hidden"` triggered by styled buttons), and toggles.
- The `data-ui-panel` attribute is load-bearing: `StageCanvas.blockFriction` checks `e.target.closest('[data-ui-panel]')` to **let panel drags through** while blocking context-menu/drag on the 3D canvas.

### `ProjectsDashboard` — modal data surface (`ProjectsDashboard.jsx`)
- A modal that does its own Supabase reads, grouping rows by `group_id ?? id` (project "rounds", see [[01_Product/Core_Concept#`projects`|group_id stacking]]) into collapsible groups (`expandedGroups` Set, `IconChevron`).
- Per-row actions use the inline icon set (`IconEdit/IconTrash/IconClone/IconLock/IconUnlock/IconCopy`) with inline confirm states; status surfaced via `Spinner`/`ErrorBanner`/`Toast`.
- Helpers `fmtDate`, `fmtSize`, `fmtExt` format the asset metadata listed from [[03_Protocol/System_Protocols#Signed-read & admin storage routes|/api/admin/r2-objects]].

### Overlay chrome
- **`TopBar`** (`TopBar.jsx`): `absolute top-4 right-4 flex gap-2` — Sign Out button (`supabase.auth.signOut()` → navigate `/`) + role badge via `BADGE_COLORS` (violet/cyan/blue). Used on protected Admin/Collab pages.
- **POV controls** (`AdminPage.jsx`): absolutely/fixed-positioned buttons (`z-[5000]`/`z-[5001]`) for Audience POV toggle, Debug toggle, and a keyboard-hint strip.

### Responsive strategy
The app is **desktop-first and largely non-responsive by design** — `index.css` locks `overflow:hidden` on the shell, and the control panels use fixed pixel widths (`UIPanel` 280px; `FeedbackDraftPanel` 320px). **No Tailwind responsive prefixes (`sm:`/`md:`/`lg:`) appear in the panel layouts.** Adaptation is feature-gated rather than breakpoint-gated: e.g. `AdminPage` hides the Audience-POV button via `!isTouchDevice()` (POV depends on pointer-lock). Inputs that must work on touch wire both mouse and touch handlers (`Slider`'s `onMouseUp` + `onTouchEnd`; `AnnotationLayer`'s pointer events with `touchAction`).

### Client/Collab vs. Admin layout primitives
- **Admin:** Tailwind utility classes, glass cards (`bg-black/60 backdrop-blur-xl`), violet/cyan accents, fixed floating panels over a full-bleed canvas.
- **Client/Collab/Feedback:** flex layouts built from the inline `Row`/`Col` primitives and the `T` ember token palette; panels like `FeedbackDraftPanel` are fixed-width (`width: 320, flexShrink: 0`) side rails with `backdropFilter: 'blur(14px)'`, header/scroll-body/footer three-zone structure (`flex` column with `overflowY:'auto'` body). Both families render as siblings over the shared `StageCanvas` (§4).

---

## 4. 3D/Canvas UI Overlays

### Layering model — DOM siblings over the canvas
`StageCanvas` returns a single positioned container; **2D UI is layered as DOM siblings of the `<Canvas>`, not inside the R3F tree**:
```jsx
<div className="w-full h-full relative bg-[#0a0a0c]" onContextMenu={blockFriction} onDragStart={blockFriction}>
  <StageErrorBoundary>
    <Canvas frameloop={freezeRenderLoop ? 'demand' : 'always'} dpr={[1,2]}
            camera={{ position:[5,5,5], fov:50, near:0.05, far:5000 }}
            gl={{ antialias:true, alpha:false, logarithmicDepthBuffer:true,
                  preserveDrawingBuffer:true, toneMapping:THREE.ACESFilmicToneMapping,
                  toneMappingExposure:0.62 }}
            shadows>
      …3D scene, EffectComposer/Bloom…
    </Canvas>
  </StageErrorBoundary>
  {children}   {/* ← UIPanel, TopBar, ClientPanel, AnnotationLayer/Toolbar, lock banners */}
</div>
```
Pages (`AdminPage`, `PresentationEditorPage`, `ClientPage`) pass their overlay UI as `children`; the parent `relative` box + each overlay's `position:absolute` provides the stacking context. A `z-index` ladder orders them: AnnotationLayer SVG `z:5`, lock badge `z:8`, toolbars/top bars `z:10`, UIPanel `z-10`, POV buttons `z-[5000+]`.

### `@react-three/drei` `<Html>` — only inside the POV rigs
`<Html>` is **not** used for feedback markers or annotations. It appears solely in `PovFpsRig.jsx` and `PovSimpleRig.jsx` as a fullscreen, click-through HUD for the pointer-lock prompt:
```jsx
<Html fullscreen style={{ pointerEvents: 'none' }}>
  <div className="flex h-full w-full items-center justify-center">
    <button className="pointer-events-auto …" onClick={() => gl.domElement.requestPointerLock?.()}>
      Click to capture mouse — WASD move — Q/E clips — 1-9 slot — P screenshot — Esc exit POV
    </button>
  </div>
</Html>
```
The container is `pointerEvents:'none'` so the canvas keeps receiving input, with only the inner button re-enabling `pointer-events-auto`.

### Annotations & feedback markers — normalized SVG overlay (not `<Html>`)
Feedback annotations (`AnnotationLayer` in `FeedbackDraftPanel.jsx`) are a **plain absolutely-positioned `<svg>`** over the canvas, decoupled from 3D coordinates:
- `viewBox="0 0 100 100"` + `preserveAspectRatio="none"` → coordinates are stored **normalized 0–1** (see [[01_Product/Core_Concept#`client_feedback_items`|annotation_json bounds]]); `normalize()` converts pointer events to `{x,y}` fractions of the bounding rect and records a `viewport {width,height}`.
- Draws `circle` (`<ellipse>`) or `region` (`<rect>`) with `vectorEffect="non-scaling-stroke"`, dashed ember stroke `#FFB37A`, and a `drop-shadow` glow filter; a live preview renders while dragging.
- `pointerEvents` is conditional: `readOnly ? 'none' : (activeTool || annotation ? 'all' : 'none')` so the overlay is click-through unless actively drawing/showing — keeping orbit/camera controls usable underneath.
- Companion chrome (`AnnotationToolbar`, `FeedbackTopBar`, `StageLockBanner`, `StageLockBadge`) are absolutely-positioned token-styled DOM elements (e.g. toolbar `bottom:50, left:50%, transform:translateX(-50%)`, `backdropFilter:'blur(14px)'`).

### Performance & visual-consistency strategies (from code)
- **On-demand render loop:** `Canvas frameloop` switches to `'demand'` when `freezeRenderLoop` is set (e.g. while the feedback overlay is open), so a static stage stops re-rendering the GPU — overlays remain live DOM.
- **Capped DPR:** `dpr={[1,2]}` bounds retina cost.
- **Context resilience:** `WebGLContextLossHandler` + `StageErrorBoundary`/`PovRuntimeBoundary` (the latter pre-checks `Function('return true')()` to detect CSP-blocked `eval` before Rapier can blank the page) keep the surface from crashing under the overlays.
- **Cinema-consistent tone:** ACES Filmic tone mapping (`toneMappingExposure:0.62`) is hardcoded so the rendered stage matches the dark `#080604`/`#0a0a0f` UI shell.
- **Visual consistency:** overlays reuse the `T` ember tokens, `Chakra Petch`, glass `backdrop-blur`, and the orange glow so 2D chrome reads as one surface with the 3D stage and the brand mark in `index.css`.
