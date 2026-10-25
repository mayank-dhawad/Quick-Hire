/**
 * QuickHire Payment Utilities
 * Standardized UPI formatting, URI generation, validation, and types.
 */

export interface PaymentRecord {
  id: string;
  payer_id: string;
  payee_id: string;
  payment_for_type: 'worker_wage' | 'machine_rental';
  reference_id: string | null;
  amount: number;
  payment_method: 'Net Banking (IMPS/NEFT)' | 'Direct UPI' | 'Cash';
  transaction_ref: string | null;
  payment_reference?: string | null;
  currency?: string | null;
  verification_status?: string | null;
  verification_notes?: string | null;
  verified_at?: string | null;
  status: string | null;
  created_at: string | null;
  updated_at?: string | null;
  payer_name?: string | null;
  payee_name?: string | null;
}

/**
 * Standard UPI VPA validation format:
 * - Handle: 2-256 alphanumeric characters, dots, hyphens, underscores
 * - At sign: exactly one '@' separator
 * - PSP Handle: 2-64 alphabetic characters
 */
export const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

/**
 * Validates whether a given string matches the standard UPI VPA structure.
 */
export function isValidUpiId(upiId: string | null | undefined): boolean {
  if (!upiId) return false;
  const clean = upiId.trim();
  if (!clean.includes('@') || clean.startsWith('@') || clean.endsWith('@')) {
    return false;
  }
  return UPI_REGEX.test(clean);
}

/**
 * Constructs a runtime URL-encoded `upi://pay` deep link URI.
 * Never concatenates raw unescaped input.
 */
export function buildUpiPayUri(params: {
  pa: string;
  pn: string;
  am: number;
  cu?: string;
  tn?: string;
  tr?: string;
}): string {
  const query = new URLSearchParams({
    pa: params.pa.trim(),
    pn: params.pn.trim(),
    am: params.am.toFixed(2),
    cu: params.cu || 'INR',
    tn: (params.tn || 'Wage Settlement').slice(0, 80),
    tr: (params.tr || '').slice(0, 35),
  });
  return `upi://pay?${query.toString()}`;
}

/**
 * Masks a UPI ID for secure display (e.g., "rakesh****@okhdfcbank").
 */
export function maskUpiId(upiId: string | null | undefined): string {
  if (!upiId) return 'Not Provided';
  const clean = upiId.trim();
  const parts = clean.split('@');
  if (parts.length !== 2) return clean;
  const [handle, psp] = parts;
  if (handle.length <= 4) {
    return `${handle.slice(0, 1)}***@${psp}`;
  }
  return `${handle.slice(0, 3)}****${handle.slice(-1)}@${psp}`;
}
