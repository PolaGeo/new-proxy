// URL rewriting engine.
//
// Rewrites every link, asset reference, form action, srcset, and CSS url()
// in a proxied page so navigation stays inside the proxy. Also injects a
// client-side script that intercepts fetch/XHR and dynamic navigation.

import { isCaptchaHost, detectCaptcha, captchaAllowlist } from "./config.js";

const PROXY_PATH = "/proxy";

// HTML entities commonly found in attribute values that need decoding
// before URL resolution and re-encoding.
const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&apos;": "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39|#x27|apos);/gi, (m) => {
    return ENTITY_MAP[m.toLowerCase()] ?? m;
  });
}

function encodeAttr(s: string): string {
  // Escape only the characters that are special in HTML attribute values.
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Encode a target URL as a proxy URL (absolute path on same origin). */
export function toProxyUrl(target: string, baseUrl: URL): string {
  const decoded = decodeEntities(target);
  try {
    const resolved = new URL(decoded, baseUrl.href);
    // Captcha providers bypass the proxy and load directly.
    if (isCaptchaHost(resolved.hostname)) {
      return resolved.href;
    }
    return `${PROXY_PATH}?url=${encodeURIComponent(resolved.href)}`;
  } catch {
    return target;
  }
}

// Link relations that should NOT be proxied — they are browser hints
// (preconnect, dns-prefetch) and proxying them defeats their purpose.
const SKIP_LINK_RELS = new Set([
  "preconnect",
  "dns-prefetch",
  "prefetch",
  "prerender",
]);

/** Rewrite an HTML document. */
export function rewriteHtml(html: string, baseUrl: URL): string {
  let out = html;

  // <a href>, <area href>
  out = rewriteAttr(out, "a", "href", baseUrl);
  out = rewriteAttr(out, "area", "href", baseUrl);

  // <link href> — skip preconnect/dns-prefetch hints
  out = rewriteLinkTag(out, baseUrl);

  // <img src>, <script src>, <embed src>, <source src>, <track src>,
  // <video src>, <audio src>, <input src>, <frame src>, <iframe src>
  out = rewriteAttr(out, "img", "src", baseUrl);
  out = rewriteAttr(out, "script", "src", baseUrl);
  out = rewriteAttr(out, "embed", "src", baseUrl);
  out = rewriteAttr(out, "source", "src", baseUrl);
  out = rewriteAttr(out, "track", "src", baseUrl);
  out = rewriteAttr(out, "video", "src", baseUrl);
  out = rewriteAttr(out, "audio", "src", baseUrl);
  out = rewriteAttr(out, "input", "src", baseUrl);
  out = rewriteAttr(out, "frame", "src", baseUrl);

  // <video poster>, <object data>
  out = rewriteAttr(out, "video", "poster", baseUrl);
  out = rewriteAttr(out, "object", "data", baseUrl);

  // <iframe src> — captcha provider iframes load directly (not proxied)
  // so the challenge widget's postMessage communication works.
  out = rewriteIframeSrc(out, baseUrl);

  // srcset (responsive images)
  out = rewriteSrcset(out, baseUrl);

  // data-* attributes that may contain URLs (data-src, data-bg, etc.)
  out = rewriteDataAttrs(out, baseUrl);

  // <form action>
  out = rewriteAttr(out, "form", "action", baseUrl);

  // <meta http-equiv="refresh" content="...;url=...">
  out = rewriteMetaRefresh(out, baseUrl);

  // <base href> — remove it so relative URLs resolve against the real
  // target (our rewrites already use baseUrl, a <base> would only confuse).
  out = out.replace(/<base\s+[^>]*?>/gi, "");

  // Inline <style> blocks
  out = out.replace(
    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_m, open: string, css: string, close: string) =>
      open + rewriteCss(css, baseUrl) + close
  );

  // Inline style="" attributes
  out = out.replace(
    /\sstyle\s*=\s*"([^"]*)"/gi,
    (_m, css: string) => ` style="${rewriteCssInline(css, baseUrl)}"`
  );

  return out;
}

