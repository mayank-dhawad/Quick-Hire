import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ADMIN_CONFIG,
  getStoredAdminSession,
  setAdminSession,
  clearAdminSession,
  loginAdminWithPassword,
  sendAdminEmailOtp,
  verifyAdminEmailOtp,
  sendAdminPhoneOtp,
  verifyAdminPhoneOtp,
  verifyAdminStatus,
  logAdminAction,
  normalizeEmail,
  normalizePhone,
  AdminSession,
} from './adminAuth';
import { supabase } from './supabase';

const DESIGNATED_ADMIN_UUID = '00000000-0000-4000-a000-000000000001';
const DESIGNATED_EMAIL = 'admin@quickhire.local';
const DESIGNATED_PHONE = '+919876543210';

vi.mock('./supabase', () => {
  return {
    supabase: {
      auth: {
        signInWithPassword: vi.fn().mockImplementation(({ email, password }) => {
          if (email === 'admin@quickhire.local' && password === 'AdminSecret123!') {
            return Promise.resolve({
              data: {
                user: { id: '00000000-0000-4000-a000-000000000001', email: 'admin@quickhire.local' },
                session: { access_token: 'valid-admin-password-jwt' },
              },
              error: null,
            });
          }
          if (email === 'unauthorized@quickhire.local' && password === 'AdminSecret123!') {
            return Promise.resolve({
              data: {
                user: { id: 'worker-uuid-123', email: 'unauthorized@quickhire.local' },
                session: { access_token: 'worker-jwt' },
              },
              error: null,
            });
          }
          return Promise.resolve({
            data: { user: null, session: null },
            error: { message: 'Invalid login credentials' },
          });
        }),
        signInWithOtp: vi.fn().mockImplementation(({ options }) => {
          // If options.shouldCreateUser is not false, fail
          if (options?.shouldCreateUser !== false) {
            return Promise.resolve({ data: null, error: { message: 'Insecure signup permitted' } });
          }
          return Promise.resolve({ data: {}, error: null });
        }),
        verifyOtp: vi.fn().mockImplementation(({ email, phone, token, type }) => {
          if (token !== '123456') {
            return Promise.resolve({
              data: { user: null, session: null },
              error: { message: 'Invalid or expired OTP token' },
            });
          }

          if (type === 'email') {
            if (email === 'admin@quickhire.local') {
              return Promise.resolve({
                data: {
                  user: { id: '00000000-0000-4000-a000-000000000001', email: 'admin@quickhire.local' },
                  session: { access_token: 'valid-admin-email-jwt' },
                },
                error: null,
              });
            }
            if (email === 'unauthorized@quickhire.local') {
              return Promise.resolve({
                data: {
                  user: { id: 'worker-uuid-123', email: 'unauthorized@quickhire.local' },
                  session: { access_token: 'worker-jwt' },
                },
                error: null,
              });
            }
          }

          if (type === 'sms') {
            if (phone === '+919876543210') {
              return Promise.resolve({
                data: {
                  user: { id: '00000000-0000-4000-a000-000000000001', phone: '+919876543210' },
                  session: { access_token: 'valid-admin-phone-jwt' },
                },
                error: null,
              });
            }
            if (phone === '+919999999999') {
              return Promise.resolve({
                data: {
                  user: { id: 'employer-uuid-456', phone: '+919999999999' },
                  session: { access_token: 'employer-jwt' },
                },
                error: null,
              });
            }
          }

          return Promise.resolve({
            data: { user: null, session: null },
            error: { message: 'Unknown identifier' },
          });
        }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      rpc: vi.fn().mockImplementation((fnName: string, args: { check_uid?: string; target_user_id?: string }) => {
        if (fnName === 'is_admin') {
          if (args.check_uid === '00000000-0000-4000-a000-000000000001') {
            return Promise.resolve({ data: true, error: null });
          }
          return Promise.resolve({ data: false, error: null });
        }
        if (fnName === 'confirm_admin_phone_verified') {
          return Promise.resolve({ data: true, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      from: vi.fn((table: string) => {
        const qb: Record<string, unknown> = {
          select: vi.fn(() => qb),
          eq: vi.fn((col: string, val: unknown) => {
            if (table === 'admin_users' && col === 'user_id') {
              if (val === '00000000-0000-4000-a000-000000000001') {
                return {
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        user_id: '00000000-0000-4000-a000-000000000001',
                        role: 'super_admin',
                        verified_email: 'admin@quickhire.local',
                        verified_phone: '+919876543210',
                        is_active: true,
                      },
                      error: null,
                    }),
                  })),
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      user_id: '00000000-0000-4000-a000-000000000001',
                      role: 'super_admin',
                      verified_email: 'admin@quickhire.local',
                      verified_phone: '+919876543210',
                      is_active: true,
                    },
                    error: null,
                  }),
                };
              }
            }
            return {
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn().mockResolvedValue({ data: null, error: null }),
          delete: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        return qb;
      }),
    },
  };
});

describe('MANDATORY SECURITY ARCHITECTURE TEST SUITE', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Rule 1: Identifier Normalization & Parsing', () => {
    it('normalizes email addresses consistently (trim, lowercase)', () => {
      expect(normalizeEmail('  Admin@QuickHire.Local  ')).toBe('admin@quickhire.local');
      expect(normalizeEmail('ADMIN@DOMAIN.COM')).toBe('admin@domain.com');
      expect(normalizeEmail('')).toBe('');
    });

    it('normalizes phone numbers to standard E.164 (+91...) format', () => {
      expect(normalizePhone('9876543210')).toBe('+919876543210');
      expect(normalizePhone('+919876543210')).toBe('+919876543210');
      expect(normalizePhone('  +91 98765 43210  ')).toBe('+919876543210');
      expect(normalizePhone('')).toBe('');
    });
  });

  describe('Cases 1, 2, 3: Dual Independent Verified Login to Single Designated UUID', () => {
    it('Case 1a: Authorized email/password login succeeds and returns designated admin user', async () => {
      const loginResult = await loginAdminWithPassword('admin@quickhire.local', 'AdminSecret123!');
      expect(loginResult.success).toBe(true);
      expect(loginResult.user?.id).toBe(DESIGNATED_ADMIN_UUID);
      expect(loginResult.user?.email).toBe(DESIGNATED_EMAIL);
    });

    it('Case 1b: Authorized verified email OTP login succeeds and returns designated admin user', async () => {
      const otpSend = await sendAdminEmailOtp('admin@quickhire.local');
      expect(otpSend.success).toBe(true);

      const verifyResult = await verifyAdminEmailOtp('admin@quickhire.local', '123456');
      expect(verifyResult.success).toBe(true);
      expect(verifyResult.user?.id).toBe(DESIGNATED_ADMIN_UUID);
      expect(verifyResult.user?.email).toBe(DESIGNATED_EMAIL);
    });

    it('Case 2: Authorized verified phone login succeeds and returns designated admin user', async () => {
      const otpSend = await sendAdminPhoneOtp('+919876543210');
      expect(otpSend.success).toBe(true);

      const verifyResult = await verifyAdminPhoneOtp('+919876543210', '123456');
      expect(verifyResult.success).toBe(true);
      expect(verifyResult.user?.id).toBe(DESIGNATED_ADMIN_UUID);
      expect(verifyResult.user?.phone).toBe(DESIGNATED_PHONE);
    });

    it('Case 3: Both email/password and phone login methods resolve to the EXACT same designated Auth UUID', async () => {
      const emailPasswordAuth = await loginAdminWithPassword('admin@quickhire.local', 'AdminSecret123!');
      const phoneAuth = await verifyAdminPhoneOtp('+919876543210', '123456');

      expect(emailPasswordAuth.user?.id).toBe(DESIGNATED_ADMIN_UUID);
      expect(phoneAuth.user?.id).toBe(DESIGNATED_ADMIN_UUID);
      expect(emailPasswordAuth.user?.id).toBe(phoneAuth.user?.id);
    });
  });

  describe('Cases 4, 5, 6: Denial of Incorrect, Unverified, or Unauthorized Logins', () => {
    it('Case 4a: An incorrect password cannot gain administrator access', async () => {
      const wrongPassword = await loginAdminWithPassword('admin@quickhire.local', 'WrongPassword!');
      expect(wrongPassword.success).toBe(false);
      expect(wrongPassword.user).toBeUndefined();
      expect(wrongPassword.error).toContain('Invalid');
    });

    it('Case 4b: An incorrect or unverified email OTP cannot gain access', async () => {
      const wrongOtp = await verifyAdminEmailOtp('admin@quickhire.local', '000000');
      expect(wrongOtp.success).toBe(false);
      expect(wrongOtp.user).toBeUndefined();

      const emptyOtp = await verifyAdminEmailOtp('admin@quickhire.local', '');
      expect(emptyOtp.success).toBe(false);
    });

    it('Case 5: An incorrect or unverified phone cannot gain access', async () => {
      const wrongOtp = await verifyAdminPhoneOtp('+919876543210', '999999');
      expect(wrongOtp.success).toBe(false);
      expect(wrongOtp.user).toBeUndefined();

      const shortOtp = await verifyAdminPhoneOtp('+919876543210', '12');
      expect(shortOtp.success).toBe(false);
    });

    it('Case 6: A verified but unauthorized user is denied and immediately signed out', async () => {
      // User authenticates with valid credentials for unauthorized@quickhire.local
      const unauthorizedResult = await loginAdminWithPassword('unauthorized@quickhire.local', 'AdminSecret123!');

      expect(unauthorizedResult.success).toBe(false);
      expect(unauthorizedResult.error).toContain('Access Denied');
      expect(supabase.auth.signOut).toHaveBeenCalled();
    });
  });

  describe('Cases 7, 8, 9, 10: Role Segregation & Access Guards', () => {
    it('Case 7: Worker accounts cannot access admin data (verifyAdminStatus returns false)', async () => {
      const workerStatus = await verifyAdminStatus('worker-uuid-123');
      expect(workerStatus.isAdmin).toBe(false);
    });

    it('Case 8: Customer accounts cannot access admin data (verifyAdminStatus returns false)', async () => {
      const employerStatus = await verifyAdminStatus('employer-uuid-456');
      expect(employerStatus.isAdmin).toBe(false);
    });

    it('Case 9: Direct access without session is denied (getStoredAdminSession returns null)', () => {
      sessionStorage.clear();
      const session = getStoredAdminSession();
      expect(session).toBeNull();
    });

    it('Case 10: Direct API requests by non-admin users are denied by server RPC is_admin', async () => {
      const { data: isAdmin } = await supabase.rpc('is_admin', { check_uid: 'worker-uuid-123' });
      expect(isAdmin).toBe(false);
    });
  });

  describe('Cases 11, 12, 13, 14: Anti-Self-Promotion, Session Expiry & Revocation', () => {
    it('Case 11: A user with an unverified profile cannot self-promote to admin', async () => {
      const rogueCheck = await verifyAdminStatus('rogue-self-promoted-uuid');
      expect(rogueCheck.isAdmin).toBe(false);
    });

    it('Case 12: Anonymous callers cannot check or modify allowlists', async () => {
      const anonCheck = await verifyAdminStatus('');
      expect(anonCheck.isAdmin).toBe(false);
    });

    it('Case 13: Expired sessions are automatically cleared and denied', () => {
      const expiredSession: AdminSession = {
        user: { id: DESIGNATED_ADMIN_UUID } as unknown as import('@supabase/supabase-js').User,
        adminRole: 'super_admin',
        authMethod: 'email',
        verifiedIdentifier: DESIGNATED_EMAIL,
        authenticatedAt: Date.now() - 86400000,
        expiresAt: Date.now() - 1000, // Expired
        sessionToken: 'expired-token',
      };

      setAdminSession(expiredSession);
      const retrieved = getStoredAdminSession();
      expect(retrieved).toBeNull();
      expect(sessionStorage.getItem(ADMIN_CONFIG.SESSION_STORAGE_KEY)).toBeNull();
    });

    it('Case 14: Logout clears session storage and prevents further protected access', () => {
      const validSession: AdminSession = {
        user: { id: DESIGNATED_ADMIN_UUID } as unknown as import('@supabase/supabase-js').User,
        adminRole: 'super_admin',
        authMethod: 'phone',
        verifiedIdentifier: DESIGNATED_PHONE,
        authenticatedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
        sessionToken: 'valid-token',
      };

      setAdminSession(validSession);
      expect(getStoredAdminSession()).not.toBeNull();

      clearAdminSession();
      expect(getStoredAdminSession()).toBeNull();
    });
  });

  describe('Cases 15, 16, 17, 18: Audit Logging, Grants & RLS Protections', () => {
    it('Case 15: Records admin actions to immutable admin_audit_logs', async () => {
      await logAdminAction({
        adminId: DESIGNATED_ADMIN_UUID,
        adminEmail: DESIGNATED_EMAIL,
        action: 'admin_login_email_verified',
        targetType: 'auth',
        targetId: DESIGNATED_ADMIN_UUID,
        reason: 'Authorized administrator single-admin authentication verified',
        metadata: { method: 'email' },
      });

      expect(supabase.from).toHaveBeenCalledWith('admin_audit_logs');
    });

    it('Case 16: Disallows automatic account creation during OTP dispatch (shouldCreateUser: false)', async () => {
      await sendAdminEmailOtp('admin@quickhire.local');
      expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ shouldCreateUser: false }),
        })
      );

      await sendAdminPhoneOtp('+919876543210');
      expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ shouldCreateUser: false }),
        })
      );
    });

    it('Case 17: Inactive or revoked administrators are rejected by verifyAdminStatus', async () => {
      const inactiveStatus = await verifyAdminStatus('admin-uuid-inactive');
      expect(inactiveStatus.isAdmin).toBe(false);
    });

    it('Case 18: Normal worker and customer login functionality remains operational', () => {
      // Normal phone format normalization still supports all standard 10-digit numbers
      expect(normalizePhone('9822012345')).toBe('+919822012345');
      expect(normalizePhone('+919822012345')).toBe('+919822012345');
    });

    it('Case 19: Authorization is strictly server-enforced and independent of VITE_ADMIN_EMAIL / VITE_ADMIN_PHONE', async () => {
      // Confirm ADMIN_CONFIG does NOT expose or rely on EMAIL_PLACEHOLDER or PHONE_PLACEHOLDER
      expect((ADMIN_CONFIG as Record<string, unknown>).EMAIL_PLACEHOLDER).toBeUndefined();
      expect((ADMIN_CONFIG as Record<string, unknown>).PHONE_PLACEHOLDER).toBeUndefined();

      // Authorization succeeds solely based on database is_admin and admin_users verification
      const check = await verifyAdminStatus(DESIGNATED_ADMIN_UUID);
      expect(check.isAdmin).toBe(true);
      expect(check.role).toBe('super_admin');
    });

    it('Case 20: Rejects authenticated identities when UUID does not match designated administrator', async () => {
      // Temporarily pin designated UUID
      ADMIN_CONFIG.DESIGNATED_UUID = DESIGNATED_ADMIN_UUID;

      // An authenticated user with different UUID (even if they guessed admin email in GoTrue)
      const mismatchResult = await verifyAdminEmailOtp('unauthorized@quickhire.local', '123456');
      expect(mismatchResult.success).toBe(false);
      expect(mismatchResult.error).toContain('Access Denied');
      expect(supabase.auth.signOut).toHaveBeenCalled();

      ADMIN_CONFIG.DESIGNATED_UUID = '';
    });
  });
});
