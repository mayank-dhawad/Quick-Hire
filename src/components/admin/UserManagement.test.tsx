import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserManagement } from './UserManagement';

// Mock supabase client
vi.mock('../../lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
    },
  };
});

// Mock adminAuth
vi.mock('../../lib/adminAuth', () => ({
  logAdminAction: vi.fn().mockResolvedValue({ success: true }),
  getStoredAdminSession: vi.fn().mockReturnValue({
    user: { id: 'admin-1' },
    adminRole: 'super_admin',
  }),
}));

import { supabase } from '../../lib/supabase';

describe('UserManagement Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
  });

  it('handles workers as either array or single object and renders users correctly', async () => {
    const mockProfiles = [
      {
        id: 'usr-1',
        role: 'worker',
        full_name: 'Ramesh Yadav',
        phone_number: '+919876500001',
        location: 'Solapur, Maharashtra',
        village: 'Khandala',
        district: 'Solapur',
        state: 'Maharashtra',
        account_status: 'active',
        created_at: '2026-11-01T10:00:00Z',
        category: null,
        skills: null,
        daily_wage: 650,
        // PostgREST 1:many reverse relation returns array
        workers: [
          {
            category: 'Agriculture',
            skills: ['Tractor Driving', 'Harvesting'],
            experience_years: 5,
            average_rating: 4.8,
            is_available: true,
          },
        ],
      },
      {
        id: 'usr-2',
        role: 'employer',
        full_name: 'Anita Desai',
        phone_number: '+919876500002',
        location: 'Pune, Maharashtra',
        account_status: 'active',
        created_at: '2026-11-02T10:00:00Z',
        workers: null,
      },
    ];

    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockProfiles,
              error: null,
            }),
          }),
        };
      }
      if (table === 'profile_private_details') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    }) as unknown as typeof supabase.from);

    render(<UserManagement />);

    expect(screen.getByText(/loading platform users/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Ramesh Yadav')).toBeInTheDocument();
      expect(screen.getByText('Anita Desai')).toBeInTheDocument();
      // Verifies wage comes from profile even when workers has no daily_wage
      expect(screen.getByText('₹650/day')).toBeInTheDocument();
      // Verifies domain resolution from normalized workers[0].category
      expect(screen.getAllByText('Agriculture').length).toBeGreaterThanOrEqual(2);
      expect(supabase.from).not.toHaveBeenCalledWith('profile_private_details');
      expect(supabase.rpc).toHaveBeenCalledWith('get_admin_profile_settlement_status', {
        p_profile_ids: ['usr-1', 'usr-2'],
      });
    });
  });

  it('correctly retrieves daily wage from profile and ensures workers.daily_wage is not queried', async () => {
    let capturedSelect = '';
    const mockProfiles = [
      {
        id: 'usr-w1',
        role: 'worker',
        full_name: 'Govind Shinde',
        phone_number: '+919876500003',
        location: 'Satara, Maharashtra',
        account_status: 'active',
        created_at: '2026-11-01T10:00:00Z',
        daily_wage: 750, // daily_wage exists in profiles
        workers: [
          {
            category: 'Agriculture',
            skills: ['Harvesting'],
            experience_years: 4,
            average_rating: 4.9,
            is_available: true,
            // Notice: NO daily_wage in workers table
          },
        ],
      },
    ];

    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn((sel: string) => {
            capturedSelect = sel;
            return {
              order: vi.fn().mockResolvedValue({
                data: mockProfiles,
                error: null,
              }),
            };
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    }) as unknown as typeof supabase.from);

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Govind Shinde')).toBeInTheDocument();
      expect(screen.getByText('₹750/day')).toBeInTheDocument();
    });

    // Ensure select string queries daily_wage from profiles, and NOT from workers
    expect(capturedSelect).toContain('daily_wage');
    expect(capturedSelect).not.toMatch(/workers\s*\([^)]*daily_wage/);
  });

  it('renders resilient error state with retry button when query fails', async () => {
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Failed to fetch profiles due to network error' },
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    }) as unknown as typeof supabase.from);

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load platform users/i)).toBeInTheDocument();
      expect(screen.getByText(/failed to fetch profiles due to network error/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });
});
