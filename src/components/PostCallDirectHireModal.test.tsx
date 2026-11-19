import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PostCallDirectHireModal, DirectHireWorkerInfo } from './PostCallDirectHireModal';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => {
  const insertMock = vi.fn();
  const selectMock = vi.fn();
  const singleMock = vi.fn();
  const eqMock = vi.fn();

  const queryBuilder = {
    select: selectMock,
    insert: insertMock,
    upsert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockResolvedValue({ error: null }),
    eq: eqMock,
    single: singleMock,
  };

  selectMock.mockReturnValue(queryBuilder);
  insertMock.mockReturnValue(queryBuilder);
  eqMock.mockReturnValue(queryBuilder);
  singleMock.mockResolvedValue({
    data: { id: 'test-profile-id', full_name: 'Test Employer' },
    error: null,
  });

  return {
    supabase: {
      from: vi.fn(() => queryBuilder),
      rpc: vi.fn(),
    },
  };
});

describe('PostCallDirectHireModal (Workflow B — Direct Phone Hiring)', () => {
  const mockWorker: DirectHireWorkerInfo = {
    id: 'worker-123',
    full_name: 'Ramesh Patel',
    category: 'Agriculture',
    daily_wage: 600,
    phone_number: '9876543210',
    village: 'Rampur',
    city: 'Pune',
  };

  const mockUser = {
    id: 'employer-456',
    email: 'employer@test.com',
    phone: '9123456789',
    user_metadata: { full_name: 'Suresh Patil' },
  } as unknown as User;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the initial prompt with 3 simple options after phone call', () => {
    render(
      <PostCallDirectHireModal
        isOpen={true}
        onClose={vi.fn()}
        worker={mockWorker}
        currentUser={mockUser}
        onRequireLogin={vi.fn()}
      />
    );

    expect(screen.getByText(/Did the worker agree to take this job\?/i)).toBeDefined();
    expect(screen.getByText(/Yes, worker agreed/i)).toBeDefined();
    expect(screen.getByText(/No, worker declined/i)).toBeDefined();
    expect(screen.getByText(/Not decided yet/i)).toBeDefined();
  });

  it('handles "No, worker declined" without creating any confirmed assignment', () => {
    const handleClose = vi.fn();
    render(
      <PostCallDirectHireModal
        isOpen={true}
        onClose={handleClose}
        worker={mockWorker}
        currentUser={mockUser}
        onRequireLogin={vi.fn()}
      />
    );

    const declinedBtn = screen.getByText(/No, worker declined/i);
    fireEvent.click(declinedBtn);

    expect(screen.getByText(/Recorded: Worker Declined/i)).toBeDefined();
    expect(screen.getByText(/No confirmed assignment was created/i)).toBeDefined();

    // Supabase job insert should NOT be called
    expect(supabase.from).not.toHaveBeenCalledWith('jobs');
  });

  it('handles "Not decided yet" without creating any confirmed assignment', () => {
    render(
      <PostCallDirectHireModal
        isOpen={true}
        onClose={vi.fn()}
        worker={mockWorker}
        currentUser={mockUser}
        onRequireLogin={vi.fn()}
      />
    );

    const undecidedBtn = screen.getByText(/Not decided yet/i);
    fireEvent.click(undecidedBtn);

    expect(screen.getByText(/Kept as Pending/i)).toBeDefined();
    expect(supabase.from).not.toHaveBeenCalledWith('jobs');
  });

  it('handles "Yes, worker agreed" and transitions to essential job details pre-filled', () => {
    render(
      <PostCallDirectHireModal
        isOpen={true}
        onClose={vi.fn()}
        worker={mockWorker}
        currentUser={mockUser}
        onRequireLogin={vi.fn()}
      />
    );

    const agreedBtn = screen.getByText(/Yes, worker agreed/i);
    fireEvent.click(agreedBtn);

    expect(screen.getByText(/Confirm Essential Job Details/i)).toBeDefined();
    expect(screen.getByDisplayValue('600')).toBeDefined(); // Prefilled wage
    expect(screen.getByDisplayValue(/Agriculture Work Assistance/i)).toBeDefined(); // Prefilled title
    expect(screen.getByText(/Employer-Reported Verbal Agreement/i)).toBeDefined(); // Transparency notice
  });

  it('creates direct phone hiring job and assignment upon confirmation', async () => {
    const onAssignmentCreated = vi.fn();

    // Mock successful Supabase inserts
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      const qb = {
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (table === 'profiles') {
            return Promise.resolve({ data: { id: mockUser.id }, error: null });
          }
          if (table === 'jobs') {
            return Promise.resolve({
              data: {
                id: 'job-789',
                title: 'Agriculture Work Assistance',
                hiring_source: 'direct_phone',
              },
              error: null,
            });
          }
          if (table === 'job_records') {
            return Promise.resolve({
              data: {
                id: 'rec-101',
                job_id: 'job-789',
                worker_id: mockWorker.id,
                status: 'hired',
                agreement_evidence_type: 'employer_reported_verbal_agreement',
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
        insert: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        eq: vi.fn().mockReturnThis(),
      };
      return qb as unknown as ReturnType<typeof supabase.from>;
    });

    render(
      <PostCallDirectHireModal
        isOpen={true}
        onClose={vi.fn()}
        worker={mockWorker}
        currentUser={mockUser}
        onAssignmentCreated={onAssignmentCreated}
        onRequireLogin={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText(/Yes, worker agreed/i));

    const submitBtn = screen.getByText(/Confirm & Create Direct Assignment/i);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Direct Hire Confirmed!/i)).toBeDefined();
    });

    expect(onAssignmentCreated).toHaveBeenCalled();
  });
});

