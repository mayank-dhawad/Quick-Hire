import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerProfileModal } from './WorkerProfileModal';
import { supabase } from '../lib/supabase';

// Mock speech synthesis and recognition
vi.mock('../lib/speech', () => ({
  speakText: vi.fn(),
  stopSpeech: vi.fn(),
  subscribeToSpeech: vi.fn(() => () => {}),
  normalizeLanguage: vi.fn((l: string) => l),
  getVoiceGuidance: vi.fn(() => 'Mock voice guidance'),
  isSpeechRecognitionSupported: vi.fn(() => false),
}));

// Mock translations
vi.mock('../lib/translations', () => ({
  getTranslation: vi.fn((_lang: string, key: string) => {
    if (key === 'saveWorkerProfileBtn') return 'Save Worker Profile';
    if (key === 'workerNamePlaceholder') return 'Full name';
    if (key === 'phonePlaceholder') return '10-digit mobile number';
    return key;
  }),
  normalizeLanguage: vi.fn((l: string) => l),
}));

// Mock Supabase
vi.mock('../lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
      auth: {
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  };
});

// Mock geocoding
vi.mock('../lib/geocoding', () => ({
  geocodeAddress: vi.fn().mockResolvedValue({
    latitude: 28.6139,
    longitude: 77.2090,
    displayName: 'Mock Locality, India',
  }),
  buildAddressQuery: vi.fn(() => 'Mock Locality, India'),
}));

