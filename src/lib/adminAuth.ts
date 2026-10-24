import { supabase } from './supabase';
import { User } from '@supabase/supabase-js';

/**
 * Configurable Administrator Identity Parameters
 * (In production, populate these via Vercel/Supabase environment variables)
 */
export const ADMIN_CONFIG = {
  DESIGNATED_UUID: import.meta.env.VITE_ADMIN_UUID || '',
  SESSION_STORAGE_KEY: 'quickhire_admin_auth_session',
  SESSION_DURATION_MS: 2 * 60 * 60 * 1000, // 2 hours
};

export interface AdminSession {
  user: User;
  adminRole: 'super_admin' | 'moderator' | 'support_agent';
  authMethod: 'email' | 'phone';
  verifiedIdentifier: string;
  verifiedEmail?: string | null;
  verifiedPhone?: string | null;
  authenticatedAt: number;
  expiresAt: number;
  sessionToken: string;
}

export type AdminAuditTargetType =
  | 'profile'
  | 'worker'
  | 'job'
  | 'equipment'
  | 'complaint'
  | 'content'
  | 'auth'
  | 'system';

/**
 * Normalizes an email address consistently
 */
export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

/**
 * Normalizes a phone number to E.164 (+91...)
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  return `+${digits}`;
}

/**
 * Checks if a given Supabase user ID has been explicitly granted administrator privileges
 * through PostgreSQL function is_admin() or the trusted admin_users table.
 * Standard profiles alone cannot confer administrative rights without an active admin_users link.
 */
export async function verifyAdminStatus(userId: string): Promise<{
  isAdmin: boolean;
  role: 'super_admin' | 'moderator' | 'support_agent';
  verifiedEmail?: string | null;
  verifiedPhone?: string | null;
}> {
  if (!userId) {
    return { isAdmin: false, role: 'support_agent' };
  }

  try {
    // 1. Try server-side RPC function is_admin
    const { data: rpcIsAdmin, error: rpcErr } = await supabase.rpc('is_admin', {
      check_uid: userId,
    });

    if (!rpcErr && rpcIsAdmin === true) {
      // Query admin_users for verified identifiers and role
      const { data: adminRecord } = await supabase
        .from('admin_users')
        .select('role, verified_email, verified_phone, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      return {
        isAdmin: true,
        role: (adminRecord?.role as 'super_admin' | 'moderator' | 'support_agent') || 'super_admin',
        verifiedEmail: adminRecord?.verified_email || null,
        verifiedPhone: adminRecord?.verified_phone || null,
      };
    }

    // 2. Direct query on admin_users table (enforced by RLS)
    const { data: adminUser, error: adminErr } = await supabase
      .from('admin_users')
      .select('role, verified_email, verified_phone, is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (!adminErr && adminUser && adminUser.is_active) {
      return {
        isAdmin: true,
        role: adminUser.role,
        verifiedEmail: adminUser.verified_email,
        verifiedPhone: adminUser.verified_phone,
      };
    }

    // Standard profiles alone cannot confer administrative rights.
    return { isAdmin: false, role: 'support_agent' };
  } catch (err) {
    console.warn('Error checking admin status:', err);
    return { isAdmin: false, role: 'support_agent' };
  }
}

/**
 * Retrieves the currently active admin session from storage, ensuring it hasn't expired.
 */
export function getStoredAdminSession(): AdminSession | null {
  try {
    const raw = sessionStorage.getItem(ADMIN_CONFIG.SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed: AdminSession = JSON.parse(raw);
    if (!parsed || !parsed.expiresAt || Date.now() > parsed.expiresAt) {
      clearAdminSession();
      return null;
    }

    return parsed;
  } catch {
    clearAdminSession();
    return null;
  }
}

/**
 * Saves a validated admin session to session storage
 */
export function setAdminSession(session: AdminSession): void {
  try {
    sessionStorage.setItem(ADMIN_CONFIG.SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    console.error('Failed to store admin session:', err);
  }
}

/**
 * Clears the stored admin session
 */
export function clearAdminSession(): void {
  try {
    sessionStorage.removeItem(ADMIN_CONFIG.SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Authenticates the administrator using email and password via Supabase Auth.
 * Confirms that the resulting authenticated account is the single designated administrator.
 */
export async function loginAdminWithPassword(adminEmail: string, password: string): Promise<{
  success: boolean;
  user?: User | null;
  error?: string;
}> {
  const cleanEmail = normalizeEmail(adminEmail);
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Please enter a valid administrator email address.' };
  }
  if (!password || password.length < 6) {
    return { success: false, error: 'Please enter your administrator password.' };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error || !data?.user) {
      return { success: false, error: error?.message || 'Invalid email or password.' };
    }

    // Verify administrator authorization in public.admin_users
    const adminCheck = await verifyAdminStatus(data.user.id);
    if (!adminCheck.isAdmin) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Access Denied: This authenticated account has not been granted administrator privileges.',
      };
    }

    // Verify designated UUID if configured
    if (ADMIN_CONFIG.DESIGNATED_UUID && data.user.id !== ADMIN_CONFIG.DESIGNATED_UUID) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Access Denied: The authenticated identity does not match the designated administrator account.',
      };
    }

    return {
      success: true,
      user: data.user,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Authentication failed.';
    return { success: false, error: message };
  }
}

/**
 * Sends a 6-digit email OTP for administrator verification using Supabase Auth.
 * Prohibits automatic sign-ups (shouldCreateUser: false) to prevent unauthorized account creation.
 */
