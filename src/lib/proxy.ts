// Helpers for building and parsing proxy URLs.
// The proxy server lives at /proxy?url=<encoded target> on the same origin,
// so the whole app deploys as a single unit.

export const PROXY_PATH = "/proxy";

/** Build the proxied URL for a given target site URL. */
export function buildProxyUrl(target: string): string {
  return `${PROXY_PATH}?url=${encodeURIComponent(target)}`;
}

/** Extract the original target URL from a proxy URL string. */
export function parseProxyUrl(proxyUrl: string): string | null {
  try {
    const u = new URL(proxyUrl, window.location.origin);
    if (u.pathname !== PROXY_PATH) return null;
    const target = u.searchParams.get("url");
    return target;
  } catch {
    return null;
  }
}

/** Normalize raw user input into a full URL with a default scheme. */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // If it already has a scheme, keep it.
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).toString();
    } catch {
      return null;
    }
  }
  // Bare domain-ish input -> prepend https://
  const withScheme = `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    // Require a dot so we don't treat search terms as hosts
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Pretty-print a URL for the breadcrumb bar (strip scheme + trailing slash). */
export function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    let path = u.pathname.replace(/\/$/, "");
    if (path) path = path + u.search;
    return `${u.hostname}${path}`;
  } catch {
    return url;
  }
}

/** Root origin URL for the app itself. */
export function homeUrl(): string {
  return window.location.origin + "/";
}
