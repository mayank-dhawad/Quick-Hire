# 01 — Project Overview & Purpose

## 1. Project Identity & Mission

**QuickHire** is an operational, open Digital Public Infrastructure (DPI) web application engineered to bridge the digital and economic divide for rural workers, agricultural laborers, smallholder farmers, and rural contractors across India.

- **Primary Goal:** Eliminate predatory labour brokers and middleman commission fees by facilitating direct phone calling (`tel:`) and direct-to-bank wage settlements between employers and workers with zero platform deduction.
- **Operating Philosophy:** 0% commission, maximum accessibility (5 Indian regional languages, text-to-speech audio guidance, font scaling), mobile-first responsiveness, and resilient dual authentication (SMS OTP and Email).

---

## 2. Problems Solved

| Problem in Rural Labor Ecosystem | QuickHire DPI Solution |
|---|---|
| **Labour Middleman Cuts (20%–30% wage loss)** | Employers call workers directly on mobile; wages are paid 100% directly via cash, UPI, or IMPS/NEFT bank transfer without platform cuts. |
| **Literacy & Smartphone Barriers** | 5-language voice companion (`AccessibleVoiceBar`) reads any screen aloud. Every critical form input has a speaker icon (`VoiceSpeakerButton`). "Assisted Profiles" allow village leaders or relatives to register workers without smartphones. |
| **Idle Machinery & Expensive Mechanization** | Agricultural equipment rental tab allows tractor, power sprayer, and concrete mixer owners to rent out idle machinery to local smallholders with transparent daily rates and deposits. |
| **Payment Delays & Dispute Risk** | Built-in Bank Details tab with direct IFSC/UPI verification, direct bank portal launch links, and a self-service settlement passbook/ledger. |
| **Worker Safety & Legal Vulnerability** | Dedicated Safety & SOS tab with one-tap dialing to national emergency helplines (112, 108, 1800-180-1551 Kisan Call Center, 14434 Labour Helpline, 1091 Women Safety). |

---

## 3. Target User Personas & Main Use Cases

### Persona A: Rural Worker / Agricultural Laborer
- **Profiles:** Harvesters, tractor operators, crop sowers, masons, loaders, carpenters, plumbers, borewell mechanics.
- **Needs:** Discover reliable local daily work; receive fair market wages on the day of completion; maintain a verifiable profile even if lacking a smartphone.
- **Primary Flows:** Listen to job listings via voice helper; tap "I'm Interested"; receive calls directly from employers; maintain bank account/UPI ID in the passbook for DBT.

### Persona B: Employer / Farmer / Rural Contractor
- **Profiles:** Orchard owners, grain farmers during harvest season, residential masonry contractors, godown/warehouse managers.
- **Needs:** Quickly mobilize 2 to 20 workers for immediate field operations; hire specialized machinery (tractors with rotavator, power sprayers, concrete mixers); verify skill experience and ratings.
- **Primary Flows:** Search workers by skill (e.g., "Tractor Driver", "राजमिस्त्री"); tap to call worker directly; post a free job listing specifying required workers and offered daily wage; track applicants in the employer dashboard; record direct wage payments.

### Persona C: Equipment Owner / Rural Entrepreneur
- **Profiles:** Farmers with tractors, fabrication workshop owners, building equipment rental providers.
- **Needs:** Monetize idle machinery between seasonal cycles; list equipment with transparent daily rental rates and refundable security deposits.
- **Primary Flows:** List machinery in the Equipment Rental portal; receive rental requests; settle rental payments directly.

### Persona D: Village Intermediary / Common Service Center (CSC) Operator
- **Profiles:** Gram panchayat computer operators, literate youth, family members.
- **Needs:** Onboard non-smartphone villagers onto the formal rural digital workforce.
- **Primary Flows:** Register "Assisted Profiles" with verified phone numbers on behalf of senior or non-digital laborers.

---

## 4. Implemented Feature Inventory (Verified)

Every feature listed below has been verified in source code and unit tests:

