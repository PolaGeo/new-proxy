/*
# Create proxy_sessions table for persistent cookie jars

## Purpose
Stores each anonymous browsing session's cookie jar so that logins, carts,
and logged-in states survive server restarts and sleeps (e.g. Render free
tier auto-sleep). Sessions are anonymous — no user accounts, no auth. Each
visitor gets a random session ID stored in a browser cookie, mapped to a
saved cookie jar in this table.

## 1. New Tables
- `proxy_sessions`
  - `session_id` (text, primary key) — anonymous session ID from the visitor's cookie
  - `cookies` (jsonb, not null, default '[]') — array of stored cookie objects
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now()) — touched on every cookie merge

## 2. Security
- Enable RLS on `proxy_sessions`.
- Grant CRUD ONLY to `service_role` — the Express proxy server uses the
  service role key to read/write cookie jars. The browser/frontend never
  touches this table directly, so `anon` and `authenticated` get NO grants.
- No policies needed for anon/authenticated since they have no grants and
  the server uses service_role (which bypasses RLS but still needs the grant).
- A `moddatetime` trigger keeps `updated_at` current on every UPDATE.

## 3. Important Notes
1. The server uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS, so policies
   are not strictly required — but the grant IS required or even the service
   role gets permission denied.
2. Cookie jars contain potentially sensitive session tokens from target
   sites, so this table must NOT be reachable by the anon key or any
   browser-facing role.
3. The `updated_at` trigger helps identify recently active sessions for
   future cleanup.
*/

CREATE TABLE IF NOT EXISTS proxy_sessions (
  session_id text PRIMARY KEY,
  cookies jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE proxy_sessions ENABLE ROW LEVEL SECURITY;

-- Only the service role (used by the Express server) can access this table.
-- The browser/frontend never touches it directly.
GRANT SELECT, INSERT, UPDATE, DELETE ON proxy_sessions TO service_role;

-- No grants to anon or authenticated — cookie jars are server-only data.

-- Drop old policies if they exist (idempotency)
DROP POLICY IF EXISTS "service_role_all_proxy_sessions" ON proxy_sessions;

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proxy_sessions_updated_at ON proxy_sessions;
CREATE TRIGGER proxy_sessions_updated_at
  BEFORE UPDATE ON proxy_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
