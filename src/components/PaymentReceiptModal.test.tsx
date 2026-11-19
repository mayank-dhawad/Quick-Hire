import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaymentReceiptModal, PaymentReceiptData } from './PaymentReceiptModal';

describe('PaymentReceiptModal (Requirement H — Payment Receipts)', () => {
  const mockReceipt: PaymentReceiptData = {
    receiptNumber: 'QH-RCP-20261031-1001',
    jobId: 'job-123',
    assignmentId: 'rec-456',
    jobTitle: 'Wheat Harvesting & Tractor Work',
    employerName: 'Suresh Patil',
    employerLocation: 'Rampur Village, Plot 4B',
    workerName: 'Ramesh Patel',
    workerCategory: 'Agriculture',
    agreedWage: 600,
    workingHours: 9,
    breakMinutes: 30,
    approvedOvertimeHours: 1,
    totalPayable: 675,
    amountPaid: 675,
    remainingBalance: 0,
    paymentMethod: 'Cash',
    paymentDate: '2026-10-31T12:00:00Z',
    transactionRef: 'CASH-REC-20261031',
    recordedByName: 'Suresh Patil',
    isUserReported: true,
  };

  it('renders official receipt details accurately', () => {
    render(
      <PaymentReceiptModal
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
      />
    );

    expect(screen.getByText('QH-RCP-20261031-1001')).toBeDefined();
    expect(screen.getAllByText('Suresh Patil').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ramesh Patel').length).toBeGreaterThan(0);
    expect(screen.getByText('Wheat Harvesting & Tractor Work')).toBeDefined();
    expect(screen.getAllByText('₹675').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Cash/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Fully Settled/i)).toBeDefined();
  });

  it('displays user-reported transparency notice', () => {
    render(
      <PaymentReceiptModal
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
      />
    );

    expect(
      screen.getByText(/This receipt reflects a direct user-reported wage settlement/i)
    ).toBeDefined();
  });

  it('invokes window.print when Print / PDF button is clicked', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    render(
      <PaymentReceiptModal
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
      />
    );

    const printButtons = screen.getAllByText(/Print \/ (Save as )?PDF/i);
    expect(printButtons.length).toBeGreaterThan(0);
    fireEvent.click(printButtons[0]);

    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it('displays remaining balance properly for partial payments', () => {
    const partialReceipt: PaymentReceiptData = {
      ...mockReceipt,
      receiptNumber: 'QH-RCP-20261031-1002',
      totalPayable: 1000,
      amountPaid: 400,
      remainingBalance: 600,
      paymentMethod: 'Direct UPI',
      transactionRef: '123456789012',
    };

    render(
      <PaymentReceiptModal
        isOpen={true}
        onClose={vi.fn()}
        receipt={partialReceipt}
      />
    );

    expect(screen.getAllByText('₹600').length).toBeGreaterThan(0);
    expect(screen.getByText(/Remaining Balance:/i)).toBeDefined();
  });
});