1. **Dual Authentication System (`Auth.tsx`):**
   - **Mobile OTP (+91):** Clean 10-digit validation, 6-digit random OTP generation, Supabase `phone_otps` storage, Fast2SMS API dispatch, deterministic credentials mapping (`<clean_phone>@quickhire.local`).
   - **Email & Password:** Standard login and signup tab with role selection (`worker` or `employer`).
   - **Soft-Delete Recovery:** If an account was previously deactivated, logging in automatically restores `account_status: 'active'`.
2. **On-the-Fly SMS Mode Toggle (`SmsAdminToggleBadge`, `smsConfig.ts`):**
   - Floating badge (`Live SMS: ON 🟢` vs `SMS Demo Mode ⚪`) with cross-tab persistence via `localStorage` and custom window event bus.
   - In Demo Mode, external HTTP calls to Fast2SMS are skipped to conserve wallet credits; an on-screen OTP card with a 1-click **Auto-fill** button is displayed.
3. **5-Language Regional Localization (`translations.ts`):**
   - English, हिन्दी (Hindi), मराठी (Marathi), বাংলা (Bengali), and తెలుగు (Telugu).
   - Instant language switching across all navigation tabs, hero banners, badges, form labels, and modals.
   - Immediate audio speech confirmation when a language is selected.
4. **Web Speech API Voice Companion (`speech.ts`, `AccessibleVoiceBar.tsx`, `VoiceSpeakerButton.tsx`):**
   - Floating screen reader companion with expandable rate toggle (`0.7x 🐢` / `0.8x 🐇`) and "Read Screen Aloud" button.
   - Field-level audio guidance buttons on input fields, job cards, worker cards, and advisory banners.
5. **GIGW Accessibility Compliance Strip:**
   - Multi-level font zoom controls (`A-` normal, `A` large, `A+` larger) dynamically modifying root typography classes.
   - High-contrast visual borders and skip-to-content friendly structure.
6. **Rural Workforce Directory (`WorkersTab.tsx`):**
   - Categorized directory: Agriculture, Construction, Daily work, Skilled self-employed.
   - Skill-based keyword search with Unicode NFC normalization.
   - Worker cards showing verified skill chips, years of experience, ratings, and direct `tel:` call button.
7. **Interactive Worker Discovery Modal (`WorkerDiscoveryModal.tsx`):**
   - Quick modal overlay accessible from category cards with live category filter chips and skill query input.
8. **Worker Profile Management & Soft Deactivation (`WorkerProfileModal.tsx`):**
   - Editable profile details (full name, phone, village/location, domain, experience years, assisted flag).
   - Category-specific localized skill suggestions with single-click chip addition.
   - Compliant soft-delete account deactivation setting `account_status: 'deactivated'` and `is_available: false` while preserving past job records and payment histories.
9. **Agricultural Equipment & Machinery Rental Portal (`EquipmentRentalTab.tsx`, `PostEquipmentModal.tsx`):**
   - Marketplace for tractors with rotavators, orchard sprayers, concrete mixers, earth compactors, and welding sets.
   - Pre-populated rental presets (₹400, ₹500, ₹650, ₹800, ₹1000, ₹1500, ₹2000).
   - Listing creation workflow with title, category, daily rent, deposit, location, and owner phone.
10. **Employer Job Posting & Management (`PostJobTab.tsx`, `DashboardTab.tsx`):**
    - Job creation form with title, category, required worker count, skill tags, daily wage, location, and instructions.
    - Employer dashboard showing active postings, count of interested workers, direct applicant calling, and "Mark Completed" state transitions.
11. **Direct Wage & Machine Rental Settlement (`BankDetailsTab.tsx`, `DirectPaymentModal.tsx`):**
    - Bank details management with Indian IFSC regex validation (`^[A-Z]{4}0[A-Z0-9]{6}$`) and UPI ID validation.
    - 0% commission direct settlement modal with tabs for Direct UPI and Net Banking (deep links to SBI, BOB, PNB, HDFC, ICICI, Canara Bank).
    - Passbook / Payment Ledger tracking payments with filters (`All`, `Received`, `Sent`) and search.
