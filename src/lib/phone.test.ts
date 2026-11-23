import { describe, expect, it } from 'vitest';
import { getIndianTelUri } from './phone';

describe('getIndianTelUri', () => {
  it.each([
    ['9876543210', 'tel:+919876543210'],
    ['+919876543210', 'tel:+919876543210'],
    ['919876543210', 'tel:+919876543210'],
    ['09876543210', 'tel:+919876543210'],
    ['0091 98765-43210', 'tel:+919876543210'],
    ['+91 98765 43210', 'tel:+919876543210'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(getIndianTelUri(input)).toBe(expected);
  });

  it.each(['', '1234567890', '5123456789', '91987654321', '91987654321099', '+1 415 555 2671'])(
    'rejects invalid Indian mobile number %s',
    (input) => {
      expect(getIndianTelUri(input)).toBeNull();
    }
  );

  it('rejects missing values', () => {
    expect(getIndianTelUri(null)).toBeNull();
    expect(getIndianTelUri(undefined)).toBeNull();
  });
});
