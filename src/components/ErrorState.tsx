import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export type ProxyErrorKind =
  | "unreachable"
  | "ssl"
  | "timeout"
  | "unsupported"
  | "blocked"
  | "unknown";

interface ErrorStateProps {
  kind: ProxyErrorKind;
  target?: string;
  message?: string;
  onRetry: () => void;
  onHome: () => void;
}

const COPY: Record<
  ProxyErrorKind,
  { title: string; detail: string }
> = {
  unreachable: {
    title: "Can't reach that site",
    detail:
      "The site didn't respond or the address doesn't exist. Check the spelling and try again.",
  },
  ssl: {
    title: "Secure connection failed",
    detail:
      "The site's security certificate could not be verified, so the proxy refused to connect.",
  },
  timeout: {
    title: "The site took too long",
    detail:
      "The request timed out before the site responded. You can try again — sometimes a second attempt works.",
  },
  unsupported: {
    title: "Can't display that here",
    detail:
      "The site returned a type of content the proxy can't show in the browser. Try opening the address directly.",
  },
  blocked: {
    title: "That address isn't allowed",
    detail:
      "The target host or port is outside the proxy's allowed list, so the request was refused.",
  },
  unknown: {
    title: "Something went wrong",
    detail:
      "An unexpected error happened while loading the site. Please try again.",
  },
};

export function ErrorState({
  kind,
  target,
  message,
  onRetry,
  onHome,
}: ErrorStateProps) {
  const copy = COPY[kind] ?? COPY.unknown;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 bg-slate-50 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <AlertTriangle className="h-7 w-7" strokeWidth={2} />
      </div>
      <div className="max-w-md">
        <p className="text-lg font-semibold text-slate-900">{copy.title}</p>
        <p className="mt-2 text-sm text-slate-600">{copy.detail}</p>
        {target && (
          <p className="mt-3 break-all rounded-lg bg-white px-3 py-2 text-xs text-slate-400 ring-1 ring-slate-200">
            {target}
          </p>
        )}
        {message && (
          <p className="mt-2 break-all text-xs text-slate-400">{message}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          <RefreshCw className="h-4 w-4" strokeWidth={2.25} />
          Try again
        </button>
        <button
          type="button"
          onClick={onHome}
          className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-100"
        >
          <Home className="h-4 w-4" strokeWidth={2.25} />
          Home
        </button>
      </div>
    </div>
  );
}
