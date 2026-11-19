import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true
  );
  const [showRestoredNotice, setShowRestoredNotice] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowRestoredNotice(true);
      const timer = setTimeout(() => setShowRestoredNotice(false), 4500);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowRestoredNotice(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !showRestoredNotice) {
    return null;
  }

  if (showRestoredNotice) {
    return (
      <aside aria-label="Connection Status" className="bg-emerald-600 text-white px-4 py-2 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all duration-300">
        <Wifi className="w-4 h-4 shrink-0" />
        <span>Connection Restored! Live workforce and job synchronization active.</span>
      </aside>
    );
  }

  return (
    <aside aria-label="Offline Mode Notice" className="bg-amber-600 text-white px-4 py-2 text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 shadow-md sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span>
          <strong>Offline Mode:</strong> Viewing cached data. Submitting jobs or profile changes requires network connection.
        </span>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold shrink-0 transition-colors cursor-pointer"
      >
        Retry
      </button>
    </aside>
  );
}

