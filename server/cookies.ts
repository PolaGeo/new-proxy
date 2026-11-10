// Cookie jar management backed by Supabase.
//
// Each anonymous session's cookie jar is stored in the `proxy_sessions`
// table so logins and cart state survive restarts. The Worker uses the
// service role key to read/write this table; the browser never touches it.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface ProxyEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  ASSETS: Fetcher;
}

interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number; // epoch ms, undefined = session cookie
  secure: boolean;
  httponly: boolean;
}

export interface CookieJar {
  sessionId: string;
  cookies: StoredCookie[];
}

function getSupabase(env: ProxyEnv): SupabaseClient | null {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!env.SUPABASE_URL || !key) return null;
  return createClient(env.SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Load a session's cookie jar. Falls back to an empty jar if storage is unavailable. */
export async function getCookieJar(env: ProxyEnv, sessionId: string): Promise<CookieJar> {
  let cookies: StoredCookie[] = [];
  try {
    const supabase = getSupabase(env);
    if (supabase) {
      const { data, error } = await supabase
        .from("proxy_sessions")
        .select("cookies")
        .eq("session_id", sessionId)
        .maybeSingle();

      if (!error && data && Array.isArray(data.cookies)) {
        cookies = data.cookies as StoredCookie[];
      }
    }
  } catch {
    // Storage unreachable: continue with an empty jar so the page still loads.
  }
  return { sessionId, cookies };
}

/** Merge Set-Cookie header values from a response into the jar and persist. */
export async function mergeSetCookies(
  env: ProxyEnv,
  jar: CookieJar,
  target: URL,
  setCookies: string[]
): Promise<void> {
  for (const raw of setCookies) {
    const parsed = parseSetCookie(raw, target);
    if (!parsed) continue;
    jar.cookies = jar.cookies.filter(
      (c) =>
        !(
          c.name === parsed.name &&
          c.domain === parsed.domain &&
          c.path === parsed.path
        )
    );
    if (parsed.expires && parsed.expires > 0 && parsed.expires < Date.now()) {
      continue;
    }
    jar.cookies.push(parsed);
  }
  await persistJar(env, jar);
}

/** Build a Cookie header value for the target URL from the jar. */
export function cookieHeaderFor(jar: CookieJar, target: URL): string {
  const now = Date.now();
  const matching = jar.cookies.filter((c) => {
    if (c.expires && c.expires > 0 && c.expires < now) return false;
    return (
      domainMatches(target.hostname, c.domain) &&
      pathMatches(target.pathname, c.path)
    );
  });
  if (matching.length === 0) return "";
  matching.sort((a, b) => b.path.length - a.path.length);
  return matching.map((c) => `${c.name}=${c.value}`).join("; ");
}

/** Persist the jar to Supabase (upsert). Best-effort: failures are logged, not thrown. */
async function persistJar(env: ProxyEnv, jar: CookieJar): Promise<void> {
  try {
    const supabase = getSupabase(env);
    if (!supabase) return;
    const { error } = await supabase
      .from("proxy_sessions")
      .upsert(
        { session_id: jar.sessionId, cookies: jar.cookies },
        { onConflict: "session_id" }
      );

    if (error) {
      console.error("Failed to persist cookie jar:", error.message);
    }
  } catch (err) {
    console.error("Failed to persist cookie jar:", err);
  }
}

// --- Parsing helpers ------------------------------------------------------

function parseSetCookie(raw: string, target: URL): StoredCookie | null {
  const parts = raw.split(";");
  if (!parts[0]) return null;
  const [name, value] = parts[0].trim().split("=");
  if (!name) return null;

  let domain = target.hostname;
  let cookiePath = "/";
  let expires: number | undefined;
  let secure = false;
  let httponly = false;

  for (const part of parts.slice(1)) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed === "secure") secure = true;
    else if (trimmed === "httponly") httponly = true;
    else if (trimmed.startsWith("domain=")) {
      let d = part.trim().slice(7).trim().toLowerCase();
      if (d.startsWith(".")) d = d.slice(1);
      domain = d;
    } else if (trimmed.startsWith("path=")) {
      cookiePath = part.trim().slice(5).trim() || "/";
    } else if (trimmed.startsWith("expires=")) {
      const d = new Date(part.trim().slice(8).trim());
      if (!isNaN(d.getTime())) expires = d.getTime();
    } else if (trimmed.startsWith("max-age=")) {
      const secs = Number(part.trim().slice(8).trim());
      if (!isNaN(secs)) {
        expires = secs <= 0 ? 0 : Date.now() + secs * 1000;
      }
    }
  }

  return {
    name: name.trim(),
    value: (value ?? "").trim(),
    domain,
    path: cookiePath,
    expires,
    secure,
    httponly,
  };
}

function domainMatches(hostname: string, cookieDomain: string): boolean {
  const h = hostname.toLowerCase();
  const d = cookieDomain.toLowerCase();
  if (h === d) return true;
  return h.endsWith("." + d);
}

function pathMatches(reqPath: string, cookiePath: string): boolean {
  if (cookiePath === "/") return true;
  if (reqPath === cookiePath) return true;
  return reqPath.startsWith(cookiePath + "/") || reqPath.startsWith(cookiePath);
}
