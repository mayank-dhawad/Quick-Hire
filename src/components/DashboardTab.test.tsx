import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DashboardTab, PostedJobItem } from './DashboardTab';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

// Mock supabase client
vi.mock('../lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    },
  };
});

describe('DashboardTab - Worker Ratings & Previously Hired Workers Features', () => {
  const mockUser = {
    id: 'employer-user-uuid-123',
    email: 'employer@test.com',
  } as unknown as User;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Rate Worker" only after the assignment is completed', async () => {
    // Setup supabase mock for reviews & jobs
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'reviews') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        };
      }
      if (table === 'jobs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'job-1',
                    title: 'Wheat Harvesting',
                    category: 'Agriculture',
                    status: 'completed',
                    created_at: '2026-10-20T10:00:00Z',
                    job_records: [
                      {
                        id: 'record-1',
                        status: 'completed',
                        created_at: '2026-10-20T11:00:00Z',
                        work_completed_at: '2026-10-21T09:00:00Z',
                        worker_id: 'worker-uuid-456',
                      },
                    ],
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'worker-uuid-456',
                  full_name: 'Ramesh Patel',
                  phone_number: '9876543210',
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'workers') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'worker-uuid-456',
                  category: 'Agriculture',
                  skills: ['Harvesting', 'Tractor'],
                  average_rating: 4.8,
                  daily_wage: 600,
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'payments') {
        const queryChain: Record<string, unknown> = {};
        queryChain.eq = vi.fn().mockReturnValue(queryChain);
        queryChain.or = vi.fn().mockReturnValue(queryChain);
        queryChain.order = vi.fn().mockResolvedValue({
          data: [],
          error: null,
        });
        return {
          select: vi.fn().mockReturnValue(queryChain),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    }) as unknown as typeof supabase.from);

    const mockPostedJobs: PostedJobItem[] = [
      {
        id: 'job-1',
        title: 'Wheat Harvesting',
        category: 'Agriculture',
        offered_wages: 600,
        description: 'Harvesting wheat',
        status: 'completed',
        created_at: '2026-10-20T10:00:00Z',
        job_records: [
          {
            id: 'record-1',
            worker_id: 'worker-uuid-456',
            status: 'completed',
            created_at: '2026-10-20T11:00:00Z',
            work_completed_at: '2026-10-21T09:00:00Z',
            profiles: {
              id: 'worker-uuid-456',
              full_name: 'Ramesh Patel',
              phone_number: '9876543210',
            },
          },
        ],
      },
    ];

    render(
      <DashboardTab
        user={mockUser}
        userRole="employer"
        myPostedJobs={mockPostedJobs}
        loadingMyJobs={false}
        onNavigateTab={vi.fn()}
        onRequireLogin={vi.fn()}
        onMarkJobCompleted={vi.fn()}
        onBrowseWorkers={vi.fn()}
        onPayWage={vi.fn()}
      />
    );

    // Verify Rate Worker button is visible on the completed job's applicant card
    await waitFor(() => {
      expect(screen.getByText(/Rate Worker/i)).toBeInTheDocument();
    });

    // Verify Previously Hired Workers section header is rendered inside employer dashboard
    expect(screen.getByText(/Previously Hired Workers/i)).toBeInTheDocument();

    // Verify the previously hired worker Ramesh Patel is listed with hire count and rating
    await waitFor(() => {
      expect(screen.getAllByText(/Ramesh Patel/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/1 hires/i)).toBeInTheDocument();
      expect(screen.getByText(/Hire Again/i)).toBeInTheDocument();
    });
  });

  it('triggers "onRehireWorker" pre-selection when "Hire Again" is clicked', async () => {
    const handleRehireWorker = vi.fn();

    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'jobs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'job-1',
                    title: 'Masonry Wall Repair',
                    category: 'Construction',
                    status: 'completed',
                    created_at: '2026-10-15T10:00:00Z',
                    job_records: [
                      {
                        id: 'record-10',
                        status: 'hired',
                        created_at: '2026-10-15T11:00:00Z',
                        worker_id: 'worker-mason-1',
                      },
                    ],
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'worker-mason-1',
                  full_name: 'Suresh Kumar',
                  phone_number: '9123456789',
                  daily_wage: 750,
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'workers') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'worker-mason-1',
                  category: 'Construction',
                  skills: ['Masonry', 'Plastering'],
                  average_rating: 4.9,
                  daily_wage: 750,
                },
              ],
              error: null,
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    }) as unknown as typeof supabase.from);

    render(
      <DashboardTab
        user={mockUser}
        userRole="employer"
        myPostedJobs={[]}
        loadingMyJobs={false}
        onNavigateTab={vi.fn()}
        onRequireLogin={vi.fn()}
        onMarkJobCompleted={vi.fn()}
        onBrowseWorkers={vi.fn()}
        onPayWage={vi.fn()}
        onRehireWorker={handleRehireWorker}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Suresh Kumar')).toBeInTheDocument();
    });

    const hireAgainBtn = screen.getByText(/Hire Again/i);
    fireEvent.click(hireAgainBtn);

    expect(handleRehireWorker).toHaveBeenCalledTimes(1);
    expect(handleRehireWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'worker-mason-1',
        name: 'Suresh Kumar',
        category: 'Construction',
        skills: ['Masonry', 'Plastering'],
        wage: 750,
      })
    );
  });

  it('loads worker private banking details from profile_private_details and selects safe columns from profiles', async () => {
    const selectedColumns: string[] = [];
    const tablesQueried: string[] = [];

    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      tablesQueried.push(table);
      if (table === 'profiles') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            selectedColumns.push(cols);
            return {
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'worker-user-999',
                    full_name: 'Anita Devi',
                    phone_number: '9876543210',
                    role: 'worker',
                    account_status: 'active',
                  },
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      if (table === 'profile_private_details') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  bank_name: 'SBI',
                  bank_account_no: '123456789012',
                  bank_ifsc: 'SBIN0001234',
                  upi_id: 'anita@oksbi',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }) as unknown as typeof supabase.from);

    render(
      <DashboardTab
        user={{ id: 'worker-user-999', email: 'anita@example.com' } as unknown as User}
        userRole="worker"
        myPostedJobs={[]}
        loadingMyJobs={false}
        onNavigateTab={vi.fn()}
        onRequireLogin={vi.fn()}
        onMarkJobCompleted={vi.fn()}
        onBrowseWorkers={vi.fn()}
        onPayWage={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(tablesQueried).toContain('profile_private_details');
    });

    // Ensure profiles query selected safe non-private columns only
    const profilesQuery = selectedColumns.join(' ');
    expect(profilesQuery).not.toContain('bank_name');
    expect(profilesQuery).not.toContain('bank_account_no');
    expect(profilesQuery).not.toContain('emergency_contact_phone');
  });
});
