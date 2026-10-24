import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../App';

describe('Zero OTP Disclosure & Production Security Guards', () => {
  it('does not render any demo SMS toggle button in the application', () => {
    render(<App />);

    // Assert that the old demo toggle button does NOT exist anywhere in the UI
    expect(screen.queryByRole('button', { name: /Toggle Fast2SMS Provider Mode/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/SMS Demo Mode/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Live SMS: ON/i)).not.toBeInTheDocument();
  });

  it('guarantees that no demo OTP or auto-fill buttons appear in initial view', () => {
    render(<App />);

    expect(screen.queryByText(/Demo OTP:/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Auto-fill/i })).not.toBeInTheDocument();
  });
});
