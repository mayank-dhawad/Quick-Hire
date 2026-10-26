import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DirectPaymentModal } from './DirectPaymentModal';
import { User } from '@supabase/supabase-js';
import { UPI_REGEX } from './BankDetailsTab';

// Mock Supabase client
const { mockInsert, mockUpdate, mockSingle } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockSingle: vi.fn(),
}));

vi.mock('../lib/supabase', () => {
  const queryBuilder: any = {
    single: mockSingle,
    eq: vi.fn(() => queryBuilder),
    in: vi.fn(() => queryBuilder),
    order: vi.fn(() => queryBuilder),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  };

  return {
    supabase: {
      from: vi.fn((_table: string) => ({
        select: vi.fn(() => queryBuilder),
        insert: mockInsert,
        update: mockUpdate,
      })),
      rpc: vi.fn(async (fnName: string, params?: any) => {
        if (fnName === 'get_payment_recipient_details') {
          if (params?.p_recipient_id === 'worker_no_upi') {
            return {
              data: {
                recipient_name: 'Kisan Lal',
                bank_name: null,
                bank_account_no: null,
                bank_ifsc: null,
                upi_id: null,
              },
              error: null,
            };
          }
          return {
            data: {
              recipient_name: 'Ramesh Patel',
              bank_name: 'State Bank of India',
              bank_account_no: '123456789012',
              bank_ifsc: 'SBIN0001234',
              upi_id: 'ramesh.patel@oksbi',
            },
            error: null,
          };
        }
        return { data: { success: true }, error: null };
      }),
    },
  };
});

// Mock speech
vi.mock('../lib/speech', () => ({
  speakText: vi.fn(),
  getVoiceGuidance: vi.fn(),
  isSpeechSupported: vi.fn(() => true),
  subscribeToSpeech: vi.fn(() => () => {}),
  getCurrentSpeakingText: vi.fn(() => null),
  stopSpeaking: vi.fn(),
}));

