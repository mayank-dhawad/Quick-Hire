import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISSAL_STORAGE_KEY = 'quickhire_pwa_prompt_dismissed_at';
const DISMISSAL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // 1. Detect if running as standalone PWA
    const checkIsStandalone = () => {
      const isStandaloneMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)').matches
        : false;
      const isIosStandalone = typeof navigator !== 'undefined' && (navigator as unknown as { standalone?: boolean }).standalone === true;
      return isStandaloneMedia || isIosStandalone;
    };

    if (checkIsStandalone()) {
      setIsInstalled(true);
      return;
    }

    // 2. Detect iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // 3. Check dismissal cooldown
    try {
      const dismissedAt = localStorage.getItem(DISMISSAL_STORAGE_KEY);
      if (dismissedAt) {
        const timeDiff = Date.now() - Number(dismissedAt);
        if (timeDiff < DISMISSAL_COOLDOWN_MS) {
          setIsDismissed(true);
        } else {
          localStorage.removeItem(DISMISSAL_STORAGE_KEY);
        }
      }
    } catch {
      // Ignore localStorage errors
    }

    // 4. Listen for beforeinstallprompt event (Android & Desktop Chrome/Edge)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    // 5. Listen for appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      try {
        localStorage.removeItem(DISMISSAL_STORAGE_KEY);
      } catch {
        // Ignore
      }
      console.log('[QuickHire PWA] App was successfully installed.');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unsupported'> => {
    if (!deferredPrompt) {
      return 'unsupported';
    }

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        setIsInstallable(false);
        setDeferredPrompt(null);
      } else {
        // User dismissed the browser prompt
        setIsDismissed(true);
        try {
          localStorage.setItem(DISMISSAL_STORAGE_KEY, String(Date.now()));
        } catch {
          // Ignore
        }
      }
      return choice.outcome;
    } catch (err) {
      console.warn('[QuickHire PWA] Installation prompt error:', err);
      return 'unsupported';
    }
  }, [deferredPrompt]);

  const dismissPrompt = useCallback(() => {
    setIsDismissed(true);
    try {
      localStorage.setItem(DISMISSAL_STORAGE_KEY, String(Date.now()));
    } catch {
      // Ignore
    }
  }, []);

  return {
    isInstallable: isInstallable && !isDismissed && !isInstalled,
    isInstalled,
    isIos: isIos && !isInstalled,
    isDismissed,
    promptInstall,
    dismissPrompt,
  };
}
