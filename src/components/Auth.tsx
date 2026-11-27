import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert,
  Sparkles,
  CheckCircle2,
  Check,
  Globe2,
  Building2,
  Users,
  Scale,
  Landmark,
  PhoneCall,
  ShieldCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-react';
import { speakText, getVoiceGuidance } from '../lib/speech';
import { VoiceSpeakerButton } from './VoiceSpeakerButton';
import { getTranslation, normalizeLanguage, SUPPORTED_LANGUAGES } from '../lib/translations';
import { AccessibleVoiceBar } from './AccessibleVoiceBar';
import { VoiceAssistanceToggle } from './VoiceAssistanceToggle';
import { verifyAdminStatus, ensureAdminSession } from '../lib/adminAuth';
import { navigateTo } from '../lib/adminRouter';

const EMAIL_REGEX = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

const COUNTRY_CODES = [
  { code: '+91', country: 'India', flag: 'IN' },
  { code: '+1', country: 'US / Canada', flag: 'US' },
  { code: '+44', country: 'UK', flag: 'UK' },
  { code: '+971', country: 'UAE', flag: 'AE' },
  { code: '+977', country: 'Nepal', flag: 'NP' },
  { code: '+880', country: 'Bangladesh', flag: 'BD' },
];

interface AuthProps {
  isOpen?: boolean;
  onClose?: () => void;
  currentLang?: string;
  isGate?: boolean;
  onLoginSuccess?: (user: User, role: 'worker' | 'employer' | 'admin') => void;
  onLangChange?: (lang: string) => void;
}

