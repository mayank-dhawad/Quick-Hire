import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Auth } from './Auth';
import { supabase } from '../lib/supabase';

// Mock Supabase client
vi.mock('../lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(() => {
        const queryBuilder: Record<string, unknown> = {
          select: vi.fn(() => queryBuilder),
          eq: vi.fn(() => queryBuilder),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn(() => queryBuilder),
          delete: vi.fn(() => queryBuilder),
        };
        return queryBuilder;
      }),
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
      auth: {
        signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
        verifyOtp: vi.fn().mockResolvedValue({
          data: {
            user: { id: 'mock-user-1', phone: '+919876543210' },
            session: { access_token: 'mock-token' },
          },
          error: null,
        }),
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: { id: 'mock-user-1' }, session: {} },
          error: null,
        }),
        signUp: vi.fn().mockResolvedValue({
          data: { user: { id: 'mock-user-1' }, session: {} },
          error: null,
        }),
      },
    },
  };
});

describe('Auth Component with Supabase Native Phone Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('renders dual authentication tabs: Mobile OTP (+91) and Email Login', () => {
    render(<Auth isOpen={true} isGate={false} currentLang="English" />);

    expect(screen.getByText('Mobile OTP (+91)')).toBeInTheDocument();
    expect(screen.getByText('Email Login')).toBeInTheDocument();
  });

  it('renders country code selector defaulting to India (+91)', () => {
    render(<Auth isOpen={true} isGate={false} currentLang="English" />);

    const select = screen.getByLabelText(/Country Code/i) as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('+91');
    expect(screen.getByText(/🇮🇳 \+91 \(India\)/i)).toBeInTheDocument();
  });

  it('allows switching between Mobile OTP and Email Login tabs', () => {
    render(<Auth isOpen={true} isGate={false} currentLang="English" />);

    expect(screen.getByPlaceholderText(/Enter 10-digit mobile number/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Email Login'));
    expect(screen.getByPlaceholderText(/name@example.com/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Mobile OTP (+91)'));
    expect(screen.getByPlaceholderText(/Enter 10-digit mobile number/i)).toBeInTheDocument();
  });

  it('validates mobile number before requesting OTP', async () => {
    render(<Auth isOpen={true} isGate={false} currentLang="English" />);

    const sendBtn = screen.getByRole('button', { name: /Send OTP/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText(/Please enter a valid 10-digit mobile number/i)).toBeInTheDocument();
    });
    expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('requests real SMS verification via Supabase Auth signInWithOtp and normalizes to E.164', async () => {
    render(<Auth isOpen={true} isGate={false} currentLang="English" />);

    const phoneInput = screen.getByPlaceholderText(/Enter 10-digit mobile number/i);
    fireEvent.change(phoneInput, { target: { value: '9876543210' } });

    const sendBtn = screen.getByRole('button', { name: /Send OTP/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
        phone: '+919876543210',
        options: { channel: 'sms' },
      });
      // Verifies eligible message
      expect(screen.getByText(/If the number is eligible, a verification code will be sent by SMS/i)).toBeInTheDocument();
      // Verifies masked phone number display
      expect(screen.getAllByText(/\+91 \*\*\*\*\*\*3210/i).length).toBeGreaterThanOrEqual(1);
      // Dedicated 6-digit OTP entry interface
      expect(screen.getByPlaceholderText(/Enter 6-digit OTP/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Verify & Sign In/i })).toBeInTheDocument();
    });

    // CRITICAL SECURITY ASSERTION: No actual OTP is EVER displayed in the DOM
    expect(screen.queryByText(/Demo OTP:/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Auto-fill/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Fast2SMS/i)).not.toBeInTheDocument();
  });

  it('displays resend cooldown timer and prevents premature resend requests', async () => {
    render(<Auth isOpen={true} isGate={false} currentLang="English" />);

    const phoneInput = screen.getByPlaceholderText(/Enter 10-digit mobile number/i);
    fireEvent.change(phoneInput, { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: /Send OTP/i }));

    await waitFor(() => {
      // Cooldown timer is visible and button is disabled
      const resendBtn = screen.getByRole('button', { name: /Resend code in \d+s/i });
      expect(resendBtn).toBeInTheDocument();
      expect(resendBtn).toBeDisabled();
    });
  });

  it('allows user to change phone number and returns to request step', async () => {
    render(<Auth isOpen={true} isGate={false} currentLang="English" />);

    const phoneInput = screen.getByPlaceholderText(/Enter 10-digit mobile number/i);
    fireEvent.change(phoneInput, { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: /Send OTP/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Change Phone Number/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Change Phone Number/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Enter 10-digit mobile number/i)).toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/Enter 6-digit OTP/i)).not.toBeInTheDocument();
    });
  });

  it('verifies 6-digit OTP code via Supabase Auth verifyOtp and triggers onLoginSuccess', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: /Send OTP/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Enter 6-digit OTP/i)).toBeInTheDocument();
    });

    const otpInput = screen.getByPlaceholderText(/Enter 6-digit OTP/i);
    fireEvent.change(otpInput, { target: { value: '654321' } });

    const verifyBtn = screen.getByRole('button', { name: /Verify & Sign In/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
        phone: '+919876543210',
        token: '654321',
        type: 'sms',
      });
      expect(onLoginSuccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'mock-user-1' }),
        'worker'
      );
    });
  });

  it('displays clear error when OTP verification fails and rejects invalid codes', async () => {
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Invalid verification token' } as any,
    });

    render(<Auth isOpen={true} isGate={false} currentLang="English" />);

    const phoneInput = screen.getByPlaceholderText(/Enter 10-digit mobile number/i);
    fireEvent.change(phoneInput, { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: /Send OTP/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Enter 6-digit OTP/i)).toBeInTheDocument();
    });

    const otpInput = screen.getByPlaceholderText(/Enter 6-digit OTP/i);
    fireEvent.change(otpInput, { target: { value: '000000' } });

    fireEvent.click(screen.getByRole('button', { name: /Verify & Sign In/i }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid verification code/i)).toBeInTheDocument();
    });
  });

  it('renders translated tabs, labels, and buttons in Hindi without any demo OTP disclosure', () => {
    render(<Auth isOpen={true} isGate={false} currentLang="हिंदी (Hindi)" />);

    expect(screen.getByText('मोबाइल ओटीपी (+91)')).toBeInTheDocument();
    expect(screen.getByText('ईमेल लॉगिन')).toBeInTheDocument();

    fireEvent.click(screen.getByText('ईमेल लॉगिन'));
    expect(screen.getByText('ईमेल पता')).toBeInTheDocument();
    expect(screen.getByText('पासवर्ड')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /साइन इन \(कामगार\)/i })).toBeInTheDocument();
  });

  it('toggles between Sign In and Sign Up modes in Email mode', () => {
    render(<Auth isOpen={true} isGate={false} currentLang="English" />);

    fireEvent.click(screen.getByText('Email Login'));

    expect(screen.getByRole('button', { name: /Sign In \(Worker\)/i })).toBeInTheDocument();
    expect(screen.getByText(/Don't have an account\?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Sign Up/i }));

    expect(screen.getByRole('button', { name: /Create Worker Account/i })).toBeInTheDocument();
    expect(screen.getByText(/Already have an account\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Minimum 6 characters required/i)).toBeInTheDocument();
  });
});
