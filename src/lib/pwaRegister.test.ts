import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerServiceWorker, unregisterServiceWorker } from './pwaRegister';

describe('pwaRegister utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('safely handles environments where navigator.serviceWorker is undefined', async () => {
    const originalNavigator = global.navigator;
    // Emulate environment without serviceWorker support
    Object.defineProperty(global, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });

    const result = await registerServiceWorker();
    expect(result).toBeNull();

    // Restore
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('registers /sw.js when serviceWorker is available on navigator', async () => {
    const mockRegister = vi.fn().mockResolvedValue({
      addEventListener: vi.fn(),
      waiting: null,
      installing: null,
      scope: '/',
    });

    Object.defineProperty(global.navigator, 'serviceWorker', {
      value: {
        register: mockRegister,
        addEventListener: vi.fn(),
      },
      writable: true,
      configurable: true,
    });

    const regPromise = registerServiceWorker();
    // Fire window load event
    window.dispatchEvent(new Event('load'));

    const reg = await regPromise;
    expect(mockRegister).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(reg).toBeTruthy();
  });

  it('unregisters active service worker registrations', async () => {
    const mockUnregister = vi.fn().mockResolvedValue(true);
    Object.defineProperty(global.navigator, 'serviceWorker', {
      value: {
        getRegistrations: vi.fn().mockResolvedValue([{ unregister: mockUnregister }]),
      },
      writable: true,
      configurable: true,
    });

    const result = await unregisterServiceWorker();
    expect(result).toBe(true);
    expect(mockUnregister).toHaveBeenCalled();
  });
});

