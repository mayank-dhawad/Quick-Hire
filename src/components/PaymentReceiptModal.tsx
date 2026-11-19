import React, { useRef } from 'react';
import {
  Receipt,
  Printer,
  X,
  ShieldCheck,
} from 'lucide-react';

export interface PaymentReceiptData {
  receiptNumber: string;
  paymentId?: string;
  jobId?: string;
  assignmentId?: string;
  jobTitle: string;
  employerName: string;
  employerLocation?: string | null;
  workerName: string;
  workerCategory?: string | null;
  agreedWage: number;
  workingHours?: number | null;
  breakMinutes?: number | null;
  approvedOvertimeHours?: number | null;
  totalPayable: number;
  amountPaid: number;
  remainingBalance: number;
  paymentMethod: string;
  paymentDate: string;
  transactionRef?: string | null;
  recordedByName?: string | null;
  isUserReported?: boolean;
}

interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: PaymentReceiptData | null;
}

export function PaymentReceiptModal({
  isOpen,
  onClose,
  receipt,
}: PaymentReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in print:p-0 print:bg-white print:static">
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden relative my-6 print:border-none print:shadow-none print:rounded-none print:my-0">
        {/* HEADER BAR (Hidden in print) */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-4 flex items-center justify-between text-white border-b border-white/10 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FF9933] text-slate-900 flex items-center justify-center font-black">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-black tracking-widest uppercase text-[#FF9933] block">
                Official Settlement Record
              </span>
              <h3 className="font-heading font-extrabold text-base text-white">
                Payment Receipt
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Print or Save as PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PRINTABLE RECEIPT CONTAINER */}
        <div ref={receiptRef} className="p-6 sm:p-8 space-y-6 text-slate-900 bg-white print:p-4">
          {/* RECEIPT HEADER */}
          <div className="flex items-start justify-between border-b-2 border-slate-900 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#FF9933]" />
                <span className="font-heading font-black text-xl tracking-tight text-slate-900">
                  QuickHire
                </span>
              </div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                Rural DPI Worker Hiring & Wage Settlement
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block">
                Receipt Number
              </span>
              <span className="font-mono font-black text-sm text-slate-900">
                {receipt.receiptNumber}
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                {new Date(receipt.paymentDate).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* PARTIES INFORMATION */}
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                Employer / Payer
              </span>
              <p className="font-bold text-slate-900">{receipt.employerName}</p>
              {receipt.employerLocation && (
                <p className="text-[11px] text-slate-500">{receipt.employerLocation}</p>
              )}
            </div>

            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                Worker / Payee
              </span>
              <p className="font-bold text-slate-900">{receipt.workerName}</p>
              {receipt.workerCategory && (
                <p className="text-[11px] text-slate-500">{receipt.workerCategory}</p>
              )}
            </div>
          </div>

          {/* WORK DETAILS */}
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Work Assignment
            </span>
            <p className="font-heading font-bold text-sm text-slate-900">
              {receipt.jobTitle}
            </p>
          </div>

          {/* LINE ITEM CALCULATION BREAKDOWN */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-4 text-center">Hours / Units</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                <tr>
                  <td className="py-2.5 px-4 text-slate-800">
                    Agreed Daily Base Wage
                  </td>
                  <td className="py-2.5 px-4 text-center text-slate-500">
                    {receipt.workingHours ? `${receipt.workingHours}h worked` : '1 standard shift'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                    ₹{receipt.agreedWage.toLocaleString()}
                  </td>
                </tr>

                {(receipt.approvedOvertimeHours || 0) > 0 && (
                  <tr>
                    <td className="py-2.5 px-4 text-slate-800">
                      Approved Overtime Work
                    </td>
                    <td className="py-2.5 px-4 text-center text-slate-500">
                      +{receipt.approvedOvertimeHours}h
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                      ₹{Math.round(
                        (receipt.approvedOvertimeHours || 0) * (receipt.agreedWage / 8)
                      ).toLocaleString()}
                    </td>
                  </tr>
                )}

                <tr className="bg-slate-50/70 font-extrabold">
                  <td className="py-2.5 px-4 text-slate-900" colSpan={2}>
                    Total Wage Payable
                  </td>
                  <td className="py-2.5 px-4 text-right font-black text-slate-900">
                    ₹{receipt.totalPayable.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* SETTLEMENT DETAILS */}
          <div className="bg-emerald-50/60 rounded-2xl border border-emerald-200/80 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-900">Amount Paid in This Record:</span>
              <span className="font-heading font-black text-lg text-emerald-700">
                ₹{receipt.amountPaid.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-600 text-[11px] pt-1 border-t border-emerald-100">
              <span>Payment Method:</span>
              <span className="font-bold text-slate-800">{receipt.paymentMethod}</span>
            </div>

            {receipt.transactionRef && (
              <div className="flex items-center justify-between text-slate-600 text-[11px]">
                <span>Transaction Reference / UTR:</span>
                <span className="font-mono text-slate-800 font-bold">{receipt.transactionRef}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-slate-600 text-[11px]">
              <span>Remaining Balance:</span>
              <span
                className={`font-black ${
                  receipt.remainingBalance > 0 ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                ₹{receipt.remainingBalance.toLocaleString()}
                {receipt.remainingBalance === 0 ? ' (Fully Settled)' : ''}
              </span>
            </div>
          </div>

          {/* AUDIT & DISCLAIMER FOOTER */}
          <div className="border-t border-slate-100 pt-4 space-y-2 text-[10px] text-slate-400">
            <div className="flex items-center justify-between">
              <span>
                Recorded by:{' '}
                <strong className="text-slate-600">
                  {receipt.recordedByName || receipt.employerName}
                </strong>
              </span>
              <span className="flex items-center gap-1 text-emerald-700 font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>QuickHire Permanent Ledger</span>
              </span>
            </div>

            <p className="leading-relaxed text-slate-400">
              <strong>Notice:</strong> This receipt reflects a direct user-reported wage settlement recorded between employer and worker. QuickHire does not operate as an escrow agent or banking intermediary.
            </p>
          </div>
        </div>

        {/* BOTTOM ACTION BAR (Hidden in print) */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 print:hidden">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save as PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
}