12. **Community Trust & Safety SOS Tab (`SafetyTab.tsx`):**
    - Emergency helpline directory with direct `tel:` triggers: 112 (All-in-One), 108 (Ambulance), 1800-180-1551 (Kisan Call Center), 14434 (Labour Helpline), 1091 (Women Safety).
    - Transparent workplace safety and fair wage guidelines.

---

## 5. End-to-End User Journey

```
[ Citizen visits QuickHire ]
           │
           ├─► Reads/Listens to Citizen Advisory Bar & Hero Banner
           ├─► Adjusts Language (English / Hindi / Marathi / Bengali / Telugu)
           ├─► Adjusts Accessibility Zoom (A- / A / A+)
           │
     ┌─────┴───────────────────────────────────────────────────────┐
     ▼                                                             ▼
[ WORKER FLOW ]                                            [ EMPLOYER FLOW ]
1. Tap "Register as Worker"                               1. Tap "Find Workers" or "Post a Job"
2. Authenticate via Mobile OTP (+91)                      2. Authenticate via Mobile OTP or Email
3. Fill Skill Profile:                                    3. Browse Workers:
   - Select Domain (e.g. Agriculture)                        - Filter by Domain (e.g. Construction)
   - Add localized chips (e.g. "Harvesting")                 - Tap "Call Worker" (tel: direct)
   - Enter village location                               4. Or Post a Job Listing:
4. Profile is immediately published to directory             - Set daily wage (e.g. ₹600/day)
5. Tap "Bank & Payouts" to save IFSC & UPI ID                - Set worker count needed
6. Receive direct calls from local employers              5. Track applicants in "My Dashboard"
7. Work completion -> Direct payment logged in passbook   6. Tap "Pay Wage" -> Direct UPI/Net Banking
```

---

## 6. Implementation Status Matrix

| Component / Feature | Implementation State | Verification Evidence |
|---|---|---|
| Dual Mobile + Email Auth | **Complete** | `src/components/Auth.tsx`, `Auth.test.tsx` (12 tests) |
| Fast2SMS OTP Dispatch | **Complete** | Integrated with Bulk V2 API + DB fallback |
| SMS Demo Mode & On-Screen OTP | **Complete** | `src/lib/smsConfig.ts`, `SmsAdminToggle.test.tsx` (3 tests) |
| 5-Language Multilingual Dictionary | **Complete** | `src/lib/translations.ts`, `translations.test.ts` (426 tests) |
| Web Speech Audio Guidance | **Complete** | `src/lib/speech.ts`, `speech.test.ts` (13 tests) |
| Floating Voice Helper Companion | **Complete** | `src/components/AccessibleVoiceBar.tsx` |
| GIGW Font Zooming (A- / A / A+) | **Complete** | `src/App.tsx` state `fontSizeZoom` |
| Worker Directory & Skill Filter | **Complete** | `src/components/WorkersTab.tsx` with NFC search |
| Worker Profile & Soft Deactivate | **Complete** | `src/components/WorkerProfileModal.tsx` |
| Equipment Rental Portal | **Complete** | `src/components/EquipmentRentalTab.tsx` + initial dataset |
| Post Job & Employer Dashboard | **Complete** | `src/components/PostJobTab.tsx`, `DashboardTab.tsx` |
| Bank Details & Passbook Ledger | **Complete** | `src/components/BankDetailsTab.tsx`, `BankDetailsTab.test.tsx` |
| Direct 0% Commission Payment Modal | **Complete** | `src/components/DirectPaymentModal.tsx` |
| Safety & SOS Emergency Helplines | **Complete** | `src/components/SafetyTab.tsx` |
| Supabase PostgreSQL Schema | **Complete** | 5 migrations in `supabase/migrations/` |
| Automated Vitest Test Suite | **Complete** | 6 test suites, 468 passed automated tests |
