import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OfflineBanner } from './OfflineBanner';

describe('OfflineBanner Component', () => {
  it('renders nothing by default when network is online', () => {
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('displays offline notice when window fires offline event', () => {
    render(<OfflineBanner />);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByRole('complementary', { name: /Offline Mode Notice/i })).toBeInTheDocument();
    expect(screen.getByText(/Offline Mode:/i)).toBeInTheDocument();
    expect(screen.getByText(/Viewing cached data/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('displays connection restored alert when window fires online event after offline', () => {
    render(<OfflineBanner />);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(/Offline Mode:/i)).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByRole('complementary', { name: /Connection Status/i })).toBeInTheDocument();
    expect(screen.getByText(/Connection Restored! Live workforce and job synchronization active/i)).toBeInTheDocument();
  });
});
