import { useState, useEffect, useRef, type FormEvent } from "react";
import { Globe, Lock, ArrowRight } from "lucide-react";
import { normalizeUrl, prettyUrl } from "@/lib/proxy";

interface AddressBarProps {
  /** Current target URL being proxied, or null when on the home page. */
  currentUrl: string | null;
  /** Whether a proxied page is currently loading. */
  loading: boolean;
  /** Fired when the user submits a new target URL to proxy. */
  onSubmit: (targetUrl: string) => void;
}

export function AddressBar({ currentUrl, loading, onSubmit }: AddressBarProps) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the field in sync with whatever page is currently loaded.
  useEffect(() => {
    if (currentUrl) {
      setValue(prettyUrl(currentUrl));
    } else {
      setValue("");
    }
  }, [currentUrl]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const target = normalizeUrl(value);
    if (target) {
      onSubmit(target);
      inputRef.current?.blur();
    }
  }

  const isSecure = currentUrl ? currentUrl.startsWith("https://") : true;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 transition focus-within:border-slate-900 focus-within:ring-2 focus-within:ring-slate-900/10"
    >
      <span className="flex shrink-0 items-center text-slate-400">
        {isSecure ? (
          <Lock className="h-4 w-4" strokeWidth={2} />
        ) : (
          <Globe className="h-4 w-4" strokeWidth={2} />
        )}
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          // Select all on focus for quick retyping
          e.target.select();
        }}
        onBlur={() => setFocused(false)}
        placeholder="Enter a web address, e.g. example.com"
        spellCheck={false}
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
        aria-label="Web address"
      />
      <button
        type="submit"
        disabled={loading || value.trim().length === 0}
        className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : (
          <>
            <span>Go</span>
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          </>
        )}
      </button>
    </form>
  );
}
