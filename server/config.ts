// Central configuration for the proxy Worker.
// All tunable settings live here so they can be adjusted in one place.

export const config = {
  // How long to wait for the target site before giving up (ms).
  timeout: 30_000,

  // User-Agent string sent to target sites. Set to a real browser UA so
  // sites treat the proxy like a normal visitor.
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",

  // Accept-Language header sent to target sites.
  acceptLanguage: "en-US,en;q=0.9",

  // Ports the proxy is allowed to fetch from. Empty = allow all standard
  // web ports (80, 443). Listed ports are an explicit allowlist.
  allowedPorts: [] as number[],

  // Hostnames that are never proxied (block at the source).
  blockedHosts: ["localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254"] as string[],

  // Maximum response body size to buffer and rewrite (bytes). Binary assets
  // that are streamed through are not subject to this limit.
  maxRewriteSize: 5 * 1024 * 1024, // 5 MB
};

// CAPTCHA and embed providers that are allowed to load directly from their
// own origin (bypassing the proxy). Trade-off: the user's real IP is visible
// to these providers, but the challenge widgets render correctly.
export const captchaAllowlist: string[] = [
  "www.google.com", // reCAPTCHA (script + iframe)
  "www.gstatic.com",
  "apis.google.com",
  "www.recaptcha.net",
  "recaptcha.net",
  "hcaptcha.com", // hCaptcha
  "newassets.hcaptcha.com",
  "assets.hcaptcha.com",
  "api.hcaptcha.com",
  "challenges.cloudflare.com", // Cloudflare Turnstile
  "cloudflareinsights.com",
];

// Patterns that identify a CAPTCHA widget in the page HTML. Used to detect
// when a challenge is present so we can show the user a notice.
export const captchaPatterns: RegExp[] = [
  /<div[^>]*class\s*=\s*["'][^"']*g-recaptcha/gi,
  /<div[^>]*data-sitekey\s*=/gi,
  /<script[^>]*src\s*=\s*["']https?:\/\/www\.google\.com\/recaptcha/gi,
  /<script[^>]*src\s*=\s*["']https?:\/\/www\.recaptcha\.net\/recaptcha/gi,
  /<iframe[^>]*src\s*=\s*["']https?:\/\/www\.google\.com\/recaptcha/gi,
  /<div[^>]*class\s*=\s*["'][^"']*h-captcha/gi,
  /<script[^>]*src\s*=\s*["']https?:\/\/js\.hcaptcha\.com/gi,
  /<script[^>]*src\s*=\s*["']https?:\/\/challenges\.cloudflare\.com\/turnstile/gi,
  /<div[^>]*class\s*=\s*["'][^"']*cf-turnstile/gi,
  /grecaptcha\.(execute|render|getResponse)/gi,
  /hcaptcha\.(execute|render|getResponse)/gi,
  /turnstile\.(execute|render|getResponse)/gi,
];

export function isCaptchaHost(hostname: string): boolean {
  return captchaAllowlist.some(
    (h) => hostname === h || hostname.endsWith("." + h)
  );
}

/** Detect whether a CAPTCHA widget is present in the page HTML. */
export function detectCaptcha(html: string): boolean {
  return captchaPatterns.some((re) => re.test(html));
}

/** Check whether a target host:port is allowed by the config. */
export function isHostAllowed(hostname: string, port: number): boolean {
  const blocked = config.blockedHosts.some(
    (h) => hostname === h || hostname.endsWith("." + h)
  );
  if (blocked) return false;

  if (config.allowedPorts.length === 0) {
    return port === 80 || port === 443 || port === 0;
  }
  return config.allowedPorts.includes(port);
}
