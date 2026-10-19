import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BankDetailsTab, IFSC_REGEX } from './BankDetailsTab';
import { User } from '@supabase/supabase-js';

// Mock supabase client
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: {
              bank_name: 'State Bank of India (SBI)',
              bank_account_no: '123456789012',
              bank_ifsc: 'SBIN0001234',
              upi_id: 'testworker@oksbi',
            },
            error: null,
          }),
        })),
        or: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'pay_1',
                payer_id: 'user_employer_1',
                payee_id: 'mock_user_123',
                payment_for_type: 'worker_wage',
                amount: 1500,
                payment_method: 'Direct UPI',
                transaction_ref: 'UPI123456789012',
                status: 'settled',
                created_at: new Date().toISOString(),
              },
            ],
            error: null,
          }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  },
}));

// Mock speech utility
vi.mock('../lib/speech', () => ({
  speakText: vi.fn(),
  getVoiceGuidance: vi.fn((key: string) => `Guidance for ${key}`),
  isSpeechSupported: vi.fn(() => true),
  subscribeToSpeech: vi.fn(() => () => {}),
  getCurrentSpeakingText: vi.fn(() => null),
  stopSpeaking: vi.fn(),
}));

const mockUser: User = {
  id: 'mock_user_123',
  app_metadata: {},
  user_metadata: { full_name: 'Ramesh Patel' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
};

describe('BankDetailsTab & Validation Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Indian IFSC Regex Validation (/^[A-Z]{4}0[A-Z0-9]{6}$/)', () => {
    it('accepts valid 11-character Indian IFSC codes', () => {
      const validCodes = [
        'SBIN0001234',
        'MAHB0000123',
        'HDFC0000001',
        'BARB0000001',
        'PUNB0123456',
        'CNRB0001234',
        'IPOS0000001',
        'UTIB0000123',
      ];

      for (const code of validCodes) {
        expect(IFSC_REGEX.test(code)).toBe(true);
      }
    });

    it('rejects invalid or malformed IFSC codes', () => {
      const invalidCodes = [
        'SBIN1234', // Too short (8 chars)
        'SBIN1001234', // 5th char must be 0, not 1
        'sbin0001234', // Lowercase letters
        '12340001234', // First 4 must be letters
        'SBIN00012345', // Too long (12 chars)
        'SBIN000123@', // Special characters
        '   ', // Whitespace
      ];

      for (const code of invalidCodes) {
        expect(IFSC_REGEX.test(code)).toBe(false);
      }
    });
  });

  describe('Component Rendering & User Experience', () => {
    it('renders login prompt when user is not authenticated', () => {
      const onRequireLogin = vi.fn();
      render(<BankDetailsTab user={null} onRequireLogin={onRequireLogin} />);

      expect(screen.getByText(/Login to Access Bank & Payouts/i)).toBeInTheDocument();
      const loginBtn = screen.getByRole('button', { name: /Login/i });
      fireEvent.click(loginBtn);
      expect(onRequireLogin).toHaveBeenCalledTimes(1);
    });

    it('renders net banking and UPI setup form when authenticated', async () => {
      render(
        <BankDetailsTab
          user={mockUser}
          currentLang="English"
          onRequireLogin={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getAllByText(/0% Platform Commission/i).length).toBeGreaterThan(0);
      });

      expect(screen.getByText(/Bank & Payout Accounts/i)).toBeInTheDocument();

      // Verify form input fields
      expect(screen.getAllByText(/Bank Account Number/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Confirm Account Number/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Bank IFSC Code/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Direct UPI ID/i).length).toBeGreaterThanOrEqual(1);
    });

    it('displays inline validation error for malformed IFSC code', async () => {
      render(
        <BankDetailsTab
          user={mockUser}
          currentLang="English"
          onRequireLogin={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/e\.g\. SBIN0001234/i)).toBeInTheDocument();
      });

      const ifscInput = screen.getByPlaceholderText(/e\.g\. SBIN0001234/i);
      fireEvent.change(ifscInput, { target: { value: 'INVALID12' } });

      expect(
        await screen.findByText(/Invalid IFSC code format/i)
      ).toBeInTheDocument();
    });

    it('displays inline validation error for malformed UPI ID lacking @', async () => {
      render(
        <BankDetailsTab
          user={mockUser}
          currentLang="English"
          onRequireLogin={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/9876543210@paytm/i)).toBeInTheDocument();
      });

      const upiInput = screen.getByPlaceholderText(/9876543210@paytm/i);
      fireEvent.change(upiInput, { target: { value: 'invalidupinokey' } });

      expect(
        await screen.findByText(/Invalid UPI ID format\. Must contain '@'/i)
      ).toBeInTheDocument();
    });

    it('supports 1-tap copy functionality with visual feedback', async () => {
      // Mock clipboard writeText
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      render(
        <BankDetailsTab
          user={mockUser}
          currentLang="English"
          onRequireLogin={vi.fn()}
        />
      );

      // Wait for existing data to populate card
      const copyButtons = await screen.findAllByRole('button', { name: /Copy/i });
      expect(copyButtons.length).toBeGreaterThan(0);

      // Click first copy button
      fireEvent.click(copyButtons[0]);
      expect(writeTextMock).toHaveBeenCalled();
    });

    it('renders in regional language (Hindi) without hardcoded English', async () => {
      render(
        <BankDetailsTab
          user={mockUser}
          currentLang="हिंदी (Hindi)"
          onRequireLogin={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/सीधा भुगतान खाता/i)).toBeInTheDocument();
      });

      // Check Hindi translated strings
      expect(screen.getByText(/शून्य शुल्क/i)).toBeInTheDocument();
      expect(screen.getByText(/खाता संख्या की पुष्टि करें/i)).toBeInTheDocument();
    });
  });
});
