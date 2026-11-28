import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import App from '../App';
import { supabase } from '../lib/supabase';

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
      in: vi.fn().mockReturnThis(),
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

describe('Mobile Navigation, Account Drawer & Responsiveness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState(null, '', '/');
  });

  it('renders the public launch page instead of the authenticated mobile drawer for guests', async () => {
    render(<App />);

    expect(await screen.findByRole('button', { name: /^Login$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Register/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Toggle navigation menu/i)).not.toBeInTheDocument();
  });

  it('renders authenticated user profile card with role badge in mobile drawer when logged in', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: {
        session: {
          user: {
            id: 'worker-user-123',
            email: 'ramesh.worker@example.com',
            user_metadata: { full_name: 'Ramesh Patil' },
          },
        } as unknown as import('@supabase/supabase-js').Session,
      },
      error: null,
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'worker-user-123', role: 'worker', account_status: 'active' },
            error: null,
          }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as unknown as ReturnType<typeof supabase.from>;
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText(/Verifying authentication/i)).not.toBeInTheDocument();
    });

    const hamburgerBtn = screen.getByLabelText(/Toggle navigation menu/i);
    fireEvent.click(hamburgerBtn);

    // Check that user full name and role badge are displayed
    await waitFor(() => {
      expect(screen.getByText(/Ramesh Patil/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Worker \/ कामगार/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Logged In/i)).toBeInTheDocument();
    });
  });

  it('renders employer mobile navigation with role-authorized tabs', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: {
        session: {
          user: {
            id: 'employer-user-456',
            email: 'employer@example.com',
            user_metadata: { full_name: 'Sita Employer' },
          },
        } as unknown as import('@supabase/supabase-js').Session,
      },
      error: null,
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      const queryBuilder: Record<string, ReturnType<typeof vi.fn>> = {
        select: vi.fn(() => queryBuilder),
        eq: vi.fn(() => queryBuilder),
        in: vi.fn(() => queryBuilder),
        order: vi.fn(() => queryBuilder),
        maybeSingle: vi.fn().mockResolvedValue({
          data: table === 'profiles'
            ? { id: 'employer-user-456', role: 'employer', account_status: 'active', can_manage_rentals: false }
            : null,
          error: null,
        }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn(() => queryBuilder),
      };
      return queryBuilder as unknown as ReturnType<typeof supabase.from>;
    });

    render(<App />);

    const mobileNav = await screen.findByRole('navigation', { name: /Mobile Navigation/i });
    expect(mobileNav).toBeInTheDocument();
    expect(mobileNav).toHaveTextContent(/Home/i);
    expect(mobileNav).toHaveTextContent(/Workers/i);
    expect(mobileNav).toHaveTextContent(/Equipment/i);
    expect(mobileNav).toHaveTextContent(/Post a Job/i);
    expect(mobileNav).toHaveTextContent(/Dashboard/i);

    fireEvent.click(within(mobileNav).getByRole('button', { name: /Workers/i }));
    await waitFor(() => {
      expect(screen.getAllByText(/Workers Directory/i).length).toBeGreaterThan(0);
    });
  });
});
