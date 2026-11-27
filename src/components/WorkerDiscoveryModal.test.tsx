import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkerDiscoveryModal } from './WorkerDiscoveryModal';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

// Mock speech
vi.mock('../lib/speech', () => ({
  speakText: vi.fn(),
  stopSpeaking: vi.fn(),
  getVoiceAssistanceEnabled: vi.fn(() => true),
  subscribeToVoiceAssistance: vi.fn(() => () => {}),
  getVoiceGuidance: vi.fn(() => 'voice instructions'),
  getWorkerSpeechText: vi.fn(() => 'worker details'),
  subscribeToSpeech: vi.fn(() => () => {}),
}));

// Mock translations
vi.mock('../lib/translations', () => ({
  getTranslation: vi.fn((_lang: string, key: string) => {
    const map: Record<string, string> = {
      skillMatcherTitle: 'Worker Discovery & Matching',
      skillMatcherSub: 'Discover certified skilled workers by trade and location.',
      loginToViewWorkers: 'Login to Browse Verified Workers',
      loginWorkersSub: 'Sign in with your mobile number to discover verified workers, view map locations, and contact local talent.',
      login: 'Login',
      filterByCategory: 'Filter by Trade',
      allCategories: 'All Categories',
      catAgri: 'Agriculture',
      catConst: 'Construction',
      catDaily: 'Daily work',
      catSkilled: 'Skilled self-employed',
      callWorker: 'Call Worker',
      phoneAvailableToRegistered: 'Contact phone available to verified users',
    };
    return map[key] || key;
  }),
  getSuggestedSkillTags: vi.fn(() => []),
}));

// Mock Supabase
vi.mock('../lib/supabase', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      },
      from: vi.fn(),
      rpc: vi.fn(),
    },
  };
});

