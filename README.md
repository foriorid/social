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

## What works now

- **Persistence:** accounts, campaigns, briefs, ideas, approvals, leads, hooks, watchlist, Drive folders and settings are saved in this browser (localStorage).
- **AI (Anthropic):** enter your API key in **Settings → AI & Models**. Routine tasks use the cheap model, creative tasks the stronger one; both are selectable. A monthly rupiah budget stops AI calls when reached, and usage/cost is tracked per month.
- **AI Agent Team:** assigning a task runs it for real and files the result in the approval queue (also shown on the Dashboard).
- **Research & Insight → Bedah Akun:** paste an Instagram/TikTok profile link. With a Meta access token + Instagram user ID (Settings) public posts of Business/Creator accounts are fetched; otherwise paste captions/notes. Ideas from the analysis go to the idea inbox.
- **Content Plan:** AI can draft all titles of a campaign or a single brief (hook, visual direction, caption, CTA); each brief has a status that feeds the Dashboard pipeline; ideas can be pulled from the inbox; briefs can be sent to approval.
- **Production Studio:** AI headline/supporting text, zoom, submit to approval, AI editing suggestions for video.
- **Inbox & Leads:** log leads manually, draft replies with AI, track status.

## Limitations

- No backend: data lives in one browser and is not shared between devices or team members. The API key is stored in that browser only and sent directly to the API provider — do not use a shared computer.
- Reach/engagement/followers, the trend list and agent "working" statuses are illustrative. Live metrics, automatic inboxes, publishing/scheduling, file upload and video rendering need platform APIs and a server.
- The Meta (Instagram Business Discovery) call has not been tested against a live token.

## Development

```bash
npm test        # unit tests for the pure helpers
npm run build   # static export to out/
```

## GitHub Pages

The project uses Next.js static export and is configured for the repository project-site path:

https://foriorid.github.io/social/

GitHub Actions builds the app and deploys the generated `out/` folder on pushes to `main`. In repository Settings → Pages, choose **GitHub Actions** as the deployment source.

GitHub Pages serves static frontend files only; it cannot host Next.js API routes, server actions, database services, or background jobs.
