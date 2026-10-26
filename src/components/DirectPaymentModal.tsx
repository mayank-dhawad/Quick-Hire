import React, { useState, useEffect, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Landmark,
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
  ShieldCheck,
  ArrowRight,
  Info
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { speakText } from '../lib/speech';
import { VoiceSpeakerButton } from './VoiceSpeakerButton';
import { getTranslation } from '../lib/translations';
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
  defaultAmount = 500,
  currentLang = 'English',
  onPaymentRecorded,
  onRequireLogin,
}: DirectPaymentModalProps) {
  const [activeSubTab, setActiveSubTab] = useState<'upi' | 'netbanking'>('upi');
  const [recipientBank, setRecipientBank] = useState<RecipientBankProfile | null>(null);
  const [loadingRecipient, setLoadingRecipient] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Flow step: 'confirm' (Step 1 Review) | 'launched' (Step 2 Intent launched & UTR submission)
  const [step, setStep] = useState<'confirm' | 'launched'>('confirm');

  // Payment states
  const [amount, setAmount] = useState<string>(String(defaultAmount));
  const [paymentMethod, setPaymentMethod] = useState<'Net Banking (IMPS/NEFT)' | 'Direct UPI' | 'Cash'>('Direct UPI');
  const [activeAttemptRef, setActiveAttemptRef] = useState<string>('');
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [existingPendingAttempt, setExistingPendingAttempt] = useState<PaymentRecord | null>(null);

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
        const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)('get_payment_recipient_details', {
          p_recipient_id: recipientId,
          p_job_id: referenceId || null,
        });

        if (!rpcErr && rpcData) {
          setRecipientBank({
            bank_name: rpcData.bank_name,
            bank_account_no: rpcData.bank_account_no,
            bank_ifsc: rpcData.bank_ifsc,
            upi_id: rpcData.upi_id,
          });
          if (!rpcData.upi_id && (rpcData.bank_account_no || rpcData.bank_ifsc)) {
            setActiveSubTab('netbanking');
            setPaymentMethod('Net Banking (IMPS/NEFT)');
          }
        } else {
          // Fallback to direct profiles query if RPC is unmigrated
          const { data: profData } = await supabase
            .from('profiles')
            .select('bank_name, bank_account_no, bank_ifsc, upi_id')
            .eq('id', recipientId)
            .single();

          if (profData) {
            setRecipientBank(profData);
            if (!profData.upi_id && (profData.bank_account_no || profData.bank_ifsc)) {
              setActiveSubTab('netbanking');
              setPaymentMethod('Net Banking (IMPS/NEFT)');
            }
          } else {
            setRecipientBank(null);
          }
        }

        // 2. Check for duplicate/existing pending payment attempt for this job and recipient
        if (currentUser) {
          const { data: existingData } = await supabase
            .from('payments')
            .select('*')
            .eq('payer_id', currentUser.id)
            .eq('payee_id', recipientId)
            .in('status', ['created', 'pending', 'submitted'])
            .order('created_at', { ascending: false })
            .limit(1);

          if (existingData && existingData.length > 0) {
            const found = existingData[0] as unknown as PaymentRecord;
            if (!referenceId || found.reference_id === referenceId) {
              setExistingPendingAttempt(found);
              setActiveAttemptRef(found.payment_reference || '');
              setActivePaymentId(found.id);
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
  }, [isOpen, recipientId, currentUser, referenceId, defaultAmount]);

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

  // STEP 1 -> STEP 2: Proceed to UPI
  const handleProceedToUpi = async () => {
    setErrorMsg('');

    if (!currentUser) {
      onRequireLogin();
      return;
    }

    if (!hasValidUpi) {
      setErrorMsg(t('noUpiConfiguredWarning'));
      speakText(t('noUpiConfiguredWarning'), currentLang);
      return;
    }

    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg('Please enter a valid payment amount (minimum ₹1).');
      return;
    }

    setIsLaunchingIntent(true);

    try {
      const attemptRef = activeAttemptRef || generatePaymentAttemptRef();
      setActiveAttemptRef(attemptRef);

      let recordId = activePaymentId;

      // 1. Create or update payment record in Supabase with status = 'pending', verification_status = 'unverified'
      if (!recordId) {
        const { data: newPay, error: insertErr } = await supabase
          .from('payments')
          .insert([
            {
              payer_id: currentUser.id,
              payee_id: recipientId,
              payment_for_type: paymentForType,
              reference_id: referenceId || null,
              amount: parsedAmount,
              payment_method: 'Direct UPI',
              payment_reference: attemptRef,
              currency: 'INR',
              status: 'pending',
              verification_status: 'unverified',
            },
          ])
          .select();

        if (insertErr) {
          console.warn('Note on Supabase payments insert:', insertErr.message);
        }

        if (newPay && newPay[0]) {
          recordId = newPay[0].id;
          setActivePaymentId(recordId);

          // Log payment audit event
          try {
            await supabase.from('payment_audit_events').insert([
              {
                payment_id: recordId,
                previous_status: null,
                new_status: 'pending',
                event_type: 'attempt_created',
                actor_id: currentUser.id,
                metadata: {
                  attempt_reference: attemptRef,
                  recipient_upi: cleanUpiId,
                  amount: parsedAmount,
                  currency: 'INR',
                },
              },
            ]);
          } catch (auditErr) {
            console.warn('Audit event notice:', auditErr);
          }
        }
      }

      // 2. Safely construct URL-encoded UPI Intent URI
      const description = getJobPaymentDescription();
      const upiUri = `upi://pay?pa=${encodeURIComponent(cleanUpiId)}&pn=${encodeURIComponent(recipientName)}&am=${encodeURIComponent(parsedAmount.toFixed(2))}&cu=INR&tn=${encodeURIComponent(description)}&tr=${encodeURIComponent(attemptRef)}`;

      // 3. Update modal UI to Step 2 (Launched & Awaiting UTR Verification)
      setStep('launched');
      speakText(t('upiOpenSuccessNotice'), currentLang);

      // 4. Attempt to open UPI application via window.location.href
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

  // SUBMIT UTR FOR VERIFICATION
  const handleSubmitUtr = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!currentUser) {
      onRequireLogin();
      return;
    }

    const cleanUtr = utrNumber.trim();
    if (!cleanUtr) {
      setErrorMsg('Please enter the 12-digit UPI Reference / UTR Number from your payment receipt.');
      return;
    }

    if (cleanUtr.length < 6) {
      setErrorMsg('UPI Reference / UTR number is usually 12 digits. Please check your payment receipt.');
      return;
    }

    setIsSubmittingUtr(true);

    try {
      const parsedAmount = Number(amount);
      const attemptRef = activeAttemptRef || generatePaymentAttemptRef();

      let targetId = activePaymentId;

      // 1. Update existing payment or insert submitted record
      if (targetId) {
        const { error: updErr } = await supabase
          .from('payments')
          .update({
            transaction_ref: cleanUtr,
            status: 'submitted',
            verification_status: 'pending_verification',
            updated_at: new Date().toISOString(),
          })
          .eq('id', targetId);

        if (updErr) {
          console.warn('Payment update notice:', updErr.message);
        }

        // Record audit event: utr_submitted
        try {
          await supabase.from('payment_audit_events').insert([
            {
              payment_id: targetId,
              previous_status: 'pending',
              new_status: 'submitted',
              event_type: 'utr_submitted',
              actor_id: currentUser.id,
              metadata: {
                transaction_ref: cleanUtr,
                submitted_by: currentUser.id,
              },
            },
          ]);
        } catch {
          // non-blocking
        }
      } else {
        // Fallback insert
        const { data: inserted, error: insErr } = await supabase
          .from('payments')
          .insert([
            {
              payer_id: currentUser.id,
              payee_id: recipientId,
              payment_for_type: paymentForType,
              reference_id: referenceId || null,
              amount: parsedAmount,
              payment_method: paymentMethod,
              payment_reference: attemptRef,
              transaction_ref: cleanUtr,
              currency: 'INR',
              status: 'submitted',
              verification_status: 'pending_verification',
            },
          ])
          .select();

        if (insErr) {
          console.warn('Fallback payment insert notice:', insErr.message);
        }
        if (inserted && inserted[0]) {
          targetId = inserted[0].id;
        }
      }

      const recordedPayment: PaymentRecord = {
        id: targetId || 'pay_' + Date.now(),
        payer_id: currentUser.id,
        payee_id: recipientId,
        payment_for_type: paymentForType,
        reference_id: referenceId || null,
        amount: parsedAmount,
        payment_method: paymentMethod,
        payment_reference: attemptRef,
        transaction_ref: cleanUtr,
        status: 'submitted',
        verification_status: 'pending_verification',
        created_at: new Date().toISOString(),
        payer_name: currentUser.user_metadata?.full_name || 'Employer',
        payee_name: recipientName,
      };

      // 2. Local storage cache resilience for passbook immediate view
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
                A previous payment attempt (Ref: <strong className="font-mono">{existingPendingAttempt.payment_reference || existingPendingAttempt.id.slice(0, 8)}</strong>) for ₹{existingPendingAttempt.amount} was initiated on {new Date(existingPendingAttempt.created_at || '').toLocaleDateString()}. Status: <em>{existingPendingAttempt.status}</em>.
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
                  {paymentForType === 'worker_wage' ? '👷 Worker' : '🚜 Machine Owner'}
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
                ₹{amount}
              </div>
            </div>
          </div>

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
              </div>

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
                            ? `Recipient UPI ID is ${cleanUpiId}. Amount is ₹${amount}. Tap Proceed to open your UPI payment app.`
                            : 'Worker has not added a UPI ID yet.'
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
                        Agreed Payment Amount (₹ INR) *
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-extrabold text-slate-400">
                          ₹
                        </span>
                        <input
                          type="number"
                          min="1"
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
                        disabled={isLaunchingIntent}
                        className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all hover:scale-[1.01] disabled:opacity-70 cursor-pointer"
                      >
                        {isLaunchingIntent ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Launching UPI Intent...</span>
                          </>
                        ) : (
                          <>
                            <QrCode className="w-5 h-5" />
                            <span>{t('proceedToUpiBtn')} (₹{amount})</span>
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
                    onClick={() => setStep('launched')}
                    className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Transferred via Net Banking? Submit UTR Reference →</span>
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
                    <span>Re-open UPI App</span>
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
                    Pay exactly ₹{amount} to <strong className="font-mono text-slate-900">{cleanUpiId}</strong>
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
                  <strong>Important:</strong> QuickHire does not mark payments as paid merely because you returned to the site. Please enter your 12-digit UPI Reference / UTR Number from your UPI app receipt to submit the payment for verification.
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
                    <span>Reference submitted! Payment logged as Submitted (Awaiting Verification).</span>
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
                      disabled={isSubmittingUtr}
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
