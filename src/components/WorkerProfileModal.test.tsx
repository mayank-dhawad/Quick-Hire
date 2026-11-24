import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerProfileModal } from './WorkerProfileModal';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

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
    if (key === 'searchLocationPlaceholder') return 'Search village, town, city, or 6-digit PIN code...';
    if (key === 'wherePreferToWork') return 'Where would you prefer to work?';
    if (key === 'preferredWorkRadius') return 'Preferred Work Radius';
    if (key === 'approximatePincodeNotice') return 'Approximate area centroid (PIN code)';
    return key;
  }),
  normalizeLanguage: vi.fn((l: string) => l),
}));

// Mock Supabase
vi.mock('../lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
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
  searchLocationSuggestions: vi.fn().mockResolvedValue([
    {
      displayName: 'Shirur, Pune, Maharashtra (PIN 412210)',
      latitude: 18.8256,
      longitude: 74.3789,
      city: 'Shirur',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '412210',
      isApproximatePincode: true,
    },
  ]),
  geocodePreferredLocation: vi.fn().mockImplementation(async (query: string) => {
    if (query.includes('412210') || query.toLowerCase().includes('shirur')) {
      return {
        latitude: 18.8256,
        longitude: 74.3789,
        displayName: 'Shirur, Pune, Maharashtra (PIN 412210)',
        city: 'Shirur',
        district: 'Pune',
        state: 'Maharashtra',
        pincode: '412210',
        isApproximatePincode: true,
      };
    }
    return {
      latitude: 28.6139,
      longitude: 77.2090,
      displayName: 'Mock Locality, India',
      isApproximatePincode: false,
    };
  }),
  resolveLocalityCoordinates: vi.fn(() => null),
}));

