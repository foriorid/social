# FORIOR Creator OS — V4 UI Prototype

Responsive frontend prototype built with Next.js App Router, TypeScript, React, and Lucide React.

## Run locally

Requirements: Node.js 20.9+

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Implemented pages

- Dashboard
- Research & Insight
  - Account audit, profile content mix, six example top-content cards, content opportunity ideas
  - Trend radar, competitor / creator watchlist
  - Searchable and saveable Bank Ide & Hook
- Content Plan
  - Personal brand, FORIOR, and client campaign workspaces
  - Campaign overview, content calendar, Reels and Carousel storyboards
  - List / Calendar views, content filters, approval state
- Production Studio
  - Feed & Carousel creative workspace with slide list, canvas preview, copy editing, and design assistant
  - Reels & Video workflow, vertical preview, timeline mockup, editing assistant
  - Template gallery and contextual asset preview
- AI Agent Team
  - Eight specialist agent roles across Strategy, Creative, Publishing, and Operations
  - Agent roster, profiles, task assignment modal, workload, and approval queue
  - Human approval is the default workflow
- Asset Library
  - Project and category folder navigation
  - Photo, video, music/audio, design asset types
  - Search, filtering, asset detail panel, project tags, usage references
  - Google Drive and Supabase Storage connection UI placeholders
  - Asset selection action for downstream creative production

## Prototype interactions

Navigation, tabs, filters, search, saved hooks, campaign/storyboard selection, approval actions, agent filters, task assignment, folder creation, asset selection, storage connection demo states, and modals are wired in the frontend.

## Important limitations

This is a frontend UI prototype with illustrative sample data. It does not yet include:
- Authentication, team permissions, database persistence, or audit logs.
- Live Instagram/TikTok account analysis or analytics.
- Actual AI model calls, image generation, video rendering, or publishing.
- Real Google Drive OAuth, Supabase project connection, file upload, or signed URL generation.
- Real approval links for external clients.

The storage connection controls currently demonstrate the intended UI flow only. They do not connect to a real Google Drive or Supabase project.

## Recommended Asset Library architecture

Recommended hybrid setup if FORIOR already keeps source media in Google Drive:

1. **Google Drive as source-of-truth for existing originals and archives.**
   - Connect using Google OAuth for each authorized workspace / owner.
   - Store provider file IDs and folder IDs, not public links or access tokens in the browser.
   - Use Drive API from a secure server-side integration.
2. **Supabase Postgres as the asset index and application database.**
   - Store asset metadata: provider, provider_file_id, project_id, workspace_id, folder_id, filename, MIME type, dimensions, duration, file size, tags, status, and usage references.
   - Store agent permissions and project-level access policies.
3. **Supabase Storage for app-generated assets and optional optimized previews.**
   - Use private buckets and short-lived signed URLs for previews / approved processing tasks.
   - Large originals can remain in Drive; avoid duplicating all large RAW / video files unless there is a clear processing need.
4. **Agent access through a backend asset service.**
   - Agents search metadata by project, type, tags, and usage rights.
   - Backend checks workspace and project permissions, then issues a short-lived URL or streams the asset to the selected AI / media-processing service.
   - Never expose Google refresh tokens, Supabase service-role keys, or permanent private storage URLs to the browser or model prompt.
5. **Approval and traceability.**
   - Record which assets were used by each generated feed, carousel, or video.
   - Keep source file IDs, derived output IDs, version, creator agent, and human approval status.

A pure Supabase Storage setup is also possible if FORIOR wants one central app-managed storage system. The hybrid setup avoids migrating the existing Drive archive all at once.

## Visual direction

Premium, spacious, minimal, lavender / deep-purple accent, responsive desktop / tablet / mobile layouts.
