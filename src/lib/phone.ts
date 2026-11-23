/**
 * Convert common Indian mobile-number formats into a valid tel: URI.
 * The dialler receives +91 followed by exactly 10 digits, never a bare 12-digit number.
 */
export function getIndianTelUri(value: string | null | undefined): string | null {
  if (!value) return null;

  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('0091')) digits = digits.slice(4);
  else if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);

  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `tel:+91${digits}`;
}
