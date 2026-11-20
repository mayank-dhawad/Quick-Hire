# 05 — Features & Business Logic Specification

This document provides the exact implementation details, functions, database queries, and boundary logic for every functional feature in **QuickHire**.

---

## Feature 1: Dual-Mode Authentication (Mobile OTP & Email/Password)

### 1. Purpose & User Interaction
Allows rural workers to authenticate effortlessly using their 10-digit Indian mobile number (+91) via Fast2SMS OTP, while providing traditional Email/Password authentication for employers and administrators.

### 2. Relevant Files & Components
- `src/components/Auth.tsx`
- `src/lib/smsConfig.ts`
- `src/lib/supabase.ts`

### 3. Step-by-Step Logic Flow

#### A. Mobile OTP Flow:
1. User enters 10-digit phone number and selects role (`worker` or `employer`).
2. Input sanitization: `cleanPhone = phone.replace(/\D/g, '')`. Validates `cleanPhone.length === 10`.
3. 6-digit random OTP is generated: `Math.floor(100000 + Math.random() * 900000).toString()`.
4. Expiration timestamp set: `expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()`.
5. Existing OTPs for `cleanPhone` in Supabase `phone_otps` table are deleted, and new record is inserted:
   ```sql
   DELETE FROM public.phone_otps WHERE phone = '9822012345';
   INSERT INTO public.phone_otps (phone, otp, expires_at) VALUES ('9822012345', '482910', '...');
   ```
6. Also saved to `sessionStorage` under `quickhire_otp_<cleanPhone>` as an offline/network fallback.
7. **SMS Dispatch (Live vs Demo Mode):**
   - If `isLiveSmsEnabled()` is `true`: calls Fast2SMS API:
     ```
     GET https://www.fast2sms.com/dev/bulkV2?authorization=${FAST2SMS_API_KEY}&route=otp&variables_values=${generatedOtp}&numbers=${cleanPhone}
     ```
   - If `isLiveSmsEnabled()` is `false`: skips the HTTP call, saves OTP to database and session, and displays the OTP in an on-screen card with an **Auto-fill** button.
8. User inputs OTP and taps `Verify & Login`.
9. OTP is verified by matching against `phone_otps` (`phone = cleanPhone AND otp = cleanOtp AND expires_at > now()`). On match, the used OTP is deleted.
10. **Deterministic Supabase Auth Account Creation/Login:**
    - Maps `cleanPhone` deterministically to:
      - Email: `${cleanPhone}@quickhire.local`
      - Password: `QuickHire_Otp_${cleanPhone}_SecuredKey!2026`
    - Tries `supabase.auth.signInWithPassword`.
    - If user does not exist, calls `supabase.auth.signUp`.
11. Profile synchronization in `profiles` and `workers` table (auto-creates if missing, auto-restores if deactivated).

#### B. Email & Password Flow:
1. Validates standard email format and minimum 6-character password.
2. Toggles between `signInWithPassword` and `signUp`.
3. Calls `handleAuthSuccess` on successful authentication.

### 4. Edge Cases & Error Handling
- Invalid phone format (<10 digits) triggers localized voice prompt and error message.
- Expired or incorrect OTP displays `Invalid or expired OTP code. Please try again.`
- If Supabase Auth signup fails due to network or rate limits, fallback user session `usr_<cleanPhone>` is generated so the user is never blocked from using the platform.

---

## Feature 2: On-the-Fly SMS Mode Toggle & Wallet Credit Protection

### 1. Purpose & User Interaction
Prevents accidental depletion of live Fast2SMS account wallet credits during development, testing, and continuous demonstrations, while allowing instant activation of real SMS delivery with a single click.

### 2. Relevant Files & Components
- `src/lib/smsConfig.ts`
- `src/App.tsx` (`SmsAdminToggleBadge`)
- `src/components/Auth.tsx`

### 3. Business Logic
- **Storage Key:** `quickhire_live_sms_enabled` in `localStorage`.
- **Default State:** Controlled by `VITE_ENABLE_LIVE_SMS` in `.env`. Defaults to `true` if not set.
- **Event Bus:** Dispatches custom window event `quickhire:sms-config-changed` with `{ detail: { enabled } }` whenever toggled.
- **Cross-Tab Synchronization:** Listens to `window.addEventListener('storage', ...)` to sync toggle state across multi-tab sessions in real-time.
- **Demo Mode Behavior:**
  - Fast2SMS API call is omitted.
  - OTP is saved to database.
  - In `Auth.tsx`, state `demoOtpCode` is set to the generated OTP.
  - An amber on-screen card displays: `[SMS Demo Mode] Verification Code: <OTP>` with an **Auto-fill OTP** button that sets `otp` state and verifies in one tap.

---

## Feature 3: 5-Language Regional Multilingual Engine

