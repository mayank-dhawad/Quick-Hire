import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import App from '../App';

// Mock Supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
  },
}));

describe('QuickHire Application Routing & Access Isolation', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState(null, '', '/');
  });

  it('renders public QuickHire homepage and User/Worker Login for unauthenticated visitor on root "/"', async () => {
    window.history.pushState(null, '', '/');
    render(<App />);

    // Waits for authChecking screen to resolve
    await waitFor(() => {
      expect(screen.queryByText(/Verifying authentication/i)).not.toBeInTheDocument();
    });

    // Root URL must remain at '/' and never be redirected to '/admin' or '/admin/login'
    expect(window.location.pathname).toBe('/');

    // User/Worker Login button must be visible in public navigation
    expect(screen.getByRole('button', { name: /^Login$/i })).toBeInTheDocument();

    // Must NOT render Admin Security Portal or Admin Dashboard suite
    expect(screen.queryByText(/Administrator Authentication/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Loading Admin Governance Suite/i)).not.toBeInTheDocument();
  });

  it('allows intentional access to "/admin/login" without forcing public visitors into it', async () => {
    window.history.pushState(null, '', '/admin/login');
    render(<App />);

    // Should load the Admin Security Portal
    await waitFor(() => {
      expect(screen.getByText(/Administrator Authentication/i)).toBeInTheDocument();
    });

    expect(window.location.pathname).toBe('/admin/login');

    // Admin authentication features must be present
    expect(screen.getByText(/Public Portal/i)).toBeInTheDocument();
  });

  it('allows admin users with saved session to visit root "/" without forced redirect to "/admin"', async () => {
    // Simulate saved admin user in localStorage
    const mockAdminUser = {
      id: 'admin-uuid-1234',
      email: 'workconnectapk@gmail.com',
      user_metadata: { full_name: 'Platform Administrator' },
    };
    localStorage.setItem('quickhire_user_session', JSON.stringify(mockAdminUser));
    localStorage.setItem('quickhire_user_role', 'admin');

    window.history.pushState(null, '', '/');
    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText(/Verifying authentication/i)).not.toBeInTheDocument();
    });

    // Path must remain root '/' — no forced hijack to '/admin'
    expect(window.location.pathname).toBe('/');
  });
});
