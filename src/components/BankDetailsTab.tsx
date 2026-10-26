import React, { useState, useEffect, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { motion } from 'framer-motion';
import {
  Landmark,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
  CreditCard,
  QrCode,
  ArrowDownLeft,
  ArrowUpRight,
  ReceiptText,
  AlertCircle,
  Sparkles,
  Building2,
  RefreshCw,
  Search,
  Lock,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { speakText, getVoiceGuidance } from '../lib/speech';
import { VoiceSpeakerButton } from './VoiceSpeakerButton';
import { getTranslation } from '../lib/translations';
import { extractErrorMessage } from '../lib/errorHandler';
import { PaymentRecord, UPI_REGEX } from '../lib/paymentUtils';

export type { PaymentRecord };
export { UPI_REGEX };

interface BankDetailsTabProps {
  user: User | null;
  currentLang?: string;
  onRequireLogin: () => void;
}

const COMMON_BANKS = [
  'State Bank of India (SBI)',
  'Bank of Baroda (BOB)',
  'Bank of Maharashtra (BOM)',
  'Punjab National Bank (PNB)',
  'HDFC Bank',
  'ICICI Bank',
  'Canara Bank',
  'Union Bank of India',
  'India Post Payments Bank (IPPB)',
  'Airtel Payments Bank',
  'Central Bank of India',
  'Other / Custom Bank',
];

// Indian IFSC standard: 4 alphabetic characters, followed by 0, followed by 6 alphanumeric characters
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function BankDetailsTab({
  user,
  currentLang = 'English',
  onRequireLogin,
}: BankDetailsTabProps) {
  // Section A: Bank form states
  const [bankName, setBankName] = useState('');
  const [customBankName, setCustomBankName] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [confirmAccountNo, setConfirmAccountNo] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [upiId, setUpiId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [hasConfiguredBank, setHasConfiguredBank] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Validation error states
  const [ifscError, setIfscError] = useState('');
  const [upiError, setUpiError] = useState('');

  // Section B: Passbook / Payment Ledger states
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'received' | 'sent'>('all');
  const [searchLedger, setSearchLedger] = useState('');

  const t = useCallback(
    (key: string): string => getTranslation(currentLang, key),
    [currentLang]
  );

  // Validation functions
  const validateIfsc = (val: string): boolean => {
    const clean = val.trim().toUpperCase();
    if (!clean) {
      setIfscError('');
      return true;
    }
    if (!IFSC_REGEX.test(clean)) {
      setIfscError(t('invalidIfscError'));
      return false;
    }
    setIfscError('');
    return true;
  };

  const validateUpi = (val: string): boolean => {
    const clean = val.trim().toLowerCase();
    if (!clean) {
      setUpiError('');
      return true;
    }
    if (!clean.includes('@') || clean.startsWith('@') || clean.endsWith('@') || !UPI_REGEX.test(clean)) {
      setUpiError(t('invalidUpiError'));
      return false;
    }
    setUpiError('');
    return true;
  };

  // Load existing profile bank details
  const loadProfileBankDetails = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('bank_name, bank_account_no, bank_ifsc, upi_id')
        .eq('id', user.id)
        .single();

      if (error) {
        // Fallback to local storage cache if table column is sync pending
        const cached = localStorage.getItem(`quickhire_bank_${user.id}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.bank_name) setBankName(parsed.bank_name);
          if (parsed.bank_account_no) {
            setAccountNo(parsed.bank_account_no);
            setConfirmAccountNo(parsed.bank_account_no);
          }
          if (parsed.bank_ifsc) setIfsc(parsed.bank_ifsc);
          if (parsed.upi_id) setUpiId(parsed.upi_id);
          setHasConfiguredBank(Boolean(parsed.bank_account_no || parsed.upi_id));
        }
        return;
      }

      if (data) {
        const bName = data.bank_name || '';
        if (COMMON_BANKS.includes(bName)) {
          setBankName(bName);
        } else if (bName) {
          setBankName('Other / Custom Bank');
          setCustomBankName(bName);
        } else {
          setBankName('');
        }

        const acc = data.bank_account_no || '';
        setAccountNo(acc);
        setConfirmAccountNo(acc);
        setIfsc(data.bank_ifsc || '');
        setUpiId(data.upi_id || '');
        setHasConfiguredBank(Boolean(acc || data.upi_id));
      }
    } catch (err) {
      console.warn('Bank load error:', err);
    }
  }, [user]);

  // Load payments ledger
  const loadPaymentsLedger = useCallback(async () => {
    if (!user) return;
    setLedgerLoading(true);
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .or(`payer_id.eq.${user.id},payee_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      // Local storage cache for offline resilience
      const localLedgerKey = `quickhire_payment_ledger_${user.id}`;
      let localPayments: PaymentRecord[] = [];
      try {
        const stored = localStorage.getItem(localLedgerKey);
        if (stored) {
          localPayments = JSON.parse(stored);
        }
      } catch {
        // Ignore local storage error
      }

      if (error || !data) {
        // Use cached local ledger
        setPayments(localPayments);
      } else {
        // Merge Supabase records with any recent local items
        const combined = [...(data as PaymentRecord[])];
        for (const localItem of localPayments) {
          if (!combined.some((item) => item.id === localItem.id)) {
            combined.unshift(localItem);
          }
        }
        combined.sort(
          (a, b) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        setPayments(combined);
      }
    } catch (err) {
      console.warn('Payments load error:', err);
    } finally {
      setLedgerLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadProfileBankDetails();
      loadPaymentsLedger();
    }
  }, [user, loadProfileBankDetails, loadPaymentsLedger]);

  const handleSaveBankDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSaveSuccess(false);

    if (!user) {
      onRequireLogin();
      return;
    }

    if (!accountNo.trim() && !upiId.trim()) {
      const msg = t('eitherAccountOrUpiError');
      setErrorMessage(msg);
      speakText(msg, currentLang);
      return;
    }

    if (accountNo.trim() && confirmAccountNo.trim() && accountNo.trim() !== confirmAccountNo.trim()) {
      const msg = t('accountMismatchError');
      setErrorMessage(msg);
      speakText(msg, currentLang);
      return;
    }

    if (ifsc.trim() && !validateIfsc(ifsc)) {
      const msg = t('invalidIfscError');
      setErrorMessage(msg);
      speakText(msg, currentLang);
      return;
    }

    if (upiId.trim() && !validateUpi(upiId)) {
      const msg = t('invalidUpiError');
      setErrorMessage(msg);
      speakText(msg, currentLang);
      return;
    }

    const finalBankName =
      bankName === 'Other / Custom Bank' ? customBankName.trim() : bankName.trim();

    setIsSaving(true);

    try {
      // 1. Update profiles table
      const { error } = await supabase
        .from('profiles')
        .update({
          bank_name: finalBankName || null,
          bank_account_no: accountNo.trim() || null,
          bank_ifsc: ifsc.trim().toUpperCase() || null,
          upi_id: upiId.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        console.warn('Supabase profile bank update fallback:', error.message);
      }

      // 2. Persist to resilient local storage cache
      const bankData = {
        bank_name: finalBankName,
        bank_account_no: accountNo.trim(),
        bank_ifsc: ifsc.trim().toUpperCase(),
        upi_id: upiId.trim(),
        updated_at: new Date().toISOString(),
      };
      localStorage.setItem(`quickhire_bank_${user.id}`, JSON.stringify(bankData));

      setHasConfiguredBank(true);
      setSaveSuccess(true);
      speakText(t('bankSavedSuccess'), currentLang);

      setTimeout(() => {
        setSaveSuccess(false);
      }, 4000);
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, 'Failed to save bank details');
      setErrorMessage('Error saving details: ' + msg);
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    speakText(t('copiedBtn'), currentLang);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Filtered payments for ledger
  const filteredPayments = payments.filter((p) => {
    if (ledgerFilter === 'received' && p.payee_id !== user?.id) return false;
    if (ledgerFilter === 'sent' && p.payer_id !== user?.id) return false;

    if (searchLedger.trim()) {
      const q = searchLedger.toLowerCase();
      const matchUtr = p.transaction_ref?.toLowerCase().includes(q);
      const matchAmount = p.amount.toString().includes(q);
      const matchMethod = p.payment_method.toLowerCase().includes(q);
      const matchType = p.payment_for_type.toLowerCase().includes(q);
      return matchUtr || matchAmount || matchMethod || matchType;
    }
    return true;
  });

  // Calculate totals
  const totalReceived = payments
    .filter((p) => p.payee_id === user?.id)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const totalSent = payments
    .filter((p) => p.payer_id === user?.id)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 text-center">
        <div className="bg-gradient-to-br from-white to-brand-50/50 rounded-3xl border border-brand-200/80 p-8 sm:p-12 shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/10 text-brand-700 flex items-center justify-center mx-auto mb-5">
            <Landmark className="w-8 h-8" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-heading font-extrabold text-slate-900 mb-3">
            {t('loginToViewBank')}
          </h2>
          <p className="text-slate-600 max-w-lg mx-auto text-sm sm:text-base mb-8">
            {t('loginBankSub')}
          </p>
          <button
            onClick={onRequireLogin}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm sm:text-base shadow-lg shadow-brand-600/25 transition-all hover:scale-[1.02]"
          >
            <Lock className="w-4 h-4" />
            <span>{t('login')}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 max-w-6xl mx-auto pb-16">
      {/* HEADER SECTION */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-900 via-brand-900 to-slate-900 text-white p-6 sm:p-10 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-black uppercase tracking-wider border border-emerald-500/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{t('zeroCommissionBanner')}</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-4xl font-heading font-black tracking-tight text-white flex items-center gap-3">
                <span className="p-2 rounded-2xl bg-white/10 backdrop-blur-md">🏦</span>
                <span>{t('bankTitle')}</span>
              </h1>
              <VoiceSpeakerButton
                text={`${t('bankTitle')}. ${t('bankSub')}`}
                lang={currentLang}
                label="Listen to bank overview"
              />
            </div>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              {t('bankSub')}
            </p>
          </div>

          {/* ACTIVE STATUS BADGE */}
          <div className="shrink-0">
            {hasConfiguredBank ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 backdrop-blur-md text-emerald-200 shadow-inner">
                <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-black">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider block text-emerald-300">
                    {t('bankVerifiedBadge')}
                  </span>
                  <span className="text-xs font-semibold text-white">
                    {bankName || t('bankActiveNotice')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-500/20 border border-amber-400/40 backdrop-blur-md text-amber-200">
                <AlertCircle className="w-6 h-6 text-amber-400" />
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider block text-amber-300">
                    {t('bankUnconfiguredBadge')}
                  </span>
                  <span className="text-xs text-amber-100">{t('addAccountToReceive')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2-COLUMN LAYOUT: SECTION A (FORM) + QUICK PREVIEW */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* SECTION A: FORM */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/80 shadow-xl p-6 sm:p-8">
          <div className="flex items-center justify-between pb-5 border-b border-slate-100 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center font-bold">
                <Landmark className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-heading font-extrabold text-slate-900">
                  {t('bankNameLabel')} & {t('upiLabel')}
                </h2>
                <p className="text-xs text-slate-500">{t('securePayoutsSub')}</p>
              </div>
            </div>

            <VoiceSpeakerButton
              text={t('bankSetupGuidance')}
              lang={currentLang}
              label="Listen to bank account guidance"
            />
          </div>

          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {saveSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{t('bankSavedSuccess')}</span>
            </motion.div>
          )}

          <form onSubmit={handleSaveBankDetails} className="space-y-5">
            {/* 1. BANK NAME SELECT */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-brand-600" />
                  <span>{t('bankNameLabel')}</span>
                </label>
                <VoiceSpeakerButton
                  text={getVoiceGuidance('bankName', currentLang)}
                  lang={currentLang}
                  label="Listen to bank name guidance"
                />
              </div>

              <select
                value={bankName}
                onClick={() => speakText(getVoiceGuidance('bankName', currentLang), currentLang)}
                onFocus={() => speakText(getVoiceGuidance('bankName', currentLang), currentLang)}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 shadow-2xs"
              >
                <option value="">{t('selectBankPrompt')}</option>
                {COMMON_BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>

              {/* QUICK CHIPS FOR TOP RURAL BANKS */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">{t('quickSelect')}</span>
                {[
                  { name: 'State Bank of India (SBI)', short: 'SBI' },
                  { name: 'Bank of Maharashtra (BOM)', short: 'Bank of Maharashtra' },
                  { name: 'Bank of Baroda (BOB)', short: 'Bank of Baroda' },
                  { name: 'Punjab National Bank (PNB)', short: 'PNB' },
                  { name: 'HDFC Bank', short: 'HDFC' },
                  { name: 'India Post Payments Bank (IPPB)', short: 'India Post Bank' },
                ].map((b) => (
                  <button
                    key={b.name}
                    type="button"
                    onClick={() => {
                      setBankName(b.name);
                      speakText(b.short, currentLang);
                    }}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-all ${
                      bankName === b.name
                        ? 'bg-brand-500 text-white border-brand-500 font-bold shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {b.short}
                  </button>
                ))}
              </div>

              {/* CUSTOM BANK INPUT IF OTHER */}
              {bankName === 'Other / Custom Bank' && (
                <div className="pt-2">
                  <input
                    type="text"
                    value={customBankName}
                    onChange={(e) => setCustomBankName(e.target.value)}
                    placeholder={t('customBankPlaceholder')}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 outline-none focus:border-brand-500 shadow-2xs"
                  />
                </div>
              )}
            </div>

            {/* 2. BANK ACCOUNT NUMBER + CONFIRM */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-brand-600" />
                      <span>{t('accountNoLabel')}</span>
                    </label>
                    {accountNo && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(accountNo, 'acc_form')}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-700 px-2 py-0.5 rounded-md bg-brand-50 hover:bg-brand-100 transition-colors"
                        title="Copy Account Number"
                      >
                        {copiedField === 'acc_form' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-600">{t('copiedBtn')}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>{t('copyBtn')}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <VoiceSpeakerButton
                    text={getVoiceGuidance('bankAccountNo', currentLang)}
                    lang={currentLang}
                    label="Listen to account number guidance"
                  />
                </div>
                <input
                  type="text"
                  value={accountNo}
                  onClick={() => speakText(getVoiceGuidance('bankAccountNo', currentLang), currentLang)}
                  onFocus={() => speakText(getVoiceGuidance('bankAccountNo', currentLang), currentLang)}
                  onChange={(e) => setAccountNo(e.target.value.replace(/\s+/g, ''))}
                  placeholder={t('accountNoPlaceholder')}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 outline-none focus:border-brand-500 shadow-2xs tracking-wider"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t('confirmAccountNoLabel')}</span>
                  </label>
                  <VoiceSpeakerButton
                    text={getVoiceGuidance('confirmAccountNo', currentLang)}
                    lang={currentLang}
                    label="Listen to confirm account guidance"
                  />
                </div>
                <input
                  type="password"
                  value={confirmAccountNo}
                  onChange={(e) => setConfirmAccountNo(e.target.value.replace(/\s+/g, ''))}
                  placeholder={t('confirmAccountNoPlaceholder')}
                  className={`w-full px-4 py-3 border rounded-xl text-sm font-mono font-bold text-slate-900 outline-none shadow-2xs tracking-wider ${
                    confirmAccountNo && accountNo && confirmAccountNo !== accountNo
                      ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                      : 'border-slate-300 focus:border-brand-500'
                  }`}
                />
                {accountNo && confirmAccountNo && accountNo !== confirmAccountNo && (
                  <div className="flex items-center gap-1.5 text-xs text-red-600 font-semibold pt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{t('accountMismatchError')}</span>
                  </div>
                )}
                {accountNo && confirmAccountNo && accountNo === confirmAccountNo && (
                  <div className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium pt-1">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Account Numbers Match</span>
                  </div>
                )}
              </div>
            </div>

            {/* 3. IFSC CODE (WITH REGEX VALIDATION) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-brand-600" />
                    <span>{t('ifscLabel')}</span>
                  </label>
                  {ifsc && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(ifsc, 'ifsc_form')}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-700 px-2 py-0.5 rounded-md bg-brand-50 hover:bg-brand-100 transition-colors"
                      title="Copy IFSC"
                    >
                      {copiedField === 'ifsc_form' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-600">{t('copiedBtn')}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>{t('copyBtn')}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <VoiceSpeakerButton
                  text={getVoiceGuidance('bankIfsc', currentLang)}
                  lang={currentLang}
                  label="Listen to IFSC code guidance"
                />
              </div>
              <input
                type="text"
                maxLength={11}
                value={ifsc}
                onClick={() => speakText(getVoiceGuidance('bankIfsc', currentLang), currentLang)}
                onFocus={() => speakText(getVoiceGuidance('bankIfsc', currentLang), currentLang)}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase().replace(/\s+/g, '');
                  setIfsc(val);
                  validateIfsc(val);
                }}
                onBlur={() => validateIfsc(ifsc)}
                placeholder={t('ifscPlaceholder')}
                className={`w-full px-4 py-3 border rounded-xl text-sm font-mono font-bold text-slate-900 uppercase outline-none shadow-2xs tracking-wider transition-colors ${
                  ifscError
                    ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                    : ifsc.trim() && IFSC_REGEX.test(ifsc.trim())
                    ? 'border-emerald-500 focus:border-emerald-600 bg-emerald-50/10'
                    : 'border-slate-300 focus:border-brand-500'
                }`}
              />
              {ifscError ? (
                <div className="flex items-center gap-1.5 text-xs text-red-600 font-semibold pt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{ifscError}</span>
                </div>
              ) : ifsc.trim() && IFSC_REGEX.test(ifsc.trim()) ? (
                <div className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium pt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Verified 11-digit IFSC structure</span>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">
                  {t('ifscFormatHint')}
                </p>
              )}
            </div>

            {/* 4. DIRECT UPI ID (WITH FORMAT VALIDATION) */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <QrCode className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{t('upiLabel')}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold">
                      Instant 0%
                    </span>
                  </label>
                  {upiId && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(upiId, 'upi_form')}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 transition-colors"
                      title="Copy UPI ID"
                    >
                      {copiedField === 'upi_form' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-600">{t('copiedBtn')}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>{t('copyBtn')}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <VoiceSpeakerButton
                  text={getVoiceGuidance('upiId', currentLang)}
                  lang={currentLang}
                  label="Listen to UPI ID guidance"
                />
              </div>
              <input
                type="text"
                value={upiId}
                onClick={() => speakText(getVoiceGuidance('upiId', currentLang), currentLang)}
                onFocus={() => speakText(getVoiceGuidance('upiId', currentLang), currentLang)}
                onChange={(e) => {
                  const val = e.target.value.trim().toLowerCase();
                  setUpiId(val);
                  validateUpi(val);
                }}
                onBlur={() => validateUpi(upiId)}
                placeholder={t('upiPlaceholder')}
                className={`w-full px-4 py-3 border rounded-xl text-sm font-semibold text-slate-900 outline-none shadow-2xs font-mono transition-colors ${
                  upiError
                    ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                    : upiId.trim() && upiId.includes('@') && !upiId.startsWith('@') && !upiId.endsWith('@')
                    ? 'border-emerald-500 focus:border-emerald-600 bg-emerald-50/10'
                    : 'border-slate-300 focus:border-brand-500'
                }`}
              />
              {upiError ? (
                <div className="flex items-center gap-1.5 text-xs text-red-600 font-semibold pt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{upiError}</span>
                </div>
              ) : upiId.trim() && upiId.includes('@') && !upiId.startsWith('@') && !upiId.endsWith('@') ? (
                <div className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium pt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Valid UPI Virtual Payment Address (VPA) format</span>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">
                  {t('upiAppsHint')}
                </p>
              )}

              {/* SECURITY & CITIZEN EDUCATION NOTICE */}
              <div className="mt-3 p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/90 text-xs text-amber-900 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold block text-amber-950">Security & Privacy Note:</span>
                  <p className="text-[11px] leading-relaxed text-amber-800">
                    {t('eduUpiNoWithdrawal')}
                  </p>
                </div>
              </div>
            </div>

            {/* SUBMIT BUTTON */}
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-3.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm sm:text-base shadow-lg shadow-brand-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-70 mt-6"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{t('savingBankBtn')}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t('saveBankBtn')}</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* SECTION A (SIDEBAR): DIGITAL VERIFICATION PASS / CARD WITH 1-TAP COPY */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-6 sm:p-7 shadow-xl border border-slate-700/60 relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-700/80 mb-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-sm tracking-wide text-white">{t('directPayoutTitle')}</span>
              </div>
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-extrabold uppercase">
                {t('zeroFees')}
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                  {t('bankNameLabel')}
                </span>
                <span className="text-base font-bold text-white block">
                  {bankName
                    ? bankName === 'Other / Custom Bank'
                      ? customBankName || 'Custom Bank'
                      : bankName
                    : t('notConfiguredYet')}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* ACCOUNT NUMBER WITH 1-TAP COPY */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    {t('accountNoLabel')}
                  </span>
                  <div className="flex items-center justify-between gap-1.5 bg-slate-800/90 p-2.5 rounded-xl border border-slate-700">
                    <span className="text-xs font-mono font-bold text-slate-200">
                      {accountNo ? `•••• ${accountNo.slice(-4)}` : '—'}
                    </span>
                    {accountNo && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(accountNo, 'acc')}
                        className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs font-bold text-white transition-colors flex items-center gap-1 shrink-0"
                        title="Copy Account Number"
                      >
                        {copiedField === 'acc' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-300 font-extrabold">{t('copiedBtn')}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>{t('copyBtn')}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* IFSC CODE WITH 1-TAP COPY */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    {t('ifscLabel')}
                  </span>
                  <div className="flex items-center justify-between gap-1.5 bg-slate-800/90 p-2.5 rounded-xl border border-slate-700">
                    <span className="text-xs font-mono font-bold text-emerald-400 truncate">
                      {ifsc || '—'}
                    </span>
                    {ifsc && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(ifsc, 'ifsc')}
                        className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs font-bold text-white transition-colors flex items-center gap-1 shrink-0"
                        title="Copy IFSC"
                      >
                        {copiedField === 'ifsc' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-300 font-extrabold">{t('copiedBtn')}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>{t('copyBtn')}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* UPI ID (VPA) WITH 1-TAP COPY */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                  {t('upiLabel')}
                </span>
                <div className="flex items-center justify-between gap-2 bg-slate-800/90 p-2.5 rounded-xl border border-slate-700">
                  <span className="text-xs font-mono font-bold text-emerald-300 truncate flex-1">
                    {upiId || t('noUpiSaved')}
                  </span>
                  {upiId && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(upiId, 'upi')}
                      className="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs font-bold text-white transition-colors flex items-center gap-1 shrink-0"
                      title="Copy UPI ID"
                    >
                      {copiedField === 'upi' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-300 font-extrabold">{t('copiedBtn')}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>{t('copyBtn')}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-700/80 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>{t('npciCompliant')}</span>
              </span>
              <span className="font-mono text-[11px] text-slate-500">ID: {user.id.slice(0, 8)}</span>
            </div>
          </div>

          {/* TOTALS SUMMARY STATS */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-1">
                <ArrowDownLeft className="w-4 h-4" />
                <span>{t('totalReceived')}</span>
              </div>
              <div className="text-xl sm:text-2xl font-heading font-black text-slate-900">
                ₹{totalReceived.toLocaleString('en-IN')}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">{t('wagesAndRentals')}</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-rose-600 text-xs font-bold uppercase tracking-wider mb-1">
                <ArrowUpRight className="w-4 h-4" />
                <span>{t('totalPaidOut')}</span>
              </div>
              <div className="text-xl sm:text-2xl font-heading font-black text-slate-900">
                ₹{totalSent.toLocaleString('en-IN')}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">{t('wagesAndMachineRents')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION B: DIGITAL PASSBOOK / PAYMENT LEDGER */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <ReceiptText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-heading font-extrabold text-slate-900">
                {t('passbookTitle')}
              </h2>
              <p className="text-xs text-slate-500">{t('passbookSub')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* FILTER BUTTONS */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLedgerFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  ledgerFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('filterAll')} ({payments.length})
              </button>
              <button
                type="button"
                onClick={() => setLedgerFilter('received')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  ledgerFilter === 'received'
                    ? 'bg-white text-emerald-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('filterReceived')}
              </button>
              <button
                type="button"
                onClick={() => setLedgerFilter('sent')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  ledgerFilter === 'sent'
                    ? 'bg-white text-rose-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('filterSent')}
              </button>
            </div>

            <button
              type="button"
              onClick={loadPaymentsLedger}
              title="Refresh Passbook"
              className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${ledgerLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* SEARCH BAR */}
        <div className="py-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchLedger}
              onChange={(e) => setSearchLedger(e.target.value)}
              placeholder={t('searchLedgerPlaceholder')}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-brand-500 focus:bg-white transition-colors"
            />
          </div>
        </div>

        {/* LEDGER LIST / TABLE */}
        {ledgerLoading ? (
          <div className="py-16 text-center text-slate-400 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-500" />
            <p className="text-sm font-medium">{t('loadingTransactions')}</p>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="py-14 text-center space-y-3 bg-slate-50 rounded-2xl border border-dashed border-slate-200 my-2">
            <ReceiptText className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">{t('noTransactions')}</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Any direct bank wages or equipment rentals paid using the &quot;Pay Wage to Bank&quot; or &quot;Pay Rent to Bank&quot; buttons will be logged directly here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                  <th className="py-3 px-3">{t('typeHeader')}</th>
                  <th className="py-3 px-3">{t('purposeHeader')}</th>
                  <th className="py-3 px-3">{t('amountHeader')}</th>
                  <th className="py-3 px-3">{t('methodHeader')}</th>
                  <th className="py-3 px-3">{t('utrHeader')}</th>
                  <th className="py-3 px-3">{t('dateHeader')}</th>
                  <th className="py-3 px-3">{t('statusHeader')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.map((p) => {
                  const isReceived = p.payee_id === user.id;
                  const dateStr = p.created_at
                    ? new Date(p.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Recent';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* TYPE (SENT / RECEIVED) */}
                      <td className="py-3.5 px-3">
                        {isReceived ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold border border-emerald-200/60 text-[11px]">
                            <ArrowDownLeft className="w-3 h-3" />
                            <span>{t('filterReceived')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 font-bold border border-rose-200/60 text-[11px]">
                            <ArrowUpRight className="w-3 h-3" />
                            <span>{t('filterSent')}</span>
                          </span>
                        )}
                      </td>

                      {/* PURPOSE */}
                      <td className="py-3.5 px-3 font-semibold text-slate-800">
                        {p.payment_for_type === 'worker_wage' ? (
                          <span className="inline-flex items-center gap-1">
                            <span>👷</span>
                            <span>{t('paymentTypeWage')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <span>🚜</span>
                            <span>{t('paymentTypeRental')}</span>
                          </span>
                        )}
                      </td>

                      {/* AMOUNT */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`font-heading font-extrabold text-sm ${
                            isReceived ? 'text-emerald-700' : 'text-slate-900'
                          }`}
                        >
                          {isReceived ? '+' : '-'} ₹{Number(p.amount).toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* PAYMENT METHOD */}
                      <td className="py-3.5 px-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                          {p.payment_method === 'Direct UPI' ? '⚡ UPI' : '🏛️ Net Banking'}
                        </span>
                      </td>

                      {/* UTR / REF WITH COPY */}
                      <td className="py-3.5 px-3 font-mono text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-[130px]">
                            {p.transaction_ref || 'Direct Settlement'}
                          </span>
                          {p.transaction_ref && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(p.transaction_ref || '', p.id)}
                              className="text-slate-400 hover:text-slate-700 inline-flex items-center gap-1"
                              title="Copy UTR"
                            >
                              {copiedField === p.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span className="text-[10px] text-emerald-600 font-bold">{t('copiedBtn')}</span>
                                </>
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* DATE */}
                      <td className="py-3.5 px-3 text-slate-500 text-[11px] whitespace-nowrap">
                        {dateStr}
                      </td>

                      {/* STATUS */}
                      <td className="py-3.5 px-3">
                        {p.status === 'paid' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300">
                            <Check className="w-3 h-3 text-emerald-700" />
                            <span>{t('statusPaid')}</span>
                          </span>
                        ) : p.status === 'submitted' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold border border-blue-300">
                            <RefreshCw className="w-3 h-3 text-blue-700" />
                            <span>{t('statusSubmitted')}</span>
                          </span>
                        ) : p.status === 'failed' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-800 text-[10px] font-bold border border-red-300">
                            <AlertCircle className="w-3 h-3 text-red-700" />
                            <span>{t('statusFailed')}</span>
                          </span>
                        ) : p.status === 'cancelled' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-300">
                            <span>{t('statusCancelled')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-300">
                            <AlertCircle className="w-3 h-3 text-amber-700" />
                            <span>{t('statusPending')}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default BankDetailsTab;