### 1. Purpose & User Interaction
Delivers full localization across 5 Indian regional languages: English, हिन्दी (Hindi), मराठी (Marathi), বাংলা (Bengali), and తెలుగు (Telugu).

### 2. Relevant Files & Components
- `src/lib/translations.ts`
- `src/App.tsx`
- Navigation Bar Language Switcher

### 3. Business Logic
- **Key Parity:** 426 verified translation keys per language, tested for 100% dictionary completeness in `src/lib/translations.test.ts`.
- **Persistence:** Selected language is saved in `localStorage.getItem('quickhire_lang')`.
- **Language Switch Audio Confirmation:** Switching languages immediately triggers a spoken confirmation in that specific tongue (e.g., selecting Marathi speaks `मराठी भाषा निवडली आहे.` via the Web Speech API).
- **Fallback Hierarchy:**
  ```ts
  translations[currentLang]?.[key] || translations['English'][key] || key
  ```

---

## Feature 4: Web Speech API Audio Guidance Engine

### 1. Purpose & User Interaction
Provides audio assistance for semi-literate and visually impaired citizens by speaking form field instructions, job descriptions, worker credentials, and full-screen summaries aloud.

### 2. Relevant Files & Components
- `src/lib/speech.ts`
- `src/components/VoiceSpeakerButton.tsx`
- `src/components/AccessibleVoiceBar.tsx`

### 3. Business Logic
- **Browser Compatibility:** Uses standard `window.speechSynthesis` and `window.SpeechSynthesisUtterance`.
- **Locale Resolution Map:**
  - `English` -> `en-IN`
  - `हिंदी (Hindi)` -> `hi-IN`
  - `मराठी (Marathi)` -> `mr-IN`
  - `বাংলা (Bengali)` -> `bn-IN`
  - `తెలుగు (Telugu)` -> `te-IN`
- **Voice Selection:** Matches installed system voices matching target BCP-47 locale (e.g., `Google हिन्दी`, `Google Indian English`). Falls back to default device voice if regional voice is absent.
- **Adjustable Speech Rate:** Defaults to `0.95x` for field prompts, togglable between `0.7x` (slow) and `0.8x` in the floating `AccessibleVoiceBar`.
- **State Synchronization:** Global subscriber registry `subscribeToSpeech((text) => ...)` ensures all active speaker buttons display an animated pulsing sound wave while their specific text is being spoken, and reset when speaking finishes or is canceled.

---

## Feature 5: Rural Workforce Directory & Skill Search

### 1. Purpose & User Interaction
Enables employers, farmers, and contractors to browse and search verified rural workers by domain category and specific skills.

### 2. Relevant Files & Components
- `src/components/WorkersTab.tsx`
- `src/components/WorkerDiscoveryModal.tsx`

### 3. Business Logic & Database Queries
- Queries Supabase `workers` table joined with `profiles`:
  ```ts
  supabase
    .from('workers')
    .select(`
      id, category, skills, experience_years, average_rating, is_available,
      profiles ( id, full_name, phone_number, is_assisted_profile )
    `)
    .eq('is_available', true);
  ```
- **Unicode NFC Normalization Search:** Search query and worker skill strings are normalized using `normalize('NFC')` before matching:
  ```ts
  const q = searchQuery.toLowerCase().normalize('NFC').trim();
  const matchesSkill = worker.skills?.some(s => s.toLowerCase().normalize('NFC').includes(q));
  const matchesName = worker.profiles?.full_name?.toLowerCase().normalize('NFC').includes(q);
  ```
- Direct phone calling: Action button binds to `href="tel:${cleanPhone}"` for zero-friction mobile dialing.

---

## Feature 6: Assisted Worker Profiles & Account Deactivation

### 1. Purpose & User Interaction
Allows non-smartphone rural workers to be registered by literate intermediaries or family members. Also provides a legally compliant, data-retentive account soft-deletion mechanism.

### 2. Relevant Files & Components
- `src/components/WorkerProfileModal.tsx`
- Supabase migrations `20261019000000_add_account_status_to_profiles.sql`

### 3. Business Logic
- **Assisted Profile Flag:** Sets `is_assisted_profile: true` and `created_by: auth.uid()` in `profiles`.
- **Category Skill Chips:** Suggests pre-translated common skills (e.g., `Harvesting`, `Tractor Driver`, `Mason`, `Plumbing`) that can be tapped to append to `skillsInput`.
- **Soft Deactivation Flow:**
  - When user taps `Deactivate My Profile` and confirms:
    ```sql
    UPDATE public.profiles SET account_status = 'deactivated' WHERE id = auth.uid();
    UPDATE public.workers SET is_available = false WHERE id = auth.uid();
    ```
  - Logs out the user session.
  - **Preservation:** Historical records in `jobs`, `job_records`, and `payments` remain intact.
  - **Auto-Restoration:** If the user logs in again using their phone OTP, `Auth.tsx` detects `account_status === 'deactivated'` and automatically resets it to `'active'`, making the worker profile available again.

