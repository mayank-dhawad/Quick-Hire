import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { skipWaitingAndReload } from '../lib/pwaRegister';

export function PwaUpdatePrompt() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const show = () => setAvailable(true);
    window.addEventListener('quickhire:pwa-update-ready', show);
    return () => window.removeEventListener('quickhire:pwa-update-ready', show);
  }, []);

  if (!available) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 left-4 right-4 z-[100] mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-emerald-200 bg-white p-4 shadow-2xl"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
        <RefreshCw className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-extrabold text-slate-900">QuickHire update available</p>
        <p className="text-sm text-slate-600">Install the latest improvements now.</p>
      </div>
      <button
        type="button"
        onClick={skipWaitingAndReload}
        className="shrink-0 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800"
      >
        Update now
      </button>
      <button
        type="button"
        aria-label="Dismiss update notification"
        onClick={() => setAvailable(false)}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
