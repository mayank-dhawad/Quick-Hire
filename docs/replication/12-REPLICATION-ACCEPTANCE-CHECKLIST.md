# 12 — Replication Acceptance Checklist

Use this checklist to independently verify that a newly recreated QuickHire project matches the original implementation across all dimensions.

---

## 1. Automated Test Suite Matrix

Execute `npm test` in the project root:

- [ ] **Suite 1: `src/lib/translations.test.ts`**
  - **Expected Result:** 426 tests pass.
  - **Verification:** All 5 languages (English, Hindi, Marathi, Bengali, Telugu) share 100% key parity with zero undefined keys.
- [ ] **Suite 2: `src/lib/speech.test.ts`**
  - **Expected Result:** 13 tests pass.
  - **Verification:** Language normalization, BCP-47 locale resolution (`hi-IN`, `mr-IN`, etc.), prompt dictionary lookups, and speech rate boundaries.
- [ ] **Suite 3: `src/lib/smsConfig.test.ts`**
  - **Expected Result:** 6 tests pass.
  - **Verification:** Environment default fallback, `localStorage` read/write, custom window event `quickhire:sms-config-changed` dispatch.
- [ ] **Suite 4: `src/components/SmsAdminToggle.test.tsx`**
  - **Expected Result:** 3 tests pass.
  - **Verification:** Badge renders `Live SMS: ON 🟢` vs `SMS Demo Mode ⚪`, clicks trigger mode toggle, and fires callback.
- [ ] **Suite 5: `src/components/BankDetailsTab.test.tsx`**
  - **Expected Result:** 8 tests pass.
  - **Verification:** Strict Indian IFSC regex check (`^[A-Z]{4}0[A-Z0-9]{6}$`), UPI ID validation, profile updates, and payment ledger rendering.
- [ ] **Suite 6: `src/components/Auth.test.tsx`**
  - **Expected Result:** 12 tests pass.
  - **Verification:** 10-digit phone sanitization, Step 1 OTP generation, Demo Mode auto-fill button, Step 2 verification, email login toggle.
- [ ] **Total Assertion Count:** Minimum 468 passed tests across 6 test files.

---

## 2. Compilation, Linting & Build Verification

- [ ] **TypeScript Typecheck:** `npm run typecheck` completes with `exit code 0` and zero diagnostics.
- [ ] **ESLint Check:** `npm run lint` completes with zero blocking errors.
- [ ] **Production Build:** `npm run build` generates `/dist` directory containing:
  - `dist/index.html`
  - `dist/assets/*.js`
  - `dist/assets/*.css`
  - Build bundle completes in `< 10s` with no missing chunk warnings.

---

## 3. UI, Typography & Visual Polish Checklist

- [ ] **Google Fonts Loading:** DM Sans and Manrope load properly without fallback serif flashing.
- [ ] **Tailwind Tokens:** Primary brand colors render emerald green (`#007a5b`), surface renders `#fbfcf8`, and dark ink text renders `#18201b`.
- [ ] **GIGW Accessibility Strip:**
  - Clicking `A-` sets normal font size.
  - Clicking `A` zooms base font size.
  - Clicking `A+` zooms to maximum accessibility font size.
- [ ] **Framer Motion Micro-Interactions:**
  - Switching tabs smoothly fades and slides content (`initial={{ opacity: 0, y: 10 }}`).
  - Modals animate in with backdrop blur (`backdrop-blur-md`).
- [ ] **Scrollbar Suppression:** Elements with `.no-scrollbar` scroll cleanly without visible scrollbars on Chrome, Firefox, and Safari.

---

## 4. Multilingual & Audio Guidance Checklist

- [ ] **Language Switching:**
  - Selecting `हिंदी (Hindi)` changes all tab titles, hero banners, and button text to Hindi.
  - Selecting `मराठी (Marathi)` updates interface to Marathi.
  - Selecting `বাংলা (Bengali)` updates interface to Bengali.
  - Selecting `తెలుగు (Telugu)` updates interface to Telugu.
- [ ] **Audio Speech Confirmation:** Switching language triggers an immediate spoken confirmation via the browser Web Speech API in that language.
- [ ] **Field-Level Speaker Buttons (`VoiceSpeakerButton`):**
  - Tapping speaker button next to any input plays localized voice instructions.
  - Button changes from emerald to amber with an animated pulsing sound wave while speaking.
  - Tapping an active button immediately stops audio playback.
