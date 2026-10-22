import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Auth } from './Auth';

// Mock Supabase client
vi.mock('../lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              gt: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({ data: [{ otp: '123456' }], error: null }),
                })),
              })),
            })),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        delete: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
      auth: {
        signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
        verifyOtp: vi.fn().mockResolvedValue({ data: { user: { id: 'mock-user-1' } }, error: null }),
        signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: 'mock-user-1' }, session: {} }, error: null }),
        signUp: vi.fn().mockResolvedValue({ data: { user: { id: 'mock-user-1' }, session: {} }, error: null }),
      },
    },
  };
});

describe('Auth Component with Fast2SMS & Dual Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ return: true, status_code: 200 }),
      })
    );
  });

  it('renders dual authentication tabs: Mobile OTP (+91) and Email Login', () => {
    render(<Auth isOpen={true} isGate={false} currentLang="English" />);

    expect(screen.getByText('Mobile OTP (+91)')).toBeInTheDocument();
    expect(screen.getByText('Email Login')).toBeInTheDocument();
  });

  it('allows switching between Mobile OTP and Email Login tabs', () => {
    render(<Auth isOpen={true} isGate={false} currentLang="English" />);

    // Default tab is mobile OTP
    expect(screen.getByPlaceholderText(/Enter 10-digit mobile number/i)).toBeInTheDocument();

    // Click on Email Login tab
    fireEvent.click(screen.getByText('Email Login'));
    expect(screen.getByPlaceholderText(/name@example.com/i)).toBeInTheDocument();

    // Click back to Mobile OTP tab
    fireEvent.click(screen.getByText('Mobile OTP (+91)'));
    expect(screen.getByPlaceholderText(/Enter 10-digit mobile number/i)).toBeInTheDocument();
  });

  it('validates mobile number before sending OTP', async () => {
    render(<Auth isOpen={true} isGate={false} currentLang="English" />);

    const sendBtn = screen.getByRole('button', { name: /Send OTP/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText(/Please enter a valid 10-digit mobile number/i)).toBeInTheDocument();
    });
  });

  it('progresses to OTP verification step when a valid 10-digit number is submitted', async () => {
    render(<Auth isOpen={true} isGate={false} currentLang="English" />);

    const phoneInput = screen.getByPlaceholderText(/Enter 10-digit mobile number/i);
    fireEvent.change(phoneInput, { target: { value: '9876543210' } });

    const sendBtn = screen.getByRole('button', { name: /Send OTP/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText('Enter OTP')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Enter 6-digit OTP/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Verify & Sign In/i })).toBeInTheDocument();
    });
  });

  it('validates 6-digit OTP format before verifying', async () => {
    render(<Auth isOpen={true} isGate={false} currentLang="English" />);

    const phoneInput = screen.getByPlaceholderText(/Enter 10-digit mobile number/i);
    fireEvent.change(phoneInput, { target: { value: '9876543210' } });

    const sendBtn = screen.getByRole('button', { name: /Send OTP/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Verify & Sign In/i })).toBeInTheDocument();
    });

    const verifyBtn = screen.getByRole('button', { name: /Verify & Sign In/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(screen.getByText(/Please enter the 6-digit OTP code/i)).toBeInTheDocument();
    });
  });

  it('successfully verifies valid OTP and triggers login callback', async () => {
    const onLoginSuccessMock = vi.fn();
    render(
      <Auth
        isOpen={true}
        isGate={false}
        currentLang="English"
        onLoginSuccess={onLoginSuccessMock}
      />
    );

    const phoneInput = screen.getByPlaceholderText(/Enter 10-digit mobile number/i);
    fireEvent.change(phoneInput, { target: { value: '9876543210' } });

    const sendBtn = screen.getByRole('button', { name: /Send OTP/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Enter 6-digit OTP/i)).toBeInTheDocument();
    });

    const otpInput = screen.getByPlaceholderText(/Enter 6-digit OTP/i);
    fireEvent.change(otpInput, { target: { value: '123456' } });

    const verifyBtn = screen.getByRole('button', { name: /Verify & Sign In/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(onLoginSuccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'mock-user-1' }),
        'worker'
      );
    });
  });

  it('renders translated tabs, labels, and buttons in Hindi', () => {
    render(<Auth isOpen={true} isGate={false} currentLang="हिंदी (Hindi)" />);

    // Mobile OTP and Email Login tabs in Hindi
    expect(screen.getByText('मोबाइल ओटीपी (+91)')).toBeInTheDocument();
    expect(screen.getByText('ईमेल लॉगिन')).toBeInTheDocument();

    // Switch to Email tab
    fireEvent.click(screen.getByText('ईमेल लॉगिन'));

    // Translated email and password labels
    expect(screen.getByText('ईमेल पता')).toBeInTheDocument();
    expect(screen.getByText('पासवर्ड')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /साइन इन \(कामगार\)/i })).toBeInTheDocument();
  });

  it('renders translated tabs, labels, and buttons in Marathi', () => {
    render(<Auth isOpen={true} isGate={false} currentLang="मराठी (Marathi)" />);

    expect(screen.getByText('मोबाईल ओटीपी (+91)')).toBeInTheDocument();
    expect(screen.getByText('ईमेल लॉगिन')).toBeInTheDocument();

    fireEvent.click(screen.getByText('ईमेल लॉगिन'));

    expect(screen.getByText('ईमेल पत्ता')).toBeInTheDocument();
    expect(screen.getByText('पासवर्ड')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /साइन इन \(कामगार\)/i })).toBeInTheDocument();
  });

  it('includes VoiceSpeakerButton accessibility triggers next to Email and Password labels', () => {
    render(<Auth isOpen={true} isGate={false} currentLang="English" />);

    // Switch to Email tab
    fireEvent.click(screen.getByText('Email Login'));

    // Verify presence of accessibility speaker buttons
    expect(screen.getByRole('button', { name: /Listen to email address instruction/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Listen to password instruction/i })).toBeInTheDocument();
  });

  it('toggles between Sign In and Sign Up modes with translated text in Email mode', () => {
    render(<Auth isOpen={true} isGate={false} currentLang="English" />);

    fireEvent.click(screen.getByText('Email Login'));

    // Initially in Sign In mode
    expect(screen.getByRole('button', { name: /Sign In \(Worker\)/i })).toBeInTheDocument();
    expect(screen.getByText(/Don't have an account\?/i)).toBeInTheDocument();

    // Toggle to Sign Up mode
    fireEvent.click(screen.getByRole('button', { name: /Sign Up/i }));

    expect(screen.getByRole('button', { name: /Create Worker Account/i })).toBeInTheDocument();
    expect(screen.getByText(/Already have an account\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Minimum 6 characters required/i)).toBeInTheDocument();
  });

  it('calls Fast2SMS API when Live SMS is ON', async () => {
    localStorage.setItem('quickhire_live_sms_enabled', 'true');
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ return: true, status_code: 200, message: ['Success'] }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    render(<Auth isOpen={true} isGate={false} currentLang="English" />);

    const phoneInput = screen.getByPlaceholderText(/Enter 10-digit mobile number/i);
    fireEvent.change(phoneInput, { target: { value: '9876543210' } });

    const sendBtn = screen.getByRole('button', { name: /Send OTP/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toContain('https://www.fast2sms.com/dev/bulkV2');
      expect(screen.getByText(/OTP successfully sent to \+91 9876543210 via Fast2SMS/i)).toBeInTheDocument();
    });
  });

  it('skips Fast2SMS network call and displays OTP on screen when Live SMS is OFF (Demo Mode)', async () => {
    localStorage.setItem('quickhire_live_sms_enabled', 'false');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    render(<Auth isOpen={true} isGate={false} currentLang="English" />);

    const phoneInput = screen.getByPlaceholderText(/Enter 10-digit mobile number/i);
    fireEvent.change(phoneInput, { target: { value: '9876543210' } });

    const sendBtn = screen.getByRole('button', { name: /Send OTP/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      // Fast2SMS network call MUST be skipped
      expect(fetchSpy).not.toHaveBeenCalled();
      // OTP notice must be displayed on screen
      expect(screen.getByText(/\[SMS Demo Mode\] OTP:/i)).toBeInTheDocument();
      // Demo OTP helper card with Auto-fill button must be visible
      expect(screen.getByText(/Demo OTP:/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Auto-fill/i })).toBeInTheDocument();
    });

    // Test clicking Auto-fill populates the OTP input
    const autoFillBtn = screen.getByRole('button', { name: /Auto-fill/i });
    fireEvent.click(autoFillBtn);
    const otpInput = screen.getByPlaceholderText(/Enter 6-digit OTP/i) as HTMLInputElement;
    expect(otpInput.value.length).toBe(6);
  });
});


