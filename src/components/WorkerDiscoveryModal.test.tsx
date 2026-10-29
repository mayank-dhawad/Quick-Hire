import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkerDiscoveryModal } from './WorkerDiscoveryModal';
import { supabase } from '../lib/supabase';

// Mock speech
vi.mock('../lib/speech', () => ({
  speakText: vi.fn(),
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
    },
  };
});

describe('WorkerDiscoveryModal Component - Secure Access & Pipeline Verification', () => {
  const mockUser: any = {
    id: 'auth-user-uuid-1',
    email: 'hirer@quickhire.in',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login prompt and prevents worker queries when user is unauthenticated', async () => {
    const onRequireLogin = vi.fn();
    (supabase.auth.getSession as any).mockResolvedValue({
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
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { user: mockUser } },
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

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: mockViewData, error: null }),
      then: vi.fn((resolve: any) => resolve({ data: mockViewData, error: null })),
    });

    // Handle view query
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'public_worker_directory') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: mockViewData, error: null }),
            then: vi.fn((resolve: any) => resolve({ data: mockViewData, error: null })),
          }),
        };
      }
      return { select: vi.fn() };
    });

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
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { user: mockUser } },
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

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'public_worker_directory') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: { code: '42P01', message: 'relation public_worker_directory does not exist' },
            }),
            then: vi.fn((resolve: any) =>
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
              then: vi.fn((resolve: any) => resolve({ data: mockFallbackWorkers, error: null })),
            }),
          }),
        };
      }
      return { select: vi.fn() };
    });

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
});