/** Rewrite <iframe src> — captcha provider iframes load directly. */
function rewriteIframeSrc(html: string, baseUrl: URL): string {
  return html.replace(
    /(<iframe\b[^>]*?\ssrc\s*=\s*)(['"])([^'"]*)\2/gi,
    (_m, pre: string, _q: string, url: string) => {
      const decoded = decodeEntities(url);
      try {
        const resolved = new URL(decoded, baseUrl.href);
        // Captcha provider iframes bypass the proxy so postMessage works.
        // Rewrite to the full absolute URL since <base> is removed.
        if (isCaptchaHost(resolved.hostname)) {
          return pre + "'" + encodeAttr(resolved.href) + "'";
        }
        const rewritten = `${PROXY_PATH}?url=${encodeURIComponent(resolved.href)}`;
        return pre + "'" + encodeAttr(rewritten) + "'";
      } catch {
        return _m;
      }
    }
  );
}

/** Rewrite <link> tags, skipping preconnect/dns-prefetch hints. */
function rewriteLinkTag(html: string, baseUrl: URL): string {
  return html.replace(
    /(<link\b[^>]*?\shref\s*=\s*)(['"])([^'"]*)\2/gi,
    (match, pre: string, _q: string, _url: string) => {
      // Check if this link has a rel we should skip.
      const relMatch = match.match(/\srel\s*=\s*['"]?([^'">\s]+)/i);
      const rel = relMatch ? relMatch[1].toLowerCase() : "";
      if (SKIP_LINK_RELS.has(rel)) {
        return match;
      }
      const rewritten = toProxyUrl(_url, baseUrl);
      return pre + "'" + encodeAttr(rewritten) + "'";
    }
  );
}

/** Rewrite a CSS stylesheet: url() references and @import rules. */
export function rewriteCss(css: string, baseUrl: URL): string {
  let out = css;

  // url(...) — handle quoted and unquoted, with or without quotes
  out = out.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (_m, _q: string, url: string) => {
      const trimmed = url.trim();
      if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("#")) {
        return `url(${url})`;
      }
      return `url(${toProxyUrl(trimmed, baseUrl)})`;
    }
  );

  // @import "..." / @import url(...)
  out = out.replace(
    /@import\s+(?:url\()?\s*(['"])([^'"]+)\1\s*\)?/gi,
    (_m, _q: string, url: string) =>
      `@import url(${toProxyUrl(url, baseUrl)})`
  );

  return out;
}

/** Rewrite url() references inside an inline style attribute. */
function rewriteCssInline(css: string, baseUrl: URL): string {
  return css.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (_m, _q: string, url: string) => {
      const trimmed = url.trim();
      if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("#")) {
        return `url(${url})`;
      }
      return `url(${toProxyUrl(trimmed, baseUrl)})`;
    }
  );
}

/** Rewrite srcset attributes (comma-separated URL + descriptor lists). */
function rewriteSrcset(html: string, baseUrl: URL): string {
  return html.replace(
    /\ssrcset\s*=\s*"([^"]*)"/gi,
    (_m, list: string) => {
      const rewritten = list
        .split(",")
        .map((entry) => {
          const parts = entry.trim().split(/\s+/);
          if (parts[0]) parts[0] = toProxyUrl(parts[0], baseUrl);
          return parts.join(" ");
        })
        .join(", ");
      return ` srcset="${encodeAttr(rewritten)}"`;
    }
  );
}

/** Rewrite common data-* attributes that hold URLs. */
function rewriteDataAttrs(html: string, baseUrl: URL): string {
  const dataUrlAttrs = [
    "data-src",
    "data-bg",
    "data-background",
    "data-background-url",
    "data-original",
    "data-lazy",
    "data-srcset",
    "data-href",
    "data-url",
    "data-poster",
  ];
  let out = html;
  for (const attr of dataUrlAttrs) {
    if (attr === "data-srcset") {
      out = out.replace(
        new RegExp(`\\s${attr}\\s*=\\s*"([^"]*)"`, "gi"),
        (_m, list: string) => {
          const rewritten = list
            .split(",")
            .map((entry) => {
              const parts = entry.trim().split(/\s+/);
              if (parts[0]) parts[0] = toProxyUrl(parts[0], baseUrl);
              return parts.join(" ");
            })
            .join(", ");
          return ` ${attr}="${encodeAttr(rewritten)}"`;
        }
      );
    } else {
      out = rewriteAttrGeneric(out, attr, baseUrl);
    }
  }
  return out;
}

/** Rewrite <meta http-equiv="refresh" content="N;url=..."> */
function rewriteMetaRefresh(html: string, baseUrl: URL): string {
  return html.replace(
    /(<meta\s+[^>]*?http-equiv\s*=\s*["']?refresh["']?[^>]*?content\s*=\s*["'])([^"']*)(["'])/gi,
    (_m, pre: string, content: string, post: string) => {
      // content = "5;url=https://example.com/page"
      const match = content.match(/^(\d+;url=)(.+)$/i);
      if (match) {
        return pre + toProxyUrl(match[2], baseUrl) + post;
      }
      return _m;
    }
  );
}

/** Rewrite a specific attribute on a specific tag. */
function rewriteAttr(
  html: string,
  tag: string,
  attr: string,
  baseUrl: URL
): string {
  const re = new RegExp(
    `(<${tag}\\b[^>]*?\\s${attr}\\s*=\\s*)(['"])([^'"]*)\\2`,
    "gi"
  );
  return html.replace(re, (_m, pre: string, _q: string, url: string) => {
    const rewritten = toProxyUrl(url, baseUrl);
    return pre + "'" + encodeAttr(rewritten) + "'";
  });
}

/** Rewrite a bare attribute name (any tag). */
function rewriteAttrGeneric(
  html: string,
  attr: string,
  baseUrl: URL
): string {
  const re = new RegExp(
    `(\\s${attr}\\s*=\\s*)(['"])([^'"]*)\\2`,
    "gi"
  );
  return html.replace(re, (_m, pre: string, _q: string, url: string) => {
    const rewritten = toProxyUrl(url, baseUrl);
    return pre + "'" + encodeAttr(rewritten) + "'";
  });
}

/** Inject the client-side interception script and CAPTCHA notice (if needed). */
export function injectClientScript(html: string): string {
  const hasCaptcha = detectCaptcha(html);
  const script = `<script>${CLIENT_SCRIPT}</script>`;
  const captchaBanner = hasCaptcha ? buildCaptchaNotice() : "";

  const injection = captchaBanner + script;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, injection + "</body>");
  }
  if (/<\/html>/i.test(html)) {
    return html.replace(/<\/html>/i, injection + "</html>");
  }
  return html + injection;
}

/** Build the CAPTCHA notice banner injected into the proxied page. */
function buildCaptchaNotice(): string {
  return `<div id="veil-captcha-notice" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1e293b;color:#f8fafc;font:14px/1.5 system-ui,sans-serif;padding:10px 16px;display:flex;align-items:center;gap:10px;box-shadow:0 2px 8px rgba(0,0,0,.2);">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
<span style="flex:1;">A CAPTCHA challenge was detected on this page. Please solve it below to continue — the page will resume automatically once you do.</span>
<button onclick="var el=document.getElementById('veil-captcha-notice');if(el){el.style.display='none';}" style="background:transparent;border:1px solid #475569;color:#cbd5e1;border-radius:6px;padding:3px 10px;font:inherit;cursor:pointer;flex-shrink:0;">Dismiss</button>
</div>
<style>#veil-captcha-notice{animation:veil-slide-in .3s ease}@keyframes veil-slide-in{from{transform:translateY(-100%)}to{transform:translateY(0)}}</style>
`;
}

// --- Client-side interception script --------------------------------------
// Re-routes in-page fetch/XHR, window.open, and location assignments so
// single-page apps and dynamic sites stay inside the proxy. Also intercepts
// dynamic element creation (innerHTML, insertAdjacentHTML) and rewrites
// URLs in newly-added content.
const CLIENT_SCRIPT = `
(function(){
  "use strict";
  var P = ${JSON.stringify(PROXY_PATH)};
  var ORIGIN = location.origin;
  var CAPTCHA_HOSTS = ${JSON.stringify(captchaAllowlist)};

  function isCaptchaHost(h) {
    h = (h || "").toLowerCase();
    for (var i = 0; i < CAPTCHA_HOSTS.length; i++) {
      var ch = CAPTCHA_HOSTS[i];
      if (h === ch || h.endsWith("." + ch)) return true;
    }
    return false;
  }

  function toProxy(u) {
    try {
      if (!u) return u;
      var s = String(u);
      if (s.charAt(0) === "#" || s.indexOf("javascript:") === 0 || s.indexOf("data:") === 0 || s.indexOf("mailto:") === 0 || s.indexOf("tel:") === 0) return s;
      // Already proxied
      if (s.indexOf(P + "?url=") === 0 || s.indexOf(ORIGIN + P + "?url=") === 0) return s;
      // Relative to current proxy URL
      var base = getCurrentTarget();
      var abs = new URL(s, base || location.href);
      // Captcha providers load directly — don't proxy them
      if (isCaptchaHost(abs.hostname)) return abs.href;
      return P + "?url=" + encodeURIComponent(abs.href);
    } catch(e) { return u; }
  }

  // Extract the current target URL from the proxy query string.
  function getCurrentTarget() {
    try {
      var u = new URL(location.href);
      if (u.pathname === P) {
        var t = u.searchParams.get("url");
        if (t) return t;
      }
    } catch(e) {}
    return null;
  }

  // --- fetch() -----------------------------------------------------------
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function(input, init) {
      try {
        if (typeof input === "string") {
          input = toProxy(input);
        } else if (input && input.url) {
          input = new Request(toProxy(input.url), input);
        }
      } catch(e) {}
      return origFetch.call(this, input, init);
    };
  }

  // --- XMLHttpRequest ----------------------------------------------------
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    arguments[1] = toProxy(url);
    return origOpen.apply(this, arguments);
  };

  // --- window.open -------------------------------------------------------
  var origWindowOpen = window.open;
  if (origWindowOpen) {
    window.open = function(url) {
      if (url) arguments[0] = toProxy(url);
      return origWindowOpen.apply(this, arguments);
    };
  }

  // --- location.assign / location.replace --------------------------------
  var origAssign = location.assign ? location.assign.bind(location) : null;
  var origReplace = location.replace ? location.replace.bind(location) : null;
  if (origAssign) {
    location.assign = function(url) { return origAssign(toProxy(url)); };
  }
  if (origReplace) {
    location.replace = function(url) { return origReplace(toProxy(url)); };
  }

  // --- Intercept clicks on dynamically-created links ---------------------
  document.addEventListener("click", function(e) {
    var a = e.target;
    while (a && a.tagName !== "A") a = a.parentNode;
    var raw = a ? a.getAttribute("href") : null;
    if (raw && !isUnproxiable(raw)) {
      e.preventDefault();
      location.href = toProxy(raw);
    }
  }, true);

  function isUnproxiable(u) {
    return u.charAt(0) === "#" || u.indexOf("javascript:") === 0 || u.indexOf("data:") === 0 || u.indexOf("blob:") === 0 || u.indexOf("mailto:") === 0 || u.indexOf("tel:") === 0 || u.indexOf(P + "?url=") === 0 || u.indexOf(ORIGIN + P + "?url=") === 0;
  }

  // --- form submissions --------------------------------------------------
  function rewriteFormAction(f) {
    var raw = f.getAttribute("action");
    if (raw) f.setAttribute("action", toProxy(raw));
  }
  document.addEventListener("submit", function(e) {
    if (e.target && e.target.tagName === "FORM") rewriteFormAction(e.target);
  }, true);
  var origFormSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function() {
    rewriteFormAction(this);
    return origFormSubmit.call(this);
  };

  // --- History API (pushState/replaceState) ------------------------------
  var origPush = history.pushState;
  var origReplaceState = history.replaceState;
  history.pushState = function(state, title, url) {
    if (url) arguments[2] = toProxy(url);
    return origPush.apply(this, arguments);
  };
  history.replaceState = function(state, title, url) {
    if (url) arguments[2] = toProxy(url);
    return origReplaceState.apply(this, arguments);
  };

  // --- postMessage passthrough for CAPTCHA widgets -----------------------
  // CAPTCHA iframes (reCAPTCHA, hCaptcha, Turnstile) communicate with the
  // parent page via postMessage. Since the captcha iframe loads directly
  // from its own origin (bypassing the proxy) while the parent page is
  // proxied, the messages still work because postMessage is origin-based
  // and we don't interfere. However, we intercept messages to detect when
  // a captcha has been solved so we can auto-dismiss the notice.
  window.addEventListener("message", function(e) {
    // Check for captcha-solved signals from reCAPTCHA, hCaptcha, Turnstile.
    try {
      var d = e.data;
      if (typeof d === "string") {
        // reCAPTCHA sends a message with the token when solved
        if (d.indexOf("captcha") !== -1 || d.indexOf("g-recaptcha-response") !== -1 || d.indexOf("h-captcha-response") !== -1 || d.indexOf("cf-turnstile-response") !== -1) {
          dismissCaptchaNotice();
        }
      }
      if (d && typeof d === "object") {
        // hCaptcha / Turnstile may send structured messages
        if (d.event === "challenge-pass" || d.event === "verified" || (d.source === "hcaptcha" && d.label === "challenge-closed")) {
          dismissCaptchaNotice();
        }
      }
    } catch(_) {}
  }, false);

  function dismissCaptchaNotice() {
    var el = document.getElementById("veil-captcha-notice");
    if (el) {
      el.style.transition = "opacity .4s, transform .4s";
      el.style.opacity = "0";
      el.style.transform = "translateY(-100%)";
      setTimeout(function() { if (el) el.style.display = "none"; }, 400);
    }
  }

  // Also dismiss when a captcha response field gets a value (fallback).
  function checkCaptchaSolved() {
    var fields = ["g-recaptcha-response", "h-captcha-response", "cf-turnstile-response"];
    for (var i = 0; i < fields.length; i++) {
      var input = document.getElementsByName(fields[i])[0];
      if (input && input.value && input.value.length > 0) {
        dismissCaptchaNotice();
        return true;
      }
    }
    return false;
  }
  setInterval(function() { checkCaptchaSolved(); }, 1500);

  // --- Dynamic content: intercept innerHTML / insertAdjacentHTML ---------
  // Catch dynamically-inserted links and images the server never saw.
  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      for (var j = 0; j < m.addedNodes.length; j++) {
        var node = m.addedNodes[j];
        if (node.nodeType === 1) {
          rewriteDomNode(node);
        }
      }
    }
  });
  function rewriteDomNode(node) {
    if (!node || !node.querySelectorAll) return;
    // Rewrite links and images
    var els = node.querySelectorAll ? node.querySelectorAll("a[href], img[src], iframe[src], script[src], form[action]") : [];
    for (var k = 0; k < els.length; k++) {
      var el = els[k];
      if (el.tagName === "A" && el.href) {
        var h = el.getAttribute("href");
        if (h && h.indexOf(P) !== 0 && h.indexOf("http") !== 0 && h.charAt(0) !== "#" && h.indexOf("javascript:") !== 0 && h.indexOf("data:") !== 0 && h.indexOf("mailto:") !== 0) {
          el.setAttribute("href", toProxy(h));
        } else if (h && h.indexOf("http") === 0 && h.indexOf(P + "?url=") === -1) {
          el.setAttribute("href", toProxy(h));
        }
      }
      if (el.tagName === "IMG" && el.src) {
        var s = el.getAttribute("src");
        if (s && s.indexOf("http") === 0 && s.indexOf(P + "?url=") === -1) {
          el.setAttribute("src", toProxy(s));
        }
      }
      if (el.tagName === "IFRAME" && el.src) {
        var is = el.getAttribute("src");
        if (is && is.indexOf("http") === 0 && is.indexOf(P + "?url=") === -1) {
          // Don't rewrite captcha provider iframes — they need to load directly.
          try {
            var ihost = new URL(is).hostname;
            if (!isCaptchaHost(ihost)) {
              el.setAttribute("src", toProxy(is));
            }
          } catch(e) {
            el.setAttribute("src", toProxy(is));
          }
        }
      }
      if (el.tagName === "SCRIPT" && el.src) {
        var ss = el.getAttribute("src");
        if (ss && ss.indexOf("http") === 0 && ss.indexOf(P + "?url=") === -1) {
          el.setAttribute("src", toProxy(ss));
        }
      }
      if (el.tagName === "FORM" && el.action) {
        var fa = el.getAttribute("action");
        if (fa && fa.indexOf("http") === 0 && fa.indexOf(P + "?url=") === -1) {
          el.setAttribute("action", toProxy(fa));
        }
      }
    }
  }
  observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
})();
`;

// Re-export for convenience.
export { PROXY_PATH };
