import { config } from "./config.js";
import {
  resolveTarget,
  buildTargetHeaders,
  parseSetCookies,
  cleanResponseHeaders,
  isHtmlType,
  isTextType,
} from "./proxy-helpers.js";
import { rewriteHtml, rewriteCss, injectClientScript, PROXY_PATH } from "./rewriter.js";
import {
  getCookieJar,
  mergeSetCookies,
  cookieHeaderFor,
  type CookieJar,
  type ProxyEnv,
} from "./cookies.js";
import { buildErrorPage } from "./error-page.js";

const SESSION_COOKIE = "veil_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 365;
const MAX_REDIRECTS = 10;

export default {
  async fetch(request: Request, env: ProxyEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PROXY_PATH && request.method === "GET") {
      return handleProxy(request, url, env);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleProxy(request: Request, url: URL, env: ProxyEnv): Promise<Response> {
  const prefetch = request.headers.get("x-veil-prefetch") === "1";
  const raw = url.searchParams.get("url");
  const check = resolveTarget(raw);
  if (!check.ok) {
    return proxyError(prefetch, check.reason === "blocked" ? "blocked" : "invalid", raw ?? "");
  }

  const sessionId = getSessionId(request);
  const jar = await getCookieJar(env, sessionId);
  return fetchTarget(request, env, check.url, sessionId, jar, prefetch, 0);
}

async function fetchTarget(
  request: Request,
  env: ProxyEnv,
  target: URL,
  sessionId: string,
  jar: CookieJar,
  prefetch: boolean,
  redirects: number
): Promise<Response> {
  if (redirects > MAX_REDIRECTS) {
    return proxyError(prefetch, "unreachable", target.href, "Too many redirects");
  }

  const upstreamHeaders = buildTargetHeaders(target, request.headers);
  const cookies = cookieHeaderFor(jar, target);
  if (cookies) upstreamHeaders["Cookie"] = cookies;

  let upstream: Response;
  try {
    upstream = await fetch(target.href, {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(config.timeout),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("aborted") || msg.includes("timeout")) {
      return proxyError(prefetch, "timeout", target.href);
    }
    if (msg.includes("certificate") || msg.includes("SSL") || msg.includes("TLS")) {
      return proxyError(prefetch, "ssl", target.href, msg);
    }
    return proxyError(prefetch, "unreachable", target.href, msg);
  }

  const status = upstream.status;
  const setCookies = parseSetCookies(upstream.headers);
  if (setCookies.length) {
    await mergeSetCookies(env, jar, target, setCookies);
  }

  if (status >= 300 && status < 400) {
    const location = upstream.headers.get("location");
    if (location) {
      const nextUrl = new URL(location, target.href);
      const nextCheck = resolveTarget(nextUrl.href);
      if (!nextCheck.ok) {
        return proxyError(prefetch, nextCheck.reason === "blocked" ? "blocked" : "invalid", nextUrl.href);
      }
      return fetchTarget(request, env, nextCheck.url, sessionId, jar, prefetch, redirects + 1);
    }
  }

  if (prefetch) {
    if (status >= 400) {
      return proxyError(prefetch, "unknown", target.href, `Target returned ${status}`);
    }
    return withSessionCookie(
      new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } }),
      sessionId
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const headers = new Headers(cleanResponseHeaders(upstream.headers));
  headers.set("X-Proxy", "veil");

  if (!isTextType(contentType) && !isHtmlType(contentType)) {
    return withSessionCookie(new Response(upstream.body, { status, headers }), sessionId);
  }

  const bytes = new Uint8Array(await upstream.arrayBuffer());
  if (bytes.byteLength > config.maxRewriteSize) {
    return withSessionCookie(new Response(bytes, { status, headers }), sessionId);
  }

  const body = new TextDecoder().decode(bytes);
  let rewritten: string;
  if (isHtmlType(contentType)) {
    rewritten = injectClientScript(rewriteHtml(body, target));
  } else if (contentType.toLowerCase().includes("text/css")) {
    rewritten = rewriteCss(body, target);
  } else {
    return withSessionCookie(new Response(bytes, { status, headers }), sessionId);
  }
  return withSessionCookie(new Response(rewritten, { status, headers }), sessionId);
}

function getSessionId(request: Request): string {
  const existing = parseCookie(request.headers.get("cookie"), SESSION_COOKIE);
  return existing ?? crypto.randomUUID();
}

function parseCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === name && v) return v;
  }
  return undefined;
}

function withSessionCookie(response: Response, sessionId: string): Response {
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
  );
  return new Response(response.body, { status: response.status, headers });
}

function proxyError(prefetch: boolean, kind: string, target: string, detail?: string): Response {
  const headers = new Headers({ "X-Proxy-Error": kind });
  if (prefetch) {
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ error: kind, target, detail }), { status: 502, headers });
  }
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(buildErrorPage(kind, target, detail), { status: 502, headers });
}
