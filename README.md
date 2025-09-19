# DeShazo Group — Migration Starter

This repo bootstraps the Webflow → Next.js + Supabase migration.

## Quick Start

```bash
# 1) Install deps
npm install

# 2) Mirror current live site into ./public/webflow-export
./scripts/mirror-live.sh https://www.deshazogroup.com

# (Alternative) Copy your local Webflow export
# cp -r /Users/deshazogroup-joshua/www.deshazogroup.com/* ./public/webflow-export/

# 3) Extract Webflow CSS
npm run extract:styles

# 4) Convert key HTML pages → React
npm run convert:html

# 5) Run dev server
npm run dev
```

## Supabase
- Run SQL in `supabase/migrations/001_initial_schema.sql` in Supabase SQL editor.
- Set env vars:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_KEY` (server/migration scripts only)

## Deploy
- Push to GitHub.
- Add Vercel project, set GitHub repo, and define the secrets used in workflows.