describe('WorkerProfileModal Component - Schema Resiliency & Profile Management', () => {
  const mockUser = {
    id: 'worker-uuid-123',
    phone: '+919876543210',
    email: 'worker@example.com',
  } as unknown as User;

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
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom as unknown as (relation: string) => ReturnType<typeof supabase.from>);

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

  it('does not load another profile by phone when the authenticated user ID has no profile', async () => {
    const lookupColumns: string[] = [];
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation((column: string) => {
            lookupColumns.push(column);
            return {
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
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
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom as unknown as (relation: string) => ReturnType<typeof supabase.from>);

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
      expect(screen.getByPlaceholderText('Full name')).toBeInTheDocument();
    });
    expect(lookupColumns).toEqual(['id']);
    expect(screen.queryByText('Pooja Sharma')).not.toBeInTheDocument();
  });

  it('gracefully handles missing location column by omitting location on upsert retry', async () => {
    const upsertProfilesCalls: Record<string, unknown>[] = [];
    const upsertWorkersCalls: Record<string, unknown>[] = [];

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
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
          upsert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
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
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom as unknown as (relation: string) => ReturnType<typeof supabase.from>);

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

    const upsertCalls: Record<string, unknown>[] = [];
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: existingProfile, error: null }),
          upsert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
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
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom as unknown as (relation: string) => ReturnType<typeof supabase.from>);

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

  it('creates an assisted worker profile with a distinct UUID and stamps created_by with intermediary user ID', async () => {
    const upsertProfilesCalls: Record<string, unknown>[] = [];
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            upsertProfilesCalls.push(payload);
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
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom as unknown as (relation: string) => ReturnType<typeof supabase.from>);

    const mockSaved = vi.fn();
    render(
      <WorkerProfileModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={mockSaved}
        currentLang="English"
        user={mockUser}
        isAssistedRegistration={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Full name')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Full name'), {
      target: { value: 'Shivaji Rao' },
    });
    fireEvent.change(screen.getByPlaceholderText('10-digit mobile number'), {
      target: { value: '+919123456789' },
    });

    const saveButton = screen.getByRole('button', { name: /save worker profile/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSaved).toHaveBeenCalled();
    });

    expect(upsertProfilesCalls.length).toBeGreaterThan(0);
    const saved = upsertProfilesCalls[0];
    // Must NOT overwrite the intermediary's user.id
    expect(saved.id).not.toBe(mockUser.id);
    expect(saved.is_assisted_profile).toBe(true);
    expect(saved.created_by).toBe(mockUser.id);
    expect(saved.role).toBe('worker');
    await waitFor(() => {
      expect(screen.getByText('One-time worker claim code')).toBeInTheDocument();
    });
    expect(supabase.rpc).toHaveBeenCalledWith(
      'set_assisted_profile_claim_secret',
      expect.objectContaining({
        p_assisted_profile_id: saved.id,
        p_secret: expect.stringMatching(/^[A-HJ-NP-Z2-9]{24}$/),
      })
    );

  it('preserves existing profile ID when a returning worker edits and updates their profile', async () => {
    const existingProfile = {
      id: 'existing-worker-uuid-999',
      full_name: 'Ganesh Shinde',
      phone_number: '+919876543210',
      email: 'ganesh@example.com',
      village: 'Wai',
      district: 'Satara',
      state: 'Maharashtra',
      category: 'Agriculture',
      experience_years: 7,
      daily_wage: 650,
      skills: ['Organic Farming'],
      role: 'worker',
    };

    const upsertProfilesCalls: Record<string, unknown>[] = [];
    const upsertWorkersCalls: Record<string, unknown>[] = [];

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: existingProfile, error: null }),
          upsert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            upsertProfilesCalls.push(payload);
            return Promise.resolve({ data: payload, error: null });
          }),
        };
      }
      if (table === 'workers') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'existing-worker-uuid-999', category: 'Agriculture', skills: ['Organic Farming'] },
            error: null,
          }),
          upsert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            upsertWorkersCalls.push(payload);
            return Promise.resolve({ data: payload, error: null });
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom as unknown as (relation: string) => ReturnType<typeof supabase.from>);

    const mockSaved = vi.fn();
    render(
      <WorkerProfileModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={mockSaved}
        currentLang="English"
        user={{ id: 'existing-worker-uuid-999', phone: '+919876543210' } as unknown as User}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Ganesh Shinde')).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: /Edit Profile Information/i });
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Full name')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('Full name'), {
      target: { value: 'Ganesh S. Shinde' },
    });

    const saveButton = screen.getByRole('button', { name: /update profile/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSaved).toHaveBeenCalled();
    });

    expect(upsertProfilesCalls.length).toBeGreaterThan(0);
    expect(upsertProfilesCalls[0].id).toBe('existing-worker-uuid-999');
    expect(upsertProfilesCalls[0].full_name).toBe('Ganesh S. Shinde');

    expect(upsertWorkersCalls.length).toBeGreaterThan(0);
    expect(upsertWorkersCalls[0].id).toBe('existing-worker-uuid-999');
  });

  it('allows user to update and intentionally clear date of birth and address in profile_private_details without skipping the update', async () => {
    const existingProfile = {
      id: 'worker-clear-123',
      full_name: 'Anita Devi',
      phone_number: '+919876543210',
      village: 'Rampur',
      district: 'Patna',
      state: 'Bihar',
      category: 'Agriculture',
      role: 'worker',
    };

    const existingPrivateDetails = {
      profile_id: 'worker-clear-123',
      date_of_birth: '1995-01-01',
      address_line: 'Old Colony 12',
    };

    const upsertPrivateCalls: Record<string, unknown>[] = [];

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: existingProfile, error: null }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === 'workers') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === 'profile_private_details') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: existingPrivateDetails, error: null }),
          upsert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            upsertPrivateCalls.push(payload);
            return Promise.resolve({ data: payload, error: null });
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom as unknown as (relation: string) => ReturnType<typeof supabase.from>);

    const mockSaved = vi.fn();
    render(
      <WorkerProfileModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={mockSaved}
        currentLang="English"
        user={{ id: 'worker-clear-123', phone: '+919876543210' } as unknown as User}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Anita Devi')).toBeInTheDocument();
      expect(screen.getByText('Old Colony 12')).toBeInTheDocument();
    });

    // Enter edit mode
    const editBtn = screen.getByRole('button', { name: /Edit Profile Information/i });
    fireEvent.click(editBtn);

    // Clear Address and DOB
    const addressInput = await screen.findByPlaceholderText('Near Old Gram Panchayat');
    fireEvent.change(addressInput, { target: { value: '' } });

    // Find date input by type="date"
    const dobInput = document.querySelector('input[type="date"]');
    if (dobInput) {
      fireEvent.change(dobInput, { target: { value: '' } });
    }

    // Submit save
    const saveButton = screen.getByRole('button', { name: /update profile/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSaved).toHaveBeenCalled();
    });

    // Verify profile_private_details upsert was called with nulls, not skipped
    expect(upsertPrivateCalls.length).toBeGreaterThan(0);
    const lastCall = upsertPrivateCalls[upsertPrivateCalls.length - 1];
    expect(lastCall.profile_id).toBe('worker-clear-123');
    expect(lastCall.date_of_birth).toBeNull();
    expect(lastCall.address_line).toBeNull();
  });

  it('does NOT overwrite private fields with nulls if profile_private_details failed to load and user did not edit private data', async () => {
    const existingProfile = {
      id: 'worker-err-123',
      full_name: 'Anita Devi',
      phone_number: '+919876543210',
      village: 'Kheda Village',
      district: 'Anand',
      state: 'Gujarat',
      category: 'Agriculture',
      role: 'worker',
    };

    const upsertPrivateCalls: Record<string, unknown>[] = [];

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: existingProfile, error: null }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === 'workers') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === 'profile_private_details') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'Connection timeout', code: 'PGRST000' } }),
          upsert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            upsertPrivateCalls.push(payload);
            return Promise.resolve({ data: payload, error: null });
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom as unknown as (relation: string) => ReturnType<typeof supabase.from>);

    const mockSaved = vi.fn();
    render(
      <WorkerProfileModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={mockSaved}
        currentLang="English"
        user={{ id: 'worker-err-123', phone: '+919876543210' } as unknown as User}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Anita Devi')).toBeInTheDocument();
    });

    // Enter edit mode
    const editBtn = screen.getByRole('button', { name: /Edit Profile Information/i });
    fireEvent.click(editBtn);

    // Only update wage, do NOT edit DOB or address
    const wageInput = await screen.findByDisplayValue('500');
    fireEvent.change(wageInput, { target: { value: '650' } });

    // Submit save
    const saveButton = screen.getByRole('button', { name: /update profile/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSaved).toHaveBeenCalled();
    });

    // Verify profile_private_details upsert was SKIPPED to protect existing remote data
    expect(upsertPrivateCalls.length).toBe(0);
  });

  it('allows worker to search preferred work location and selects autocomplete suggestion with automatic coordinates mapping', async () => {
    const upsertProfilesCalls: Record<string, unknown>[] = [];
    const upsertWorkersCalls: Record<string, unknown>[] = [];

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            upsertProfilesCalls.push(payload);
            return Promise.resolve({ data: payload, error: null });
          }),
        };
      }
      if (table === 'workers') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            upsertWorkersCalls.push(payload);
            return Promise.resolve({ data: payload, error: null });
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom as unknown as (relation: string) => ReturnType<typeof supabase.from>);

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

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Full name')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Full name'), {
      target: { value: 'Kisan Patil' },
    });
    fireEvent.change(screen.getByPlaceholderText('10-digit mobile number'), {
      target: { value: '+919876543210' },
    });

    // Enter preferred location search
    const locInput = screen.getByPlaceholderText(/search village, town, city, or 6-digit PIN code/i);
    fireEvent.change(locInput, { target: { value: 'Shirur' } });

    // Suggestion dropdown appears
    const suggestionBtn = await screen.findByText(/Shirur, Pune, Maharashtra \(PIN 412210\)/i);
    expect(suggestionBtn).toBeInTheDocument();

    // Select suggestion
    fireEvent.mouseDown(suggestionBtn);

    // Confirmation badge appears
    await waitFor(() => {
      expect(screen.getByText(/18.8256° N, 74.3789° E/i)).toBeInTheDocument();
      expect(screen.getByText(/Approximate area centroid \(PIN code\)/i)).toBeInTheDocument();
    });

    // Select 15 km radius chip
    const radiusChip = screen.getByRole('button', { name: '15 km' });
    fireEvent.click(radiusChip);

    // Save profile
    const saveButton = screen.getByRole('button', { name: /save worker profile/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSaved).toHaveBeenCalled();
    });

    // Verify coordinates and preferred location persisted
    expect(upsertProfilesCalls.length).toBeGreaterThan(0);
    expect(upsertProfilesCalls[0].latitude).toBe(18.8256);
    expect(upsertProfilesCalls[0].longitude).toBe(74.3789);

    expect(upsertWorkersCalls.length).toBeGreaterThan(0);
    expect(upsertWorkersCalls[0].latitude).toBe(18.8256);
    expect(upsertWorkersCalls[0].longitude).toBe(74.3789);
    expect(upsertWorkersCalls[0].preferred_work_location).toContain('15 km');
  });

  it('displays coordinates and preferred working location in read-only profile view', async () => {
    const existingProfile = {
      id: 'worker-uuid-123',
      full_name: 'Baburao Apte',
      phone_number: '+919876543210',
      category: 'Agriculture',
      role: 'worker',
      latitude: 18.8256,
      longitude: 74.3789,
      preferred_work_location: 'Shirur, Pune (Radius: 25 km)',
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
            data: {
              id: 'worker-uuid-123',
              latitude: 18.8256,
              longitude: 74.3789,
              preferred_work_location: 'Shirur, Pune (Radius: 25 km)',
            },
            error: null,
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom as unknown as (relation: string) => ReturnType<typeof supabase.from>);

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
      expect(screen.getByText('Baburao Apte')).toBeInTheDocument();
      expect(screen.getByText(/18.8256° N, 74.3789° E/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Shirur, Pune/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/25 km radius/i)).toBeInTheDocument();
    });
  });
});