import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck, Globe2, Zap, LockKeyhole } from "lucide-react";
import { AddressBar } from "@/components/AddressBar";
import { BreadcrumbBar } from "@/components/BreadcrumbBar";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState, type ProxyErrorKind } from "@/components/ErrorState";
import {
  buildProxyUrl,
  parseProxyUrl,
  normalizeUrl,
  homeUrl,
} from "@/lib/proxy";
import { checkProxyTarget } from "@/lib/proxy-check";

interface ProxyState {
  status: "idle" | "loading" | "loaded" | "error";
  target: string | null;
  errorKind?: ProxyErrorKind;
  errorMessage?: string;
  /** Bump to force the iframe to reload. */
  reloadKey: number;
}

const START: ProxyState = {
  status: "idle",
  target: null,
  reloadKey: 0,
};

function App() {
  const [state, setState] = useState<ProxyState>(START);
  // History of visited target URLs and current pointer.
  const [history, setHistory] = useState<string[]>([]);
  const [histIndex, setHistIndex] = useState(-1);

  // On first load, if the current browser URL already points at a proxy
  // target (e.g. a refresh), restore it into the shell.
  useEffect(() => {
    const target = parseProxyUrl(window.location.href);
    if (target) {
      setHistory([target]);
      setHistIndex(0);
      setState({ status: "loading", target, reloadKey: 0 });
    }
  }, []);

  const navigateTo = useCallback((target: string) => {
    setState((prev) => ({
      status: "loading",
      target,
      reloadKey: prev.reloadKey + 1,
    }));
    setHistory((prev) => {
      const next = prev.slice(0, histIndexRef.current + 1);
      next.push(target);
      histIndexRef.current = next.length - 1;
      setHistIndex(next.length - 1);
      return next;
    });
    // Update the browser address bar so the proxied URL is shareable/refreshable.
    window.history.replaceState({}, "", buildProxyUrl(target));

    // Pre-check the proxy target — if the server returns an error,
    // show the proper error state instead of loading a broken iframe.
    preCheckTarget(target);
  }, []);

  const preCheckTarget = useCallback(async (target: string) => {
    const result = await checkProxyTarget(target);
    // Only apply the result if we're still loading this target.
    setState((prev) => {
      if (prev.status !== "loading" || prev.target !== target) return prev;
      if (!result.ok) {
        return {
          ...prev,
          status: "error" as const,
          errorKind: result.errorKind,
          errorMessage: result.errorMessage,
        };
      }
      // OK — transition to "loaded" so the iframe renders.
      return { ...prev, status: "loaded" as const };
    });
  }, []);

  // We need a ref mirror of histIndex so navigateTo's setHistory updater
  // sees the latest pointer without a stale-closure dependency.
  const histIndexRef = useRef(-1);
  useEffect(() => {
    histIndexRef.current = histIndex;
  }, [histIndex]);

  const goHome = useCallback(() => {
    setState(START);
    setHistory([]);
    setHistIndex(-1);
    histIndexRef.current = -1;
    window.history.replaceState({}, "", homeUrl());
  }, []);

  const navigateHistory = useCallback(
    (newIndex: number) => {
      const target = history[newIndex];
      if (!target) return;
      setHistIndex(newIndex);
      histIndexRef.current = newIndex;
      setState((prev) => ({
        status: "loading",
        target,
        reloadKey: prev.reloadKey + 1,
      }));
      window.history.replaceState({}, "", buildProxyUrl(target));
      preCheckTarget(target);
    },
    [history, preCheckTarget]
  );

  const reload = useCallback(() => {
    if (!state.target) return;
    setState((prev) => ({
      ...prev,
      status: "loading",
      reloadKey: prev.reloadKey + 1,
    }));
    preCheckTarget(state.target);
  }, [state.target, preCheckTarget]);

  const handleRetry = useCallback(() => {
    if (state.target) reload();
    else goHome();
  }, [state.target, reload, goHome]);

  // ---- Render -----------------------------------------------------------

  const showShell = state.target !== null || state.status !== "idle";
  const loading = state.status === "loading";

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      {/* Top chrome: address bar + breadcrumb row */}
      <header className="z-10 shrink-0 bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-3 py-2 sm:px-4">
          <div className="hidden items-center gap-1.5 pr-1 text-slate-900 sm:flex">
            <Globe2 className="h-5 w-5" strokeWidth={2.25} />
            <span className="text-sm font-semibold tracking-tight">Veil</span>
          </div>
          <div className="flex-1">
            <AddressBar
              currentUrl={state.target}
              loading={loading}
              onSubmit={navigateTo}
            />
          </div>
        </div>
        {showShell && (
          <BreadcrumbBar
            history={history}
            index={histIndex}
            loading={loading}
            onNavigate={navigateHistory}
            onReload={reload}
            onHome={goHome}
          />
        )}
      </header>

      {/* Main content area */}
      <main className="relative flex flex-1 overflow-hidden">
        {state.status === "idle" && <HomePage onPick={navigateTo} />}

        {state.status === "loading" && state.target && (
          <LoadingState target={state.target} />
        )}

        {state.status === "error" && (
          <ErrorState
            kind={state.errorKind ?? "unknown"}
            target={state.target ?? undefined}
            message={state.errorMessage}
            onRetry={handleRetry}
            onHome={goHome}
          />
        )}

        {state.status === "loaded" && state.target && (
          <iframe
            key={state.reloadKey}
            src={buildProxyUrl(state.target)}
            title="Proxied content"
            className="h-full w-full flex-1 border-0 bg-white"
            sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-popups-to-escape-sandbox"
          />
        )}
      </main>
    </div>
  );
}

function HomePage({ onPick }: { onPick: (url: string) => void }) {
  const features = [
    {
      icon: <LockKeyhole className="h-5 w-5" strokeWidth={2} />,
      title: "Persistent sessions",
      desc: "Logins and carts survive server restarts. Your browsing session is saved, not forgotten.",
    },
    {
      icon: <ShieldCheck className="h-5 w-5" strokeWidth={2} />,
      title: "Stays in the proxy",
      desc: "Every link, image, and form is rewritten so you never accidentally leave the protected view.",
    },
    {
      icon: <Zap className="h-5 w-5" strokeWidth={2} />,
      title: "Manual CAPTCHAs",
      desc: "Challenge widgets render correctly so you can solve them by hand — no automated bypassing.",
    },
  ];

  const suggestions = [
    "en.wikipedia.org",
    "news.ycombinator.com",
    "example.com",
  ];

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-16 sm:py-24">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/20">
          <Globe2 className="h-8 w-8" strokeWidth={2} />
        </div>
        <h1 className="text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Browse the web through your personal proxy
        </h1>
        <p className="mt-4 max-w-xl text-center text-base leading-relaxed text-slate-600">
          Enter any address above to open it in a protected, persistent
          browsing session. Your logins stick around, links stay routed
          through the proxy, and CAPTCHAs just work.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(normalizeUrl(s) ?? `https://${s}`)}
              className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:ring-slate-300"
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mt-16 grid w-full gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl bg-white p-5 ring-1 ring-slate-200"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                {f.icon}
              </div>
              <p className="text-sm font-semibold text-slate-900">{f.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
