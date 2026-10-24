import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ADMIN_CONFIG,
  AdminSession,
  verifyAdminStatus,
  loginAdminWithPassword,
  sendAdminPhoneOtp,
  verifyAdminPhoneOtp,
  setAdminSession,
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
} from 'lucide-react';

interface AdminLoginProps {
  onLoginSuccess?: () => void;
  onNavigatePublic?: () => void;
}

export function AdminLogin({ onLoginSuccess, onNavigatePublic }: AdminLoginProps) {
  // Method: 'email' (Email + Password) or 'phone' (Phone + SMS OTP)
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  // Phone flow step: 'request' (enter phone) or 'verify' (enter 6-digit OTP code)
  const [phoneStep, setPhoneStep] = useState<'request' | 'verify'>('request');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');

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

  // Check if already authenticated with active admin session
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const check = await verifyAdminStatus(session.user.id);
        if (check.isAdmin) {
          const raw = sessionStorage.getItem(ADMIN_CONFIG.SESSION_STORAGE_KEY);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed.expiresAt && Date.now() < parsed.expiresAt) {
                if (onLoginSuccess) onLoginSuccess();
                navigateTo('/admin');
                return;
              }
            } catch {
              // Ignore parse error
            }
          }
        }
      }
    });
  }, [onLoginSuccess]);

  // Switch between Email and Phone authentication tabs
  const handleSwitchMethod = (method: 'email' | 'phone') => {
    setAuthMethod(method);
    setPhoneStep('request');
    setErrorMsg('');
    setNoticeMsg('');
    setOtp('');
    setPassword('');
    setCooldown(0);
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

      // Establish validated admin session
      const sessionPayload: AdminSession = {
        user: loginRes.user,
        adminRole: adminStatus.role,
        authMethod: 'email',
        verifiedIdentifier: cleanEmail,
        verifiedEmail: adminStatus.verifiedEmail || cleanEmail,
        verifiedPhone: adminStatus.verifiedPhone || null,
        authenticatedAt: Date.now(),
        expiresAt: Date.now() + ADMIN_CONFIG.SESSION_DURATION_MS,
        sessionToken: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      };

      setAdminSession(sessionPayload);

      await logAdminAction({
        adminId: loginRes.user.id,
        adminEmail: cleanEmail,
        action: 'admin_login_password_verified',
        targetType: 'auth',
        targetId: loginRes.user.id,
        reason: 'Administrator authenticated via verified Email & Password',
        metadata: { role: adminStatus.role, method: 'email_password' },
      });

      if (onLoginSuccess) onLoginSuccess();
      navigateTo('/admin');
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

      // Establish validated admin session
      const sessionPayload: AdminSession = {
        user: verifyRes.user,
        adminRole: adminStatus.role,
        authMethod: 'phone',
        verifiedIdentifier: cleanPhone,
        verifiedEmail: adminStatus.verifiedEmail || null,
        verifiedPhone: adminStatus.verifiedPhone || cleanPhone,
        authenticatedAt: Date.now(),
        expiresAt: Date.now() + ADMIN_CONFIG.SESSION_DURATION_MS,
        sessionToken: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      };

      setAdminSession(sessionPayload);

      await logAdminAction({
        adminId: verifyRes.user.id,
        adminEmail: verifyRes.user.email || null,
        action: 'admin_login_phone_verified',
        targetType: 'auth',
        targetId: verifyRes.user.id,
        reason: 'Administrator authenticated via verified Phone SMS OTP',
        metadata: { role: adminStatus.role, method: 'phone_otp', phone: cleanPhone },
      });

      if (onLoginSuccess) onLoginSuccess();
      navigateTo('/admin');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'SMS OTP verification encountered an unexpected error.';
      setErrorMsg(message);
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

          {/* Error & Notice Banners */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-950/60 border border-rose-800/60 rounded-2xl flex items-start gap-2.5 text-xs text-rose-200 shadow-sm animate-shake">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5 leading-relaxed font-medium">{errorMsg}</div>
            </div>
          )}

          {noticeMsg && (
            <div className="p-3.5 bg-emerald-950/50 border border-emerald-800/60 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-200 shadow-sm">
              <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5 leading-relaxed font-medium">{noticeMsg}</div>
            </div>
          )}

          {/* METHOD 1: EMAIL & PASSWORD LOGIN */}
          {authMethod === 'email' && (
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
                <p className="text-[11px] text-slate-500">
                  A 6-digit SMS verification code will be dispatched via Fast2SMS / Supabase Auth.
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
