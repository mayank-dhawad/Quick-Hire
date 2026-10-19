import { describe, it, expect } from 'vitest';
import {
  translations,
  getTranslation,
  normalizeLanguage,
  SUPPORTED_LANGUAGES,
} from './translations';

describe('Multilingual Translation Dictionary', () => {
  it('supports exactly 5 official Indian languages', () => {
    expect(SUPPORTED_LANGUAGES).toEqual([
      'English',
      'हिंदी (Hindi)',
      'मराठी (Marathi)',
      'বাংলা (Bengali)',
      'తెలుగు (Telugu)',
    ]);

    for (const lang of SUPPORTED_LANGUAGES) {
      expect(translations[lang]).toBeDefined();
      expect(typeof translations[lang]).toBe('object');
      expect(Object.keys(translations[lang]).length).toBeGreaterThan(50);
    }
  });

  describe('normalizeLanguage helper', () => {
    it('normalizes various input casings and colloquial names', () => {
      expect(normalizeLanguage('English')).toBe('English');
      expect(normalizeLanguage('hindi')).toBe('हिंदी (Hindi)');
      expect(normalizeLanguage('HINDI')).toBe('हिंदी (Hindi)');
      expect(normalizeLanguage('hi')).toBe('हिंदी (Hindi)');
      expect(normalizeLanguage('हिंदी')).toBe('हिंदी (Hindi)');
      expect(normalizeLanguage('marathi')).toBe('मराठी (Marathi)');
      expect(normalizeLanguage('mr')).toBe('मराठी (Marathi)');
      expect(normalizeLanguage('मराठी')).toBe('मराठी (Marathi)');
      expect(normalizeLanguage('bengali')).toBe('বাংলা (Bengali)');
      expect(normalizeLanguage('bangla')).toBe('বাংলা (Bengali)');
      expect(normalizeLanguage('bn')).toBe('বাংলা (Bengali)');
      expect(normalizeLanguage('বাংলা')).toBe('বাংলা (Bengali)');
      expect(normalizeLanguage('telugu')).toBe('తెలుగు (Telugu)');
      expect(normalizeLanguage('te')).toBe('తెలుగు (Telugu)');
      expect(normalizeLanguage('తెలుగు')).toBe('తెలుగు (Telugu)');
      expect(normalizeLanguage('')).toBe('English');
      expect(normalizeLanguage('unknown')).toBe('English');
    });
  });

  describe('getTranslation helper & fallbacks', () => {
    it('retrieves correct translation for standard keys', () => {
      expect(getTranslation('English', 'tabHome')).toBe('Home');
      expect(getTranslation('हिंदी (Hindi)', 'tabHome')).toBe('होम');
      expect(getTranslation('मराठी (Marathi)', 'tabHome')).toBe('होम');
      expect(getTranslation('বাংলা (Bengali)', 'tabHome')).toBe('হোম');
      expect(getTranslation('తెలుగు (Telugu)', 'tabHome')).toBe('హోమ్');
    });

    it('falls back to English when key is missing in target language', () => {
      const englishOnlyKey = 'englishOnlyKeyFallbackTest';
      // Temporarily register an English key
      translations['English'][englishOnlyKey] = 'English Fallback Value';

      expect(getTranslation('বাংলা (Bengali)', englishOnlyKey)).toBe('English Fallback Value');
      expect(getTranslation('తెలుగు (Telugu)', englishOnlyKey)).toBe('English Fallback Value');

      // Cleanup
      delete translations['English'][englishOnlyKey];
    });

    it('returns the raw key if key does not exist anywhere', () => {
      const nonExistentKey = 'completely_unknown_test_key_xyz';
      expect(getTranslation('English', nonExistentKey)).toBe(nonExistentKey);
      expect(getTranslation('हिंदी (Hindi)', nonExistentKey)).toBe(nonExistentKey);
    });
  });

  describe('Critical Citizen Advisory & Helpline Keys', () => {
    const criticalKeys = [
      'tabHome',
      'tabWorkers',
      'tabPostJob',
      'tabSafety',
      'kisanHelpline',
      'womenSafety',
      'laborDispute',
      'grievanceTitle',
    ];

    for (const key of criticalKeys) {
      for (const lang of SUPPORTED_LANGUAGES) {
        it(`provides valid, non-empty translation for "${key}" in ${lang}`, () => {
          const val = getTranslation(lang, key);
          expect(val).toBeDefined();
          expect(val.length).toBeGreaterThan(0);
          expect(val).not.toBe(key);
        });
      }
    }
  });

  describe('Authentication & Dual-Mode Translation Parity', () => {
    const authKeys = [
      'tabMobileOtp',
      'tabEmailLogin',
      'emailAddressLabel',
      'passwordLabel',
      'passwordMinLength',
      'signingInBtn',
      'creatingAccountBtn',
      'signInWorkerBtn',
      'signInHirerBtn',
      'createWorkerAccountBtn',
      'createHirerAccountBtn',
      'alreadyHaveAccount',
      'signInAction',
      'dontHaveAccount',
      'signUpAction',
      'createAccountTitle',
      'signInTitle',
      'registerWithEmailDesc',
      'signInWithEmailDesc',
      'invalidEmail',
      'invalidPassword',
      'accountCreatedNotice',
      'accountCreatedSpeech',
      'registerError',
      'invalidCredentials',
      'sendingFast2sms',
      'verifySignIn',
      'eshramDpiBadge',
    ];

    for (const key of authKeys) {
      for (const lang of SUPPORTED_LANGUAGES) {
        it(`provides valid regional translation for auth key "${key}" in ${lang}`, () => {
          const val = getTranslation(lang, key);
          expect(val).toBeDefined();
          expect(val.length).toBeGreaterThan(0);
          expect(val).not.toBe(key);
        });
      }
    }
  });

  describe('Bank & Payouts Translation Parity', () => {
    const bankKeys = [
      'bankTitle',
      'bankSub',
      'bankNameLabel',
      'accountNoLabel',
      'confirmAccountNoLabel',
      'confirmAccountNoPlaceholder',
      'ifscLabel',
      'ifscPlaceholder',
      'ifscFormatHint',
      'invalidIfscError',
      'upiLabel',
      'upiPlaceholder',
      'invalidUpiError',
      'accountMismatchError',
      'eitherAccountOrUpiError',
      'saveBankBtn',
      'savingBankBtn',
      'bankSavedSuccess',
      'bankVerifiedBadge',
      'bankUnconfiguredBadge',
      'directPayoutTitle',
      'zeroCommissionBanner',
      'addAccountToReceive',
      'quickSelect',
      'totalReceived',
      'totalPaidOut',
      'passbookTitle',
      'passbookSub',
      'filterAll',
      'filterReceived',
      'filterSent',
      'searchLedgerPlaceholder',
      'loadingTransactions',
      'typeHeader',
      'purposeHeader',
      'amountHeader',
      'methodHeader',
      'utrHeader',
      'dateHeader',
      'statusHeader',
      'settledBadge',
      'bankSetupGuidance',
      'securePayoutsSub',
      'zeroFees',
      'npciCompliant',
      'bankActiveNotice',
      'noUpiSaved',
      'notConfiguredYet',
    ];

    for (const key of bankKeys) {
      for (const lang of SUPPORTED_LANGUAGES) {
        it(`provides valid regional translation for bank key "${key}" in ${lang}`, () => {
          const val = getTranslation(lang, key);
          expect(val).toBeDefined();
          expect(val.length).toBeGreaterThan(0);
          expect(val).not.toBe(key);
        });
      }
    }
  });

  describe('Unicode NFC Normalization & Script Encoding', () => {
    it('maintains valid UTF-8 NFC representation without encoding corruption', () => {
      const hindiSample = translations['हिंदी (Hindi)']['heroTitle'];
      const marathiSample = translations['मराठी (Marathi)']['heroTitle'];
      const bengaliSample = translations['বাংলা (Bengali)']['heroTitle'];
      const teluguSample = translations['తెలుగు (Telugu)']['heroTitle'];

      // Ensure no Unicode replacement character  (U+FFFD) is present
      expect(hindiSample).not.toContain('\uFFFD');
      expect(marathiSample).not.toContain('\uFFFD');
      expect(bengaliSample).not.toContain('\uFFFD');
      expect(teluguSample).not.toContain('\uFFFD');

      // Verify NFC equality
      expect(hindiSample.normalize('NFC')).toBe(hindiSample);
      expect(marathiSample.normalize('NFC')).toBe(marathiSample);
      expect(bengaliSample.normalize('NFC')).toBe(bengaliSample);
      expect(teluguSample.normalize('NFC')).toBe(teluguSample);
    });
  });
});
