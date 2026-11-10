# FORIOR Creator OS — V5

Responsive frontend prototype built with Next.js App Router, TypeScript, React, and Lucide React.

## Run locally

Requirements: Node.js 20.9+

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Pages included

- Dashboard
- Research & Insight
- Content Plan
- Production Studio
- AI Agent Team
- Analytics
- Asset Library
- Team & Workflow
- Settings

## Prototype status

This repository contains the frontend UI prototype. Navigation, tabs, filters, search, saved hooks, campaign/storyboard selection, approval actions, agent filters, task assignment, folder creation, asset selection, and settings controls are frontend interactions with illustrative sample data.

The following still require backend services and integrations:
- Authentication, team permissions, database persistence, and audit logs.
- Live Instagram/TikTok account analytics.
- Actual AI model calls, image generation, video rendering, and publishing.
- Google Drive OAuth, Supabase connection, file upload, and signed URLs.
- Persistent team, project, workflow, and workspace settings.

Do not put API secrets or service-role keys in this frontend repository.

## GitHub Pages deployment

The project is configured for static export and the repository project-site path:

https://foriorid.github.io/social/

The GitHub Actions workflow at `.github/workflows/deploy.yml` builds the Next.js app and publishes the generated `out/` directory whenever code is pushed to `main`.

In GitHub, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.

## Important hosting limitation

GitHub Pages serves static HTML, CSS, and JavaScript only. It can host this frontend prototype, but it cannot run a Next.js server, API routes, server actions, authentication backend, database, or background jobs. Add those services separately when the product moves beyond the frontend prototype.

## Visual direction

Premium, spacious, minimal, lavender / deep-purple accent, responsive desktop / tablet / mobile layouts.
