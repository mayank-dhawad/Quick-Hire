import { useState, useEffect, useCallback } from 'react';

/**
 * LocalStorage key used to store the Fast2SMS live delivery toggle state.
 */
export const SMS_LIVE_STORAGE_KEY = 'quickhire_live_sms_enabled';

/**
 * Event name dispatched when SMS toggle state changes.
 */
export const SMS_TOGGLE_EVENT = 'quickhire:sms-config-changed';

/**
 * Determines the default SMS live state based on VITE_ENABLE_LIVE_SMS environment variable.
 * Defaults to true if VITE_ENABLE_LIVE_SMS is 'true', otherwise false.
 */
export const getDefaultLiveSmsState = (): boolean => {
  const envVal = import.meta.env.VITE_ENABLE_LIVE_SMS;
  if (envVal === undefined || envVal === null || envVal === '') {
    return true; // Default fallback to active if not explicitly disabled
  }
  return String(envVal).toLowerCase() === 'true';
};

/**
 * Reads the current SMS delivery mode.
 * Checks localStorage first; if not set, falls back to the environment variable.
 */
export const isLiveSmsEnabled = (): boolean => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(SMS_LIVE_STORAGE_KEY);
      if (stored !== null) {
        return stored === 'true';
      }
    }
  } catch (err) {
    console.warn('Unable to read SMS config from localStorage:', err);
  }
  return getDefaultLiveSmsState();
};

type SmsListener = (enabled: boolean) => void;
const listeners = new Set<SmsListener>();

/**
 * Notifies all in-memory subscribers and dispatches window events for external observers.
 */
const notifySmsListeners = (enabled: boolean): void => {
  listeners.forEach((listener) => {
    try {
      listener(enabled);
    } catch (err) {
      console.error('Error executing SMS config subscriber callback:', err);
    }
  });

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent<{ enabled: boolean }>(SMS_TOGGLE_EVENT, {
          detail: { enabled },
        })
      );
    } catch {
      // Ignore if event dispatch fails in restricted environments
    }
  }
};

/**
 * Persists the SMS toggle state in localStorage and notifies active listeners.
 */
export const setLiveSmsEnabled = (enabled: boolean): void => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SMS_LIVE_STORAGE_KEY, String(enabled));
    }
  } catch (err) {
    console.warn('Unable to write SMS config to localStorage:', err);
  }
  notifySmsListeners(enabled);
};

/**
 * Toggles the current SMS mode between Live Fast2SMS and Demo Mode.
 * Returns the new state.
 */
export const toggleLiveSms = (): boolean => {
  const next = !isLiveSmsEnabled();
  setLiveSmsEnabled(next);
  return next;
};

// Setup cross-tab storage sync once globally
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key === SMS_LIVE_STORAGE_KEY) {
      notifySmsListeners(isLiveSmsEnabled());
    }
  });
}

/**
 * Subscribes to live SMS mode changes.
 * Returns an unsubscribe callback.
 */
export const subscribeToSmsConfig = (listener: SmsListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Returns the formatted display label based on toggle status.
 */
export const getSmsStatusLabel = (enabled: boolean): string => {
  return enabled ? 'Live SMS: ON 🟢' : 'SMS Demo Mode ⚪';
};

/**
 * React hook to observe and toggle SMS mode seamlessly with real-time UI synchronization.
 */
export const useLiveSms = (): {
  isLiveSms: boolean;
  toggleSms: () => boolean;
  setLiveSms: (val: boolean) => void;
  statusLabel: string;
} => {
  const [isLiveSms, setIsLiveSmsState] = useState<boolean>(() => isLiveSmsEnabled());

  useEffect(() => {
    setIsLiveSmsState(isLiveSmsEnabled());
    const unsubscribe = subscribeToSmsConfig((val) => {
      setIsLiveSmsState(val);
    });
    return unsubscribe;
  }, []);

  const toggleSms = useCallback((): boolean => {
    return toggleLiveSms();
  }, []);

  const setLiveSms = useCallback((val: boolean): void => {
    setLiveSmsEnabled(val);
  }, []);

  return {
    isLiveSms,
    toggleSms,
    setLiveSms,
    statusLabel: getSmsStatusLabel(isLiveSms),
  };
};
