import { ArrowLeft, ArrowRight, RotateCw, Home, X } from "lucide-react";
import { prettyUrl, homeUrl } from "@/lib/proxy";

interface BreadcrumbBarProps {
  /** Stack of visited target URLs, oldest first. */
  history: string[];
  /** Current index into the history array. */
  index: number;
  /** Whether a page is currently loading. */
  loading: boolean;
  /** Navigate to a different index in the history stack. */
  onNavigate: (index: number) => void;
  /** Reload the current page. */
  onReload: () => void;
  /** Leave the proxy and return to the home page. */
  onHome: () => void;
}

export function BreadcrumbBar({
  history,
  index,
  loading,
  onNavigate,
  onReload,
  onHome,
}: BreadcrumbBarProps) {
  const canGoBack = index > 0;
  const canGoForward = index < history.length - 1;
  const current = history[index] ?? null;

  return (
    <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-2 py-1.5 sm:px-3">
      <NavButton
        label="Back"
        icon={<ArrowLeft className="h-4 w-4" strokeWidth={2.25} />}
        disabled={!canGoBack || loading}
        onClick={() => canGoBack && onNavigate(index - 1)}
      />
      <NavButton
        label="Forward"
        icon={<ArrowRight className="h-4 w-4" strokeWidth={2.25} />}
        disabled={!canGoForward || loading}
        onClick={() => canGoForward && onNavigate(index + 1)}
      />
      <NavButton
        label="Reload"
        icon={
          loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
          ) : (
            <RotateCw className="h-4 w-4" strokeWidth={2.25} />
          )
        }
        disabled={!current || loading}
        onClick={onReload}
      />
      <NavButton
        label="Home"
        icon={<Home className="h-4 w-4" strokeWidth={2.25} />}
        disabled={loading}
        onClick={onHome}
      />

      <div className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-xs text-slate-500">
        {current ? (
          <span className="truncate" title={current}>
            {prettyUrl(current)}
          </span>
        ) : (
          <span className="text-slate-400">Home</span>
        )}
      </div>

      {current && (
        <NavButton
          label="Close"
          icon={<X className="h-4 w-4" strokeWidth={2.25} />}
          disabled={loading}
          onClick={() => {
            window.location.href = homeUrl();
          }}
        />
      )}
    </div>
  );
}

interface NavButtonProps {
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}

function NavButton({ label, icon, disabled, onClick }: NavButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {icon}
    </button>
  );
}
