import { Loader2 } from "lucide-react";

export function LoadingState({ target }: { target: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-slate-50 p-8 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-slate-400" strokeWidth={2} />
      <div>
        <p className="text-sm font-medium text-slate-700">Loading site…</p>
        <p className="mt-1 max-w-xs break-all text-xs text-slate-400">{target}</p>
      </div>
    </div>
  );
}
