# Veil — Always-on Personal Web Proxy

Browse the web through your own proxy with persistent sessions, manual CAPTCHA support, and full URL rewriting that keeps you inside the proxy.

## Features

- **Persistent sessions** — logins, carts, and logged-in states survive restarts via Supabase cookie jar storage
- **Full URL rewriting** — every link, image, form, script, and CSS reference is rewritten so you never leave the proxy by accident
- **Single-page app support** — in-page fetch/XHR, History API, and dynamic DOM content are intercepted and re-routed
- **Manual CAPTCHA support** — reCAPTCHA, hCaptcha, and Cloudflare Turnstile render correctly so you can solve them by hand (no automated solving)
- **Anonymous sessions** — no user accounts; each visitor gets a random session ID stored in a browser cookie
- **One deployment** — a single Cloudflare Worker serves both the React app and the proxy engine at one URL

## Quick start (local development)

```bash
npm install
npm run build
npx wrangler dev
```

`wrangler dev` runs the Worker locally (by default at `http://localhost:8787`) and serves the built React app from `dist/`. Local development reads Supabase credentials from a `.dev.vars` file (see below).

## How it works

1. Enter any web address in the address bar
2. The Worker fetches the real site and rewrites all URLs so navigation stays inside the proxy
3. Cookies from the target site are stored in Supabase, keyed to your anonymous session
4. On future visits, your saved cookies are loaded so logins and carts persist
5. CAPTCHAs load directly from their providers (your real IP is visible to them) so the challenges work

## Configuration

All configurable settings are in [`server/config.ts`](server/config.ts):

| Setting | Default | Description |
|---|---|---|
| `timeout` | 30,000 ms | How long to wait for a target site before giving up |
| `userAgent` | Chrome 124 | User-Agent string sent to target sites |
| `acceptLanguage` | `en-US,en;q=0.9` | Accept-Language header |
| `allowedPorts` | `[]` (80/443 only) | Ports the proxy is allowed to fetch from. Empty = standard web ports only |
| `blockedHosts` | localhost, 127.0.0.1, etc. | Hostnames that are never proxied |
| `maxRewriteSize` | 5 MB | Max body size to rewrite; larger text responses pass through unmodified |

### CAPTCHA allowlist

The following hosts are allowed to load directly (bypassing the proxy) so CAPTCHA widgets work:

- `www.google.com`, `www.gstatic.com`, `apis.google.com`, `www.recaptcha.net` (reCAPTCHA)
- `hcaptcha.com`, `newassets.hcaptcha.com`, `assets.hcaptcha.com`, `api.hcaptcha.com` (hCaptcha)
- `challenges.cloudflare.com`, `cloudflareinsights.com` (Cloudflare Turnstile)

**Trade-off:** your real IP is visible to these providers. This is accepted so the challenges are fully functional. No automatic CAPTCHA solving is used anywhere.

## Supabase session storage

Cookie jars are stored in the `proxy_sessions` table in Supabase. The table is created by the migrations in `supabase/migrations/`.

### Required secrets

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS, used by the Worker) |
| `SUPABASE_ANON_KEY` | Anon key (fallback if the service role key is not set) |

For production these are stored as Worker secrets (never committed). For local development, put them in a `.dev.vars` file in the project root:

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Deploy to Cloudflare Workers

### One-time setup

1. **Create a Cloudflare account** at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up) (free plan).
2. **Log in from the project folder:**
   ```bash
   npx wrangler login
   ```
3. **Store the Supabase secrets** (you will be prompted to paste each value):
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put SUPABASE_ANON_KEY
   ```

### Deploy

```bash
npm run deploy
```

This builds the React app and publishes the Worker. It gets a permanent `*.workers.dev` URL (you can also attach your own domain in the Cloudflare dashboard). Re-run `npm run deploy` after every change.

### Free plan limits

- Cloudflare's free plan allows 100,000 requests per day and a small amount of CPU time per request. Very large pages can take longer to rewrite; if you hit the limit, the paid Workers plan raises it.
- Sessions persist across visits because cookie jars are stored in Supabase, not in the Worker.

## Architecture

```
Browser (React app)
  └── Address bar → /proxy?url=<target>
        └── Cloudflare Worker
              ├── Fetches the real site (follows redirects, sends browser headers)
              ├── Rewrites all URLs to /proxy?url=...
              ├── Injects client script (fetch/XHR/navigation interception)
              ├── Streams binary assets, rewrites text/HTML/CSS
              ├── Loads/saves cookies via Supabase proxy_sessions table
              └── Returns rewritten page to the browser
        └── Any other path → built React app (static assets)
```

### Key files

- `server/worker.ts` — Worker entry point, proxy endpoint, redirects, session cookies
- `server/config.ts` — All configurable settings + CAPTCHA allowlist
- `server/rewriter.ts` — URL rewriting engine + client-side interception script
- `server/cookies.ts` — Supabase-backed cookie jar management
- `server/proxy-helpers.ts` — Request validation, header building, response cleaning
- `server/error-page.ts` — Standalone error page for direct browser visits
- `wrangler.jsonc` — Cloudflare Worker configuration (name, assets, routing)
- `src/App.tsx` — React browsing shell (address bar, breadcrumbs, error states)
- `src/lib/proxy.ts` — URL building/parsing helpers
- `src/lib/proxy-check.ts` — Pre-check proxy targets before loading iframe

## Error handling

The proxy provides dedicated error states for:

- **Unreachable sites** — the host didn't respond or doesn't exist
- **SSL/certificate problems** — the site's certificate couldn't be verified
- **Timeouts** — the site took too long to respond
- **Unsupported content** — the response type can't be displayed
- **Blocked addresses** — the host/port is outside the allowed list

Each error page includes a clear explanation and a "Try again" option.