- [ ] **Floating Audio Companion (`AccessibleVoiceBar`):**
  - Present in bottom-right corner across all tabs.
  - Collapses/expands with chevron button.
  - Speed toggle switches between `0.7x 🐢` and `0.8x 🐇`.
  - Tapping "Read Screen Aloud" summarizes the currently active tab.

---

## 5. Dual Authentication & Fast2SMS Gateway Checklist

- [ ] **Live SMS Mode:**
  - Floating badge displays `Live SMS: ON 🟢` with a pulsing green indicator.
  - Entering a 10-digit phone number dispatches a real SMS via Fast2SMS and transitions to Step 2.
- [ ] **SMS Demo Mode:**
  - Tapping the badge switches to `SMS Demo Mode ⚪`.
  - Entering a 10-digit number displays an on-screen alert card with the 6-digit OTP code.
  - Tapping **Auto-fill OTP** immediately fills the input and verifies the account.
- [ ] **Email & Password Mode:**
  - Switching to Email tab renders email and password fields with Sign In / Sign Up toggle.
- [ ] **Account Restoration on Login:**
  - Logging in with an account previously marked `'deactivated'` automatically resets `account_status` to `'active'` and restores directory visibility.

---

## 6. Workforce Directory & Discovery Checklist

- [ ] **Worker Grid:** Verified worker cards show full name, category badge, rating star, and skill chips.
- [ ] **Unicode NFC Search:** Searching in Hindi/Marathi (e.g., `ट्रैक्टर`) or English (e.g., `Tractor`) correctly filters results.
- [ ] **Direct Phone Call Button:** Tapping "Call Worker" initiates a `tel:` link to the worker's mobile number.
- [ ] **Direct Payment Button:** Tapping "Pay Direct" opens `DirectPaymentModal` with the worker's ID and name pre-filled.
- [ ] **Worker Profile Modal:**
  - Editing skills and tapping localized chips appends them to the input.
  - Tapping "Deactivate My Profile" prompts for confirmation, soft-deactivates the account, and logs out.

---

## 7. Agricultural Equipment Sharing Checklist

- [ ] **Rental Grid:** Displays tractors, sprayers, concrete mixers, and pallet jacks.
- [ ] **Presets:** Daily rental rate and refundable deposit displayed in bold rupees.
- [ ] **Posting Modal:**
  - Allows listing new equipment with category, daily rent, deposit, location, and owner phone.
  - Rental presets (₹400, ₹500, ₹650, etc.) quickly populate the rent input.
- [ ] **Direct Pay Rent:** Launches `DirectPaymentModal` with machinery owner details and rental fee.

---

## 8. Employer Job Posting & Dashboard Checklist

- [ ] **Post a Job Form:**
  - Form validates required fields (Title, Category, Workers Count, Skills, Offered Wage, Location).
  - Tapping suggested skill tags automatically adds them as chips.
  - Submitting inserts record into Supabase `jobs` table with `status: 'open'`.
- [ ] **Employer Dashboard:**
  - Lists all jobs posted by the logged-in employer.
  - Displays count of interested applicants.
  - Action "Mark as Completed" updates job status to `'completed'`.

---

## 9. Bank & Payouts (DBT) & Direct Settlement Checklist

- [ ] **Bank Profile Validation:**
  - Entering an invalid IFSC (e.g., `INVALID123`) displays an error.
  - Entering a valid 11-char IFSC (e.g., `SBIN0001234`) passes validation.
  - Saving updates `profiles` table.
- [ ] **Direct Payment Modal:**
  - Tapping "Copy" next to UPI ID or Account Number copies to clipboard with "Copied!" feedback.
  - Net Banking tab provides clickable links to SBI, BOB, PNB, HDFC, ICICI, and Canara Bank.
  - Recording settlement adds an entry to `public.payments` and updates the Passbook ledger.

---

## 10. Safety & Emergency Helplines Checklist

- [ ] **Emergency Hotlines:**
  - Card `112` has clickable link `tel:112`.
  - Card `108` has clickable link `tel:108`.
  - Kisan Call Center card has clickable link `tel:18001801551`.
  - National Labour Helpline has clickable link `tel:14434`.
  - Women Safety card has clickable link `tel:1091`.
