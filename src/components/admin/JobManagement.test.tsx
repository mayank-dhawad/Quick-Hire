import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobManagement } from './JobManagement';

// Mock supabase client
vi.mock('../../lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
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

describe('JobManagement Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries jobs and applicant profiles without direct nested joins and renders jobs', async () => {
    const mockJobs = [
      {
        id: 'job-1',
        employer_id: 'emp-1',
        title: 'Agricultural Harvesting',
        category: 'Agriculture',
        required_skills: ['Harvesting'],
        offered_wages: 650,
        description: 'Need assistance with paddy field harvest',
        status: 'open',
        created_at: '2026-11-01T10:00:00Z',
        profiles: { id: 'emp-1', full_name: 'Rajesh Patel', phone_number: '+919876500001', location: 'Nashik' },
        job_records: [
          { id: 'rec-1', worker_id: 'wrk-1', status: 'pending', created_at: '2026-11-01T11:00:00Z' },
        ],
      },
    ];

    const mockWorkerProfiles = [
      { id: 'wrk-1', full_name: 'Suresh Kumar', phone_number: '+919876500002' },
    ];

    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'jobs') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockJobs,
              error: null,
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: mockWorkerProfiles,
              error: null,
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

    render(<JobManagement />);

    expect(screen.getByText(/loading platform jobs/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Agricultural Harvesting')).toBeInTheDocument();
      expect(screen.getByText('Rajesh Patel')).toBeInTheDocument();
    });

    // Verify profiles query was batched for worker_id
    expect(supabase.from).toHaveBeenCalledWith('jobs');
    expect(supabase.from).toHaveBeenCalledWith('profiles');
  });

  it('renders resilient error state with retry button when query fails', async () => {
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'jobs') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database connection timeout' },
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

    render(<JobManagement />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load platform jobs/i)).toBeInTheDocument();
      expect(screen.getByText(/database connection timeout/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });
});
