import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isLiveSmsEnabled,
  setLiveSmsEnabled,
  toggleLiveSms,
  subscribeToSmsConfig,
  getSmsStatusLabel,
  SMS_LIVE_STORAGE_KEY,
} from './smsConfig';

describe('smsConfig helper utility', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('reads default live SMS state from environment variable if localStorage is empty', () => {
    // VITE_ENABLE_LIVE_SMS is true in .env
    const isLive = isLiveSmsEnabled();
    expect(typeof isLive).toBe('boolean');
    expect(isLive).toBe(true);
  });

  it('reads override state from localStorage when present', () => {
    localStorage.setItem(SMS_LIVE_STORAGE_KEY, 'false');
    expect(isLiveSmsEnabled()).toBe(false);

    localStorage.setItem(SMS_LIVE_STORAGE_KEY, 'true');
    expect(isLiveSmsEnabled()).toBe(true);
  });

  it('sets and persists live SMS state to localStorage', () => {
    setLiveSmsEnabled(false);
    expect(localStorage.getItem(SMS_LIVE_STORAGE_KEY)).toBe('false');
    expect(isLiveSmsEnabled()).toBe(false);

    setLiveSmsEnabled(true);
    expect(localStorage.getItem(SMS_LIVE_STORAGE_KEY)).toBe('true');
    expect(isLiveSmsEnabled()).toBe(true);
  });

  it('toggles live SMS state between true and false', () => {
    setLiveSmsEnabled(true);
    const toggled1 = toggleLiveSms();
    expect(toggled1).toBe(false);
    expect(isLiveSmsEnabled()).toBe(false);

    const toggled2 = toggleLiveSms();
    expect(toggled2).toBe(true);
    expect(isLiveSmsEnabled()).toBe(true);
  });

  it('notifies subscribers in real-time when SMS mode changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToSmsConfig(listener);

    setLiveSmsEnabled(false);
    expect(listener).toHaveBeenCalledWith(false);

    setLiveSmsEnabled(true);
    expect(listener).toHaveBeenCalledWith(true);

    unsubscribe();
    setLiveSmsEnabled(false);
    // Should not receive call after unsubscription
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('returns correct status labels for UI badge', () => {
    expect(getSmsStatusLabel(true)).toBe('Live SMS: ON 🟢');
    expect(getSmsStatusLabel(false)).toBe('SMS Demo Mode ⚪');
  });
});
