import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkersTab } from './WorkersTab';
import { WorkerItem } from './WorkerDiscoveryModal';

// Mock speech and translations
vi.mock('../lib/speech', () => ({
  speakText: vi.fn(),
  getVoiceGuidance: vi.fn(() => 'voice instructions'),
  getWorkerSpeechText: vi.fn(() => 'worker details'),
  subscribeToSpeech: vi.fn(() => () => {}),
}));

// Mock geocoding library
vi.mock('../lib/geocoding', () => ({
  geocodeAddress: vi.fn(async (input: string) => {
    if (input.toLowerCase().includes('pune')) {
      return {
        latitude: 18.5204,
        longitude: 73.8567,
        displayName: 'Pune, Maharashtra, India',
      };
    }
    return null;
  }),
  calculateHaversineDistanceKm: vi.fn((lat1, lon1, lat2, lon2) => {
    // If worker is in Pune (same coords), 0 km; if in Shirur, ~60 km; if Mumbai, ~120 km
    if (lat2 === 18.5204) return 0.0;
    if (lat2 === 18.8256) return 60.5;
    return 120.0;
  }),
  resolveLocalityCoordinates: vi.fn((input: any) => {
    const str = typeof input === 'string' ? input : '';
    if (str.toLowerCase().includes('shirur')) {
      return { latitude: 18.8256, longitude: 74.3789, displayName: 'Shirur, Pune, Maharashtra' };
    }
    if (str.toLowerCase().includes('pune')) {
      return { latitude: 18.5204, longitude: 73.8567, displayName: 'Pune, Maharashtra' };
    }
    return null;
  }),
}));

// Mock Leaflet WorkersMapView to avoid WebGL / Canvas issues in Node environment
vi.mock('./WorkersMapView', () => ({
  WorkersMapView: ({ onSelectLocation, onRefreshAvailability }: any) => (
    <div data-testid="mock-workers-map">
      <span>Workers Map View</span>
      <button onClick={() => onSelectLocation && onSelectLocation(18.5204, 73.8567, 'Mock Selected Point')}>
        Mock Select Point
      </button>
      <button onClick={() => onRefreshAvailability && onRefreshAvailability()}>
        Mock Refresh Availability
      </button>
    </div>
  ),
}));

// Mock Supabase RPC
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
    })),
  },
}));

describe('WorkersTab - Nearby Workers Search Feature', () => {
  const mockUser = { id: 'test-user-uuid-1', email: 'test@example.com' } as any;

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
        onOpenDirectPayment={vi.fn()}
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
        onOpenDirectPayment={vi.fn()}
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
        onOpenDirectPayment={vi.fn()}
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
        onOpenDirectPayment={vi.fn()}
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
    (global as any).navigator.geolocation = mockGeolocation;

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
        onOpenDirectPayment={vi.fn()}
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
        onOpenDirectPayment={vi.fn()}
        onOpenWorkerDiscovery={vi.fn()}
        onRefreshWorkers={mockRefresh}
      />
    );

    const refreshBtn = screen.getByTitle(/Refresh Workers/i);
    fireEvent.click(refreshBtn);

    expect(mockRefresh).toHaveBeenCalled();
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
          onOpenDirectPayment={vi.fn()}
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

});
