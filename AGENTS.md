# QR Field Ops — Base44 Dev Environment

## Overview
Static HTML/JS/CSS frontend (`site/`) + two Netlify Functions (`netlify/functions/`) backed by Supabase. No build step — CDN-loaded scripts only.

## How it runs here
A custom Node.js dev server (`server.mjs`) replaces Netlify: it serves static files from `site/` and emulates both Netlify Functions (`/.netlify/functions/public-config` and `/qr/:code`). Started via `docker-compose.base44.yml` with `node --watch` for auto-restart on server file changes.

## Required secrets (in /run/base44/app.env)
- `SUPABASE_URL` — project URL
- `SUPABASE_PUBLISHABLE_KEY` — anon/publishable key (sent to client)
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (server-side only, for QR redirects)

Without these the page loads but shows a config error.

## Verification
- `curl localhost:3000/` → serves `site/index.html`
- `curl localhost:3000/.netlify/functions/public-config` → JSON with `supabaseUrl` + `supabasePublishableKey`
- Preview shows the login screen when Supabase is reachable

## Notes
- Static file changes (HTML/CSS/JS in `site/`) require a browser refresh; `node --watch` only restarts the server itself.
- The SPA fallback serves `index.html` for any unrecognized path.