describe('WorkerDiscoveryModal Component - Secure Access & Pipeline Verification', () => {
  const mockUser = {
    id: 'auth-user-uuid-1',
    email: 'hirer@quickhire.in',
  } as unknown as User;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login prompt and prevents worker queries when user is unauthenticated', async () => {
    const onRequireLogin = vi.fn();
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    render(
      <WorkerDiscoveryModal
        isOpen={true}
        onClose={vi.fn()}
        initialCategory="All"
        initialSkillSearch=""
        user={null}
        onRequireLogin={onRequireLogin}
      />
    );

    await waitFor(() => {
      // Verify login prompt is shown
      expect(screen.getByText('Login to Browse Verified Workers')).toBeInTheDocument();
      expect(
        screen.getByText(/Sign in with your mobile number to discover verified workers/i)
      ).toBeInTheDocument();
    });

    // Verify supabase tables/views were NEVER queried
    expect(supabase.from).not.toHaveBeenCalled();

    // Verify clicking login triggers the callback
    const loginBtn = screen.getByRole('button', { name: /Login/i });
    fireEvent.click(loginBtn);
    expect(onRequireLogin).toHaveBeenCalledTimes(1);
  });

  it('queries public_worker_directory view for authenticated users', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: mockUser } as unknown as Session },
      error: null,
    });

    const mockViewData = [
      {
        id: 'worker-101',
        full_name: 'Baburao Apte',
        category: 'Construction',
        skills: ['Masonry', 'Plastering'],
        experience_years: 12,
        daily_wage: 750,
        average_rating: 4.8,
        is_available: true,
        village: 'Kalyan',
        city: 'Thane',
        district: 'Thane',
        state: 'Maharashtra',
        latitude: 19.2403,
        longitude: 73.1305,
      },
    ];

    // Handle view query
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'public_worker_directory') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: mockViewData, error: null }),
            then: vi.fn((resolve: (val: unknown) => void) => resolve({ data: mockViewData, error: null })),
          }),
        };
      }
      return { select: vi.fn() };
    }) as unknown as typeof supabase.from);

    render(
      <WorkerDiscoveryModal
        isOpen={true}
        onClose={vi.fn()}
        initialCategory="All"
        initialSkillSearch=""
        user={mockUser}
      />
    );

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('public_worker_directory');
      expect(screen.getByText('Baburao Apte')).toBeInTheDocument();
      expect(screen.getByText('Masonry')).toBeInTheDocument();
      expect(screen.getByText('Plastering')).toBeInTheDocument();
    });
  });

  it('falls back to workers and profiles tables with warning if public_worker_directory view errors', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: mockUser } as unknown as Session },
      error: null,
    });

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mockFallbackWorkers = [
      {
        id: 'worker-202',
        category: 'Agriculture',
        skills: ['Harvesting'],
        experience_years: 4,
        average_rating: 4.6,
        is_available: true,
        location: 'Baramati, Pune',
        profiles: {
          id: 'worker-202',
          full_name: 'Ananda Shinde',
          phone_number: '9822000000',
          is_assisted_profile: false,
          village: 'Baramati',
          city: 'Baramati',
          district: 'Pune',
          state: 'Maharashtra',
          daily_wage: 600,
        },
      },
    ];

    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'public_worker_directory') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: { code: '42P01', message: 'relation public_worker_directory does not exist' },
            }),
            then: vi.fn((resolve: (val: unknown) => void) =>
              resolve({
                data: null,
                error: { code: '42P01', message: 'relation public_worker_directory does not exist' },
              })
            ),
          }),
        };
      }
      if (table === 'workers') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: mockFallbackWorkers, error: null }),
              then: vi.fn((resolve: (val: unknown) => void) => resolve({ data: mockFallbackWorkers, error: null })),
            }),
          }),
        };
      }
      return { select: vi.fn() };
    }) as unknown as typeof supabase.from);

    render(
      <WorkerDiscoveryModal
        isOpen={true}
        onClose={vi.fn()}
        initialCategory="All"
        initialSkillSearch=""
        user={mockUser}
      />
    );

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('public_worker_directory');
      expect(supabase.from).toHaveBeenCalledWith('workers');
      expect(screen.getByText('Ananda Shinde')).toBeInTheDocument();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('WorkerDiscoveryModal: public_worker_directory query failed, falling back:'),
        expect.anything()
      );
    });

    consoleWarnSpy.mockRestore();
  });

  it('invokes get_worker_contact_phone RPC and sanitizes authorization error upon calling worker', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: mockUser } as unknown as Session },
      error: null,
    });

    const mockWorkers = [
      {
        id: 'worker-101',
        category: 'Agriculture',
        skills: ['Tractor Driving'],
        experience_years: 5,
        daily_wage: 600,
        experience_description: 'Skilled in tractor repair and harvesting',
        preferred_work_location: 'Nashik',
        is_available: true,
        average_rating: 4.8,
        latitude: 19.9975,
        longitude: 73.7898,
        full_name: 'Pandurang Jadhav',
        is_assisted_profile: false,
        location: 'Nashik, Maharashtra',
        village: 'Ozar',
        city: 'Nashik',
        district: 'Nashik',
        state: 'Maharashtra',
      },
    ];

    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'public_worker_directory') {
        return {
          select: vi.fn().mockReturnValue({
            then: vi.fn((resolve: (val: unknown) => void) => resolve({ data: mockWorkers, error: null })),
          }),
        };
      }
      return { select: vi.fn() };
    }) as unknown as typeof supabase.from);

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: {
        code: '42501',
        message: 'Only authorized employers, admins, or the worker can access this contact.',
        details: '',
        hint: '',
        name: 'PostgrestError',
      },
      count: null,
      status: 403,
      statusText: 'Forbidden',
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>);

    render(
      <WorkerDiscoveryModal
        isOpen={true}
        onClose={vi.fn()}
        initialCategory="All"
        initialSkillSearch=""
        user={mockUser}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Pandurang Jadhav')).toBeInTheDocument();
    });

    // Select worker card to view details
    fireEvent.click(screen.getByText('Pandurang Jadhav'));

    // Verify "Call Worker" button is shown (not raw phone)
    const callBtn = await screen.findByRole('button', { name: /Call/i });
    expect(callBtn).toBeInTheDocument();

    // Click Call Worker
    fireEvent.click(callBtn);

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('get_worker_contact_phone', {
        p_worker_id: 'worker-101',
      });
      // Friendly Option 3 authorization message is displayed
      expect(
        screen.getByText('You need an existing job connection with this worker to access their contact number.')
      ).toBeInTheDocument();
    });

    // Ensure raw error message and DB error code are NOT leaked
    expect(screen.queryByText(/Only authorized employers/)).not.toBeInTheDocument();
    expect(screen.queryByText(/42501/)).not.toBeInTheDocument();
  });
});
