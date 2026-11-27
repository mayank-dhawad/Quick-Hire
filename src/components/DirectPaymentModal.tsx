import React, { useState, useEffect, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Landmark,
  IndianRupee,
  CheckCircle2,
  Copy,
  Check,
  QrCode,
  PhoneCall,
  ExternalLink,
  AlertTriangle,
  Receipt,
  RefreshCw,
  Building2,
  X,
  ArrowRight,
  Info
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { speakText } from '../lib/speech';
import { VoiceSpeakerButton } from './VoiceSpeakerButton';
import { getTranslation, formatLocalizedCurrency, formatLocalizedDate } from '../lib/translations';
import { PaymentRecord, UPI_REGEX } from '../lib/paymentUtils';
import { extractErrorMessage } from '../lib/errorHandler';

interface DirectPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  recipientId: string;
  recipientName: string;
  recipientPhone?: string | null;
  paymentForType: 'worker_wage' | 'machine_rental';
  referenceId?: string | null;
  jobId?: string | null;
  assignmentId?: string | null;
  defaultAmount?: number;
  currentLang?: string;
  onPaymentRecorded?: (payment: PaymentRecord) => void;
  onRequireLogin: () => void;
}

interface RecipientBankProfile {
  bank_name: string | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  upi_id: string | null;
}

const NET_BANKING_PORTALS = [
  { name: 'State Bank of India (SBI)', url: 'https://retail.onlinesbi.sbi/' },
  { name: 'Bank of Baroda', url: 'https://www.bobibanking.com/' },
  { name: 'Punjab National Bank', url: 'https://netpnb.com/' },
  { name: 'HDFC Bank', url: 'https://netbanking.hdfcbank.com/' },
  { name: 'ICICI Bank', url: 'https://infinity.icicibank.com/' },
  { name: 'Canara Bank', url: 'https://netbanking.canarabank.in/' },
];

