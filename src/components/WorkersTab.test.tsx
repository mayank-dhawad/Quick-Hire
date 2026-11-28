import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkersTab } from './WorkersTab';
import { WorkerItem } from './WorkerDiscoveryModal';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// Mock speech and translations
vi.mock('../lib/speech', () => ({
  speakText: vi.fn(),
  stopSpeaking: vi.fn(),
  getVoiceAssistanceEnabled: vi.fn(() => true),
  subscribeToVoiceAssistance: vi.fn(() => () => {}),
  getVoiceGuidance: vi.fn(() => 'voice instructions'),
  getWorkerSpeechText: vi.fn(() => 'worker details'),
  subscribeToSpeech: vi.fn(() => () => {}),
}));

// Mock geocoding library
vi.mock('../lib/geocoding', () => ({
  geocodeAddress: vi.fn(async (input: string) => {
    if (input.toLowerCase().includes('nagpur')) {
      return {
        latitude: 21.1458,
        longitude: 79.0882,
        displayName: 'Nagpur, Maharashtra, India',
      };
    }
    if (input.toLowerCase().includes('pune')) {
      return {
        latitude: 18.5204,
        longitude: 73.8567,
        displayName: 'Pune, Maharashtra, India',
      };
    }
    return null;
  }),
  calculateHaversineDistanceKm: vi.fn((...args: number[]) => {
    const [lat1, lon1, lat2, lon2] = args;
    if (Math.abs(lat1 - lat2) < 0.001 && Math.abs(lon1 - lon2) < 0.001) return 0.0;
    if (lat2 === 18.5204) return 0.0;
    if (lat2 === 18.8256) return 60.5;
    return 120.0;
  }),
  resolveLocalityCoordinates: vi.fn((input: unknown) => {
    const str = typeof input === 'string' ? input : '';
    if (str.toLowerCase().includes('nagpur')) {
      return { latitude: 21.1458, longitude: 79.0882, displayName: 'Nagpur, Maharashtra' };
    }
    if (str.toLowerCase().includes('shirur')) {
      return { latitude: 18.8256, longitude: 74.3789, displayName: 'Shirur, Pune, Maharashtra' };
    }
    if (str.toLowerCase().includes('pune')) {
      return { latitude: 18.5204, longitude: 73.8567, displayName: 'Pune, Maharashtra' };
    }
    return null;
  }),
  getSavedPreferredLocation: vi.fn(() => null),
  savePreferredLocation: vi.fn(),
  getRecentLocations: vi.fn(() => [
    { lat: 18.5204, lon: 73.8567, label: 'Pune', radiusKm: 25 },
    { lat: 21.1458, lon: 79.0882, label: 'Nagpur', radiusKm: 50 },
  ]),
  saveRecentLocation: vi.fn(),
}));

// Mock Leaflet WorkersMapView to avoid WebGL / Canvas issues in Node environment
vi.mock('./WorkersMapView', () => ({
  WorkersMapView: ({
    centerLat,
    centerLon,
    centerLabel,
    workers,
    onSelectLocation,
    onRefreshAvailability,
  }: {
    centerLat?: number;
    centerLon?: number;
    centerLabel?: string;
    workers?: WorkerItem[];
    onSelectLocation?: (lat: number, lon: number, name: string) => void;
    onRefreshAvailability?: () => void;
  }) => (
    <div data-testid="mock-workers-map">
      <span>Workers Map View</span>
      <div data-testid="map-center-coords">{centerLat},{centerLon}</div>
      <div data-testid="map-center-label">{centerLabel}</div>
      <div data-testid="map-workers-count">{workers ? workers.length : 0}</div>
      <button onClick={() => onSelectLocation && onSelectLocation(18.5204, 73.8567, 'Mock Selected Point')}>
        Mock Select Point
      </button>
      <button onClick={() => onRefreshAvailability && onRefreshAvailability()}>
        Mock Refresh Availability
      </button>
    </div>
  ),
}));

