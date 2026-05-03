# Roadmap — Stage Visualizer

## EPIC #2 — Embed widget (public stage in iframe / LMS)

Phases tracked in code comments (`EmbedPage.jsx`, `App.jsx`). Status reflects the repository as of the latest commit.

| Phase | Scope | Status |
|-------|--------|--------|
| **P6** | Route `/embed/:projectId`, admin toggle `embed_enabled`, base layout + sidebar (embed code / preview chrome) | Done |
| **P7** | Wire **3D `StageCanvas`** (same scene as Client view): load `stage_url`, `scene_config`, `camera_presets`, optional `media_playlist` / `video_url`; minimal controls (camera presets, orbit) | **Done** (this iteration) |
| **P8** | Deploy headers / CSP so the embed URL can be **iframes** on external sites (e.g. Canvas LMS): relax `frame-ancestors` + remove `X-Frame-Options: DENY` for `/embed` only | **Done** (this iteration) |
| **P9** | **Embed token API** — public URL by opaque token (not raw project UUID), optional regenerate/revoke; remove `ProtectedRoute` from embed when ready | Planned |
| **P10** | Optional: analytics for embed views, rate limits, signed short-lived URLs | Future |

### Notes

- **Admin preview** (`/embed/:projectId` behind `ProtectedRoute`): full stage preview with embed chrome; mirrors what will ship publicly after P9.
- **Security**: Until P9, only authenticated admins can open `/embed/...`. After P9, enforce `embed_enabled` + token for anonymous access.
