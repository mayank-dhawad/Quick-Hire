# 10 — Testing Architecture & Known Technical Observations

## 1. Automated Testing Framework & Test Harness

**QuickHire** incorporates an automated test suite powered by [Vitest 2](https://vitest.dev/) and [@testing-library/react 16](https://testing-library.com/).

### Test Runner Configuration (`vitest.config.ts`)
- **Environment:** `jsdom` (simulates browser DOM, `window`, `document`, and events in Node.js).
- **Setup File:** `src/test/setup.ts`.
- **Globals:** Enabled (`describe`, `it`, `expect`, `vi`, `beforeEach` accessible without manual imports).

### Speech Synthesis Mocking Harness (`src/test/setup.ts`)
Because standard Node.js/JSDOM does not implement browser speech APIs, `setup.ts` polyfills the Web Speech API:
```ts
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

class MockSpeechSynthesisUtterance {
  text: string;
  lang: string = 'en-IN';
  pitch: number = 1.0;
  rate: number = 0.95;
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(text: string = '') {
    this.text = text;
  }
}

const mockSpeechSynthesis = {
  speaking: false,
  paused: false,
  pending: false,
  cancel: vi.fn(),
  speak: vi.fn((utterance) => {
    mockSpeechSynthesis.speaking = true;
    setTimeout(() => {
      mockSpeechSynthesis.speaking = false;
      if (utterance.onend) utterance.onend();
    }, 10);
  }),
  getVoices: vi.fn(() => [
    { name: 'Google हिन्दी', lang: 'hi-IN', default: false, localService: true, voiceURI: 'hi-IN' },
    { name: 'Google বাংলা', lang: 'bn-IN', default: false, localService: true, voiceURI: 'bn-IN' },
    { name: 'Google తెలుగు', lang: 'te-IN', default: false, localService: true, voiceURI: 'te-IN' },
    { name: 'Google Indian English', lang: 'en-IN', default: true, localService: true, voiceURI: 'en-IN' },
  ]),
};

Object.defineProperty(window, 'speechSynthesis', { writable: true, value: mockSpeechSynthesis });
Object.defineProperty(window, 'SpeechSynthesisUtterance', { writable: true, value: MockSpeechSynthesisUtterance });
```

---

## 2. Test Suite Breakdown (468+ Tests)

| Test File | Test Suite Name | Tests | Tested Logic & Assertions |
|---|---|---|---|
| `src/lib/translations.test.ts` | Translation Key Parity | **426** | Verifies that all 5 languages (English, Hindi, Marathi, Bengali, Telugu) contain every single translation key without missing entries. |
| `src/lib/speech.test.ts` | Web Speech API Engine | **13** | Tests `normalizeLanguageKey`, `getLocaleForLanguage`, BCP-47 mappings (`hi-IN`, `mr-IN`, `bn-IN`, `te-IN`), prompt guidance lookups, and fallback behavior. |
| `src/lib/smsConfig.test.ts` | SMS Mode & Event Bus | **6** | Tests reading default env value, saving to `localStorage`, dispatching `quickhire:sms-config-changed` custom events, and toggle function. |
| `src/components/SmsAdminToggle.test.tsx` | Admin Badge Component | **3** | Tests rendering label `Live SMS: ON 🟢` vs `SMS Demo Mode ⚪`, click toggling, and callback invocation. |
| `src/components/BankDetailsTab.test.tsx` | Banking & IFSC Validation | **8** | Tests Indian IFSC regex (`^[A-Z]{4}0[A-Z0-9]{6}$`), UPI ID format checks, profile saving, and payment ledger rendering. |
| `src/components/Auth.test.tsx` | Dual Authentication & OTP | **12** | Tests phone number sanitization, Step 1 OTP generation, Demo Mode auto-fill button, Step 2 verification, email login toggle, and role selection. |

### Running the Test Suite:
```bash
npm test
```
Expected output:
```
Test Files  6 passed (6)
Tests       468 passed (468)
```

---

## 3. Known Technical Observations & Architectural Nuances

### 1. Deterministic Phone Credentials in Supabase Auth
- **Architecture:** Standard Supabase phone authentication requires activating an external SMS provider (e.g., Twilio/MessageBird) directly in the Supabase Dashboard, which adds setup barriers and monthly costs.
- **Solution:** QuickHire maps verified 10-digit phone numbers to deterministic internal credentials:
  - Email: `${cleanPhone}@quickhire.local`
  - Password: `QuickHire_Otp_${cleanPhone}_SecuredKey!2026`
- **Result:** Provides seamless native phone OTP verification via Fast2SMS while utilizing standard Supabase Auth sessions, JWTs, and Row-Level Security without paid Supabase SMS addons.

### 2. Fast2SMS Client-Side Fetch & CORS
- **Observation:** Fast2SMS Bulk V2 API is invoked directly from `src/components/Auth.tsx` via `fetch`. Fast2SMS responds with permissive CORS headers.
- **Resilience:** If network security policies or browser extensions block the external GET request, `Auth.tsx` gracefully catches the failure, displays the generated OTP in an on-screen alert card, and allows instant verification.
- **Demo Mode:** Switching to `SMS Demo Mode` completely bypasses external network calls, preserving Fast2SMS wallet credits while allowing full end-to-end user testing.

### 3. Client-Side State Router vs URL Routing
- **Observation:** QuickHire manages navigation through React state `activeTab` (`'home' | 'workers' | 'equipment' | 'post-job' | 'my-jobs' | 'dashboard' | 'bank' | 'safety'`) with Framer Motion transitions, rather than multi-page URL routing (`react-router-dom`).
- **Benefits:**
  - Zero risk of HTTP 404 errors on Vercel when refreshing deep links.
  - Instant tab transitions without page reloads.
  - Minimal bundle size.

### 4. Unicode NFC Normalization in Client Search
- **Observation:** Regional scripts (Hindi, Marathi, Bengali, Telugu) can be encoded in either Precomposed (NFC) or Decomposed (NFD) Unicode forms depending on mobile keyboard software (e.g., Gboard vs SwiftKey).
- **Solution:** Both search queries and stored skill arrays are normalized using `.normalize('NFC')` before string comparison in `WorkersTab.tsx`, `EquipmentRentalTab.tsx`, and `WorkerDiscoveryModal.tsx`.

### 5. Soft-Delete Account Deactivation
- **Observation:** Hard-deleting worker records (`DELETE FROM profiles WHERE id = ...`) would trigger foreign key cascade deletions, wiping out past jobs, application histories, and payment receipts.
- **Solution:** Deactivation sets `profiles.account_status = 'deactivated'` and `workers.is_available = false`. Logging back in with phone OTP automatically restores the profile to `'active'`.
