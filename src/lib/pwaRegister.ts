/**
 * Service Worker Registration & Lifecycle Manager for QuickHire PWA
 */

export interface PwaRegistrationOptions {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
}

let registrationInstance: ServiceWorkerRegistration | null = null;

export function registerServiceWorker(options: PwaRegistrationOptions = {}): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }

  // In development mode, do not register the service worker to prevent intercepting Vite HMR and dev assets
  if (import.meta.env.MODE === 'development') {
    if (typeof navigator.serviceWorker.getRegistrations === 'function') {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) {
          reg.unregister().catch(() => {});
        }
      });
    }
    return Promise.resolve(null);
  }

  // Register once the window finishes loading for non-blocking initial paint
  return new Promise((resolve) => {
    const doRegister = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        registrationInstance = registration;

        // Check if an updated worker is already waiting
        if (registration.waiting) {
          options.onNeedRefresh?.();
        }

        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // New update available
                console.log('[QuickHire PWA] New version installed and waiting.');
                options.onNeedRefresh?.();
              } else {
                // Content cached for offline use
                console.log('[QuickHire PWA] Content precached for offline use.');
                options.onOfflineReady?.();
              }
            }
          });
        });

        // Check once when the app starts and periodically while it remains open.
        registration.update().catch(() => {});
        const updateCheck = window.setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 60 * 1000);
        window.addEventListener('pagehide', () => window.clearInterval(updateCheck), { once: true });

        resolve(registration);
      } catch (err) {
        console.warn('[QuickHire PWA] Service worker registration failed:', err);
        resolve(null);
      }
    };

    if (document.readyState === 'complete') {
      doRegister();
    } else {
      window.addEventListener('load', doRegister);
    }

    // Detect when the new service worker takes over and reload the page smoothly
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}

/**
 * Commands the waiting service worker to activate and reload
 */
export function skipWaitingAndReload(): void {
  if (registrationInstance && registrationInstance.waiting) {
    registrationInstance.waiting.postMessage({ type: 'SKIP_WAITING' });
  } else {
    window.location.reload();
  }
}

/**
 * Unregisters all active service worker registrations (useful for debugging and cache resets)
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      await reg.unregister();
    }
    return true;
  } catch (err) {
    console.warn('[QuickHire PWA] Unregistration failed:', err);
    return false;
  }
}