export async function sendAdminEmailOtp(adminEmail: string): Promise<{
  success: boolean;
  message: string;
}> {
  const cleanEmail = normalizeEmail(adminEmail);
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Please enter a valid administrator email address.');
  }

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        shouldCreateUser: false,
      },
    });

    if (error) {
      if (
        error.message.toLowerCase().includes('user not found') ||
        error.message.toLowerCase().includes('signups not allowed')
      ) {
        return {
          success: true,
          message: 'If the email belongs to an authorized administrator, a verification code will be sent.',
        };
      }
      throw new Error(error.message);
    }

    return {
      success: true,
      message: 'If the email belongs to an authorized administrator, a verification code will be sent.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to dispatch email verification code.';
    throw new Error(message);
  }
}

/**
 * Validates the entered OTP code against Supabase Auth email verification.
 * Confirms that the resulting authenticated account is the authorized administrator.
 */
export async function verifyAdminEmailOtp(adminEmail: string, enteredOtp: string): Promise<{
  success: boolean;
  user?: User | null;
  error?: string;
}> {
  const cleanEmail = normalizeEmail(adminEmail);
  const cleanOtp = (enteredOtp || '').trim();

  if (!cleanOtp || cleanOtp.length !== 6) {
    return { success: false, error: 'Please enter a valid 6-digit verification code.' };
  }

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanOtp,
      type: 'email',
    });

    if (error || !data?.user) {
      return { success: false, error: error?.message || 'Invalid or expired verification code.' };
    }

    // Verify administrator authorization in public.admin_users
    const adminCheck = await verifyAdminStatus(data.user.id);
    if (!adminCheck.isAdmin) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Access Denied: This authenticated account has not been granted administrator privileges.',
      };
    }

    // Verify designated UUID if configured
    if (ADMIN_CONFIG.DESIGNATED_UUID && data.user.id !== ADMIN_CONFIG.DESIGNATED_UUID) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Access Denied: The authenticated identity does not match the designated administrator account.',
      };
    }

    return {
      success: true,
      user: data.user,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Verification failed.';
    return { success: false, error: message };
  }
}

/**
 * Sends a 6-digit SMS OTP for administrator phone verification using Supabase Auth.
 * Prohibits automatic sign-ups (shouldCreateUser: false).
 */
export async function sendAdminPhoneOtp(adminPhone: string): Promise<{
  success: boolean;
  message: string;
}> {
  const e164Phone = normalizePhone(adminPhone);
  const cleanDigits = e164Phone.replace(/\D/g, '');
  if (!cleanDigits || cleanDigits.length < 10) {
    throw new Error('Please enter a valid mobile number with country code (e.g. +91).');
  }


  try {
    const { error } = await supabase.auth.signInWithOtp({
      phone: e164Phone,
      options: {
        channel: 'sms',
        shouldCreateUser: false,
      },
    });

    if (error) {
      if (
        error.message.toLowerCase().includes('user not found') ||
        error.message.toLowerCase().includes('signups not allowed')
      ) {
        return {
          success: true,
          message: 'If the registered administrator phone is eligible, a verification code will be sent by SMS.',
        };
      }
      throw new Error(error.message);
    }

    return {
      success: true,
      message: 'If the registered administrator phone is eligible, a verification code will be sent by SMS.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to dispatch phone verification OTP.';
    throw new Error(message);
  }
}

/**
 * Validates the entered OTP code against Supabase Auth phone verification.
 * Confirms that the resulting authenticated account is the authorized administrator.
 */
export async function verifyAdminPhoneOtp(adminPhone: string, enteredOtp: string): Promise<{
  success: boolean;
  user?: User | null;
  error?: string;
}> {
  const e164Phone = normalizePhone(adminPhone);
  const cleanOtp = (enteredOtp || '').trim();

  if (!cleanOtp || cleanOtp.length !== 6) {
    return { success: false, error: 'Please enter a valid 6-digit verification code.' };
  }

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: e164Phone,
      token: cleanOtp,
      type: 'sms',
    });

    if (error || !data?.user) {
      return { success: false, error: error?.message || 'Invalid or expired verification code.' };
    }

    // Verify administrator authorization in public.admin_users
    const adminCheck = await verifyAdminStatus(data.user.id);
    if (!adminCheck.isAdmin) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Access Denied: This authenticated account has not been granted administrator privileges.',
      };
    }

    // Verify designated UUID if configured
    if (ADMIN_CONFIG.DESIGNATED_UUID && data.user.id !== ADMIN_CONFIG.DESIGNATED_UUID) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Access Denied: The authenticated identity does not match the designated administrator account.',
      };
    }

    return {
      success: true,
      user: data.user,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Verification failed.';
    return { success: false, error: message };
  }
}

/**
 * Logs an administrative action to the public.admin_audit_logs table.
 */
export async function logAdminAction(params: {
  adminId?: string | null;
  adminEmail?: string | null;
  action: string;
  targetType: AdminAuditTargetType;
  targetId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const payload = {
      admin_id: params.adminId || null,
      admin_email: params.adminEmail || null,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId,
      reason: params.reason || null,
      metadata: (params.metadata || {}) as import('./database.types').Json,
    };

    const { error } = await supabase.from('admin_audit_logs').insert(payload);
    if (error) {
      console.warn('Could not record administrative audit log:', error.message);
    }
  } catch (err) {
    console.warn('Audit logging exception:', err);
  }
}