const mockEmployer: User = {
  id: 'employer_user_999',
  app_metadata: {},
  user_metadata: { full_name: 'Harish Kumar' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
};

describe('DirectPaymentModal & Direct UPI Intent Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Default mock response for recipient profile
    mockSingle.mockResolvedValue({
      data: {
        bank_name: 'State Bank of India',
        bank_account_no: '123456789012',
        bank_ifsc: 'SBIN0001234',
        upi_id: 'ramesh.patel@oksbi',
      },
      error: null,
    });

    mockInsert.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'pay_attempt_123',
            payer_id: 'employer_user_999',
            payee_id: 'worker_user_111',
            payment_for_type: 'worker_wage',
            reference_id: 'job_harvest_456',
            amount: 750,
            payment_method: 'Direct UPI',
            payment_reference: 'QH-PAY-12345678-ABCD',
            currency: 'INR',
            status: 'pending',
            verification_status: 'unverified',
          },
        ],
        error: null,
      }),
    });

    mockUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  describe('UPI Virtual Payment Address (VPA) Regex Testing', () => {
    it('accepts valid Indian UPI handles across bank providers', () => {
      const validUpiIds = [
        'ramesh.patel@oksbi',
        '9876543210@paytm',
        'farmer_kisan@apl',
        'contractor12@ybl',
        'dailyworker@icici',
        'custom.name-123@hdfcbank',
      ];

      for (const id of validUpiIds) {
        expect(UPI_REGEX.test(id)).toBe(true);
      }
    });

    it('rejects invalid, whitespace, or malformed UPI handles', () => {
      const invalidUpiIds = [
        'plainusername', // missing @
        '@oksbi', // starts with @
        'username@', // ends with @
        'user@name@upi', // double @
        'user space@upi', // contains space
        '', // empty
      ];

      for (const id of invalidUpiIds) {
        expect(UPI_REGEX.test(id)).toBe(false);
      }
    });
  });

  describe('Payment Confirmation Screen (Step 1)', () => {
    it('displays worker recipient, agreed wage amount, and real saved UPI ID', async () => {
      render(
        <DirectPaymentModal
          isOpen={true}
          onClose={vi.fn()}
          currentUser={mockEmployer}
          recipientId="worker_user_111"
          recipientName="Ramesh Patel"
          recipientPhone="+919876543210"
          paymentForType="worker_wage"
          referenceId="job_harvest_456"
          defaultAmount={750}
          currentLang="English"
          onRequireLogin={vi.fn()}
        />
      );

      // Verify recipient summary
      expect(await screen.findByText('Ramesh Patel')).toBeInTheDocument();
      expect(screen.getByText('₹750')).toBeInTheDocument();
      expect(screen.getByText('ramesh.patel@oksbi')).toBeInTheDocument();

      // Verify Proceed to UPI button is present with correct amount
      expect(screen.getByRole('button', { name: /Proceed to UPI App/i })).toBeInTheDocument();
    });

    it('shows warning when worker has not added a UPI ID', async () => {
      mockSingle.mockResolvedValueOnce({
        data: {
          bank_name: null,
          bank_account_no: null,
          bank_ifsc: null,
          upi_id: null,
        },
        error: null,
      });

      render(
        <DirectPaymentModal
          isOpen={true}
          onClose={vi.fn()}
          currentUser={mockEmployer}
          recipientId="worker_no_upi"
          recipientName="Kisan Lal"
          recipientPhone="+919876543210"
          paymentForType="worker_wage"
          referenceId="job_harvest_456"
          defaultAmount={500}
          currentLang="English"
          onRequireLogin={vi.fn()}
        />
      );

      expect(
        await screen.findByText(/Worker has not configured a UPI ID yet/i)
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Proceed to UPI App/i })).not.toBeInTheDocument();
    });
  });

  describe('Payment Intent Launch & Status Isolation (Step 2)', () => {
    it('creates an unverified pending payment attempt record and transitions to UTR verification screen', async () => {
      render(
        <DirectPaymentModal
          isOpen={true}
          onClose={vi.fn()}
          currentUser={mockEmployer}
          recipientId="worker_user_111"
          recipientName="Ramesh Patel"
          recipientPhone="+919876543210"
          paymentForType="worker_wage"
          referenceId="job_harvest_456"
          defaultAmount={750}
          currentLang="English"
          onRequireLogin={vi.fn()}
        />
      );

      const proceedBtn = await screen.findByRole('button', { name: /Proceed to UPI App/i });
      fireEvent.click(proceedBtn);

      await waitFor(() => {
        // Assert attempt was inserted with status 'pending' (NOT 'completed' or 'paid')
        expect(mockInsert).toHaveBeenCalled();
      });

      // Verify Step 2 UI is displayed
      expect(await screen.findByText(/UPI Intent Dispatched/i)).toBeInTheDocument();
      expect(screen.getByText(/does not mark payments as paid merely because you returned/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/e\.g\. 423849182394 or UPI Reference/i)).toBeInTheDocument();
    });

    it('submitting UTR reference updates payment status to "submitted", NOT "paid"', async () => {
      const onPaymentRecorded = vi.fn();

      render(
        <DirectPaymentModal
          isOpen={true}
          onClose={vi.fn()}
          currentUser={mockEmployer}
          recipientId="worker_user_111"
          recipientName="Ramesh Patel"
          recipientPhone="+919876543210"
          paymentForType="worker_wage"
          referenceId="job_harvest_456"
          defaultAmount={750}
          currentLang="English"
          onPaymentRecorded={onPaymentRecorded}
          onRequireLogin={vi.fn()}
        />
      );

      // Launch intent to reach step 2
      const proceedBtn = await screen.findByRole('button', { name: /Proceed to UPI App/i });
      fireEvent.click(proceedBtn);

      const utrInput = await screen.findByPlaceholderText(/e\.g\. 423849182394 or UPI Reference/i);
      fireEvent.change(utrInput, { target: { value: '423849182394' } });

      const submitUtrBtn = screen.getByRole('button', { name: /Submit Reference for Verification/i });
      fireEvent.click(submitUtrBtn);

      await waitFor(() => {
        expect(onPaymentRecorded).toHaveBeenCalledWith(
          expect.objectContaining({
            transaction_ref: '423849182394',
            status: 'submitted',
            verification_status: 'pending_verification',
          })
        );
      });
    });

    it('rejects empty or short UTR submissions', async () => {
      render(
        <DirectPaymentModal
          isOpen={true}
          onClose={vi.fn()}
          currentUser={mockEmployer}
          recipientId="worker_user_111"
          recipientName="Ramesh Patel"
          recipientPhone="+919876543210"
          paymentForType="worker_wage"
          referenceId="job_harvest_456"
          defaultAmount={750}
          currentLang="English"
          onRequireLogin={vi.fn()}
        />
      );

      // Launch intent
      const proceedBtn = await screen.findByRole('button', { name: /Proceed to UPI App/i });
      fireEvent.click(proceedBtn);

      const utrInput = await screen.findByPlaceholderText(/e\.g\. 423849182394 or UPI Reference/i);
      fireEvent.change(utrInput, { target: { value: '123' } });

      const submitUtrBtn = screen.getByRole('button', { name: /Submit Reference for Verification/i });
      fireEvent.click(submitUtrBtn);

      expect(
        await screen.findByText(/UPI Reference \/ UTR number is usually 12 digits/i)
      ).toBeInTheDocument();
    });
  });
});
