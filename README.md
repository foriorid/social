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

## How it fits together

One content item moves through six stages — Ide → Brief → Produksi → Review → Terjadwal → Tayang — and every page reads and writes that same item:

1. **Research & Insight** and **Analytics** send ideas to the idea inbox.
2. **Content Plan** holds campaigns per account. Each content item has a full brief (goal, key message, hook, CTA, visual direction, asset needs, caption, hashtags) and a storyboard: scenes for video, slides for carousel. Board, list and calendar views; share link and HTML/PDF export.
3. **AI Agent Team** runs a fixed pipeline per content item: Strategist (campaign titles) → Content Writer (brief + storyboard) → Designer / Video Editor (production package) → Social Media Manager (final caption, hashtags, schedule) → your approval. Run it manually for N items, or switch on automatic mode for a campaign (works while the app is open, capped per session and by the monthly budget).
4. **Production Studio** works from the storyboard: slide editor with templates and PNG export, video scene board with script copy and `.srt` subtitles, production package, caption.
5. **Asset Library** lists Google Drive folders directly. Files stay in Drive; only links are stored and attached to content.
6. **Dashboard** shows the pipeline counts, pending approvals, leads and AI cost.

## Setup (Settings → AI & Models)

- **Anthropic API key** — required for every AI feature. Choose the routine and creative models and a monthly rupiah budget.
- **Google API key** — for Asset Library. Enable "Google Drive API" for the key, and share each folder as "Anyone with the link". Restrict the key to your site's HTTP referrer.
- **Meta access token + Instagram user ID** — optional, for automatic Instagram profile audits.

## Limitations

- No backend: data lives in one browser and is not shared between devices or team members. Keys are stored in that browser only and sent directly to the provider.
- Automatic mode only runs while the app is open in a browser tab.
- Video rendering, publishing/scheduling to platforms and automatic inboxes need platform APIs and a server. PNG export of a slide falls back to no photo when the image host blocks canvas export.
- Reach/engagement/followers and the trend list are illustrative.
- The Google Drive and Meta calls were tested against mocked responses, not live keys.

## Development

```bash
npm test        # unit tests for the pure helpers and pipeline logic
npm run build   # static export to out/
```

## GitHub Pages

The project uses Next.js static export and is configured for the repository project-site path:

https://foriorid.github.io/social/

GitHub Actions builds the app and deploys the generated `out/` folder on pushes to `main`. In repository Settings → Pages, choose **GitHub Actions** as the deployment source.

GitHub Pages serves static frontend files only; it cannot host Next.js API routes, server actions, database services, or background jobs.
