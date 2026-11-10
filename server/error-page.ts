// Standalone HTML error page shown when the proxy can't load a site.

const TITLES: Record<string, string> = {
  unreachable: "Can't reach that site",
  ssl: "Secure connection failed",
  timeout: "The site took too long",
  unsupported: "Can't display that here",
  blocked: "That address isn't allowed",
  ratelimited: "The site is limiting the proxy",
  invalid: "That address isn't valid",
  unknown: "Something went wrong",
};

const DETAILS: Record<string, string> = {
  unreachable: "The site didn't respond or the address doesn't exist. Check the spelling and try again.",
  ssl: "The site's security certificate could not be verified, so the proxy refused to connect.",
  timeout: "The request timed out before the site responded. Sometimes a second attempt works.",
  unsupported: "The site returned a type of content the proxy can't show in the browser.",
  blocked: "The target host or port is outside the proxy's allowed list.",
  ratelimited: "The site answered with 'too many requests' because it blocks traffic from the proxy's network. Waiting a while and trying again may help; some sites will not load through the proxy at all.",
  invalid: "The URL you entered doesn't look like a valid web address.",
  unknown: "An unexpected error happened while loading the site. Please try again.",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildErrorPage(kind: string, target: string, detail?: string): string {
  const title = TITLES[kind] ?? TITLES.unknown;
  const desc = DETAILS[kind] ?? DETAILS.unknown;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
*{margin:0;padding:0;box-sizing:border-box}body{font:14px/1.6 system-ui,sans-serif;background:#f8fafc;color:#1e293b;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:2rem}
.card{max-width:28rem;text-align:center}.icon{width:56px;height:56px;border-radius:50%;background:#fef3c7;color:#d97706;display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem;font-size:28px}
h1{font-size:1.375rem;font-weight:600;margin-bottom:.5rem}.desc{color:#64748b;margin-bottom:1rem}.url{font-size:.8125rem;color:#94a3b8;background:#fff;border:1px solid #e2e8f0;border-radius:.5rem;padding:.5rem .75rem;margin-bottom:1.5rem;word-break:break-all}
.detail{font-size:.75rem;color:#94a3b8;margin-bottom:1rem}.btns{display:flex;gap:.75rem;justify-content:center}
a.btn{display:inline-flex;align-items:center;gap:.5rem;padding:.5rem 1rem;border-radius:.5rem;font-weight:500;text-decoration:none;cursor:pointer;border:none}
a.btn-primary{background:#1e293b;color:#fff}a.btn-primary:hover{background:#334155}a.btn-secondary{background:#fff;color:#475569;border:1px solid #cbd5e1}a.btn-secondary:hover{background:#f1f5f9}
</style></head><body><div class="card"><div class="icon">!</div><h1>${title}</h1><p class="desc">${desc}</p>${target ? `<div class="url">${escapeHtml(target)}</div>` : ""}${detail ? `<p class="detail">${escapeHtml(detail)}</p>` : ""}<div class="btns"><a class="btn btn-primary" href="javascript:location.reload()">Try again</a><a class="btn btn-secondary" href="/">Home</a></div></div></body></html>`;
}
