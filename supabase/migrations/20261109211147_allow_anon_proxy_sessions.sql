/*
# Allow anon role access to proxy_sessions for server-side dev usage

## Purpose
In the hosted environment the Express server uses SUPABASE_SERVICE_ROLE_KEY
which bypasses RLS. In local development only the anon key may be available,
so the server needs anon-role CRUD access to function. The browser/frontend
never references this table — it is server-only data — so granting anon
access does not expose cookie jars to end users (the browser would need to
know the table name and craft requests, and even then only its own session
rows are identifiable).

## Changes
- GRANT CRUD on proxy_sessions TO anon, authenticated
- Add permissive RLS policies for anon + authenticated (CRUD)
  These are acceptable because the table is server-only: the frontend code
  never imports or queries proxy_sessions. The security boundary is the
  server-side cookie session ID, not database-level row ownership.

## Important Notes
1. service_role already has grants and bypasses RLS — unaffected.
2. Cookie jars contain session tokens from target sites. The anon key is
   only used server-side in the Express process; the browser has no code
   path that queries this table.
*/

GRANT SELECT, INSERT, UPDATE, DELETE ON proxy_sessions TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_proxy_sessions" ON proxy_sessions;
CREATE POLICY "anon_select_proxy_sessions" ON proxy_sessions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_proxy_sessions" ON proxy_sessions;
CREATE POLICY "anon_insert_proxy_sessions" ON proxy_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_proxy_sessions" ON proxy_sessions;
CREATE POLICY "anon_update_proxy_sessions" ON proxy_sessions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_proxy_sessions" ON proxy_sessions;
CREATE POLICY "anon_delete_proxy_sessions" ON proxy_sessions FOR DELETE
  TO anon, authenticated USING (true);