describe('WorkerProfileModal Component - Schema Resiliency & Profile Management', () => {
  const mockUser: any = {
    id: 'worker-uuid-123',
    phone: '+919876543210',
    email: 'worker@example.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads returning worker profile by user.id and displays read-only view with composite location', async () => {
    const existingProfile = {
      id: 'worker-uuid-123',
      full_name: 'Ramesh Patel',
      phone_number: '+919876543210',
      email: 'ramesh@example.com',
      village: 'Kheda Village',
      district: 'Anand',
      state: 'Gujarat',
      category: 'Agriculture',
      experience_years: 5,
      daily_wage: 600,
      skills: ['Farming', 'Harvesting'],
      role: 'worker',
    };

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: existingProfile, error: null }),
        };
      }
      if (table === 'workers') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'worker-uuid-123', category: 'Agriculture', skills: ['Farming', 'Harvesting'] },
            error: null,
          }),
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    });

    (supabase.from as any) = mockFrom;

    render(
      <WorkerProfileModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        currentLang="English"
        user={mockUser}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Ramesh Patel')).toBeInTheDocument();
      expect(screen.getByText('Kheda Village')).toBeInTheDocument();
      expect(screen.getByText('Anand, Gujarat')).toBeInTheDocument();
    });
  });

  it('retrieves profile by phone number if not found by user.id for returning worker', async () => {
    const existingProfile = {
      id: 'older-profile-uuid-456',
      full_name: 'Pooja Sharma',
      phone_number: '+919876543210',
      village: 'Shirdi',
      district: 'Ahmednagar',
      state: 'Maharashtra',
      category: 'Construction',
      experience_years: 3,
      daily_wage: 550,
      role: 'worker',
    };

    let lookupCount = 0;
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation((col: string, val: string) => {
            if (col === 'id') {
              return {
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              };
            }
            if (col === 'phone_number' && val === '+919876543210') {
              lookupCount++;
              return {
                maybeSingle: vi.fn().mockResolvedValue({ data: existingProfile, error: null }),
              };
            }
            return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
          }),
        };
      }
      if (table === 'workers') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    });

    (supabase.from as any) = mockFrom;

    render(
      <WorkerProfileModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        currentLang="English"
        user={mockUser}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Pooja Sharma')).toBeInTheDocument();
      expect(screen.getByText('Shirdi')).toBeInTheDocument();
      expect(screen.getByText('Ahmednagar, Maharashtra')).toBeInTheDocument();
    });
    expect(lookupCount).toBe(1);
  });

  it('gracefully handles missing location column by omitting location on upsert retry', async () => {
    const upsertProfilesCalls: any[] = [];
    const upsertWorkersCalls: any[] = [];

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockImplementation((payload: any) => {
            upsertProfilesCalls.push(payload);
            // First call has 'location', simulate DB error 42703
            if ('location' in payload && payload.location !== undefined) {
              return Promise.resolve({
                data: null,
                error: { code: '42703', message: 'column profiles.location does not exist' },
              });
            }
            // Fallback retry without location succeeds!
            return Promise.resolve({ data: payload, error: null });
          }),
        };
      }
      if (table === 'workers') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockImplementation((payload: any) => {
            upsertWorkersCalls.push(payload);
            // Simulate missing daily_wage or location column on workers table
            if ('daily_wage' in payload || 'location' in payload) {
              return Promise.resolve({
                data: null,
                error: { code: '42703', message: 'column workers.location does not exist' },
              });
            }
            return Promise.resolve({ data: payload, error: null });
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    (supabase.from as any) = mockFrom;

    const mockSaved = vi.fn();
    render(
      <WorkerProfileModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={mockSaved}
        currentLang="English"
        user={mockUser}
      />
    );

    // Form starts in edit mode because no existing profile found
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Full name')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Full name'), {
      target: { value: 'Suresh Kumar' },
    });
    fireEvent.change(screen.getByPlaceholderText('10-digit mobile number'), {
      target: { value: '+919876543210' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Rampur'), {
      target: { value: 'Rampur' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Pune / Varanasi'), {
      target: { value: 'Meerut' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Maharashtra, UP'), {
      target: { value: 'Uttar Pradesh' },
    });

    const saveButton = screen.getByRole('button', { name: /save worker profile/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSaved).toHaveBeenCalled();
    });

    // Verify first attempt sent location, but second attempt gracefully stripped it
    expect(upsertProfilesCalls.length).toBe(2);
    expect(upsertProfilesCalls[0]).toHaveProperty('location');
    expect(upsertProfilesCalls[1]).not.toHaveProperty('location');
    // Structured address was preserved!
    expect(upsertProfilesCalls[1].village).toBe('Rampur');
    expect(upsertProfilesCalls[1].district).toBe('Meerut');
    expect(upsertProfilesCalls[1].state).toBe('Uttar Pradesh');

    // Verify workers retry omitted daily_wage and location
    expect(upsertWorkersCalls.length).toBe(2);
    expect(upsertWorkersCalls[1]).not.toHaveProperty('location');
    expect(upsertWorkersCalls[1]).not.toHaveProperty('daily_wage');
    expect(upsertWorkersCalls[1].category).toBe('Agriculture');
  });

  it('updates existing profile targetId without generating duplicate records', async () => {
    const existingProfile = {
      id: 'existing-worker-uuid-999',
      full_name: 'Anita Devi',
      phone_number: '+919876543210',
      village: 'Sonpur',
      district: 'Saran',
      state: 'Bihar',
      category: 'Daily work',
      role: 'worker',
    };

    const upsertCalls: any[] = [];
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: existingProfile, error: null }),
          upsert: vi.fn().mockImplementation((payload: any) => {
            upsertCalls.push(payload);
            return Promise.resolve({ data: payload, error: null });
          }),
        };
      }
      if (table === 'workers') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockResolvedValue({ data: {}, error: null }),
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    });

    (supabase.from as any) = mockFrom;

    render(
      <WorkerProfileModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        currentLang="English"
        user={mockUser}
      />
    );

    // Initial state is read-only
    await waitFor(() => {
      expect(screen.getByText('Anita Devi')).toBeInTheDocument();
    });

    // Click edit profile (first button)
    const editBtns = screen.getAllByRole('button', { name: /edit profile/i });
    fireEvent.click(editBtns[0]);

    // Update village
    const villageInput = screen.getByPlaceholderText('e.g. Rampur');
    fireEvent.change(villageInput, { target: { value: 'Hajipur' } });

    const saveBtn = screen.getByRole('button', { name: /update profile/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(upsertCalls.length).toBeGreaterThan(0);
      // Target ID preserved existing profile UUID
      expect(upsertCalls[0].id).toBe('existing-worker-uuid-999');
      expect(upsertCalls[0].village).toBe('Hajipur');
    });
  });
});