// Mock Supabase RPC & Database updates
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(async (fnName: string) => {
      if (fnName === 'get_worker_contact_phone') {
        return { data: { phone_number: '9876543210', remaining_calls: 14 }, error: null };
      }
      return { data: null, error: null };
    }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
  },
}));

describe('WorkersTab - Nearby Workers Search Feature', () => {
  const mockUser = { id: 'test-user-uuid-1', email: 'test@example.com' } as unknown as User;

  const mockWorkers: WorkerItem[] = [
    {
      id: 'worker-1',
      category: 'Agriculture',
      skills: ['Harvesting', 'Tractor Driver'],
      experience_years: 5,
      daily_wage: 600,
      average_rating: 4.9,
      is_available: true,
      latitude: 18.5204, // Pune (~0 km from search)
      longitude: 73.8567,
      profiles: {
        id: 'worker-1',
        full_name: 'Dnyaneshwar Shinde',
        phone_number: '9876543210',
        is_assisted_profile: false,
        village: 'Hadapsar',
        district: 'Pune',
        state: 'Maharashtra',
      },
    },
    {
      id: 'worker-2',
      category: 'Construction',
      skills: ['Masonry', 'Plastering'],
      experience_years: 3,
      daily_wage: 700,
      average_rating: 4.7,
      is_available: true,
      latitude: 18.8256, // Shirur (~60.5 km from search)
      longitude: 74.3789,
      profiles: {
        id: 'worker-2',
        full_name: 'Santosh Gaikwad',
        phone_number: '9876543211',
        is_assisted_profile: false,
        village: 'Shirur',
        district: 'Pune',
        state: 'Maharashtra',
      },
    },
    {
      id: 'worker-3',
      category: 'Agriculture',
      skills: ['Weeding'],
      experience_years: 2,
      daily_wage: 500,
      average_rating: 4.5,
      is_available: true,
      latitude: null, // No coordinates
      longitude: null,
      profiles: {
        id: 'worker-3',
        full_name: 'Ramesh NoCoords',
        phone_number: '9876543212',
        is_assisted_profile: false,
        village: 'Remote Village',
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all workers normally when no location search or radius filter is active', () => {
    render(
      <WorkersTab
        workersLoading={false}
        selectedCategory="All"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        filteredWorkers={mockWorkers}
        user={mockUser}
        onRequireLogin={vi.fn()}
        onRegisterSkillProfile={vi.fn()}
        onOpenWorkerDiscovery={vi.fn()}
      />
    );

    expect(screen.getByText('Dnyaneshwar Shinde')).toBeInTheDocument();
    expect(screen.getByText('Santosh Gaikwad')).toBeInTheDocument();
    expect(screen.getByText('Ramesh NoCoords')).toBeInTheDocument();
    expect(screen.getByText('Map location not set')).toBeInTheDocument();
    expect(screen.getByText('Search Nearby Workers')).toBeInTheDocument();
  });

  it('performs location geocoding and displays distance badges', async () => {
    render(
      <WorkersTab
        workersLoading={false}
        selectedCategory="All"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        filteredWorkers={mockWorkers}
        user={mockUser}
        onRequireLogin={vi.fn()}
        onRegisterSkillProfile={vi.fn()}
        onOpenWorkerDiscovery={vi.fn()}
      />
    );

    const locInput = screen.getByPlaceholderText(/Enter village, town, or district/i);
    fireEvent.change(locInput, { target: { value: 'Pune' } });

    const searchBtn = screen.getByText('Find Nearby');
    fireEvent.click(searchBtn);

    // Expect distance badge for Dnyaneshwar (0 km away)
    await waitFor(() => {
      expect(screen.getByText(/0 km away/i)).toBeInTheDocument();
    });
  });

  it('filters workers by radius (excludes workers exceeding radius and workers without coordinates)', async () => {
    render(
      <WorkersTab
        workersLoading={false}
        selectedCategory="All"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        filteredWorkers={mockWorkers}
        user={mockUser}
        onRequireLogin={vi.fn()}
        onRegisterSkillProfile={vi.fn()}
        onOpenWorkerDiscovery={vi.fn()}
      />
    );

    const locInput = screen.getByPlaceholderText(/Enter village, town, or district/i);
    fireEvent.change(locInput, { target: { value: 'Pune' } });
    fireEvent.click(screen.getByText('Find Nearby'));

    // Select 25 km radius chip
    const radius25Btn = await screen.findByRole('button', { name: '25 km' });
    fireEvent.click(radius25Btn);

    // Dnyaneshwar is at 0 km -> should be shown
    expect(screen.getByText('Dnyaneshwar Shinde')).toBeInTheDocument();

    // Santosh is at 60.5 km -> should be excluded by 25 km filter
    expect(screen.queryByText('Santosh Gaikwad')).not.toBeInTheDocument();

    // Ramesh has no coordinates -> should be excluded from radius-filtered search
    expect(screen.queryByText('Ramesh NoCoords')).not.toBeInTheDocument();
  });

  it('toggles collapsible map view on and off', () => {
    render(
      <WorkersTab
        workersLoading={false}
        selectedCategory="All"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        filteredWorkers={mockWorkers}
        user={mockUser}
        onRequireLogin={vi.fn()}
        onRegisterSkillProfile={vi.fn()}
        onOpenWorkerDiscovery={vi.fn()}
      />
    );

    const mapToggleBtn = screen.getByText(/Map View/i);
    fireEvent.click(mapToggleBtn);

    expect(screen.getByTestId('mock-workers-map')).toBeInTheDocument();

    // Toggle off
    const hideMapBtn = screen.getByText(/Hide Map/i);
    fireEvent.click(hideMapBtn);

    expect(screen.queryByTestId('mock-workers-map')).not.toBeInTheDocument();
  });

  it('handles "Use My Location" (browser GPS) to find nearby workers', async () => {
    const mockGeolocation = {
      getCurrentPosition: vi.fn().mockImplementation((success) =>
        success({
          coords: {
            latitude: 18.5204,
            longitude: 73.8567,
          },
        })
      ),
    };
    Object.defineProperty(navigator, 'geolocation', { value: mockGeolocation, writable: true, configurable: true });

    render(
      <WorkersTab
        workersLoading={false}
        selectedCategory="All"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        filteredWorkers={mockWorkers}
        user={mockUser}
        onRequireLogin={vi.fn()}
        onRegisterSkillProfile={vi.fn()}
        onOpenWorkerDiscovery={vi.fn()}
      />
    );

    const gpsBtn = screen.getByTitle(/Use My Location/i);
    fireEvent.click(gpsBtn);

    expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByTestId('mock-workers-map')).toBeInTheDocument();
    });
  });

  it('triggers onRefreshWorkers on manual availability refresh', () => {
    const mockRefresh = vi.fn();
    render(
      <WorkersTab
        workersLoading={false}
        selectedCategory="All"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        filteredWorkers={mockWorkers}
        user={mockUser}
        onRequireLogin={vi.fn()}
        onRegisterSkillProfile={vi.fn()}
        onOpenWorkerDiscovery={vi.fn()}
        onRefreshWorkers={mockRefresh}
      />
    );

    const refreshBtn = screen.getByTitle(/Refresh Workers/i);
    fireEvent.click(refreshBtn);

    expect(mockRefresh).toHaveBeenCalled();
  });

  describe('Map and Directory Synchronization & Geocoding Persistence', () => {
    it('automatically moves map center to searched city (Nagpur) when search query contains Nagpur', async () => {
      render(
        <WorkersTab
          workersLoading={false}
          selectedCategory="All"
          onSelectCategory={vi.fn()}
          searchQuery="Nagpur, Maharashtra"
          onSearchQueryChange={vi.fn()}
          filteredWorkers={mockWorkers}
          user={mockUser}
          onRequireLogin={vi.fn()}
          onRegisterSkillProfile={vi.fn()}
          onOpenWorkerDiscovery={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('mock-workers-map')).toBeInTheDocument();
        expect(screen.getByTestId('map-center-coords')).toHaveTextContent('21.1458,79.0882');
        expect(screen.getByTestId('map-center-label')).toHaveTextContent('Nagpur, Maharashtra');
      });
    });

    it('updates map center from Nagpur to Pune when search query changes', async () => {
      const { rerender } = render(
        <WorkersTab
          workersLoading={false}
          selectedCategory="All"
          onSelectCategory={vi.fn()}
          searchQuery="Nagpur, Maharashtra"
          onSearchQueryChange={vi.fn()}
          filteredWorkers={mockWorkers}
          user={mockUser}
          onRequireLogin={vi.fn()}
          onRegisterSkillProfile={vi.fn()}
          onOpenWorkerDiscovery={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('map-center-coords')).toHaveTextContent('21.1458,79.0882');
      });

      rerender(
        <WorkersTab
          workersLoading={false}
          selectedCategory="All"
          onSelectCategory={vi.fn()}
          searchQuery="Pune, Maharashtra"
          onSearchQueryChange={vi.fn()}
          filteredWorkers={mockWorkers}
          user={mockUser}
          onRequireLogin={vi.fn()}
          onRegisterSkillProfile={vi.fn()}
          onOpenWorkerDiscovery={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('map-center-coords')).toHaveTextContent('18.5204,73.8567');
      });
    });

    it('displays distinct counts for directory found and plotted on map', () => {
      render(
        <WorkersTab
          workersLoading={false}
          selectedCategory="All"
          onSelectCategory={vi.fn()}
          searchQuery=""
          onSearchQueryChange={vi.fn()}
          filteredWorkers={mockWorkers}
          user={mockUser}
          onRequireLogin={vi.fn()}
          onRegisterSkillProfile={vi.fn()}
          onOpenWorkerDiscovery={vi.fn()}
        />
      );

      expect(screen.getByText('4.9')).toBeInTheDocument();
      // Directory summary bar shows total workers found
      expect(screen.getByText('3 workers found')).toBeInTheDocument();
      // Status displays plotted on map count
      expect(screen.getByText('2 plotted on map')).toBeInTheDocument();
      // Unmapped badge displays unmapped count
      expect(screen.getByText('+1 unmapped')).toBeInTheDocument();
    });

    it('does not invent guessed coordinates for unmapped workers, keeping them labeled as unmapped in directory', () => {
      const workerWithUnmappedLocality: WorkerItem[] = [
        {
          id: 'worker-shirur',
          category: 'Agriculture',
          skills: ['Harvesting'],
          experience_years: 4,
          average_rating: null,
          is_available: true,
          latitude: null, // missing coords
          longitude: null,
          profiles: {
            id: 'worker-shirur',
            full_name: 'Rohit Garad',
            phone_number: '9876543299',
            is_assisted_profile: false,
            village: 'Shirur',
            district: 'Pune',
            state: 'Maharashtra',
          },
        },
      ];

      render(
        <WorkersTab
          workersLoading={false}
          selectedCategory="All"
          onSelectCategory={vi.fn()}
          searchQuery=""
          onSearchQueryChange={vi.fn()}
          filteredWorkers={workerWithUnmappedLocality}
          user={mockUser}
          onRequireLogin={vi.fn()}
          onRegisterSkillProfile={vi.fn()}
          onOpenWorkerDiscovery={vi.fn()}
        />
      );

      expect(screen.getByText('New')).toBeInTheDocument();

      // Worker should strictly remain visible in directory
      expect(screen.getByText('Rohit Garad')).toBeInTheDocument();
      expect(screen.getByText('1 worker found')).toBeInTheDocument();

      // Verified coordinates only: unmapped worker must NOT be plotted on the map
      expect(screen.getByText('0 plotted on map')).toBeInTheDocument();
      expect(screen.getByText('+1 unmapped')).toBeInTheDocument();
      expect(screen.getByText('Map location not set')).toBeInTheDocument();
    });

    it('plots Rohit Garad on map with accurate distance when coordinates are resolved or saved in Supabase', async () => {
      const mappedRohit: WorkerItem[] = [
        {
          id: 'e2290510-4590-44ac-9d0d-ba6ce9654715',
          category: 'Agriculture',
          skills: ['Driving', 'Harvesting'],
          experience_years: 1,
          daily_wage: 500,
          average_rating: 4.8,
          is_available: true,
          latitude: 21.1458,
          longitude: 79.0882,
          profiles: {
            id: 'e2290510-4590-44ac-9d0d-ba6ce9654715',
            full_name: 'Rohit Garad',
            phone_number: '918983538343',
            is_assisted_profile: true,
            location: 'Nagpur, Maharashtra',
            village: 'Nagpur',
            city: 'Nagpur',
            district: 'Nagpur',
            state: 'Maharashtra',
            latitude: 21.1458,
            longitude: 79.0882,
          },
        },
      ];

      render(
        <WorkersTab
          workersLoading={false}
          selectedCategory="All"
          onSelectCategory={vi.fn()}
          searchQuery=""
          onSearchQueryChange={vi.fn()}
          filteredWorkers={mappedRohit}
          user={mockUser}
          onRequireLogin={vi.fn()}
          onRegisterSkillProfile={vi.fn()}
          onOpenWorkerDiscovery={vi.fn()}
        />
      );

      const locInput = screen.getByPlaceholderText(/Enter village, town, or district/i);
      fireEvent.change(locInput, { target: { value: 'Nagpur' } });
      fireEvent.click(screen.getByText('Find Nearby'));

      await waitFor(() => {
        expect(screen.getByText('1 worker found')).toBeInTheDocument();
        expect(screen.getByText('1 plotted on map')).toBeInTheDocument();
        expect(screen.queryByText(/unmapped/i)).not.toBeInTheDocument();
        expect(screen.getByText(/Rohit Garad/i)).toBeInTheDocument();
      });
    });

    it('renders recent search location chips and selects preferred location on click', async () => {
      render(
        <WorkersTab
          workersLoading={false}
          selectedCategory="All"
          onSelectCategory={vi.fn()}
          searchQuery=""
          onSearchQueryChange={vi.fn()}
          filteredWorkers={mockWorkers}
          user={mockUser}
          onRequireLogin={vi.fn()}
          onRegisterSkillProfile={vi.fn()}
          onOpenWorkerDiscovery={vi.fn()}
        />
      );

      // Recent chips rendered from mock (Pune and Nagpur)
      expect(screen.getByText('Recent:')).toBeInTheDocument();
      const nagpurChip = screen.getByRole('button', { name: 'Nagpur' });
      expect(nagpurChip).toBeInTheDocument();

      fireEvent.click(nagpurChip);

      await waitFor(() => {
        expect(screen.getByTestId('mock-workers-map')).toBeInTheDocument();
        expect(screen.getByTestId('map-center-coords')).toHaveTextContent('21.1458,79.0882');
      });
    });

    it('supports custom radius input and recalculates matching workers', async () => {
      render(
        <WorkersTab
          workersLoading={false}
          selectedCategory="All"
          onSelectCategory={vi.fn()}
          searchQuery=""
          onSearchQueryChange={vi.fn()}
          filteredWorkers={mockWorkers}
          user={mockUser}
          onRequireLogin={vi.fn()}
          onRegisterSkillProfile={vi.fn()}
          onOpenWorkerDiscovery={vi.fn()}
        />
      );

      // Search Pune
      const locInput = screen.getByPlaceholderText(/Enter village, town, or district/i);
      fireEvent.change(locInput, { target: { value: 'Pune' } });
      fireEvent.click(screen.getByText('Find Nearby'));

      // Click Custom radius button
      const customBtn = screen.getByRole('button', { name: 'Custom' });
      fireEvent.click(customBtn);

      const customInput = screen.getByPlaceholderText('km');
      expect(customInput).toBeInTheDocument();

      // Enter 70 km radius
      fireEvent.change(customInput, { target: { value: '70' } });

      // Both Dnyaneshwar (0 km) and Santosh (60.5 km) should be within 70 km
      expect(screen.getByText('Dnyaneshwar Shinde')).toBeInTheDocument();
      expect(screen.getByText('Santosh Gaikwad')).toBeInTheDocument();

      // Change radius down to 10 km
      fireEvent.change(customInput, { target: { value: '10' } });

      // Only Dnyaneshwar (0 km) should be within 10 km
      expect(screen.getByText('Dnyaneshwar Shinde')).toBeInTheDocument();
      expect(screen.queryByText('Santosh Gaikwad')).not.toBeInTheDocument();
    });

    it('keeps worker in directory without plotting if geocoding fails completely', async () => {
      const unresolvableWorker: WorkerItem[] = [
        {
          id: 'worker-unknown',
          category: 'Daily work',
          skills: ['Packing'],
          experience_years: 1,
          average_rating: 4.0,
          is_available: true,
          latitude: null,
          longitude: null,
          profiles: {
            id: 'worker-unknown',
            full_name: 'Unknown Place Worker',
            phone_number: '9876543298',
            is_assisted_profile: false,
            village: 'NonExistentZzz999',
          },
        },
      ];

      render(
        <WorkersTab
          workersLoading={false}
          selectedCategory="All"
          onSelectCategory={vi.fn()}
          searchQuery=""
          onSearchQueryChange={vi.fn()}
          filteredWorkers={unresolvableWorker}
          user={mockUser}
          onRequireLogin={vi.fn()}
          onRegisterSkillProfile={vi.fn()}
          onOpenWorkerDiscovery={vi.fn()}
        />
      );

      // Worker remains in directory!
      expect(screen.getByText('Unknown Place Worker')).toBeInTheDocument();
      expect(screen.getByText('1 worker found')).toBeInTheDocument();
      // Map plotted is 0, unmapped is +1
      expect(screen.getByText('0 plotted on map')).toBeInTheDocument();
      expect(screen.getByText('+1 unmapped')).toBeInTheDocument();
    });
  });

  describe('Unauthenticated User Access Restriction', () => {
    it('renders login prompt when user is not authenticated and protects worker list', () => {
      const onRequireLogin = vi.fn();
      render(
        <WorkersTab
          workersLoading={false}
          selectedCategory="All"
          onSelectCategory={vi.fn()}
          searchQuery=""
          onSearchQueryChange={vi.fn()}
          filteredWorkers={mockWorkers}
          user={null}
          onRequireLogin={onRequireLogin}
          onRegisterSkillProfile={vi.fn()}
          onOpenWorkerDiscovery={vi.fn()}
        />
      );

      expect(screen.getByText('Login to Browse Verified Workers')).toBeInTheDocument();
      expect(screen.getByText(/Sign in with your mobile number to discover verified workers/i)).toBeInTheDocument();
      expect(screen.queryByText('Dnyaneshwar Shinde')).not.toBeInTheDocument();
      expect(screen.queryByText('Santosh Gaikwad')).not.toBeInTheDocument();
      expect(screen.queryByText('Search Nearby Workers')).not.toBeInTheDocument();

      const loginBtn = screen.getByRole('button', { name: /Login/i });
      fireEvent.click(loginBtn);
      expect(onRequireLogin).toHaveBeenCalledTimes(1);
    });
  });

  describe('Worker Contact Privacy and Authorization (Option 3)', () => {
    it('never displays worker phone numbers directly on initial card rendering', () => {
      render(
        <WorkersTab
          workersLoading={false}
          selectedCategory="All"
          onSelectCategory={vi.fn()}
          searchQuery=""
          onSearchQueryChange={vi.fn()}
          filteredWorkers={mockWorkers}
          user={mockUser}
          onRequireLogin={vi.fn()}
          onRegisterSkillProfile={vi.fn()}
          onOpenWorkerDiscovery={vi.fn()}
        />
      );

      // Verify that phone numbers from mock worker profiles are strictly not rendered anywhere on initial cards
      expect(screen.queryByText(/9876543210/)).not.toBeInTheDocument();
      expect(screen.queryByText(/9876543211/)).not.toBeInTheDocument();
      expect(screen.queryByText(/9876543212/)).not.toBeInTheDocument();

      // Verify clean Call buttons are present
      const callButtons = screen.getAllByRole('button', { name: /Call/i });
      expect(callButtons.length).toBeGreaterThanOrEqual(3);
    });

    it('invokes get_worker_contact_phone RPC and launches dialer on authorization', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { phone_number: '+919876543210', remaining_calls: 14 },
        error: null,
        count: null,
        status: 200,
        statusText: 'OK',
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>);

      render(
        <WorkersTab
          workersLoading={false}
          selectedCategory="All"
          onSelectCategory={vi.fn()}
          searchQuery=""
          onSearchQueryChange={vi.fn()}
          filteredWorkers={[mockWorkers[0]]}
          user={mockUser}
          onRequireLogin={vi.fn()}
          onRegisterSkillProfile={vi.fn()}
          onOpenWorkerDiscovery={vi.fn()}
        />
      );

      const callBtn = screen.getByRole('button', { name: /Call/i });
      fireEvent.click(callBtn);

      await waitFor(() => {
        expect(supabase.rpc).toHaveBeenCalledWith('get_worker_contact_phone', {
          p_worker_id: 'worker-1',
        });
      });
    });

    it('sanitizes authorization failures and renders friendly connection requirement without raw database error', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: {
          code: '42501',
          message: 'Only authorized employers, admins, or the worker can access this contact.',
          details: 'RLS check failed',
          hint: '',
          name: 'PostgrestError',
        },
        count: null,
        status: 403,
        statusText: 'Forbidden',
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>);

      render(
        <WorkersTab
          workersLoading={false}
          selectedCategory="All"
          onSelectCategory={vi.fn()}
          searchQuery=""
          onSearchQueryChange={vi.fn()}
          filteredWorkers={[mockWorkers[0]]}
          user={mockUser}
          onRequireLogin={vi.fn()}
          onRegisterSkillProfile={vi.fn()}
          onOpenWorkerDiscovery={vi.fn()}
        />
      );

      const callBtn = screen.getByRole('button', { name: /Call/i });
      fireEvent.click(callBtn);

      await waitFor(() => {
        expect(
          screen.getByText('You need an existing job connection with this worker to access their contact number.')
        ).toBeInTheDocument();
      });

      // Verify raw database error string is NEVER leaked to the UI
      expect(screen.queryByText(/Only authorized employers, admins, or the worker can access this contact/)).not.toBeInTheDocument();
      expect(screen.queryByText(/42501/)).not.toBeInTheDocument();
    });

    it('displays user-friendly rate limit error when 15 calls limit is exceeded', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: {
          code: 'P0001',
          message: 'Daily contact limit reached (15 calls per 24 hours). Please try again tomorrow.',
          details: '',
          hint: '',
          name: 'PostgrestError',
        },
        count: null,
        status: 429,
        statusText: 'Too Many Requests',
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>);

      render(
        <WorkersTab
          workersLoading={false}
          selectedCategory="All"
          onSelectCategory={vi.fn()}
          searchQuery=""
          onSearchQueryChange={vi.fn()}
          filteredWorkers={[mockWorkers[0]]}
          user={mockUser}
          onRequireLogin={vi.fn()}
          onRegisterSkillProfile={vi.fn()}
          onOpenWorkerDiscovery={vi.fn()}
        />
      );

      const callBtn = screen.getByRole('button', { name: /Call/i });
      fireEvent.click(callBtn);

      await waitFor(() => {
        expect(
          screen.getByText('Daily contact limit reached (15 calls per 24 hours). Please try again tomorrow.')
        ).toBeInTheDocument();
      });
    });
  });

});
