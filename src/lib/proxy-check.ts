// Client-side proxy pre-check: fetch the proxy endpoint with a HEAD-like
// GET and inspect the response before loading the iframe. This lets the
// shell show proper error states (timeout, SSL, unreachable, blocked)
// instead of rendering raw JSON inside the iframe.

import { buildProxyUrl } from "./proxy";
import type { ProxyErrorKind } from "@/components/ErrorState";

export interface ProxyCheckResult {
  ok: boolean;
  errorKind?: ProxyErrorKind;
  errorMessage?: string;
  /** Final target URL after redirects, if different from the input. */
  finalUrl?: string;
}

export async function checkProxyTarget(target: string): Promise<ProxyCheckResult> {
  const proxyUrl = buildProxyUrl(target);

  try {
    // Use a HEAD-like fetch — the server still returns headers + status.
    // We don't need the body; we just need to know if it succeeded.
    const res = await fetch(proxyUrl, {
      method: "GET",
      headers: { "X-Veil-Prefetch": "1" },
      redirect: "follow",
    });

    // Check for proxy-specific error headers
    const proxyError = res.headers.get("X-Proxy-Error");
    if (proxyError) {
      const kind = mapErrorKind(proxyError);
      let detail: string | undefined;
      try {
        const body = await res.text();
        const parsed = JSON.parse(body);
        detail = parsed.detail;
      } catch {
        /* ignore body parse errors */
      }
      return { ok: false, errorKind: kind, errorMessage: detail };
    }

    if (res.status >= 400) {
      return {
        ok: false,
        errorKind: "unknown",
        errorMessage: `Server returned status ${res.status}`,
      };
    }

    return { ok: true };
  } catch (err) {
    // Network-level failure (server unreachable, etc.)
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      return {
        ok: false,
        errorKind: "unreachable",
        errorMessage: "The proxy server could not be reached.",
      };
    }
    return { ok: false, errorKind: "unknown", errorMessage: msg };
  }
}

function mapErrorKind(kind: string): ProxyErrorKind {
  switch (kind) {
    case "unreachable":
    case "invalid":
      return "unreachable";
    case "ssl":
      return "ssl";
    case "timeout":
      return "timeout";
    case "unsupported":
      return "unsupported";
    case "blocked":
      return "blocked";
    case "ratelimited":
      return "ratelimited";
    default:
      return "unknown";
  }
}
