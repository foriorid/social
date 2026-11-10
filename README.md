# FORIOR Creator OS — V5

Frontend prototype built with Next.js App Router, TypeScript, React, and Lucide React.

## Run locally

```bash
npm install
npm run dev
```

## Product structure

- Accounts / brands: Alvian, FORIOR, Intragama Villa, and additional accounts.
- Campaigns within each account: for example Christmas & New Year, Valentine's Day, or a property campaign.
- Each campaign contains 30 content-plan slots.
- Every content plan has an editable brief (title, hook / core message, format, objective, and status).
- Content brief fields can be handed into Production Studio as a starting point.
- Production Studio: Feed & Carousel, Reels & Video, Templates.
- Asset Library: register Google Drive folders with a title and folder URL.
- Analytics: illustrative metrics plus a community inbox for comments / mentions that can be sent into Content Plan.
- Automation: intentionally simplified reminder placeholders.

## Prototype limitations

Interactions currently use frontend state and illustrative data. They are not yet persisted across sessions or users. Google Drive folder URLs are registered in the UI, but automatic file listing requires Google OAuth, Drive API access, and a secure backend. Analytics comments and metrics are sample data; live platform inboxes require authorized platform APIs.

Authentication, database persistence, team permissions, real AI model calls, media processing, publishing, and scheduled automation require backend services. Do not put API secrets or service-role keys in this frontend repository.

## GitHub Pages

The project uses Next.js static export and is configured for the repository project-site path:

https://foriorid.github.io/social/

GitHub Actions builds the app and deploys the generated `out/` folder on pushes to `main`. In repository Settings → Pages, choose **GitHub Actions** as the deployment source.

GitHub Pages serves static frontend files only; it cannot host Next.js API routes, server actions, database services, or background jobs.
