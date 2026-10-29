import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkersMapView } from './WorkersMapView';
import { WorkerItem } from './WorkerDiscoveryModal';

// Mock translations
vi.mock('../lib/translations', () => ({
  getTranslation: vi.fn((lang: string, key: string) => {
    const dict: Record<string, string> = {
      workersNearbyCount: 'Workers Nearby Map',
      workersPlotted: 'plotted',
      unmappedWorkersNotice: 'workers with unmapped localities available in list below',
      clickMapHint: 'Tap anywhere on map to set search center',
      refreshAvailability: 'Refresh Workers',
      expandMap: 'Expand Map',
      shrinkMap: 'Shrink Map',
      noWorkersFound: 'No Workers Found',
    };
    return dict[key] || key;
  }),
}));

describe('WorkersMapView Component — Advanced Discovery Map', () => {
  const mockWorkers: WorkerItem[] = [
    {
      id: 'worker-1',
      category: 'Agriculture',
      skills: ['Tractor Driving', 'Harvesting'],
      experience_years: 5,
      daily_wage: 650,
      average_rating: 4.9,
      is_available: true,
      latitude: 18.5204,
      longitude: 73.8567,
      profiles: {
        id: 'worker-1',
        full_name: 'Baburao Shinde',
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
      average_rating: 4.8,
      is_available: true,
      latitude: 18.5210, // Very close to worker-1 to test clustering
      longitude: 73.8570,
      profiles: {
        id: 'worker-2',
        full_name: 'Anand Gaikwad',
        phone_number: '9876543211',
        is_assisted_profile: false,
        village: 'Pune City',
        district: 'Pune',
        state: 'Maharashtra',
      },
    },
    {
      id: 'worker-3',
      category: 'Daily work',
      skills: ['Loading / Unloading'],
      experience_years: 2,
      daily_wage: 500,
      average_rating: 4.6,
      is_available: true,
      latitude: null, // Unmapped worker
      longitude: null,
      profiles: {
        id: 'worker-3',
        full_name: 'Unmapped Worker',
        phone_number: '9876543212',
        is_assisted_profile: false,
        village: 'Remote Hamlet',
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders top map bar with plotted and radius counters', () => {
    render(
      <WorkersMapView
        workers={mockWorkers}
        centerLat={18.5204}
        centerLon={73.8567}
        centerLabel="Pune Center"
        radiusKm={25}
        currentLang="English"
      />
    );

    // 2 workers have coordinates, 1 is unmapped
    expect(screen.getByText(/Workers Nearby Map \(2 plotted\)/i)).toBeInTheDocument();
    expect(screen.getByText(/25 km/i)).toBeInTheDocument();
  });

  it('displays notice for unmapped workers without omitting or crashing', () => {
    render(
      <WorkersMapView
        workers={mockWorkers}
        centerLat={18.5204}
        centerLon={73.8567}
        centerLabel="Pune Center"
        currentLang="English"
      />
    );

    // +1 worker unmapped notice in footer
    expect(screen.getByText(/\+1 workers with unmapped localities available in list below/i)).toBeInTheDocument();
  });

  it('shows informative overlay when all workers in list have missing coordinates', () => {
    const unmappedOnly: WorkerItem[] = [mockWorkers[2]];

    render(
      <WorkersMapView
        workers={unmappedOnly}
        centerLat={20.5937}
        centerLon={78.9629}
        currentLang="English"
      />
    );

    expect(screen.getByText(/Locality Coordinates Pending/i)).toBeInTheDocument();
    expect(screen.getByText(/1 worker\(s\) in this category are listed in the directory below/i)).toBeInTheDocument();
  });

  it('toggles map expansion height when maximize/minimize button is clicked', () => {
    const { container } = render(
      <WorkersMapView
        workers={mockWorkers}
        centerLat={18.5204}
        centerLon={73.8567}
        currentLang="English"
      />
    );

    const expandBtn = screen.getByTitle(/Expand Map/i);
    expect(container.firstChild).toHaveClass('h-80');

    fireEvent.click(expandBtn);
    expect(container.firstChild).toHaveClass('h-[520px]');

    const shrinkBtn = screen.getByTitle(/Shrink Map/i);
    fireEvent.click(shrinkBtn);
    expect(container.firstChild).toHaveClass('h-80');
  });

  it('calls onRefreshAvailability when refresh button is tapped', () => {
    const mockRefresh = vi.fn();
    render(
      <WorkersMapView
        workers={mockWorkers}
        centerLat={18.5204}
        centerLon={73.8567}
        currentLang="English"
        onRefreshAvailability={mockRefresh}
      />
    );

    const refreshBtn = screen.getByTitle(/Refresh Workers/i);
    fireEvent.click(refreshBtn);

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('calls onClose callback when close button is clicked', () => {
    const mockClose = vi.fn();
    render(
      <WorkersMapView
        workers={mockWorkers}
        centerLat={18.5204}
        centerLon={73.8567}
        currentLang="English"
        onClose={mockClose}
      />
    );

    const closeBtn = screen.getByTitle(/Close map/i);
    fireEvent.click(closeBtn);

    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
