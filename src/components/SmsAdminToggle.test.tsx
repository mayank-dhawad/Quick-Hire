import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SmsAdminToggleBadge } from '../App';
import { setLiveSmsEnabled, SMS_LIVE_STORAGE_KEY } from '../lib/smsConfig';

describe('SmsAdminToggleBadge in App.tsx', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders "Live SMS: ON 🟢" when live SMS is enabled by default', () => {
    setLiveSmsEnabled(true);
    render(<SmsAdminToggleBadge />);
    expect(screen.getByText('Live SMS: ON 🟢')).toBeInTheDocument();
  });

  it('renders "SMS Demo Mode ⚪" when live SMS is disabled', () => {
    setLiveSmsEnabled(false);
    render(<SmsAdminToggleBadge />);
    expect(screen.getByText('SMS Demo Mode ⚪')).toBeInTheDocument();
  });

  it('toggles SMS state on click and fires onToggled callback', () => {
    setLiveSmsEnabled(true);
    const onToggledMock = vi.fn();
    render(<SmsAdminToggleBadge onToggled={onToggledMock} />);

    const badge = screen.getByRole('button', { name: /Toggle Fast2SMS Provider Mode/i });
    expect(screen.getByText('Live SMS: ON 🟢')).toBeInTheDocument();

    // Click to toggle to Demo mode
    fireEvent.click(badge);
    expect(onToggledMock).toHaveBeenCalledWith(false);
    expect(localStorage.getItem(SMS_LIVE_STORAGE_KEY)).toBe('false');
    expect(screen.getByText('SMS Demo Mode ⚪')).toBeInTheDocument();

    // Click to toggle back to Live mode
    fireEvent.click(badge);
    expect(onToggledMock).toHaveBeenCalledWith(true);
    expect(localStorage.getItem(SMS_LIVE_STORAGE_KEY)).toBe('true');
    expect(screen.getByText('Live SMS: ON 🟢')).toBeInTheDocument();
  });
});
