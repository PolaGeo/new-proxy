import { config, isHostAllowed } from "./config.js";

/** Normalized target URL, or an error describing why it's invalid. */
export type TargetCheck =
  | { ok: true; url: URL }
  | { ok: false; reason: "blocked" | "invalid" };

/** Validate and normalize a target URL string from the ?url= param. */
export function resolveTarget(raw: string | null | undefined): TargetCheck {
  if (!raw) return { ok: false, reason: "invalid" };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // No scheme? Try prepending http:// for bare hosts.
    try {
      url = new URL(`http://${raw}`);
    } catch {
      return { ok: false, reason: "invalid" };
    }
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "invalid" };
  }

  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!isHostAllowed(url.hostname, port)) {
    return { ok: false, reason: "blocked" };
  }

  return { ok: true, url };
}

/** Build the set of headers to send to the target site. */
export function buildTargetHeaders(
  target: URL,
  incoming: Headers
): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": config.userAgent,
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": config.acceptLanguage,
    "Accept-Encoding": "identity", // no gzip — we need to rewrite the body
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
  };

  // Forward the Referer relative to the target origin so the site sees a
  // sensible referrer without leaking the proxy's own URL.
  const referer = incoming.get("referer");
  if (referer) {
    // The proxy's referer will look like /proxy?url=...; extract the target.
    try {
      const refUrl = new URL(referer, target.origin);
      const refTarget = refUrl.searchParams.get("url");
      if (refTarget) {
        headers["Referer"] = refTarget;
      }
    } catch {
      /* ignore malformed referer */
    }
  }

  return headers;
}

/** Parse Set-Cookie headers (possibly multiple) into individual cookie strings. */
export function parseSetCookies(headers: Headers): string[] {
  return headers.getSetCookie();
}

/** Strip hop-by-hop and security headers that shouldn't be forwarded back. */
export function cleanResponseHeaders(
  headers: Headers
): Record<string, string> {
  const cleaned: Record<string, string> = {};
  const skip = new Set([
    "set-cookie",
    "set-cookie2",
    "content-encoding",
    "content-length",
    "transfer-encoding",
    "connection",
    "keep-alive",
    "x-frame-options",
    "content-security-policy",
    "content-security-policy-report-only",
    "strict-transport-security",
    "x-content-type-options",
    "x-xss-protection",
    "referrer-policy",
    "cross-origin-opener-policy",
    "cross-origin-embedder-policy",
    "cross-origin-resource-policy",
    "permissions-policy",
  ]);

  headers.forEach((value, name) => {
    if (!skip.has(name.toLowerCase())) {
      cleaned[name] = value;
    }
  });
  return cleaned;
}

/** Whether a content type is HTML that should be rewritten. */
export function isHtmlType(contentType: string | undefined | null): boolean {
  if (!contentType) return false;
  return contentType.toLowerCase().includes("text/html");
}

/** Whether a content type is text-based and rewriteable (CSS, JS, etc.). */
export function isTextType(contentType: string | undefined | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return (
    ct.startsWith("text/") ||
    ct.includes("javascript") ||
    ct.includes("json") ||
    ct.includes("xml") ||
    ct.includes("svg")
  );
}
