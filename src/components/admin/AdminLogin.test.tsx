import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdminLogin from './AdminLogin';

// Mock Supabase
vi.mock('../../lib/supabase', () => {
  return {
    supabase: {
      auth: {
        signInWithPassword: vi.fn().mockImplementation(({ email, password }) => {
          if (email === 'admin@quickhire.local' && password === 'ValidPassword123!') {
            return Promise.resolve({
              data: {
                user: { id: 'admin-uuid-1', email: 'admin@quickhire.local' },
                session: { access_token: 'mock-token' },
              },
              error: null,
            });
          }
          return Promise.resolve({
            data: { user: null, session: null },
            error: { message: 'Invalid email or password.' },
          });
        }),
        signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
        verifyOtp: vi.fn().mockResolvedValue({
          data: {
            user: { id: 'admin-uuid-1', phone: '+919876543210' },
            session: { access_token: 'mock-token' },
          },
          error: null,
        }),
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      rpc: vi.fn().mockImplementation((fnName: string) => {
        if (fnName === 'is_admin') {
          return Promise.resolve({ data: true, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      from: vi.fn(() => {
        const queryBuilder: Record<string, unknown> = {
          select: vi.fn(() => queryBuilder),
          eq: vi.fn(() => queryBuilder),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              role: 'super_admin',
              verified_email: 'admin@quickhire.local',
              verified_phone: '+919876543210',
              is_active: true,
            },
            error: null,
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        return queryBuilder;
      }),
    },
  };
});

describe('AdminLogin Component (Dual-Method Verified Auth: Email/Password & Phone OTP)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('renders Administrator Authentication heading and dual login tabs', () => {
    render(<AdminLogin onLoginSuccess={vi.fn()} />);

    expect(screen.getByText('Administrator Authentication')).toBeInTheDocument();
    expect(screen.getByText(/Single designated administrator portal/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Email & Password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Phone SMS OTP/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('admin@quickhire.local')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In as Administrator/i })).toBeInTheDocument();
  });

  it('allows switching between Email & Password and Phone SMS OTP tabs', () => {
    render(<AdminLogin onLoginSuccess={vi.fn()} />);

    const phoneTabBtn = screen.getByRole('button', { name: /Phone SMS OTP/i });
    fireEvent.click(phoneTabBtn);

    expect(screen.getByPlaceholderText('+919876543210')).toBeInTheDocument();
    expect(screen.getByText(/Authorized Administrator Phone/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send Verification Code/i })).toBeInTheDocument();

    const emailTabBtn = screen.getByRole('button', { name: /Email & Password/i });
    fireEvent.click(emailTabBtn);

    expect(screen.getByPlaceholderText('admin@quickhire.local')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••••••')).toBeInTheDocument();
  });

  it('validates email format before submitting password login', async () => {
    render(<AdminLogin onLoginSuccess={vi.fn()} />);

    const emailInput = screen.getByPlaceholderText('admin@quickhire.local') as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText('••••••••••••') as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    fireEvent.change(passwordInput, { target: { value: 'SomePass123!' } });

    const submitBtn = screen.getByRole('button', { name: /Sign In as Administrator/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Please enter a valid administrator email address/i)).toBeInTheDocument();
    });
  });

  it('validates minimum password length before submitting password login', async () => {
    render(<AdminLogin onLoginSuccess={vi.fn()} />);

    const emailInput = screen.getByPlaceholderText('admin@quickhire.local') as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText('••••••••••••') as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: 'admin@quickhire.local' } });
    fireEvent.change(passwordInput, { target: { value: '123' } });

    const submitBtn = screen.getByRole('button', { name: /Sign In as Administrator/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Please enter your administrator password \(at least 6 characters\)/i)).toBeInTheDocument();
    });
  });

  it('authenticates successfully with valid email and password', async () => {
    const mockSuccess = vi.fn();
    render(<AdminLogin onLoginSuccess={mockSuccess} />);

    const emailInput = screen.getByPlaceholderText('admin@quickhire.local') as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText('••••••••••••') as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: 'admin@quickhire.local' } });
    fireEvent.change(passwordInput, { target: { value: 'ValidPassword123!' } });

    const submitBtn = screen.getByRole('button', { name: /Sign In as Administrator/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSuccess).toHaveBeenCalled();
    });
  });

  it('dispatches SMS OTP and transitions to code verification step in Phone tab', async () => {
    render(<AdminLogin onLoginSuccess={vi.fn()} />);

    const phoneTabBtn = screen.getByRole('button', { name: /Phone SMS OTP/i });
    fireEvent.click(phoneTabBtn);

    const phoneInput = screen.getByPlaceholderText('+919876543210') as HTMLInputElement;
    fireEvent.change(phoneInput, { target: { value: '+919876543210' } });

    const sendBtn = screen.getByRole('button', { name: /Send Verification Code/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText(/6-Digit SMS Verification Code/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Verify & Authenticate/i })).toBeInTheDocument();
    });
  });

  it('allows navigating back to public portal', () => {
    const mockNavigatePublic = vi.fn();
    render(<AdminLogin onNavigatePublic={mockNavigatePublic} />);

    const publicBtn = screen.getByRole('button', { name: /Public Portal/i });
    fireEvent.click(publicBtn);

    expect(mockNavigatePublic).toHaveBeenCalled();
  });
});
