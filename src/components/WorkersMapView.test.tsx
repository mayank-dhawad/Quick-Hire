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

    // 3 total workers found in directory, 2 plotted on map, 1 unmapped
    expect(screen.getByText(/Workers Nearby Map \(3 workers found\)/i)).toBeInTheDocument();
    expect(screen.getByText(/2 plotted on map/i)).toBeInTheDocument();
    expect(screen.getByText(/\+1 unmapped/i)).toBeInTheDocument();
    expect(screen.getAllByText(/25 km/i).length).toBeGreaterThanOrEqual(1);
  });

  it('correctly distinguishes directory count and plotted count when 1 worker is found and 0 are plotted', () => {
    const unmappedOnly: WorkerItem[] = [mockWorkers[2]]; // latitude: null, longitude: null

    render(
      <WorkersMapView
        workers={unmappedOnly}
        centerLat={21.1458}
        centerLon={79.0882}
        centerLabel="Nagpur, Maharashtra"
        currentLang="English"
      />
    );

    // Directory found 1 worker, map plots 0
    expect(screen.getByText(/Workers Nearby Map \(1 worker found\)/i)).toBeInTheDocument();
    expect(screen.getByText(/0 plotted on map/i)).toBeInTheDocument();
    expect(screen.getByText(/\+1 unmapped/i)).toBeInTheDocument();
  });

  it('keeps map centered on searched location (Nagpur) even when single worker has Pune coordinates', () => {
    const singlePuneWorker: WorkerItem[] = [mockWorkers[0]]; // Worker is in Pune (18.5204, 73.8567)

    render(
      <WorkersMapView
        workers={singlePuneWorker}
        centerLat={21.1458}
        centerLon={79.0882}
        centerLabel="Nagpur, Maharashtra"
        radiusKm={50}
        currentLang="English"
      />
    );

    // Header reflects 1 worker found and 1 plotted without overriding the searched center
    expect(screen.getByText(/Workers Nearby Map \(1 worker found\)/i)).toBeInTheDocument();
    expect(screen.getByText(/1 plotted on map/i)).toBeInTheDocument();
    expect(screen.getAllByText(/50 km/i).length).toBeGreaterThanOrEqual(1);
  });

  it('handles search location transition smoothly when changing from Nagpur to Pune', () => {
    const { rerender } = render(
      <WorkersMapView
        workers={mockWorkers}
        centerLat={21.1458}
        centerLon={79.0882}
        centerLabel="Nagpur, Maharashtra"
        radiusKm={25}
        currentLang="English"
      />
    );

    expect(screen.getByText(/Workers Nearby Map \(3 workers found\)/i)).toBeInTheDocument();

    // Change location to Pune
    rerender(
      <WorkersMapView
        workers={mockWorkers}
        centerLat={18.5204}
        centerLon={73.8567}
        centerLabel="Pune, Maharashtra"
        radiusKm={25}
        currentLang="English"
      />
    );

    expect(screen.getByText(/Workers Nearby Map \(3 workers found\)/i)).toBeInTheDocument();
    expect(screen.getByText(/2 plotted on map/i)).toBeInTheDocument();
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
    expect(container.firstChild).toHaveClass('h-[400px]');

    fireEvent.click(expandBtn);
    expect(container.firstChild).toHaveClass('h-[580px]');

    const shrinkBtn = screen.getByTitle(/Shrink Map/i);
    fireEvent.click(shrinkBtn);
    expect(container.firstChild).toHaveClass('h-[400px]');
  });

  it('renders interactive nearby workers sidebar and toggles it', () => {
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

    // Sidebar includes mapped and unmapped directory workers
    expect(screen.getByText('Find a worker')).toBeInTheDocument();
    expect(screen.getByText('Baburao Shinde')).toBeInTheDocument();
    expect(screen.getByText('Anand Gaikwad')).toBeInTheDocument();
    expect(screen.getByText('Unmapped Worker')).toBeInTheDocument();

    // Toggle sidebar off
    const sidebarToggleBtn = screen.getByTitle(/Toggle nearby workers list sidebar/i);
    fireEvent.click(sidebarToggleBtn);

    expect(screen.queryByText('Find a worker')).not.toBeInTheDocument();
  });

  it('renders quick floating map controls: Recenter, Fit to Workers, and Reset', () => {
    render(
      <WorkersMapView
        workers={mockWorkers}
        centerLat={18.5204}
        centerLon={73.8567}
        centerLabel="Pune Center"
        currentLang="English"
      />
    );

    expect(screen.getByTitle(/Recenter to selected preferred location/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Fit view to all matching workers/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Reset map view/i)).toBeInTheDocument();
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

  it('strictly separates search center (Nagpur) from worker marker and does NOT plot unmapped Rohit Garad at search center', () => {
    const unmappedRohit: WorkerItem[] = [
      {
        id: 'e2290510-4590-44ac-9d0d-ba6ce9654715',
        category: 'Agriculture',
        skills: ['Driving', 'Harvesting'],
        experience_years: 1,
        daily_wage: 500,
        average_rating: 4.8,
        is_available: true,
        latitude: null,
        longitude: null,
        profiles: {
          id: 'e2290510-4590-44ac-9d0d-ba6ce9654715',
          full_name: 'Rohit Garad',
          phone_number: '918983538343',
          is_assisted_profile: true,
          location: '',
          village: null,
          city: null,
          district: null,
          state: null,
          latitude: null,
          longitude: null,
        },
      },
    ];

    render(
      <WorkersMapView
        workers={unmappedRohit}
        centerLat={21.1458}
        centerLon={79.0882}
        centerLabel="Nagpur, Maharashtra"
        radiusKm={25}
        currentLang="English"
      />
    );

    // Rohit is found in directory but unmapped: plotted is 0, unmapped is 1
    expect(screen.getByText(/Workers Nearby Map \(1 worker found\)/i)).toBeInTheDocument();
    expect(screen.getByText(/0 plotted on map/i)).toBeInTheDocument();
    expect(screen.getByText(/\+1 unmapped/i)).toBeInTheDocument();
    expect(screen.getByText(/Locality Coordinates Pending/i)).toBeInTheDocument();
  });

  it('plots Rohit Garad at his own coordinates when coordinates exist with category-based Emerald color', () => {
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
      <WorkersMapView
        workers={mappedRohit}
        centerLat={21.1458}
        centerLon={79.0882}
        centerLabel="Nagpur, Maharashtra"
        radiusKm={25}
        currentLang="English"
      />
    );

    expect(screen.getByText(/Workers Nearby Map \(1 worker found\)/i)).toBeInTheDocument();
    expect(screen.getByText(/1 plotted on map/i)).toBeInTheDocument();
    expect(screen.queryByText(/unmapped/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Locality Coordinates Pending/i)).not.toBeInTheDocument();
  });

  it('prioritizes worker coordinates over profile coordinates when both are present', () => {
    const workerWithDualCoords: WorkerItem[] = [
      {
        id: 'dual-worker-1',
        category: 'Construction',
        skills: ['Masonry'],
        experience_years: 4,
        daily_wage: 650,
        average_rating: 5.0,
        is_available: true,
        latitude: 21.1500, // Worker operating coordinate
        longitude: 79.0900,
        profiles: {
          id: 'dual-worker-1',
          full_name: 'Vikas Jadhav',
          phone_number: '9876543210',
          is_assisted_profile: false,
          latitude: 18.5204, // Profile residential coordinate
          longitude: 73.8567,
        },
      },
    ];

    render(
      <WorkersMapView
        workers={workerWithDualCoords}
        centerLat={21.1458}
        centerLon={79.0882}
        currentLang="English"
      />
    );

    expect(screen.getByText(/1 plotted on map/i)).toBeInTheDocument();
    expect(screen.getByText('Vikas Jadhav')).toBeInTheDocument();
  });

  it('filters out invalid or Null Island (0,0) coordinates and increments unmapped count', () => {
    const invalidCoordsWorker: WorkerItem[] = [
      {
        id: 'null-island-worker',
        category: 'Daily work',
        skills: ['Helper'],
        experience_years: 1,
        daily_wage: 400,
        average_rating: 4.0,
        is_available: true,
        latitude: 0, // Invalid Null Island coordinate
        longitude: 0,
        profiles: {
          id: 'null-island-worker',
          full_name: 'Invalid Coord Worker',
          phone_number: '9876543200',
          is_assisted_profile: false,
          latitude: 0,
          longitude: 0,
        },
      },
    ];

    render(
      <WorkersMapView
        workers={invalidCoordsWorker}
        centerLat={21.1458}
        centerLon={79.0882}
        currentLang="English"
      />
    );

    expect(screen.getByText(/0 plotted on map/i)).toBeInTheDocument();
    expect(screen.getByText(/\+1 unmapped/i)).toBeInTheDocument();
    expect(screen.getByText(/Locality Coordinates Pending/i)).toBeInTheDocument();
  });

  it('keeps available and unmapped workers in the list without implying live-online presence', () => {
    const onSelectWorker = vi.fn();
    const onCallWorker = vi.fn();
    render(
      <WorkersMapView
        workers={mockWorkers}
        centerLat={18.5204}
        centerLon={73.8567}
        onSelectWorker={onSelectWorker}
        onCallWorker={onCallWorker}
      />
    );

    expect(screen.getByText('Unmapped Worker')).toBeInTheDocument();
    expect(screen.getAllByText('Available for work').length).toBeGreaterThan(0);
    expect(screen.queryByText('Available Now')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Baburao Shinde'));
    expect(onSelectWorker).toHaveBeenCalledWith(expect.objectContaining({ id: 'worker-1' }));
    expect(onCallWorker).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Unavailable' }));
    expect(screen.queryByText('Baburao Shinde')).not.toBeInTheDocument();
    expect(screen.queryByText('Unmapped Worker')).not.toBeInTheDocument();
  });

  it('accepts zero as a valid coordinate when the pair is not Null Island', () => {
    const equatorWorker: WorkerItem[] = [{
      id: 'equator-worker',
      category: 'Daily work',
      skills: ['Helper'],
      experience_years: 1,
      average_rating: null,
      is_available: true,
      latitude: 0,
      longitude: 73.5,
      profiles: { id: 'equator-worker', full_name: 'Equator Worker', phone_number: null, is_assisted_profile: false },
    }];

    render(<WorkersMapView workers={equatorWorker} currentLang="English" />);
    expect(screen.getByText(/1 plotted on map/i)).toBeInTheDocument();
    expect(screen.getByText('Equator Worker')).toBeInTheDocument();
  });
});
