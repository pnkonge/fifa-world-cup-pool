# World Cup 2026 Pool — Friends Dashboard

A dashboard for our 20–30 person World Cup 2026 prediction pool. Built so everyone can check the standings on their phone or laptop, see the schedule, and (in Phase 1B) submit their knockout bracket through a real bracket UI instead of a Google Form.

> Source of truth is the Google Sheet that already runs the pool. This dashboard is **read-only** in Phase 1A; bracket write-back lands in Phase 1B.

## Stack

- **Vite + React + TypeScript** — fast build, type-safe
- **Tailwind CSS** — editorial sports-magazine theme (Fraunces + IBM Plex Sans, pitch-green + gold palette)
- **PapaParse** — CSV parsing from the published Sheet
- **react-router-dom** — Leaderboard, Schedule, Standings, Bracket, My Picks
- **Day.js** — timezones and "last updated" timestamps
- **Recharts** — coming with Phase 2 analytics

## Architecture (Phase 1)

```
Google Sheet (source of truth)
   └── Publish-to-web → CSV per tab
       └── React app on Netlify fetches on page load
           └── Manual "Refresh" button re-fetches on demand
```

No background polling. No backend. The Sheet stays in charge.

## Run locally

```bash
# 1. Install deps
npm install

# 2. (Optional) copy env template — without this, mock data is used
cp .env.example .env
# fill in the published-CSV URLs

# 3. Start dev server
npm run dev
```

Open <http://localhost:5173>. With no env vars set, the app renders with realistic mock data so you can develop offline.

## Wiring up the real Sheet

In your Google Sheet:

1. **File → Share → Publish to web**
2. For each tab (`Results`, `Scoring`, `Group Standings`, the schedule view, `Predictions-Group`, `Predictions-Knockout`), select the tab, choose **CSV**, click **Publish**.
3. Copy each URL into the matching variable in `.env`.
4. Restart the dev server. The Refresh button now pulls real data.

> Published CSVs cache for ~5 minutes on Google's side. The "Last updated" timestamp in the header reflects the local fetch time, not the Sheet's last edit.

## Deploy

Push to GitHub → connect the repo in Netlify → set env vars in **Site settings → Environment variables** → deploy. The `netlify.toml` in this repo handles the SPA redirect and Node version.

## Roadmap

- **Phase 1A (this scaffold)** — read-only dashboard with leaderboard, schedule, standings, bracket display, my picks
- **Phase 1B** — custom knockout bracket UI with cascading picks; writes back via Google Apps Script Web App
- **Phase 2** — Python ETL pipeline, Postgres + dbt, FastAPI backend, prediction analytics. Same React frontend, real data engineering story underneath. This is the portfolio version.

## Project structure

```
src/
├── components/      Header, Layout
├── lib/             Domain types, CSV layer, mock data
└── pages/           Leaderboard (built), others (placeholders)
```

## License

Private project for a group of friends. Code MIT-licensed for portfolio use.