export function DirectPaymentModal({
  isOpen,
  onClose,
  currentUser,
  recipientId,
  recipientName,
  recipientPhone,
  paymentForType,
  referenceId,
  jobId,
  assignmentId,
  defaultAmount = 500,
  currentLang = 'English',
  onPaymentRecorded,
  onRequireLogin,
}: DirectPaymentModalProps) {
  const [activeSubTab, setActiveSubTab] = useState<'upi' | 'netbanking' | 'cash'>('upi');
  const [recipientBank, setRecipientBank] = useState<RecipientBankProfile | null>(null);
  const [loadingRecipient, setLoadingRecipient] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Flow step: 'confirm' (Step 1 Review) | 'launched' (Step 2 Intent launched & UTR submission)
  const [step, setStep] = useState<'confirm' | 'launched'>('confirm');

  // Payment states & Multi-payment ledger
  const [amount, setAmount] = useState<string>(String(defaultAmount));
  const [paymentMethod, setPaymentMethod] = useState<'Net Banking (IMPS/NEFT)' | 'Direct UPI' | 'Cash'>('Direct UPI');
  const [activeAttemptRef, setActiveAttemptRef] = useState<string>('');
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [existingPendingAttempt, setExistingPendingAttempt] = useState<PaymentRecord | null>(null);
  const [totalPreviouslyPaid, setTotalPreviouslyPaid] = useState<number>(0);
  const [remainingBalance, setRemainingBalance] = useState<number>(defaultAmount || 500);

  // Cash payment confirmation
  const [cashHandedOver, setCashHandedOver] = useState(false);
  const [isRecordingCash, setIsRecordingCash] = useState(false);

  // UTR submission & verification state
  const [utrNumber, setUtrNumber] = useState('');
  const [isLaunchingIntent, setIsLaunchingIntent] = useState(false);
  const [isSubmittingUtr, setIsSubmittingUtr] = useState(false);
  const [utrSuccess, setUtrSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showQrCode, setShowQrCode] = useState(false);

  const t = useCallback(
    (key: string): string => getTranslation(currentLang, key),
    [currentLang]
  );

  // Fetch recipient real bank & UPI details and check for existing pending attempts
  useEffect(() => {
    if (!isOpen || !recipientId) return;

    setAmount(String(defaultAmount || 500));
    setStep('confirm');
    setUtrNumber('');
    setErrorMsg('');
    setUtrSuccess(false);
    setIsLaunchingIntent(false);
    setIsSubmittingUtr(false);
    setActiveAttemptRef('');
    setActivePaymentId(null);
    setExistingPendingAttempt(null);

    const fetchRecipientBankAndAttempts = async () => {
      setLoadingRecipient(true);
      try {
        // 1. Fetch authorized recipient bank details via get_payment_recipient_details RPC
        const { data: rpcData, error: rpcErr } = await supabase.rpc('get_payment_recipient_details', {
          p_recipient_id: recipientId,
          p_job_id: (jobId || referenceId || null) as string | null,
        });

        if (!rpcErr && rpcData) {
          const detail = Array.isArray(rpcData) ? (rpcData as unknown as Array<RecipientBankProfile>)[0] : rpcData;
          if (detail) {
            setRecipientBank({
              bank_name: detail.bank_name,
              bank_account_no: detail.bank_account_no,
              bank_ifsc: detail.bank_ifsc,
              upi_id: detail.upi_id,
            });
            if (!detail.upi_id && (detail.bank_account_no || detail.bank_ifsc)) {
              setActiveSubTab('netbanking');
              setPaymentMethod('Net Banking (IMPS/NEFT)');
            }
          } else {
            setRecipientBank(null);
          }
        } else {
          setRecipientBank(null);
        }

        // 2. Check for duplicate/existing pending payment attempt and multi-payment ledger
        if (currentUser) {
          const { data: existingData } = await supabase
            .from('payments')
            .select('*')
            .eq('payer_id', currentUser.id)
            .eq('payee_id', recipientId)
            .order('created_at', { ascending: false });

          if (existingData && existingData.length > 0) {
            const pending = existingData.find(p => ['created', 'pending', 'submitted'].includes(p.status || ''));
            if (pending && (!referenceId || pending.reference_id === referenceId)) {
              setExistingPendingAttempt(pending as unknown as PaymentRecord);
              setActiveAttemptRef(pending.payment_reference || '');
              setActivePaymentId(pending.id);
            }

            // Compute ledger for this job reference
            const matchingJobPays = referenceId
              ? existingData.filter(p => p.reference_id === referenceId && ['completed', 'paid', 'submitted'].includes(p.status || ''))
              : [];
            const paidSum = matchingJobPays.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
            const remBal = Math.max(0, (defaultAmount || 500) - paidSum);
            setTotalPreviouslyPaid(paidSum);
            setRemainingBalance(remBal);
            if (remBal > 0) {
              setAmount(String(remBal));
            }
          }
        }
      } catch (err) {
        console.warn('Recipient details fetch warning:', err);
      } finally {
        setLoadingRecipient(false);
      }
    };

    fetchRecipientBankAndAttempts();
  }, [isOpen, recipientId, currentUser, referenceId, jobId, defaultAmount]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, field: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    speakText(t('copiedBtn'), currentLang);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const cleanUpiId = recipientBank?.upi_id?.trim() || '';
  const hasValidUpi = Boolean(cleanUpiId && cleanUpiId.includes('@') && UPI_REGEX.test(cleanUpiId));

  // Construct secure, runtime URL-encoded payment intent URI
  const generatePaymentAttemptRef = () => {
    return `QH-PAY-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  };

  const getJobPaymentDescription = () => {
    if (paymentForType === 'worker_wage') {
      return `QuickHire Wage ${referenceId ? referenceId.slice(0, 8) : ''}`.trim();
    }
    return `QuickHire Rental ${referenceId ? referenceId.slice(0, 8) : ''}`.trim();
  };

  // RECORD CASH SETTLEMENT VIA RPC
  const handleRecordCashPayment = async () => {
    if (isRecordingCash) return;
    if (!currentUser) {
      onRequireLogin();
      return;
    }

    if (paymentForType === 'machine_rental') {
      setErrorMsg(t('machineRentalDisabled'));
      return;
    }

    const effectiveJobId = jobId || referenceId || null;
    if (!effectiveJobId) {
      setErrorMsg(t('validJobReference'));
      return;
    }

    if (!assignmentId) {
      setErrorMsg(t('validAssignmentReference'));
      return;
    }

    if (!recipientId) {
      setErrorMsg(t('recipientMissing'));
      return;
    }

    const parsedAmount = Number(amount);
    if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg(t('validPaymentAmount').replace('{amount}', formatLocalizedCurrency(1, currentLang)));
      return;
    }
    if (remainingBalance > 0 && parsedAmount > remainingBalance) {
      setErrorMsg(t('paymentAmountExceedsRemaining').replace('{amount}', formatLocalizedCurrency(parsedAmount, currentLang)).replace('{balance}', formatLocalizedCurrency(remainingBalance, currentLang)));
      return;
    }
    if (remainingBalance <= 0 && totalPreviouslyPaid > 0) {
      setErrorMsg(t('assignmentFullyPaid'));
      return;
    }

    setIsRecordingCash(true);
    setErrorMsg('');

    try {
      const attemptRef = activeAttemptRef || generatePaymentAttemptRef();
      setActiveAttemptRef(attemptRef);

      const { data: rpcRes, error: rpcErr } = await supabase.rpc('record_direct_payment', {
        p_payment_for_type: 'worker_wage',
        p_reference_id: effectiveJobId,
        p_assignment_id: assignmentId,
        p_payee_id: recipientId,
        p_amount: parsedAmount,
        p_payment_method: 'Cash',
        p_payment_reference: attemptRef,
        p_utr_number: null,
        p_idempotency_key: attemptRef,
      });

      if (rpcErr) {
        throw rpcErr;
      }

      interface RecordDirectPaymentResult {
        success?: boolean;
        payment_id?: string;
        payment_for_type?: string;
        assignment_id?: string;
        job_id?: string;
        amount?: number;
        status?: string;
        verification_status?: string;
        receipt_number?: string;
        idempotent_duplicate?: boolean;
        message?: string;
      }

      const res = rpcRes as RecordDirectPaymentResult | null;
      if (!res || res.success !== true) {
        throw new Error(res?.message || 'Failed to record cash payment.');
      }

      const paymentId = res.payment_id || `pay_${Date.now()}`;
      setActivePaymentId(paymentId);

      const recordedPay: PaymentRecord = {
        id: paymentId,
        payer_id: currentUser.id,
        payee_id: recipientId,
        payment_for_type: 'worker_wage',
        reference_id: effectiveJobId,
        amount: parsedAmount,
        payment_method: 'Cash',
        payment_reference: attemptRef,
        transaction_ref: null,
        status: (res.status as PaymentRecord['status']) || 'completed',
        verification_status: res.verification_status || 'user_reported',
        created_at: new Date().toISOString(),
        payer_name: currentUser.user_metadata?.full_name || 'Employer',
        payee_name: recipientName,
      };

      if (onPaymentRecorded) {
        onPaymentRecorded(recordedPay);
      }
      setStep('launched');
      setUtrSuccess(true);
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, 'Failed to record cash payment.');
      setErrorMsg(msg);
    } finally {
      setIsRecordingCash(false);
    }
  };

  const handleProceedToUpi = async () => {
    if (isLaunchingIntent) return;
    setErrorMsg('');

    if (!currentUser) {
      onRequireLogin();
      return;
    }

    if (paymentForType === 'machine_rental') {
      setErrorMsg(t('machineRentalDisabled'));
      return;
    }

    const effectiveJobId = jobId || referenceId || null;
    if (!effectiveJobId) {
      setErrorMsg(t('validJobReference'));
      return;
    }

    if (!assignmentId) {
      setErrorMsg(t('validAssignmentReference'));
      return;
    }

    if (!recipientId) {
      setErrorMsg(t('recipientMissing'));
      return;
    }

    if (!hasValidUpi) {
      setErrorMsg(t('noUpiConfiguredWarning'));
      speakText(t('noUpiConfiguredWarning'), currentLang);
      return;
    }

    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg(t('validPaymentAmount').replace('{amount}', formatLocalizedCurrency(1, currentLang)));
      return;
    }

    if (remainingBalance > 0 && parsedAmount > remainingBalance) {
      setErrorMsg(t('paymentAmountExceedsRemaining').replace('{amount}', formatLocalizedCurrency(parsedAmount, currentLang)).replace('{balance}', formatLocalizedCurrency(remainingBalance, currentLang)));
      return;
    }
    if (remainingBalance <= 0 && totalPreviouslyPaid > 0) {
      setErrorMsg(t('assignmentFullyPaid'));
      return;
    }

    setIsLaunchingIntent(true);

    try {
      const attemptRef = activeAttemptRef || generatePaymentAttemptRef();
      setActiveAttemptRef(attemptRef);
      setPaymentMethod('Direct UPI');

      // Safely construct URL-encoded UPI Intent URI
      const description = getJobPaymentDescription();
      const upiUri = `upi://pay?pa=${encodeURIComponent(cleanUpiId)}&pn=${encodeURIComponent(recipientName)}&am=${encodeURIComponent(parsedAmount.toFixed(2))}&cu=INR&tn=${encodeURIComponent(description)}&tr=${encodeURIComponent(attemptRef)}`;

      // Update modal UI to Step 2 (Launched & Awaiting UTR Verification)
      setStep('launched');
      speakText(t('upiOpenSuccessNotice'), currentLang);

      // Attempt to open UPI application via window.location.href
      try {
        window.location.href = upiUri;
      } catch (launchErr) {
        console.warn('UPI deep link launch notice:', launchErr);
      }
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, 'Could not initiate UPI payment attempt');
      setErrorMsg(msg);
    } finally {
      setIsLaunchingIntent(false);
    }
  };

  // SUBMIT UTR FOR VERIFICATION VIA RPC
  const handleSubmitUtr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingUtr) return;
    setErrorMsg('');

    if (!currentUser) {
      onRequireLogin();
      return;
    }

    if (paymentForType === 'machine_rental') {
      setErrorMsg(t('machineRentalDisabled'));
      return;
    }

    const effectiveJobId = jobId || referenceId || null;
    if (!effectiveJobId) {
      setErrorMsg(t('validJobReference'));
      return;
    }

    if (!assignmentId) {
      setErrorMsg(t('validAssignmentReference'));
      return;
    }

    if (!recipientId) {
      setErrorMsg(t('recipientMissing'));
      return;
    }

    const cleanUtr = utrNumber.trim();
    if (!cleanUtr) {
      setErrorMsg(t('submitUtrPrompt'));
      return;
    }

    if (cleanUtr.length < 6) {
      setErrorMsg(t('utrFormatReminder'));
      return;
    }

    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg(t('validPaymentAmount').replace('{amount}', formatLocalizedCurrency(1, currentLang)));
      return;
    }

    setIsSubmittingUtr(true);

    try {
      const attemptRef = activeAttemptRef || generatePaymentAttemptRef();
      setActiveAttemptRef(attemptRef);

      const { data: rpcRes, error: rpcErr } = await supabase.rpc('record_direct_payment', {
        p_payment_for_type: 'worker_wage',
        p_reference_id: effectiveJobId,
        p_assignment_id: assignmentId,
        p_payee_id: recipientId,
        p_amount: parsedAmount,
        p_payment_method: paymentMethod,
        p_payment_reference: attemptRef,
        p_utr_number: cleanUtr,
        p_idempotency_key: attemptRef,
      });

      if (rpcErr) {
        throw rpcErr;
      }

      interface RecordDirectPaymentResult {
        success?: boolean;
        payment_id?: string;
        payment_for_type?: string;
        assignment_id?: string;
        job_id?: string;
        amount?: number;
        status?: string;
        verification_status?: string;
        receipt_number?: string;
        idempotent_duplicate?: boolean;
        message?: string;
      }

      const res = rpcRes as RecordDirectPaymentResult | null;
      if (!res || res.success !== true) {
        throw new Error(res?.message || 'Failed to submit payment reference.');
      }

      const targetId = res.payment_id || activePaymentId || `pay_${Date.now()}`;
      setActivePaymentId(targetId);

      const recordedPayment: PaymentRecord = {
        id: targetId,
        payer_id: currentUser.id,
        payee_id: recipientId,
        payment_for_type: 'worker_wage',
        reference_id: effectiveJobId,
        amount: parsedAmount,
        payment_method: paymentMethod,
        payment_reference: attemptRef,
        transaction_ref: cleanUtr,
        status: (res.status as PaymentRecord['status']) || 'submitted',
        verification_status: res.verification_status || 'pending_verification',
        created_at: new Date().toISOString(),
        payer_name: currentUser.user_metadata?.full_name || 'Employer',
        payee_name: recipientName,
      };

      // Local storage cache resilience for passbook immediate view
      try {
        const localKey = `quickhire_payment_ledger_${currentUser.id}`;
        const stored = localStorage.getItem(localKey);
        const list: PaymentRecord[] = stored ? JSON.parse(stored) : [];
        const existingIdx = list.findIndex((p) => p.id === recordedPayment.id);
        if (existingIdx >= 0) {
          list[existingIdx] = recordedPayment;
        } else {
          list.unshift(recordedPayment);
        }
        localStorage.setItem(localKey, JSON.stringify(list));

        // Also update recipient passbook cache
        const payeeKey = `quickhire_payment_ledger_${recipientId}`;
        const payeeStored = localStorage.getItem(payeeKey);
        const payeeList: PaymentRecord[] = payeeStored ? JSON.parse(payeeStored) : [];
        payeeList.unshift(recordedPayment);
        localStorage.setItem(payeeKey, JSON.stringify(payeeList));
      } catch {
        // non-blocking
      }

      setUtrSuccess(true);
      speakText('Payment reference submitted for verification', currentLang);

      if (onPaymentRecorded) {
        onPaymentRecorded(recordedPayment);
      }

      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, 'Failed to submit reference');
      setErrorMsg(msg);
    } finally {
      setIsSubmittingUtr(false);
    }
  };

  const previewUpiUri = hasValidUpi
    ? `upi://pay?pa=${encodeURIComponent(cleanUpiId)}&pn=${encodeURIComponent(recipientName)}&am=${encodeURIComponent(Number(amount || defaultAmount).toFixed(2))}&cu=INR&tn=${encodeURIComponent(getJobPaymentDescription())}`
    : '';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-6 sm:p-8 overflow-hidden border border-slate-200 z-10 max-h-[92vh] overflow-y-auto"
        >
          {/* CLOSE BUTTON */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* HEADER */}
          <div className="flex items-center gap-3 mb-2 pr-8">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200/60 shadow-xs">
              <Landmark className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading font-extrabold text-xl sm:text-2xl text-slate-900">
                  {step === 'confirm' ? t('confirmPaymentTitle') : t('directPaymentTitle')}
                </h2>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  0% Commission
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {step === 'confirm' ? t('confirmPaymentSubtitle') : t('directPaymentSub')}
              </p>
            </div>
          </div>

          {/* DUPLICATE / EXISTING ATTEMPT WARNING */}
          {existingPendingAttempt && step === 'confirm' && (
            <div className="my-3 p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{t('duplicatePaymentWarning')}</span>
              </div>
              <p className="text-[11px] text-amber-800">
                {t('previousPaymentAttempt').replace('{reference}', String(existingPendingAttempt.payment_reference ?? existingPendingAttempt.id.slice(0, 8))).replace('{amount}', formatLocalizedCurrency(existingPendingAttempt.amount, currentLang)).replace('{date}', formatLocalizedDate(existingPendingAttempt.created_at, currentLang)).replace('{status}', String(existingPendingAttempt.status ?? ''))}
              </p>
              <button
                type="button"
                onClick={() => setStep('launched')}
                className="text-[11px] font-bold text-amber-900 underline hover:text-amber-950 pt-0.5 cursor-pointer"
              >
                Already paid in UPI app? Click here to enter your UTR reference →
              </button>
            </div>
          )}

          {/* RECIPIENT & WAGE SUMMARY CARD */}
          <div className="my-4 p-4 rounded-2xl bg-slate-50 border border-slate-200/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                {paymentForType === 'worker_wage' ? 'Worker Wage Recipient' : 'Machinery Rental Recipient'}
              </span>
              <div className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>{recipientName}</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 font-semibold border border-brand-200/60">
                  {paymentForType === 'worker_wage' ? 'Worker' : 'Machine Owner'}
                </span>
              </div>
              {referenceId && (
                <span className="text-[10px] font-mono text-slate-400 block">
                  Job Ref: {referenceId.slice(0, 12)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 sm:self-center">
              {recipientPhone && (
                <a
                  href={`tel:${recipientPhone}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors shadow-2xs"
                >
                  <PhoneCall className="w-3.5 h-3.5 text-brand-600" />
                  <span>Call: {recipientPhone}</span>
                </a>
              )}
              <div className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-extrabold whitespace-nowrap">
                {formatLocalizedCurrency(amount, currentLang)}
              </div>
            </div>
          </div>

          {/* NOTICE IF MACHINE RENTAL PAYMENT */}
          {paymentForType === 'machine_rental' && (
            <div className="mb-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{t('machineRentalDisabledTitle')}</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Machinery rental payments via in-app direct settlements are temporarily disabled pending rental booking contract verification. Please arrange rental settlement directly with the equipment owner.
              </p>
            </div>
          )}

          {/* WARNING IF NO UPI ID CONFIGURED */}
          {!loadingRecipient && !hasValidUpi && (
            <div className="mb-4 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-rose-950">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{t('noUpiConfiguredWarning')}</span>
              </div>
              <p className="text-[11px] text-rose-800 leading-relaxed">
                Direct UPI app payments require the worker to save a valid Virtual Payment Address (e.g. name@upi). You can call the worker directly to confirm details, or pay via Net Banking (IMPS/NEFT) if bank account details are configured.
              </p>
            </div>
          )}

          {errorMsg && step === 'confirm' && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: PAYMENT REVIEW & INTENT LAUNCH CONFIRMATION */}
          {step === 'confirm' && (
            <div className="space-y-5">
              {/* PAYMENT METHOD TABS */}
              <div className="flex items-center bg-slate-100 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setActiveSubTab('upi');
                    setPaymentMethod('Direct UPI');
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    activeSubTab === 'upi'
                      ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <QrCode className="w-4 h-4 text-emerald-600" />
                  <span>{t('directUPITab')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveSubTab('netbanking');
                    setPaymentMethod('Net Banking (IMPS/NEFT)');
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    activeSubTab === 'netbanking'
                      ? 'bg-white text-brand-700 shadow-sm border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Building2 className="w-4 h-4 text-brand-600" />
                  <span>{t('netBankingTab')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveSubTab('cash');
                    setPaymentMethod('Cash');
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    activeSubTab === 'cash'
                      ? 'bg-white text-amber-700 shadow-sm border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <IndianRupee className="w-4 h-4 text-amber-600" />
                  <span>{t('tabCash')}</span>
                </button>
              </div>

              {/* MULTI-PAYMENT LEDGER BREAKDOWN (Requirement G) */}
              {totalPreviouslyPaid > 0 && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block" >{t('totalAgreed')}</span>
                    <span className="font-bold text-slate-800">{formatLocalizedCurrency(defaultAmount, currentLang)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-600 font-bold uppercase block" >{t('paidSoFar')}</span>
                    <span className="font-bold text-emerald-700">{formatLocalizedCurrency(totalPreviouslyPaid, currentLang)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-amber-600 font-bold uppercase block" >{t('remainingBalance')}</span>
                    <span className="font-black text-amber-800">{formatLocalizedCurrency(remainingBalance, currentLang)}</span>
                  </div>
                </div>
              )}

              {/* TAB 1: DIRECT UPI PAYMENT INTENT REVIEW */}
              {activeSubTab === 'upi' && (
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/80 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                        Worker UPI ID (Virtual Payment Address)
                      </span>
                      <VoiceSpeakerButton
                        text={
                          hasValidUpi
                            ? `Recipient UPI ID is ${cleanUpiId}. Amount is ${formatLocalizedCurrency(amount, currentLang)}. Tap Proceed to open your UPI payment app.`
                            : t('workerUpiNotAdded')
                        }
                        lang={currentLang}
                        label="Listen to UPI details"
                      />
                    </div>

                    <div className="flex items-center gap-2 bg-white p-3.5 rounded-xl border border-emerald-300/80 shadow-2xs">
                      <span className="font-mono font-extrabold text-sm sm:text-base text-slate-900 flex-1 truncate">
                        {hasValidUpi ? cleanUpiId : t('noUpiSaved')}
                      </span>
                      {hasValidUpi && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(cleanUpiId, 'modal_upi')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          {copiedField === 'modal_upi' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedField === 'modal_upi' ? t('copiedBtn') : t('copyBtn')}</span>
                        </button>
                      )}
                    </div>

                    {/* AMOUNT CONFIRMATION INPUT */}
                    <div className="space-y-1.5 bg-white p-4 rounded-xl border border-emerald-200">
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                        {t('agreedPaymentAmountLabel')}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-extrabold text-slate-400">
                          ₹
                        </span>
                        <input
                          type="number"
                          min="1"
                          max={remainingBalance > 0 ? remainingBalance : undefined}
                          required
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="w-full pl-8 pr-4 py-2.5 border border-slate-300 rounded-xl text-base font-extrabold text-slate-900 outline-none focus:border-emerald-500 shadow-2xs"
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 block">
                        Wage derived from job listing. Directly sent to worker with 0% platform deductions.
                      </span>
                    </div>

                    {/* PROCEED TO UPI BUTTON */}
                    {hasValidUpi ? (
                      <button
                        type="button"
                        onClick={handleProceedToUpi}
                        disabled={paymentForType === 'machine_rental' || isLaunchingIntent}
                        className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all hover:scale-[1.01] disabled:opacity-70 cursor-pointer"
                      >
                        {isLaunchingIntent ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>{t('launchingUpiIntent')}</span>
                          </>
                        ) : (
                          <>
                            <QrCode className="w-5 h-5" />
                            <span>{t('proceedToUpiBtn')} ({formatLocalizedCurrency(amount, currentLang)})</span>
                            <ArrowRight className="w-4 h-4 ml-1" />
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="text-center py-2 text-xs text-slate-500 font-medium">
                        Direct UPI intent unavailable without worker&apos;s UPI ID. Please use Net Banking or Cash below.
                      </div>
                    )}
                  </div>

                  {/* HONEST STATUS DISCLAIMER */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-[11px] leading-relaxed flex items-start gap-2">
                    <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>{t('unverifiedPaymentDisclaimer')}</span>
                  </div>
                </div>
              )}

              {/* TAB 3: CASH PAYMENT (Requirement G) */}
              {activeSubTab === 'cash' && (
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black">
                        <IndianRupee className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-heading font-extrabold text-sm text-slate-900">
                          Handover Cash Directly in Person
                        </h4>
                        <p className="text-xs text-slate-500">
                          Pay physical cash directly to {recipientName} with zero deductions.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5 bg-white p-4 rounded-xl border border-amber-200">
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                        {t('cashAmountHandedOverLabel')}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-extrabold text-slate-400">
                          ₹
                        </span>
                        <input
                          type="number"
                          min="1"
                          max={remainingBalance > 0 ? remainingBalance : undefined}
                          required
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="w-full pl-8 pr-4 py-2.5 border border-slate-300 rounded-xl text-base font-extrabold text-slate-900 outline-none focus:border-amber-500 shadow-2xs"
                        />
                      </div>
                    </div>

                    <label className="flex items-start gap-2.5 bg-white p-3.5 rounded-xl border border-amber-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cashHandedOver}
                        onChange={(e) => setCashHandedOver(e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                      />
                      <span className="text-xs text-slate-700 font-medium">
                        {t('confirmCashReceived')} ({recipientName})
                      </span>
                    </label>

                    <button
                      type="button"
                      disabled={paymentForType === 'machine_rental' || !cashHandedOver || isRecordingCash}
                      onClick={handleRecordCashPayment}
                      className="w-full py-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-amber-600/30 transition-all hover:scale-[1.01] disabled:opacity-50 cursor-pointer"
                    >
                      <Check className="w-5 h-5" />
                      <span>{isRecordingCash ? t('recordingCashSettlement') : `${t('recordCashBtn')} (${formatLocalizedCurrency(amount, currentLang)})`}</span>
                    </button>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-[11px] leading-relaxed flex items-start gap-2">
                    <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>{t('notice')}:</strong> Cash settlements are recorded directly in QuickHire's permanent ledger as user-reported transactions. Both parties can view and print receipts immediately.
                    </span>
                  </div>
                </div>
              )}

              {/* TAB 2: NET BANKING (IMPS / NEFT) */}
              {activeSubTab === 'netbanking' && (
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-brand-50 to-slate-50 border border-brand-200/80">
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-900 block mb-3">
                      Recipient Bank Account Details (IMPS / NEFT)
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                      <div className="bg-white p-3 rounded-xl border border-slate-200">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                          Bank Name
                        </span>
                        <span className="text-xs font-bold text-slate-900 block truncate">
                          {recipientBank?.bank_name || 'Not Configured'}
                        </span>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                          Beneficiary Name
                        </span>
                        <span className="text-xs font-bold text-slate-900 block truncate">
                          {recipientName}
                        </span>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                            Account Number
                          </span>
                          <span className="text-sm font-mono font-bold text-slate-900">
                            {recipientBank?.bank_account_no || 'Not Configured'}
                          </span>
                        </div>
                        {recipientBank?.bank_account_no && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(recipientBank.bank_account_no!, 'modal_acc')}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                          >
                            {copiedField === 'modal_acc' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                            IFSC Code
                          </span>
                          <span className="text-sm font-mono font-bold text-brand-600">
                            {recipientBank?.bank_ifsc || 'Not Configured'}
                          </span>
                        </div>
                        {recipientBank?.bank_ifsc && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(recipientBank.bank_ifsc!, 'modal_ifsc')}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                          >
                            {copiedField === 'modal_ifsc' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* NET BANKING QUICK LINKS */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        {t('quickNetBanking')}:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {NET_BANKING_PORTALS.map((portal) => (
                          <a
                            key={portal.name}
                            href={portal.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-brand-500 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
                          >
                            <span>{portal.name.split(' (')[0]}</span>
                            <ExternalLink className="w-3 h-3 text-slate-400" />
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={paymentForType === 'machine_rental'}
                    onClick={() => {
                      setPaymentMethod('Net Banking (IMPS/NEFT)');
                      setStep('launched');
                    }}
                    className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>{t('transferredViaNetBanking')} →</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: INTENT LAUNCHED / RETURN-TO-SITE & UTR SUBMISSION */}
          {step === 'launched' && (
            <div className="space-y-5 pt-2">
              {/* LAUNCHED NOTICE BANNER */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-300 text-emerald-950 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <h4 className="font-heading font-extrabold text-sm sm:text-base">
                    UPI Intent Dispatched (Attempt: <span className="font-mono">{activeAttemptRef || 'QH-PAY'}</span>)
                  </h4>
                </div>
                <p className="text-xs text-emerald-900 leading-relaxed">
                  Your device was instructed to open your UPI payment app. Complete the authorization inside Google Pay, PhonePe, Paytm, or BHIM.
                </p>
                <div className="pt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (previewUpiUri) window.location.href = previewUpiUri;
                    }}
                    className="text-xs font-bold text-emerald-800 underline hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{t('reopenUpiApp')}</span>
                  </button>
                  <span className="text-emerald-400">•</span>
                  <button
                    type="button"
                    onClick={() => setShowQrCode(!showQrCode)}
                    className="text-xs font-bold text-emerald-800 underline hover:text-emerald-950 cursor-pointer"
                  >
                    {showQrCode ? 'Hide QR Code' : 'Show Payment QR Code'}
                  </button>
                </div>
              </div>

              {/* DESKTOP / FALLBACK QR CODE & COPY BOX */}
              {showQrCode && hasValidUpi && (
                <div className="p-5 rounded-2xl bg-white border border-slate-200 text-center space-y-3 shadow-sm">
                  <h5 className="font-bold text-xs uppercase tracking-wider text-slate-600">
                    Scan with any UPI App (GPay, PhonePe, Paytm, BHIM)
                  </h5>
                  <div className="inline-block p-3 rounded-2xl bg-white border border-slate-300 shadow-sm">
                    {/* Standard SVG QR Code Representation */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(previewUpiUri)}`}
                      alt="UPI Payment QR Code"
                      className="w-44 h-44 mx-auto rounded-lg"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    {t('payExactly').replace('{amount}', formatLocalizedCurrency(amount, currentLang))} <strong className="font-mono text-slate-900">{cleanUpiId}</strong>
                  </p>
                </div>
              )}

              {/* RECORD UTR / TRANSACTION REFERENCE (VERIFICATION STEP) */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-brand-600" />
                  <h3 className="text-sm font-heading font-extrabold text-slate-900">
                    {t('submitUtrPrompt')}
                  </h3>
                </div>

                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                  {t('unverifiedPaymentDisclaimer')} {t('submitUtrPrompt')}
                </div>

                {errorMsg && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 font-semibold">
                    {errorMsg}
                  </div>
                )}

                {utrSuccess && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-bold flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{t('referenceSubmittedNotice')}</span>
                  </motion.div>
                )}

                <form onSubmit={handleSubmitUtr} className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                      {t('utrRefLabel')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={utrNumber}
                      onChange={(e) => setUtrNumber(e.target.value.trim())}
                      placeholder={t('utrPlaceholder')}
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 outline-none focus:border-brand-500 shadow-2xs"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setStep('confirm')}
                      className="px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition-colors cursor-pointer"
                    >
                      ← Back to Review
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingUtr || paymentForType === 'machine_rental'}
                      className="flex-1 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-70 cursor-pointer"
                    >
                      {isSubmittingUtr ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>{t('submittingUtr')}</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>{t('submitUtrBtn')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default DirectPaymentModal;
