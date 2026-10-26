import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ADMIN_CONFIG,
  AdminSession,
  verifyAdminStatus,
  loginAdminWithPassword,
  sendAdminPhoneOtp,
  verifyAdminPhoneOtp,
  setupAdminPasswordWithPhoneVerification,
  sendAdminPasswordReset,
  setAdminSession,
  ensureAdminSession,
  logAdminAction,
  normalizeEmail,
  normalizePhone,
} from '../../lib/adminAuth';
import { navigateTo } from '../../lib/adminRouter';
import {
  ShieldCheck,
  Lock,
  Mail,
  Phone,
  KeyRound,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Eye,
  EyeOff,
  Sparkles,
  Key,
} from 'lucide-react';

interface AdminLoginProps {
  onLoginSuccess?: () => void;
  onNavigatePublic?: () => void;
}

export function AdminLogin({ onLoginSuccess, onNavigatePublic }: AdminLoginProps) {
  // Method: 'email' (Email + Password), 'phone' (Phone + SMS OTP), or 'setup' (Initial password creation)
  const [authMethod, setAuthMethod] = useState<'email' | 'phone' | 'setup'>('email');
  // Phone flow step: 'request' (enter phone) or 'verify' (enter 6-digit OTP code)
  const [phoneStep, setPhoneStep] = useState<'request' | 'verify'>('request');
  // Setup flow step: 'verify_phone' (send/verify OTP) or 'set_password' (choose new password)
  const [setupStep, setSetupStep] = useState<'request' | 'set_password'>('request');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');

  // Password reset inline toggle & recovery session state
  const [showResetBox, setShowResetBox] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [noticeMsg, setNoticeMsg] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Countdown timer for SMS OTP resend
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // Check URL hash/query for recovery token and check existing active admin session
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const hasRecovery = hash.includes('type=recovery') || search.includes('type=recovery');

    if (hasRecovery) {
      setIsRecoveryMode(true);
      setNoticeMsg('Administrator password recovery session detected. Please set your new password.');
      return;
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const check = await verifyAdminStatus(session.user.id);
        if (check.isAdmin) {
          ensureAdminSession(session.user, check.role, check.verifiedEmail, check.verifiedPhone);
          if (onLoginSuccess) onLoginSuccess();
          navigateTo('/admin');
        }
      }
    });

    const authListener = supabase.auth?.onAuthStateChange ? supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
        setNoticeMsg('Password recovery mode active. Please set your new password.');
      }
    }) : null;

    return () => {
      authListener?.data?.subscription?.unsubscribe();
    };
  }, [onLoginSuccess]);

  // Switch between Authentication tabs
  const handleSwitchMethod = (method: 'email' | 'phone' | 'setup') => {
    setAuthMethod(method);
    setPhoneStep('request');
    setSetupStep('request');
    setErrorMsg('');
    setNoticeMsg('');
    setOtp('');
    setPassword('');
    setConfirmPassword('');
    setShowResetBox(false);
    setCooldown(0);
  };

  // Helper to establish validated admin session and redirect
  const completeAdminAuth = async (
    authUser: import('@supabase/supabase-js').User,
    method: 'email' | 'phone',
    identifier: string,
    role: 'super_admin' | 'moderator' | 'support_agent' = 'super_admin',
    verifiedEmail?: string | null,
    verifiedPhone?: string | null
  ) => {
    const sessionPayload: AdminSession = {
      user: authUser,
      adminRole: role,
      authMethod: method,
      verifiedIdentifier: identifier,
      verifiedEmail: verifiedEmail || (method === 'email' ? identifier : null),
      verifiedPhone: verifiedPhone || (method === 'phone' ? identifier : null),
      authenticatedAt: Date.now(),
      expiresAt: Date.now() + ADMIN_CONFIG.SESSION_DURATION_MS,
      sessionToken: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    };

    setAdminSession(sessionPayload);

    await logAdminAction({
      adminId: authUser.id,
      adminEmail: verifiedEmail || authUser.email || identifier,
      action: `admin_login_${method}_verified`,
      targetType: 'auth',
      targetId: authUser.id,
      reason: `Administrator authenticated via verified ${method === 'email' ? 'Email & Password' : 'Phone SMS OTP'}`,
      metadata: { role, method, identifier },
    });

    if (onLoginSuccess) onLoginSuccess();
    navigateTo('/admin');
  };

  // 1. Email + Password Authentication Handler
  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setNoticeMsg('');

    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Please enter a valid administrator email address.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg('Please enter your administrator password (at least 6 characters).');
      return;
    }

    setLoading(true);

    try {
      const loginRes = await loginAdminWithPassword(cleanEmail, password);

      if (!loginRes.success || !loginRes.user) {
        setErrorMsg(loginRes.error || 'Authentication failed. Please verify your administrator credentials.');
        setLoading(false);
        return;
      }

      const adminStatus = await verifyAdminStatus(loginRes.user.id);
      if (!adminStatus.isAdmin) {
        await supabase.auth.signOut();
        setErrorMsg('Access Denied: This authenticated account has not been granted administrator privileges.');
        setLoading(false);
        return;
      }

      await completeAdminAuth(
        loginRes.user,
        'email',
        cleanEmail,
        adminStatus.role,
        adminStatus.verifiedEmail || cleanEmail,
        adminStatus.verifiedPhone || null
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication encountered an unexpected error.';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Phone SMS OTP: Step 1 (Send OTP)
  const handleSendPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setNoticeMsg('');

    const cleanPhone = normalizePhone(phone);
    const digits = cleanPhone.replace(/\D/g, '');
    if (digits.length < 10) {
      setErrorMsg('Please enter a valid mobile number with country code (e.g. +919876543210).');
      return;
    }

    setLoading(true);

    try {
      const res = await sendAdminPhoneOtp(cleanPhone);
      setNoticeMsg(res.message);
      setPhoneStep('verify');
      setCooldown(60);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to dispatch SMS verification code.';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Phone SMS OTP: Step 2 (Verify OTP & Authenticate)
  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOtp = otp.trim();

    if (!cleanOtp || cleanOtp.length !== 6) {
      setErrorMsg('Please enter the complete 6-digit verification code.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const cleanPhone = normalizePhone(phone);
      const verifyRes = await verifyAdminPhoneOtp(cleanPhone, cleanOtp);

      if (!verifyRes.success || !verifyRes.user) {
        setErrorMsg(verifyRes.error || 'Invalid or expired SMS verification code.');
        setLoading(false);
        return;
      }

      const adminStatus = await verifyAdminStatus(verifyRes.user.id);
      if (!adminStatus.isAdmin) {
        await supabase.auth.signOut();
        setErrorMsg('Access Denied: This account has not been designated as an administrator.');
        setLoading(false);
        return;
      }

      await completeAdminAuth(
        verifyRes.user,
        'phone',
        cleanPhone,
        adminStatus.role,
        adminStatus.verifiedEmail || null,
        adminStatus.verifiedPhone || cleanPhone
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'SMS OTP verification encountered an unexpected error.';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  // 3. Admin Setup & Password Initialization: Step 1 (Send OTP to authorized phone)
  const handleStartSetupOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setNoticeMsg('');

    const targetPhone = phone.trim() ? normalizePhone(phone) : ADMIN_CONFIG.DESIGNATED_PHONE;
    setPhone(targetPhone);

    setLoading(true);
    try {
      const res = await sendAdminPhoneOtp(targetPhone);
      setNoticeMsg(res.message || 'Verification SMS dispatched to the authorized administrator phone.');
      setSetupStep('set_password');
      setCooldown(60);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to dispatch setup verification code.';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  // 3. Admin Setup & Password Initialization: Step 2 (Verify OTP & Save Chosen Password)
  const handleSaveSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setNoticeMsg('');

    const targetEmail = email.trim() ? normalizeEmail(email) : ADMIN_CONFIG.DESIGNATED_EMAIL;
    const targetPhone = phone.trim() ? normalizePhone(phone) : ADMIN_CONFIG.DESIGNATED_PHONE;
    const cleanOtp = otp.trim();

    if (!cleanOtp || cleanOtp.length !== 6) {
      setErrorMsg('Please enter the 6-digit verification code received on your phone.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    if (confirmPassword && password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please re-enter to confirm.');
      return;
    }

    setLoading(true);

    try {
      const setupRes = await setupAdminPasswordWithPhoneVerification(
        targetPhone,
        cleanOtp,
        password,
        targetEmail
      );

      if (!setupRes.success || !setupRes.user) {
        setErrorMsg(setupRes.error || 'Failed to establish administrator credentials.');
        setLoading(false);
        return;
      }

      setNoticeMsg('Administrator password initialized successfully! Connecting to Governance Suite...');

      await completeAdminAuth(
        setupRes.user,
        'email',
        targetEmail,
        'super_admin',
        targetEmail,
        targetPhone
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Administrator setup encountered an unexpected error.';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  // 4. Send Password Reset Link to Admin Email
  const handleSendResetEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = normalizeEmail(resetEmail || email || ADMIN_CONFIG.DESIGNATED_EMAIL);
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Please enter a valid administrator email address for password recovery.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await sendAdminPasswordReset(cleanEmail);
      if (res.success) {
        setNoticeMsg(res.message);
        setShowResetBox(false);
      } else {
        setErrorMsg(res.error || 'Could not send reset link.');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error sending password reset email.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Complete Password Recovery: Set New Password
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setNoticeMsg('');

    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMsg('Passwords do not match. Please verify both entries.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.updateUser({ password: newPassword });
      if (error || !data?.user) {
        setErrorMsg(error?.message || 'Failed to update administrator password.');
        setLoading(false);
        return;
      }

      setNoticeMsg('Administrator password updated successfully! Redirecting to Governance Suite...');
      const adminStatus = await verifyAdminStatus(data.user.id);
      if (adminStatus.isAdmin) {
        await completeAdminAuth(
          data.user,
          'email',
          data.user.email || ADMIN_CONFIG.DESIGNATED_EMAIL,
          adminStatus.role,
          adminStatus.verifiedEmail || data.user.email,
          adminStatus.verifiedPhone || null
        );
      } else {
        setIsRecoveryMode(false);
        setNoticeMsg('Password updated successfully. Please sign in with your updated credentials.');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error setting new password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between selection:bg-emerald-500 selection:text-slate-950 font-sans text-slate-100 antialiased">
      {/* Top Security Banner */}
      <header className="w-full border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center font-black">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="font-heading font-black text-white tracking-tight text-sm">
              Quick<span className="text-emerald-400">Hire</span> Governance Suite
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onNavigatePublic) onNavigatePublic();
              else navigateTo('/');
            }}
            className="text-xs text-slate-400 hover:text-emerald-400 font-semibold transition flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Public Portal</span>
          </button>
        </div>
      </header>

      {/* Center Auth Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6 relative overflow-hidden">
          {/* Subtle Accent Glow */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600" />

          {/* Heading */}
          <div className="text-center space-y-2 pt-1">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-1">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-heading font-black text-white tracking-tight">
              Administrator Authentication
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
              Single designated administrator portal with verified email/password or SMS OTP.
            </p>
          </div>

          {/* Authentication Method Selector Tabs */}
          {!isRecoveryMode && (
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950/80 rounded-2xl border border-slate-800/80">
              <button
                type="button"
                onClick={() => handleSwitchMethod('email')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  authMethod === 'email'
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700/60'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Mail className="w-3.5 h-3.5 text-emerald-400" />
                <span>Email & Password</span>
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMethod('phone')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  authMethod === 'phone'
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700/60'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                <span>Phone SMS OTP</span>
              </button>
            </div>
          )}

          {/* Quick Dedicated Email Indicator */}
          {!isRecoveryMode && (
            <div className="p-2.5 bg-slate-950/60 border border-slate-800/90 rounded-xl flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2 truncate">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">Admin Email:</span>
                <strong className="text-slate-200 font-mono text-[11px] truncate">
                  {ADMIN_CONFIG.DESIGNATED_EMAIL}
                </strong>
              </div>
              {authMethod === 'email' && email !== ADMIN_CONFIG.DESIGNATED_EMAIL && (
                <button
                  type="button"
                  onClick={() => setEmail(ADMIN_CONFIG.DESIGNATED_EMAIL)}
                  className="text-[10px] text-emerald-400 hover:underline font-semibold shrink-0 cursor-pointer"
                >
                  Use
                </button>
              )}
            </div>
          )}

          {/* Error & Notice Banners */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-950/60 border border-rose-800/60 rounded-2xl flex items-start gap-2.5 text-xs text-rose-200 shadow-sm animate-shake">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5 leading-relaxed font-medium">
                <div>{errorMsg}</div>
                {errorMsg.toLowerCase().includes('credentials') && (
                  <div className="pt-1 flex items-center gap-3 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        setShowResetBox(true);
                        setResetEmail(email || ADMIN_CONFIG.DESIGNATED_EMAIL);
                        setErrorMsg('');
                      }}
                      className="text-emerald-400 hover:underline font-bold cursor-pointer"
                    >
                      Reset Password via Email →
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchMethod('setup')}
                      className="text-slate-400 hover:text-white font-medium cursor-pointer"
                    >
                      Use Phone Verification
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {noticeMsg && (
            <div className="p-3.5 bg-emerald-950/50 border border-emerald-800/60 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-200 shadow-sm">
              <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5 leading-relaxed font-medium">{noticeMsg}</div>
            </div>
          )}

          {/* DEDICATED RECOVERY MODE FORM */}
          {isRecoveryMode && (
            <form onSubmit={handleUpdatePassword} className="p-5 bg-slate-950 border border-emerald-500/50 rounded-2xl space-y-4 shadow-xl">
              <div className="flex items-center gap-2 text-emerald-400">
                <KeyRound className="w-5 h-5 text-emerald-400 shrink-0" />
                <h3 className="text-sm font-bold">Set New Administrator Password</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Choose a secure password (at least 6 characters) for your administrator account.
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">Confirm Password</label>
                <input
                  type="password"
                  required
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition cursor-pointer"
                >
                  {loading ? 'Updating Password...' : 'Save Password & Access Admin'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsRecoveryMode(false)}
                  className="px-4 py-3 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* INLINE PASSWORD RESET DRAWER */}
          {showResetBox && !isRecoveryMode && (
            <form onSubmit={handleSendResetEmail} className="p-4 bg-slate-950 border border-emerald-500/30 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5" />
                  <span>Reset Administrator Password</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowResetBox(false)}
                  className="text-slate-500 hover:text-slate-300 text-xs"
                >
                  ✕
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                A password recovery link will be sent to the registered administrator email via Supabase Auth.
              </p>
              <input
                type="email"
                required
                value={resetEmail || email || ADMIN_CONFIG.DESIGNATED_EMAIL}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="admin@quickhire.local"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition cursor-pointer"
              >
                {loading ? 'Dispatching Reset Link...' : 'Send Password Reset Link'}
              </button>
            </form>
          )}

          {/* METHOD 1: EMAIL & PASSWORD LOGIN */}
          {authMethod === 'email' && !showResetBox && !isRecoveryMode && (
            <form onSubmit={handleEmailPasswordLogin} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  Authorized Administrator Email
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@quickhire.local"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                  />
                  <Mail className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowResetBox(true);
                      setResetEmail(email || ADMIN_CONFIG.DESIGNATED_EMAIL);
                    }}
                    className="text-[11px] text-emerald-400 hover:underline font-semibold cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3.5 top-3.5 text-slate-500 hover:text-slate-300 transition cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Password-based authentication through Supabase Auth.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-sm transition shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Verifying Administrator Credentials...</span>
                  </span>
                ) : (
                  <>
                    <span>Sign In as Administrator</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => handleSwitchMethod('setup')}
                  className="text-xs text-slate-400 hover:text-emerald-400 transition font-medium cursor-pointer"
                >
                  First-time admin setup? <strong className="text-emerald-400 underline">Set or Choose Password</strong>
                </button>
              </div>
            </form>
          )}

          {/* METHOD 2: PHONE SMS OTP (STEP 1: REQUEST OTP) */}
          {authMethod === 'phone' && phoneStep === 'request' && (
            <form onSubmit={handleSendPhoneOtp} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  Authorized Administrator Phone
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+919876543210"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                  />
                  <Phone className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5 pointer-events-none" />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>A 6-digit SMS verification code will be dispatched.</span>
                  {phone !== ADMIN_CONFIG.DESIGNATED_PHONE && (
                    <button
                      type="button"
                      onClick={() => setPhone(ADMIN_CONFIG.DESIGNATED_PHONE)}
                      className="text-emerald-400 hover:underline cursor-pointer"
                    >
                      Use {ADMIN_CONFIG.DESIGNATED_PHONE}
                    </button>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-sm transition shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Dispatching SMS Code...</span>
                  </span>
                ) : (
                  <>
                    <span>Send Verification Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* METHOD 2: PHONE SMS OTP (STEP 2: VERIFY OTP) */}
          {authMethod === 'phone' && phoneStep === 'verify' && (
            <form onSubmit={handleVerifyPhoneOtp} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                    6-Digit SMS Verification Code
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {phone}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest text-emerald-400 placeholder-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                  />
                  <KeyRound className="w-4 h-4 text-slate-600 absolute right-3.5 top-3.5 pointer-events-none" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || otp.trim().length !== 6}
                className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-sm transition shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Verifying Administrator Token...</span>
                  </span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Verify & Authenticate</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={handleSendPhoneOtp}
                  disabled={loading || cooldown > 0}
                  className="text-emerald-400 hover:text-emerald-300 disabled:text-slate-600 transition font-semibold cursor-pointer"
                >
                  {cooldown > 0 ? `Resend SMS in ${cooldown}s` : 'Resend SMS code'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhoneStep('request');
                    setOtp('');
                    setErrorMsg('');
                    setNoticeMsg('');
                  }}
                  className="text-slate-400 hover:text-slate-200 transition cursor-pointer"
                >
                  Change phone number
                </button>
              </div>
            </form>
          )}

          {/* METHOD 3: ADMIN SETUP & PASSWORD INITIALIZATION */}
          {authMethod === 'setup' && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/40 rounded-xl text-xs text-emerald-200 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-emerald-300">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Secure Admin Password Initialization</span>
                </p>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Verify ownership via SMS OTP on your designated admin phone ({ADMIN_CONFIG.DESIGNATED_PHONE}) to choose your dedicated password for {ADMIN_CONFIG.DESIGNATED_EMAIL}. Never hardcoded, 100% server-verified.
                </p>
              </div>

              {setupStep === 'request' ? (
                <form onSubmit={handleStartSetupOtp} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      Admin Phone Number
                    </label>
                    <input
                      type="tel"
                      required
                      value={phone || ADMIN_CONFIG.DESIGNATED_PHONE}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-sm transition shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                        <span>Sending SMS OTP...</span>
                      </span>
                    ) : (
                      <>
                        <span>Send Phone Verification Code</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => handleSwitchMethod('email')}
                      className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      ← Back to Email & Password Login
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleSaveSetupPassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      6-Digit SMS Code Sent to {phone || ADMIN_CONFIG.DESIGNATED_PHONE}
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-center text-base font-mono tracking-widest text-emerald-400 focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      Admin Email (Linked)
                    </label>
                    <input
                      type="email"
                      required
                      value={email || ADMIN_CONFIG.DESIGNATED_EMAIL}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-300 focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      Choose Your Administrator Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Choose a strong password"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      Confirm Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter to confirm"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || otp.trim().length !== 6 || password.length < 6}
                    className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-sm transition shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                        <span>Saving Password & Entering Governance Suite...</span>
                      </span>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Save Password & Launch Dashboard</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <button
                      type="button"
                      onClick={handleStartSetupOtp}
                      disabled={loading || cooldown > 0}
                      className="text-emerald-400 hover:underline cursor-pointer"
                    >
                      {cooldown > 0 ? `Resend SMS in ${cooldown}s` : 'Resend Code'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchMethod('email')}
                      className="text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      Cancel Setup
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Security Assurance Footer */}
          <div className="pt-4 border-t border-slate-800/80 text-[11px] text-slate-500 space-y-1 text-center">
            <p className="flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Identity verified via Supabase Auth & PostgreSQL RLS</span>
            </p>
            <p>Direct database mutations and unauthorized role elevations are rejected.</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-900 bg-slate-950 py-4 px-4 text-center text-xs text-slate-600">
        QuickHire Rural DPI Initiative • Administrative Governance & Platform Security System
      </footer>
    </div>
  );
}
export default AdminLogin;