export function Auth({
  isOpen = true,
  onClose,
  currentLang = 'English',
  isGate = false,
  onLoginSuccess,
  onLangChange,
}: AuthProps) {
  // 1. Dual authentication mode: 'phone' or 'email'
  const [authType, setAuthType] = useState<'phone' | 'email'>('phone');

  // Phone Authentication states (Fast2SMS SMS Hook via Supabase Auth)
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Email Authentication states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showForgotBox, setShowForgotBox] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  // Common UI & async loading states
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [selectedRole, setSelectedRole] = useState<'worker' | 'employer'>('worker');
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  // Resend OTP cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const phonePrompt = getVoiceGuidance('phoneInput', currentLang);
  const otpPrompt = getVoiceGuidance('otpInput', currentLang);
  const rolePrompt = getVoiceGuidance('roleSelection', currentLang);
  const emailPrompt = getVoiceGuidance('emailInput', currentLang);
  const passwordPrompt = getVoiceGuidance('passwordInput', currentLang);

  const t = (key: string): string => getTranslation(currentLang, key);

  const handleClose = () => {
    if (onClose) onClose();
    setStep('request');
    setAuthError('');
    setAuthNotice('');
    setOtp('');
    setPassword('');
    setConfirmPassword('');
    setFullName('');
    setShowForgotBox(false);
    setResendCooldown(0);
  };

  const handleRoleSelect = (role: 'worker' | 'employer') => {
    setSelectedRole(role);
    const roleConfirmations: Record<'worker' | 'employer', Record<string, string>> = {
      worker: {
        English: 'Worker role selected.',
        'हिंदी (Hindi)': 'श्रमिक कामगार चुना गया।',
        'मराठी (Marathi)': 'कामगार निवडले.',
        'বাংলা (Bengali)': 'কর্মী ভূমিকা নির্বাচিত হয়েছে।',
        'తెలుగు (Telugu)': 'కార్మికుని పాత్ర ఎంపిక చేయబడింది.',
      },
      employer: {
        English: 'Job Hirer role selected.',
        'हिंदी (Hindi)': 'नियोक्ता किसान चुना गया।',
        'मराठी (Marathi)': 'मालक शेतकरी निवडले.',
        'বাংলা (Bengali)': 'নিয়োগকর্তা ভূমিকা নির্বাচিত হয়েছে।',
        'తెలుగు (Telugu)': 'యజమాని పాత్ర ఎంపిక చేయబడింది.',
      },
    };
    const normLang = normalizeLanguage(currentLang);
    const confirmation = roleConfirmations[role]?.[normLang] || roleConfirmations[role]['English'];
    speakText(confirmation, currentLang);
  };

  // Centralized session & profile synchronization handler
  const handleAuthSuccess = async (authUser: User) => {
    try {
      // 1. Check if authenticated user is the designated platform administrator
      const adminCheck = await verifyAdminStatus(authUser.id);
      if (adminCheck.isAdmin) {
        ensureAdminSession(authUser, adminCheck.role, adminCheck.verifiedEmail, adminCheck.verifiedPhone);

        // Admin access is granted only by the server-verified admin_users/is_admin
        // checks above. Never create or promote an admin profile from browser code.

        setLoading(false);
        if (onLoginSuccess) {
          onLoginSuccess(authUser, 'admin');
        }
        if (onClose) {
          onClose();
        }
        speakText('Administrator session verified. Connecting to governance suite.', currentLang);
        navigateTo('/admin');
        return;
      }

      // 2. Normal citizen / worker / employer handling
      let existingProfile: { id: string; role: string; account_status?: string | null; full_name?: string | null } | null = null;
      try {
        const { data, error: profileLookupError } = await supabase
          .from('profiles')
          .select('id, role, account_status, full_name')
          .eq('id', authUser.id)
          .maybeSingle();
        if (profileLookupError) throw profileLookupError;
        existingProfile = data;

        if (existingProfile?.account_status === 'suspended') {
          throw new Error(t('authSuspendedAccount'));
        }

        const normalizedPhone = authUser.phone || (phone ? `${countryCode}${phone.replace(/\D/g, '')}` : null);

        if (!existingProfile) {
          // Brand-new registration: assign normal user role by default. Never accept an admin role.
          const assignedRole = selectedRole === 'employer' ? 'employer' : 'worker';
          const profileEmail = authUser.email && !authUser.email.endsWith('@quickhire.local') ? authUser.email : null;
          const userDisplayName = fullName.trim() || authUser.user_metadata?.full_name || (assignedRole === 'worker' ? 'QuickHire Worker' : 'QuickHire Employer');

          const newProfilePayload: Record<string, unknown> = {
            id: authUser.id,
            full_name: userDisplayName,
            phone_number: normalizedPhone,
            role: assignedRole,
            account_status: 'active',
          };
          if (profileEmail) {
            newProfilePayload.email = profileEmail;
          }

          if (assignedRole === 'employer') {
            // 1. Preferred server-authorized RPC onboarding path
            const { error: rpcErr } = await supabase.rpc('register_as_employer');
            if (rpcErr) {
              console.warn('register_as_employer RPC unavailable, falling back:', rpcErr);
              const { error: insErr } = await supabase.from('profiles').insert(newProfilePayload);
              if (insErr) {
                if (insErr.code === '42703' && 'email' in newProfilePayload) {
                  delete newProfilePayload.email;
                  const { error: retryError } = await supabase.from('profiles').insert(newProfilePayload);
                  if (retryError) throw retryError;
                } else {
                  throw insErr;
                }
              }
            } else {
              // Update additional profile fields after the server-authorized role registration.
              const metaUpdate: Record<string, unknown> = {};
              if (userDisplayName) metaUpdate.full_name = userDisplayName;
              if (normalizedPhone) metaUpdate.phone_number = normalizedPhone;
              if (profileEmail) metaUpdate.email = profileEmail;
              if (Object.keys(metaUpdate).length > 0) {
                const { error: metaUpdateError } = await supabase
                  .from('profiles')
                  .update(metaUpdate)
                  .eq('id', authUser.id);
                if (metaUpdateError) throw metaUpdateError;
              }
            }
          } else {
            // Worker registration
            const { error: insErr } = await supabase.from('profiles').insert(newProfilePayload);
            if (insErr) {
              if (insErr.code === '42703' && 'email' in newProfilePayload) {
                delete newProfilePayload.email;
                const { error: retryError } = await supabase.from('profiles').insert(newProfilePayload);
                if (retryError) throw retryError;
              } else {
                throw insErr;
              }
            }

            const { error: workerInsertError } = await supabase.from('workers').insert({
              id: authUser.id,
              category: 'Daily work',
              skills: [] as string[],
              is_available: true,
            });
            if (workerInsertError && workerInsertError.code !== '23505') throw workerInsertError;
          }

        } else {
          // Returning user: PRESERVE existing profile role and data. Do NOT overwrite saved role.
          // Suspended accounts cannot self-activate. Deactivated accounts are restored only after successful re-authentication.
          const updatePayload: Record<string, unknown> = {};

          if (authUser.email && !authUser.email.endsWith('@quickhire.local')) {
            updatePayload.email = authUser.email;
          }
          if (normalizedPhone) {
            updatePayload.phone_number = normalizedPhone;
          }

          if (Object.keys(updatePayload).length > 0) {
            const { error: updErr } = await supabase
              .from('profiles')
              .update(updatePayload)
              .eq('id', authUser.id);

            if (updErr) {
              if (updErr.code === '42703' && 'email' in updatePayload) {
                delete updatePayload.email;
                const { error: retryError } = await supabase
                  .from('profiles')
                  .update(updatePayload)
                  .eq('id', authUser.id);
                if (retryError) throw retryError;
              } else {
                throw updErr;
              }
            }
          }

          if (existingProfile.role === 'worker') {
            const { data: existingWorker, error: workerLookupError } = await supabase
              .from('workers')
              .select('id')
              .eq('id', authUser.id)
              .maybeSingle();

            if (workerLookupError) throw workerLookupError;
            if (!existingWorker) {
              const { error: workerInsertError } = await supabase.from('workers').insert({
                id: authUser.id,
                category: 'Daily work',
                skills: [] as string[],
                is_available: true,
              });
              if (workerInsertError && workerInsertError.code !== '23505') throw workerInsertError;
            }
          }

        }
      } catch (dbErr) {
        console.warn('Database profile sync failed:', dbErr);
        throw dbErr;
      }

      setLoading(false);
      setPhone('');
      setOtp('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setFullName('');
      setShowForgotBox(false);
      setStep('request');
      setResendCooldown(0);
      setAuthError('');
      setAuthNotice('');

      const resolvedRole: 'worker' | 'employer' = existingProfile
        ? (existingProfile.role === 'employer' ? 'employer' : 'worker')
        : selectedRole;

      if (existingProfile && existingProfile.account_status === 'deactivated') {
        speakText(t('accountRestoredSuccess'), currentLang);
      } else {
        speakText(`${t('loginGateTitle')}. ${resolvedRole === 'worker' ? t('roleWorker') : t('roleEmployer')}`, currentLang);
      }

      if (onLoginSuccess) {
        onLoginSuccess(authUser, resolvedRole);
      }
      if (onClose) {
        onClose();
      }
    } catch (err: unknown) {
      setLoading(false);
      console.error('Authentication succeeded but QuickHire profile setup failed:', err);
      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        console.warn('Could not clear the partially established auth session:', signOutError);
      }
      const failureMessage = err instanceof Error ? err.message : '';
      setAuthError(
        failureMessage.toLowerCase().includes('account is suspended')
          ? failureMessage
          : 'Your sign-in was verified, but QuickHire could not finish setting up your profile. Please try again. If this continues, contact support.'
      );
    }
  };

  // Mobile Phone OTP: Step 1 (Send OTP via Supabase Auth with Fast2SMS SMS Hook)
  const handleSendOtp = async (isResend = false) => {
    if (isResend && resendCooldown > 0) return;

    const cleanDigits = phone.replace(/\D/g, '');
    if (countryCode === '+91' && cleanDigits.length !== 10) {
      const errMsg = t('invalidPhone') || 'Please enter a valid 10-digit mobile number.';
      setAuthError(errMsg);
      speakText(errMsg, currentLang);
      return;
    }
    if (cleanDigits.length < 7 || cleanDigits.length > 15) {
      const errMsg = 'Please enter a valid mobile number (7-15 digits).';
      setAuthError(errMsg);
      speakText(errMsg, currentLang);
      return;
    }

    setLoading(true);
    setAuthError('');
    setAuthNotice('');

    const e164 = `${countryCode}${cleanDigits}`;

    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: e164,
        options: {
          channel: 'sms',
          shouldCreateUser: isSignUp,
        },
      });

      if (error) {
        setLoading(false);
        let friendlyError = error.message;
        const lower = error.message.toLowerCase();
        if (lower.includes('rate limit') || lower.includes('over_sms_provider_quota') || lower.includes('too many')) {
          friendlyError = 'Too many attempts. Please wait a few minutes before requesting another code.';
        } else if (lower.includes('unsupported') || lower.includes('not enabled') || lower.includes('provider')) {
          friendlyError = 'SMS verification service is temporarily unavailable. Please verify provider settings or contact support.';
        } else if (lower.includes('invalid phone') || lower.includes('e.164')) {
          friendlyError = 'Invalid phone number format. Please check your country code and mobile number.';
        }
        setAuthError(friendlyError);
        speakText(friendlyError, currentLang);
        return;
      }

      setLoading(false);
      setStep('verify');
      setResendCooldown(60);
      setAuthNotice('');
      speakText(otpPrompt, currentLang);
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : 'System error occurred while sending OTP.';
      setAuthError(msg);
      speakText(msg, currentLang);
    }
  };

  // Mobile Phone OTP: Step 2 (Verify OTP & Establish Authenticated Supabase Session)
  const handleVerifyOtp = async () => {
    const cleanDigits = phone.replace(/\D/g, '');
    const cleanOtp = otp.trim();

    if (!cleanOtp || cleanOtp.length !== 6) {
      const errMsg = t('invalidOtp') || 'Please enter the 6-digit OTP code.';
      setAuthError(errMsg);
      speakText(errMsg, currentLang);
      return;
    }

    setLoading(true);
    setAuthError('');
    setAuthNotice('');

    const e164 = `${countryCode}${cleanDigits}`;

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: e164,
        token: cleanOtp,
        type: 'sms',
      });

      if (error || !data?.user) {
        setLoading(false);
        let errMsg = 'Invalid or expired OTP code. Please try again.';
        if (error?.message) {
          const lower = error.message.toLowerCase();
          if (lower.includes('expired')) {
            errMsg = 'The verification code has expired. Please request a new code.';
          } else if (lower.includes('invalid') || lower.includes('token') || lower.includes('code')) {
            errMsg = 'Invalid verification code. Please enter the 6-digit code received on your phone.';
          } else {
            errMsg = error.message;
          }
        }
        setAuthError(errMsg);
        speakText(errMsg, currentLang);
        return;
      }

      // Establish real authenticated Supabase session and synchronize profile
      await handleAuthSuccess(data.user);
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : 'Error verifying credentials.';
      setAuthError(msg);
      speakText(msg, currentLang);
    }
  };

  // Email & Password: Sign In or Sign Up
  const handleEmailAuth = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!EMAIL_REGEX.test(cleanEmail)) {
      const errMsg = t('invalidEmail');
      setAuthError(errMsg);
      speakText(errMsg, currentLang);
      return;
    }

    if (!cleanPassword || cleanPassword.length < 6) {
      const errMsg = t('invalidPassword');
      setAuthError(errMsg);
      speakText(errMsg, currentLang);
      return;
    }

    if (isSignUp && confirmPassword && cleanPassword !== confirmPassword.trim()) {
      const errMsg = t('authPasswordMismatch');
      setAuthError(errMsg);
      speakText(errMsg, currentLang);
      return;
    }

    setLoading(true);
    setAuthError('');
    setAuthNotice('');

    try {
      if (isSignUp) {
        const userDisplayName = fullName.trim() || (selectedRole === 'worker' ? 'QuickHire Worker' : 'QuickHire Employer');
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password: cleanPassword,
          options: {
            data: {
              role: selectedRole,
              full_name: userDisplayName,
            },
          },
        });

        if (error) {
          setLoading(false);
          setAuthError(error.message);
          speakText(error.message, currentLang);
          return;
        }

        if (data.user) {
          if (data.session) {
            await handleAuthSuccess(data.user);
          } else {
            setLoading(false);
            setAuthNotice(t('accountCreatedNotice'));
            setIsSignUp(false);
            speakText(t('accountCreatedSpeech'), currentLang);
          }
        } else {
          setLoading(false);
          setAuthError(t('registerError'));
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword,
        });

        if (error) {
          setLoading(false);
          setAuthError(error.message);
          speakText(error.message, currentLang);
          return;
        }

        if (data.user) {
          await handleAuthSuccess(data.user);
        } else {
          setLoading(false);
          setAuthError(t('invalidCredentials'));
        }
      }
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : t('authSystemError');
      setAuthError(msg);
    }
  };

  // Password Recovery / Reset for Users
  const handleSendUserPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = (resetEmail || email).trim().toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      const errMsg = t('invalidEmail');
      setAuthError(errMsg);
      speakText(errMsg, currentLang);
      return;
    }

    setLoading(true);
    setAuthError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      });

      if (error) {
        setAuthError(error.message);
        speakText(error.message, currentLang);
      } else {
        setAuthNotice(t('authPasswordResetSent'));
        setShowForgotBox(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('authPasswordResetError');
      setAuthError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Reusable Form Inner Content
  const formContent = (
    <div className="space-y-6">
      {/* MODE SWITCHER: SIGN IN vs SIGN UP */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl border border-slate-200">
        <button
          type="button"
          onClick={() => {
            setIsSignUp(false);
            setAuthError('');
            setAuthNotice('');
            setShowForgotBox(false);
            speakText(t('signInTitle'), currentLang);
          }}
          className={`py-2 px-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            !isSignUp
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200/90'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <CheckCircle2 className={`w-3.5 h-3.5 ${!isSignUp ? 'text-emerald-600' : 'text-slate-300'}`} />
          <span>{t('signInAction')}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIsSignUp(true);
            setAuthError('');
            setAuthNotice('');
            setShowForgotBox(false);
            speakText(t('createAccountTitle'), currentLang);
          }}
          className={`py-2 px-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            isSignUp
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200/90'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Sparkles className={`w-3.5 h-3.5 ${isSignUp ? 'text-emerald-600' : 'text-slate-400'}`} />
          <span>{t('createAccountTitle')}</span>
        </button>
      </div>

      {/* 1. DUAL AUTH METHOD TAB SWITCHER */}
      <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl border border-slate-200 shadow-2xs">
        <button
          type="button"
          onClick={() => {
            setAuthType('phone');
            setAuthError('');
            setAuthNotice('');
            speakText(`${t('tabMobileOtp')}. ${phonePrompt}`, currentLang);
          }}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            authType === 'phone'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <PhoneCall className={`w-4 h-4 ${authType === 'phone' ? 'text-emerald-600' : 'text-slate-400'}`} />
          <span>{t('tabMobileOtp')}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setAuthType('email');
            setAuthError('');
            setAuthNotice('');
            speakText(`${t('tabEmailLogin')}. ${emailPrompt}`, currentLang);
          }}
          className={`shrink-0 py-2.5 px-3 rounded-xl text-[11px] sm:text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
            authType === 'email'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Mail className={`w-4 h-4 ${authType === 'email' ? 'text-blue-600' : 'text-slate-400'}`} />
          <span>{t('tabEmailLogin')}</span>
        </button>
      </div>

      {isSignUp && (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            {t('selectRolePrompt')}
          </label>
          <VoiceSpeakerButton
            text={rolePrompt}
            lang={currentLang}
            label="Listen to role selection instructions"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* WORKER CARD */}
          <button
            type="button"
            onClick={() => handleRoleSelect('worker')}
            className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-2 relative ${
              selectedRole === 'worker'
                ? 'border-[#138808] bg-emerald-50/70 ring-2 ring-[#138808]/20 shadow-sm'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-100 text-[#138808]">
                  <Users className="w-4 h-4" />
                </span>
                <span className="font-heading font-extrabold text-xs sm:text-sm text-slate-900">
                  {t('roleWorker')}
                </span>
              </div>
              {selectedRole === 'worker' && (
                <CheckCircle2 className="w-5 h-5 text-[#138808] shrink-0" />
              )}
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {t('roleWorkerDesc')}
            </p>
          </button>

          {/* EMPLOYER / JOB HIRER CARD */}
          <button
            type="button"
            onClick={() => handleRoleSelect('employer')}
            className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-2 relative ${
              selectedRole === 'employer'
                ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-500/20 shadow-sm'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-amber-100 text-amber-700">
                  <Building2 className="w-4 h-4" />
                </span>
                <span className="font-heading font-extrabold text-xs sm:text-sm text-slate-900">
                  {t('roleEmployer')}
                </span>
              </div>
              {selectedRole === 'employer' && (
                <CheckCircle2 className="w-5 h-5 text-amber-600 shrink-0" />
              )}
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {t('roleEmployerDesc')}
            </p>
          </button>
        </div>
      </div>

      )}

      {authError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
          <span>{authError}</span>
        </div>
      )}

      {authNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{authNotice}</span>
        </div>
      )}

      {/* 3. CONDITIONAL RENDER: PHONE OTP vs EMAIL */}
      {authType === 'phone' ? (
        step === 'request' ? (
          /* AUTH STEP 1: MOBILE NUMBER & COUNTRY CODE */
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {t('mobileNumberLabel')}
                </label>
                <div className="flex items-center gap-2">
                  <VoiceSpeakerButton
                    text={phonePrompt}
                    lang={currentLang}
                    label="Listen to mobile number instruction"
                  />
                </div>
              </div>
              <div className="flex items-center border border-slate-300 rounded-xl focus-within:border-brand-500 shadow-2xs bg-white overflow-hidden">
                <div className="relative border-r border-slate-200 bg-slate-50">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    aria-label="Country Code"
                    className="appearance-none bg-transparent pl-3 pr-7 py-3.5 text-xs sm:text-sm font-bold text-slate-700 outline-none cursor-pointer"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.code} ({c.country})
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400 text-[10px]">
                    ▼
                  </div>
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={countryCode === '+91' ? 10 : 15}
                  value={phone}
                  onClick={() => speakText(phonePrompt, currentLang)}
                  onFocus={() => speakText(phonePrompt, currentLang)}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder={countryCode === '+91' ? t('mobilePlaceholder') : 'Enter mobile number'}
                  className="w-full px-4 py-3.5 outline-none text-sm font-medium text-slate-900 bg-transparent"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSendOtp(false)}
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-sm font-bold bg-[#0f2942] hover:bg-[#1a3d60] text-white transition-all shadow-md shadow-[#0f2942]/20 disabled:opacity-70 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Sending verification SMS...</span>
                </span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>
                    {`${t('sendOtpBtn')} (${selectedRole === 'worker' ? t('roleWorker') : t('roleEmployer')})`}
                  </span>
                </>
              )}
            </button>
          </div>
        ) : (
          /* AUTH STEP 2: DEDICATED 6-DIGIT OTP ENTRY & VERIFICATION */
          <div className="space-y-4">
            {/* Informational security card with masked phone number */}
            <div className="p-3.5 bg-blue-50/90 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-950 shadow-2xs">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-slate-800 leading-tight">
                  If the number is eligible, a verification code will be sent by SMS.
                </p>
                <p className="text-[11px] text-slate-600">
                  Sent to: <span className="font-mono font-bold text-slate-900">{`${countryCode} ******${phone.replace(/\D/g, '').slice(-4)}`}</span>
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {t('otpCodeLabel')}
                </label>
                <VoiceSpeakerButton
                  text={otpPrompt}
                  lang={currentLang}
                  label="Listen to OTP code instruction"
                />
              </div>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onClick={() => speakText(otpPrompt, currentLang)}
                onFocus={() => speakText(otpPrompt, currentLang)}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder={t('otpPlaceholder')}
                className="w-full px-4 py-3.5 border border-slate-300 rounded-xl outline-none focus:border-brand-500 text-center tracking-widest text-lg font-bold text-slate-900 shadow-2xs bg-white"
              />
            </div>

            <button
              type="button"
              onClick={handleVerifyOtp}
              disabled={loading || otp.trim().length !== 6}
              className="w-full py-3.5 rounded-xl text-sm font-bold bg-[#138808] hover:bg-[#0f6f06] text-white transition-all shadow-md shadow-[#138808]/20 disabled:opacity-70 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{t('verifyingBtn')}</span>
                </span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>{t('verifySignIn')}</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={() => handleSendOtp(true)}
                disabled={loading || resendCooldown > 0}
                className="font-bold text-emerald-700 hover:text-emerald-800 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend SMS code'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('request');
                  setOtp('');
                  setAuthError('');
                  setAuthNotice('');
                }}
                className="font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                {t('changePhoneBtn')}
              </button>
            </div>
          </div>
        )
      ) : showForgotBox ? (
        /* INLINE PASSWORD RECOVERY FORM */
        <form onSubmit={handleSendUserPasswordReset} className="space-y-4 p-4 bg-blue-50/70 border border-blue-200 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-blue-600" />
              <span>{t('authResetPasswordTitle')}</span>
            </span>
            <button
              type="button"
              onClick={() => setShowForgotBox(false)}
              className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Enter your registered email address and we'll send you a secure link to recover your account.
          </p>
          <div className="flex items-center border border-slate-300 rounded-xl px-4 py-3 bg-white focus-within:border-brand-500 shadow-2xs">
            <Mail className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
            <input
              type="email"
              required
              value={resetEmail || email}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              className="w-full outline-none text-xs sm:text-sm font-medium text-slate-900 bg-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-xs sm:text-sm font-bold bg-[#0f2942] hover:bg-[#1a3d60] text-white transition-all shadow-md shadow-[#0f2942]/20 disabled:opacity-70 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? <span>{t('authSendingRecovery')}</span> : <span>{t('authSendRecoveryLink')}</span>}
          </button>
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => setShowForgotBox(false)}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              ← Back to Sign In
            </button>
          </div>
        </form>
      ) : (
        /* EMAIL AUTHENTICATION FORM */
        <form onSubmit={handleEmailAuth} className="space-y-4">
          {/* Full Name field for first-time sign-up */}
          {isSignUp && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                {t('authFullName')}
              </label>
              <div className="flex items-center border border-slate-300 rounded-xl px-4 py-3.5 focus-within:border-brand-500 shadow-2xs bg-white">
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('authFullNamePlaceholder')}
                  className="w-full outline-none text-sm font-medium text-slate-900 bg-transparent"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {t('emailAddressLabel')}
              </label>
              <VoiceSpeakerButton
                text={emailPrompt}
                lang={currentLang}
                label="Listen to email address instruction"
              />
            </div>
            <div className="flex items-center border border-slate-300 rounded-xl px-4 py-3.5 focus-within:border-brand-500 shadow-2xs bg-white">
              <Mail className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
              <input
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                value={email}
                onClick={() => speakText(emailPrompt, currentLang)}
                onFocus={() => speakText(emailPrompt, currentLang)}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                className="w-full outline-none text-sm font-medium text-slate-900 bg-transparent"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {t('passwordLabel')}
              </label>
              <div className="flex items-center gap-2">
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotBox(true);
                      setResetEmail(email);
                    }}
                    className="text-[11px] text-blue-600 hover:underline font-semibold cursor-pointer"
                  >
                    {t('authForgotPassword')}
                  </button>
                )}
                <VoiceSpeakerButton
                  text={passwordPrompt}
                  lang={currentLang}
                  label="Listen to password instruction"
                />
              </div>
            </div>
            <div className="relative flex items-center border border-slate-300 rounded-xl px-4 py-3.5 focus-within:border-brand-500 shadow-2xs bg-white">
              <Lock className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onClick={() => speakText(passwordPrompt, currentLang)}
                onFocus={() => speakText(passwordPrompt, currentLang)}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('passwordPlaceholder')}
                className="w-full outline-none text-sm font-medium text-slate-900 bg-transparent pr-8"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {isSignUp && (
              <p className="text-[11px] text-slate-500">{t('passwordMinLength')}</p>
            )}
          </div>

          {/* Confirm Password field for first-time sign-up */}
          {isSignUp && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                {t('authConfirmPassword')}
              </label>
              <div className="relative flex items-center border border-slate-300 rounded-xl px-4 py-3.5 focus-within:border-brand-500 shadow-2xs bg-white">
                <Lock className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full outline-none text-sm font-medium text-slate-900 bg-transparent"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl text-sm font-bold bg-[#0f2942] hover:bg-[#1a3d60] text-white transition-all shadow-md shadow-[#0f2942]/20 disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>{isSignUp ? t('creatingAccountBtn') : t('signingInBtn')}</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>
                  {isSignUp
                    ? (selectedRole === 'worker' ? t('createWorkerAccountBtn') : t('createHirerAccountBtn'))
                    : (selectedRole === 'worker' ? t('signInWorkerBtn') : t('signInHirerBtn'))}
                </span>
              </>
            )}
          </button>

          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => {
                const nextMode = !isSignUp;
                setIsSignUp(nextMode);
                setAuthError('');
                setAuthNotice('');
                const switchNotice = nextMode ? t('createAccountTitle') : t('signInTitle');
                speakText(switchNotice, currentLang);
              }}
              className="text-xs font-medium text-slate-600 hover:text-brand-600 transition-colors"
            >
              {isSignUp ? (
                <span>
                  {t('alreadyHaveAccount')}{' '}
                  <strong className="text-brand-600 underline">{t('signInAction')}</strong>
                </span>
              ) : (
                <span>
                  {t('dontHaveAccount')}{' '}
                  <strong className="text-brand-600 underline">{t('signUpAction')}</strong>
                </span>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );

  // ================= RENDER A: FULL-SCREEN AUTHENTICATION GATE =================
  if (isGate) {
    return (
      <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col justify-between font-sans selection:bg-[#0f2942] selection:text-white overflow-x-hidden w-full">
        {/* LAYER 1: TOP TRICOLOR & GIGW ACCESSIBILITY STRIP */}
        <div className="bg-slate-900 text-white text-xs py-1.5 border-t-4 border-t-[#FF9933] shadow-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[11px] sm:text-xs">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#FF9933]" />
                <span className="w-2 h-2 rounded-full bg-[#FFFFFF]" />
                <span className="w-2 h-2 rounded-full bg-[#138808]" />
              </span>
              <span className="font-semibold text-slate-200">
                {t('platformOverview')} — {t('publicCommissionBadge')}
              </span>
            </div>

            <div className="flex items-center gap-3 text-[11px] shrink-0">
              <VoiceAssistanceToggle currentLang={currentLang} />
              <a
                href="tel:18001801551"
                className="flex items-center gap-1 text-amber-300 hover:text-amber-200 font-bold tracking-wide"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>{t('sosKisanTitle')}: 1551</span>
              </a>
            </div>
          </div>
        </div>

        {/* LAYER 2: INSTITUTIONAL BRANDING BAR */}
        <div className="bg-white border-b border-slate-200 py-3.5 w-full shadow-2xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
            {/* Left: Formal Emblem & Title */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#0f2942] to-[#1a3d60] text-white flex flex-col items-center justify-center shadow-md border-2 border-[#FF9933]/60">
                <Landmark className="w-5 h-5 text-amber-300" />
                <span className="text-[7px] font-black tracking-widest uppercase text-emerald-300">QH</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-heading font-black text-xl sm:text-2xl tracking-tight text-[#0f2942]">
                    Quick<span className="text-[#138808]">Hire</span>
                  </span>
                  <span className="text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-sm bg-[#0f2942] text-white">
                    {t('publicPortalBadge')}
                  </span>
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                    <CheckCircle2 className="w-3 h-3 text-[#138808]" />
                    {t('directBenefitBadge')}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-600 font-medium">
                  {t('ruralRegistrySub')}
                </p>
              </div>
            </div>

            <nav aria-label="Public navigation" className="hidden lg:flex items-center gap-4 text-xs font-bold text-slate-600">
              <a href="#public-about" className="hover:text-emerald-700">{t('publicNavAbout')}</a>
              <a href="#public-how" className="hover:text-emerald-700">{t('publicNavHow')}</a>
              <a href="#public-features" className="hover:text-emerald-700">{t('publicNavFeatures')}</a>
              <a href="#public-safety" className="hover:text-emerald-700">{t('publicNavSafety')}</a>
              <a href="#public-contact" className="hover:text-emerald-700">{t('publicNavContact')}</a>
              <a href="#public-auth" className="rounded-lg bg-[#0f2942] px-3 py-2 text-white hover:bg-[#183b56]">{t('publicNavAccess')}</a>
            </nav>

            {/* Right: Language Selector */}
            <div className="relative shrink-0">
              <button
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 transition-colors shadow-2xs"
              >
                <Globe2 className="w-4 h-4 text-[#0f2942]" />
                <span>{currentLang}</span>
              </button>

              <AnimatePresence>
                {langMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 z-50 overflow-hidden text-slate-800"
                  >
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
                      {t('chooseLanguage')}
                    </div>
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <button
                        key={lang}
                        onClick={() => {
                          if (onLangChange) onLangChange(lang);
                          setLangMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs sm:text-sm rounded-xl text-left transition-colors ${
                          currentLang === lang
                            ? 'bg-emerald-50 text-[#138808] font-bold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span>{lang}</span>
                        {currentLang === lang && <Check className="w-4 h-4 text-[#138808] stroke-[3]" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* MAIN FULL-SCREEN GATE CONTENT */}
        <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            id="public-auth" className="w-full max-w-xl bg-white rounded-3xl border border-slate-300 shadow-xl p-6 sm:p-10 space-y-6 relative overflow-hidden"
          >
            {/* Top decorative tricolor line */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#FF9933] via-white to-[#138808]" />

            {/* BRANDING & HEADER */}
            <div className="text-center space-y-3 pt-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-[#0f2942] border border-slate-300 text-xs font-bold">
                <ShieldCheck className="w-4 h-4 text-[#138808]" />
                <span>{t('publicAboutTitle')}</span>
              </div>

              <div>
                <div className="flex items-center justify-center gap-2">
                  <h1 className="font-heading font-black text-2xl sm:text-3xl text-[#0f2942]">
                    {t('loginGateTitle')}
                  </h1>
                  <VoiceSpeakerButton
                    text={`${t('loginGateTitle')}. ${t('loginGateSub')}`}
                    lang={currentLang}
                    label="Listen to welcome and login instructions"
                  />
                </div>
                <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto mt-1 leading-relaxed">
                  {t('loginGateSub')}
                </p>
              </div>
            </div>

            {/* INNER AUTH FORM */}
            <div className="pt-2">
              {formContent}
            </div>

            {/* TRUST & ACCESSIBILITY BADGES */}
            <div className="pt-6 border-t border-slate-200 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-600">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <Scale className="w-4 h-4 text-[#0f2942] mx-auto mb-1" />
                <span className="font-bold text-slate-900 block">{t('statZeroFee')}</span>
                <span>{t('statDirectWages')}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <Landmark className="w-4 h-4 text-[#138808] mx-auto mb-1" />
                <span className="font-bold text-slate-900 block">{t('statDbtPayouts')}</span>
                <span>{t('statDirectBank')}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <Sparkles className="w-4 h-4 text-amber-600 mx-auto mb-1" />
                <span className="font-bold text-slate-900 block">{t('statFiveLangs')}</span>
                <span>{t('statVoiceNav')}</span>
              </div>
            </div>
          </motion.div>
        </main>
        {/* PUBLIC INFORMATION — no operational listings or private records */}
        <section id="public-about" className="w-full bg-white py-12 sm:py-16 border-y border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-3">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-700">QuickHire</span>
              <h2 className="font-heading text-2xl sm:text-3xl font-black text-slate-900">{t('publicAboutTitle')}</h2>
              <p className="text-sm sm:text-base leading-relaxed text-slate-600">{t('publicAboutBody')}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 border border-slate-200 p-6 sm:p-8">
              <h3 className="font-heading text-xl font-extrabold text-slate-900">{t('publicProblemTitle')}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{t('publicProblemBody')}</p>
            </div>
          </div>
        </section>

        <section id="public-how" className="w-full py-12 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <h2 className="font-heading text-2xl sm:text-3xl font-black text-slate-900">{t('publicHowTitle')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-6">
                <div className="flex items-center gap-2 text-emerald-800"><Users className="h-5 w-5" /><h3 className="font-bold">{t('publicWorkerTitle')}</h3></div>
                <p className="mt-3 text-sm leading-relaxed text-slate-700">{t('publicWorkerBody')}</p>
              </div>
              <div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-6">
                <div className="flex items-center gap-2 text-amber-800"><Building2 className="h-5 w-5" /><h3 className="font-bold">{t('publicEmployerTitle')}</h3></div>
                <p className="mt-3 text-sm leading-relaxed text-slate-700">{t('publicEmployerBody')}</p>
              </div>
            </div>
          </div>
        </section>

        <section id="public-features" className="w-full bg-white py-12 sm:py-16 border-y border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="font-heading text-2xl sm:text-3xl font-black text-slate-900">{t('publicFeaturesTitle')}</h2>
            <p className="mt-3 max-w-4xl text-sm sm:text-base leading-relaxed text-slate-600">{t('publicFeaturesBody')}</p>
          </div>
        </section>

        <section id="public-safety" className="w-full py-12 sm:py-16 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-emerald-800"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-black uppercase tracking-wider">{t('publicNavSafety')}</span></div>
              <h2 className="mt-2 font-heading text-2xl sm:text-3xl font-black text-slate-900">{t('publicSafetyTitle')}</h2>
              <p className="mt-2 text-sm text-slate-600">{t('publicSafetyIntro')}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              <a href="tel:112" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all">
                <span className="block text-2xl font-black tracking-tight text-[#0f2942]">112</span>
                <span className="mt-1 block text-xs font-semibold text-slate-600">{t('sos112Title')}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700"><PhoneCall className="h-3.5 w-3.5" /> {t('publicCallAction')}</span>
              </a>
              <a href="tel:102" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all">
                <span className="block text-2xl font-black tracking-tight text-[#0f2942]">102 / 108</span>
                <span className="mt-1 block text-xs font-semibold text-slate-600">{t('publicAmbulance102')}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700"><PhoneCall className="h-3.5 w-3.5" /> {t('publicCallAction')}</span>
              </a>
              <a href="tel:181" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all">
                <span className="block text-2xl font-black tracking-tight text-[#0f2942]">181</span>
                <span className="mt-1 block text-xs font-semibold text-slate-600">{t('publicWomen181')}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700"><PhoneCall className="h-3.5 w-3.5" /> {t('publicCallAction')}</span>
              </a>
              <a href="tel:1091" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all">
                <span className="block text-2xl font-black tracking-tight text-[#0f2942]">1091</span>
                <span className="mt-1 block text-xs font-semibold text-slate-600">{t('sos1091Title')}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700"><PhoneCall className="h-3.5 w-3.5" /> {t('publicCallAction')}</span>
              </a>
              <a href="tel:1098" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all">
                <span className="block text-2xl font-black tracking-tight text-[#0f2942]">1098</span>
                <span className="mt-1 block text-xs font-semibold text-slate-600">{t('publicChild1098')}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700"><PhoneCall className="h-3.5 w-3.5" /> {t('publicCallAction')}</span>
              </a>
              <a href="tel:1930" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all">
                <span className="block text-2xl font-black tracking-tight text-[#0f2942]">1930</span>
                <span className="mt-1 block text-xs font-semibold text-slate-600">{t('publicCyber1930')}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700"><PhoneCall className="h-3.5 w-3.5" /> {t('publicCallAction')}</span>
              </a>
              <a href="tel:1551" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all">
                <span className="block text-2xl font-black tracking-tight text-[#0f2942]">1551</span>
                <span className="mt-1 block text-xs font-semibold text-slate-600">{t('sosKisanTitle')}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700"><PhoneCall className="h-3.5 w-3.5" /> {t('publicCallAction')}</span>
              </a>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <h3 className="font-bold text-amber-950">{t('publicFraudTitle')}</h3>
                <p className="mt-2 text-sm leading-relaxed text-amber-900">{t('publicFraudBody')}</p>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
                <h3 className="font-bold text-rose-950">{t('publicWomenSafetyTitle')}</h3>
                <p className="mt-2 text-sm leading-relaxed text-rose-900">{t('publicWomenSafetyBody')}</p>
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-600">{t('publicEmergencyNote')}</p>
            <a href="https://www.india.gov.in/directory/helpline" target="_blank" rel="noreferrer" className="inline-flex text-xs font-bold text-emerald-700 underline underline-offset-4">{t('publicHelplineDirectory')}</a>
          </div>
        </section>

        <section id="public-contact" className="w-full bg-white py-10 border-t border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="font-heading text-xl font-black text-slate-900">{t('publicContactTitle')}</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">{t('publicContactBody')}</p>
            <p className="mt-4 text-xs text-slate-500">{t('publicDisclaimer')}</p>
          </div>
        </section>


        {/* PUBLIC QUICKHIRE FOOTER */}
        <footer className="mt-auto w-full bg-[#0f2942] text-white py-8 border-t border-slate-800">
          <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-300">
              <div>
                <span className="font-bold text-white uppercase tracking-wider block mb-2">
                  {t('publicPlatformName')}
                </span>
                <p className="text-slate-400 leading-relaxed">
                  {t('publicAboutBody')}
                </p>
              </div>

              <div>
                <span className="font-bold text-white uppercase tracking-wider block mb-2">
                  {t('publicSafetyTitle')}
                </span>
                <div className="space-y-1 text-slate-400">
                  <p>112 · 102/108 · 181 · 1091 · 1098 · 1930 · 1551</p>
                </div>
              </div>

              <div>
                <span className="font-bold text-white uppercase tracking-wider block mb-2">
                  Multilingual Citizen Inclusion
                </span>
                <p className="text-slate-400 leading-relaxed">
                  Supported in English, हिंदी, मराठी, বাংলা, and తెలుగు with real-time text-to-speech audio guidance.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-400">
              <span>{t('publicDisclaimer')}</span>
              <span>© {new Date().getFullYear()} {t('publicPlatformName')}</span>
            </div>
          </div>
        </footer>

        {/* FLOATING ACCESSIBLE VOICE HELPER */}
        <AccessibleVoiceBar activeTab="authGate" currentLang={currentLang} />
      </div>
    );
  }

  // ================= RENDER B: MODAL AUTHENTICATION DIALOG =================
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 sm:p-8 overflow-y-auto max-h-[92vh] border border-slate-200"
          >
            {onClose && (
              <button
                onClick={handleClose}
                className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
              >
                ✕
              </button>
            )}

            <div className="flex items-center justify-between mb-2 pr-8">
              <h2 className="font-heading font-extrabold text-2xl text-slate-900">
                {authType === 'email'
                  ? isSignUp
                    ? t('createAccountTitle')
                    : t('signInTitle')
                  : step === 'request'
                  ? t('loginWithMobile')
                  : t('enterOtp')}
              </h2>
              <VoiceSpeakerButton
                text={
                  authType === 'email'
                    ? isSignUp
                      ? `${t('createAccountTitle')}. ${t('registerWithEmailDesc')}`
                      : `${t('signInTitle')}. ${t('signInWithEmailDesc')}`
                    : step === 'request'
                    ? phonePrompt
                    : otpPrompt
                }
                lang={currentLang}
                label="Listen to instructions"
              />
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mb-5">
              {authType === 'email'
                ? isSignUp
                  ? t('registerWithEmailDesc')
                  : t('signInWithEmailDesc')
                : step === 'request'
                ? t('otpSendDesc')
                : `${t('codeSentTo')} ${countryCode} ******${phone.replace(/\D/g, '').slice(-4)}`}
            </p>

            {formContent}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}