---

## Feature 7: Agricultural Equipment & Machinery Sharing

### 1. Purpose & User Interaction
A rural peer-to-peer machinery sharing portal where equipment owners list tractors, sprayers, and mixers, and farmers rent them at fixed daily rates with zero platform fees.

### 2. Relevant Files & Components
- `src/components/EquipmentRentalTab.tsx`
- `src/components/PostEquipmentModal.tsx`

### 3. Business Logic
- **Preloaded Datasets:** Includes initial high-demand machinery (Mahindra 575 DI Tractor with Rotavator, 500L Orchard Power Sprayer, 1-Bag Concrete Mixer, Plate Compactor, Hydraulic Pallet Jack, 250A Welding Machine, Rotary Hammer Demolition Breaker).
- **Posting Workflow:**
  - Owner enters Title, Category, Daily Rent (preset chips ₹400 to ₹2000), Refundable Deposit, Location, and Description.
  - Inserts into `public.equipment`:
    ```sql
    INSERT INTO public.equipment (owner_id, title, category, daily_rent, deposit_required, location, status)
    VALUES (auth.uid(), 'Mahindra Tractor', 'Agriculture', 1800, 2000, 'Rampur Village', 'available');
    ```
- Rent payment can be directly initiated via `DirectPaymentModal`.

---

## Feature 8: Employer Job Posting & Applicant Tracking Dashboard

### 1. Purpose & User Interaction
Allows farmers and contractors to broadcast labour requirements and track applicants.

### 2. Relevant Files & Components
- `src/components/PostJobTab.tsx`
- `src/components/DashboardTab.tsx`

### 3. Business Logic
- **Posting:** Employer specifies Title, Category, Worker Count, Required Skills, Offered Daily Wage, Location, and Description.
  - Inserts into `public.jobs` with `status: 'open'`.
- **Worker Application:** Workers tap `I'm Interested`, creating a record in `public.job_records` with `status: 'contacted'`.
- **Dashboard Management:**
  - Displays jobs posted by the logged-in employer with count of applicants.
  - Direct call button to contact each applicant.
  - `Mark as Completed` updates job status: `UPDATE public.jobs SET status = 'completed' WHERE id = jobId`.
  - `Pay Wage Direct` launches `DirectPaymentModal` with pre-filled worker details and wage amount.

---

## Feature 9: 0% Commission Direct Wage & Rental Settlement (DBT)

### 1. Purpose & User Interaction
Facilitates direct-to-bank and UPI wage transfers without intermediary cuts, logging receipts into a self-service passbook ledger.

### 2. Relevant Files & Components
- `src/components/BankDetailsTab.tsx`
- `src/components/DirectPaymentModal.tsx`

### 3. Business Logic
- **Bank Profile Verification:**
  - IFSC Code validated using strict RBI regex: `/^[A-Z]{4}0[A-Z0-9]{6}$/`.
  - UPI ID validated: must contain `@` with valid domain suffix.
  - Saved to `profiles`: `bank_name`, `bank_account_no`, `bank_ifsc`, `upi_id`.
- **Direct Settlement Modal:**
  - **Direct UPI Tab:** Displays recipient's UPI ID, QR launch link, and copy button.
  - **Net Banking Tab:** Displays recipient's Bank Account No and IFSC code, with one-tap launch links to major bank retail portals (SBI, BOB, PNB, HDFC, ICICI, Canara Bank).
- **Settlement Logging:**
  - Payer logs settlement amount, payment method, and bank transaction reference (UTR).
  - Inserts into `public.payments`:
    ```sql
    INSERT INTO public.payments (payer_id, payee_id, payment_for_type, amount, payment_method, transaction_ref, status)
    VALUES (payer_id, payee_id, 'worker_wage', 600, 'Direct UPI', 'UPI202610221234', 'completed');
    ```
  - Payment record instantly renders in the user's Passbook / Payment Ledger.

---

## Feature 10: Community Trust & Emergency Safety Directory (SOS)

### 1. Purpose & User Interaction
Provides immediate, one-tap mobile phone dialing to India's national emergency services and labour welfare hotlines.

### 2. Relevant Files & Components
- `src/components/SafetyTab.tsx`

### 3. Business Logic & Directory Numbers
- All helpline cards feature direct `href="tel:<number>"` anchors:
  - **112:** National All-in-One Emergency Services (Police, Fire, Disaster).
  - **108:** Medical Ambulance & Rural Health SOS.
  - **1800-180-1551:** Kisan Call Center (Agronomy advisory, crop damage, seed support).
  - **14434:** National Labour Welfare Helpline (Wage rights, working condition grievances).
  - **1091:** Women Safety & Rural Helpline.
