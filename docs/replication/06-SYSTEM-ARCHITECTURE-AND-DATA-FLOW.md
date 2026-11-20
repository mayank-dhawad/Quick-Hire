# 06 — System Architecture & Data Flows

## 1. High-Level System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT WEB BROWSER                                   │
│                                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                                QUICKHIRE REACT SPA                               │  │
│  │                                                                                  │  │
│  │  ┌─────────────────────────────┐   ┌──────────────────────────────────────────┐  │  │
│  │  │    GLOBAL APPLICATION CORE  │   │          ACCESSIBILITY & SPEECH          │  │  │
│  │  │  • App.tsx (Main Shell)     │   │  • AccessibleVoiceBar (Screen Reader)    │  │  │
│  │  │  • Router & Tab State       │   │  • VoiceSpeakerButton (Field Guidance)   │  │  │
│  │  │  • GIGW Zoom Controller     │   │  • Web Speech API (speechSynthesis)      │  │  │
│  │  │  • SmsAdminToggleBadge      │   │  • translations.ts (5-Language Dict)     │  │  │
│  │  └──────────────┬──────────────┘   └────────────────────┬─────────────────────┘  │  │
│  │                 │                                       │                        │  │
│  │  ┌──────────────┴───────────────────────────────────────┴─────────────────────┐  │  │
│  │  │                          FEATURE TABS & MODALS                             │  │  │
│  │  │  • HomeTab               • PostJobTab             • DirectPaymentModal     │  │  │
│  │  │  • WorkersTab            • DashboardTab           • WorkerProfileModal     │  │  │
│  │  │  • EquipmentRentalTab    • BankDetailsTab         • PostEquipmentModal     │  │  │
│  │  │  • SafetyTab             • Auth (Dual Mode)       • WorkerDiscoveryModal   │  │  │
│  │  └──────────────┬───────────────────────────────────────┬─────────────────────┘  │  │
│  │                 │                                       │                        │  │
│  │  ┌──────────────┴──────────────┐   ┌────────────────────┴─────────────────────┐  │  │
│  │  │   LOCAL STORAGE / SESSION   │   │       SUPABASE JS CLIENT (supabase.ts)   │  │  │
│  │  │  • quickhire_lang           │   │  • Auth Sessions & Session Management    │  │  │
│  │  │  • quickhire_live_sms_state │   │  • Typed Queries (database.types.ts)     │  │  │
│  │  │  • quickhire_otp_<phone>    │   │  • Row-Level Security Enforced Requests  │  │  │
│  │  └─────────────────────────────┘   └────────────────────┬─────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┼────────────────────────┘  │
└────────────────────────────────────────────────────────────┼───────────────────────────┘
                                                             │
                    ┌────────────────────────────────────────┼────────────────────────┐
                    │ HTTPS / REST / WSS                     │ HTTPS GET Request      │
                    ▼                                        ▼                        │
┌───────────────────────────────────────┐   ┌─────────────────────────────────────────┼──┐
│             SUPABASE CLOUD            │   │              FAST2SMS GATEWAY           │  │
│                                       │   │                                         │  │
│  ┌─────────────────────────────────┐  │   │  • Endpoint:                            │  │
│  │          SUPABASE AUTH          │  │   │    https://www.fast2sms.com/dev/bulkV2  │  │
│  │  • Phone deterministic accounts │  │   │  • Route: otp                           │  │
│  │    (<phone>@quickhire.local)    │  │   │  • Params:                              │  │
│  │  • Email/Password accounts      │  │   │    authorization, variables_values,     │  │
│  └────────────────┬────────────────┘  │   │    numbers                              │  │
│                   │                   │   └─────────────────────────────────────────┼──┘
│  ┌────────────────┴────────────────┐  │                                             │
│  │      POSTGRESQL DATABASE (15+)  │  │                                             │
│  │  • profiles      • equipment    │  │                                             │
│  │  • workers       • payments     │  │                                             │
│  │  • jobs          • reviews      │  │                                             │
│  │  • job_records   • notifications│  │                                             │
│  │  • phone_otps    • interest     │  │                                             │
│  │  (Protected by Postgres RLS)    │  │                                             │
│  └─────────────────────────────────┘  │                                             │
└───────────────────────────────────────┘                                             │
                                                                                      │
┌─────────────────────────────────────────────────────────────────────────────────────┼──┐
│                                DEPLOYMENT INFRASTRUCTURE                             │  │
│                                                                                      │  │
│  ┌───────────────────────────────────┐    ┌─────────────────────────────────────────┐│  │
│  │         GITHUB REPOSITORY         │    │             VERCEL PLATFORM             ││  │
│  │  • github.com/mayank-dhawad/      │───►│  • Production Host                      ││  │
│  │    Quick-Hire.git (main branch)   │    │  • URL: quick-hire-khaki.vercel.app     ││  │
│  │  • Automated Deployment Webhook   │    │  • Static Asset CDN & Edge Cache        ││  │
│  └───────────────────────────────────┘    └─────────────────────────────────────────┘│  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Hierarchy Tree

```
<App> (src/App.tsx)
 │
 ├── <SmsAdminToggleBadge> (Header floating status pill)
 ├── <AccessibleVoiceBar> (Bottom-right floating screen reader companion)
 ├── <ToastContainer> (Floating feedback toasts)
 │
 ├── [ Navigation Bar ]
 │    ├── [ Language Dropdown Switcher ]
 │    ├── [ Tab Pills Bar ]
 │    └── [ Auth / Profile Avatar Button ]
 │
 ├── <Suspense fallback={<TabLoadingSkeleton />}>
 │    │
 │    ├── <HomeTab> (activeTab === 'home')
 │    │    ├── <VoiceSpeakerButton> (Citizen Advisory Marquee)
 │    │    ├── [ Hero Section with CTAs ]
 │    │    ├── [ Trust Statistics Strip ]
 │    │    ├── [ Work Domain Category Cards ]
 │    │    ├── [ How It Works 3-Step Guide ]
 │    │    └── [ Recent Jobs Spotlight Grid ]
 │    │
 │    ├── <WorkersTab> (activeTab === 'workers')
 │    │    ├── [ Category Selector & Search Input ]
 │    │    └── [ Worker Cards Grid with Call & Pay Buttons ]
 │    │
 │    ├── <EquipmentRentalTab> (activeTab === 'equipment')
 │    │    ├── [ Category Filter Chips & Search Bar ]
 │    │    └── [ Machinery Rental Cards Grid with Direct Pay ]
 │    │
 │    ├── <PostJobTab> (activeTab === 'post-job')
 │    │    └── [ Employer Job Creation Form with Audio Guidance ]
 │    │
 │    ├── <DashboardTab> (activeTab === 'dashboard')
 │    │    └── [ Employer Posted Jobs & Worker Applicant Tracker ]
 │    │
 │    ├── <BankDetailsTab> (activeTab === 'bank')
 │    │    ├── [ Bank & UPI Account Settings with Regex Validation ]
 │    │    └── [ Passbook & Direct Wage Settlement Ledger ]
 │    │
 │    └── <SafetyTab> (activeTab === 'safety')
 │         ├── [ 24x7 Emergency Helplines (112, 108, Kisan Call Center) ]
 │         └── [ Labour Safety & Fair Wage Standards ]
 │
 └── [ Modals ]
      ├── <Auth> (Dual phone OTP & email login)
      ├── <WorkerProfileModal> (Profile editor, skills chip-picker, soft deactivation)
      ├── <WorkerDiscoveryModal> (Category modal explorer)
      ├── <PostEquipmentModal> (Tool & machinery listing form)
      └── <DirectPaymentModal> (0% commission wage & rental settlement)
```

---

## 3. End-to-End Sequence Data Flows

### Flow 1: Mobile Phone OTP Authentication & Fast2SMS Dispatch

```
Citizen/User             QuickHire SPA (Auth.tsx)           Fast2SMS API           Supabase DB
    │                               │                             │                     │
    │── 1. Enter 10-digit mobile ──►│                             │                     │
    │   and tap "Send Code"         │                             │                     │
    │                               │── 2. Validate clean 10-digit│                     │
    │                               │   generate 6-digit OTP code │                     │
    │                               │                             │                     │
    │                               │── 3. Store in phone_otps ────────────────────────►│
    │                               │   (and sessionStorage)      │                     │
    │                               │                             │                     │
    │                               │── 4. Check SMS Mode Toggle  │                     │
    │                               │                             │                     │
    │                               │── 5. IF Live SMS is ON:     │                     │
    │                               │      Dispatch HTTP GET ────►│                     │
    │                               │      (Fast2SMS bulkV2 API)  │                     │
    │                               │◄───── Response (200 OK) ────│                     │
    │                               │                             │                     │
    │                               │── 6. IF SMS Demo Mode:      │                     │
    │                               │      Skip external call,    │                     │
    │                               │      render OTP Card        │                     │
    │                               │                             │                     │
    │◄── 7. Display Step 2 ─────────│                             │                     │
    │    (Enter 6-digit OTP)        │                             │                     │
    │                               │                             │                     │
    │── 8. Enter OTP & Submit ─────►│                             │                     │
    │                               │── 9. Verify OTP from phone_otps ─────────────────►│
    │                               │◄───── Valid OTP Record ───────────────────────────│
    │                               │                                                   │
    │                               │── 10. Authenticate via Supabase Auth:             │
    │                               │       Deterministic: <phone>@quickhire.local ────►│
    │                               │                                                   │
    │                               │── 11. Sync profile & restore if deactivated ─────►│
    │◄── 12. Authenticated Session ─│                                                   │
```

### Flow 2: Direct 0% Commission Wage Settlement & Passbook Logging

```
Employer                    DirectPaymentModal.tsx         Net Banking / UPI         Supabase DB
    │                                  │                           │                      │
    │── 1. Tap "Pay Wage Direct" ─────►│                           │                      │
    │   from Worker Card or Dashboard  │                           │                      │
    │                                  │── 2. Fetch Payee Bank/UPI details ──────────────►│
    │                                  │◄───── Return Bank Account, IFSC, UPI ID ─────────│
    │                                  │                                                  │
    │◄── 3. Display Payee Details ─────│                                                  │
    │    (Account No, IFSC, UPI ID)    │                                                  │
    │                                  │                                                  │
    │── 4. Tap "Launch Bank Portal" ──►│── 5. Open Bank URL ──────►│                      │
    │   or copy details                │    (e.g. retail.onlinesbi)│                      │
    │                                  │                           │                      │
    │── 6. Settle payment directly in banking portal / UPI app ───►│                      │
    │                                  │                           │                      │
    │── 7. Enter Transaction Ref (UTR) │                           │                      │
    │   and tap "Record Settlement" ──►│                                                  │
    │                                  │── 8. INSERT into payments table ────────────────►│
    │                                  │      (payer_id, payee_id, amount, UTR)           │
    │                                  │                                                  │
    │◄── 9. Confirmation & Toast ──────│◄───── Acknowledged ──────────────────────────────│
    │    Passbook Ledger updated       │                                                  │
```

### Flow 3: Multilingual Voice Guidance & Screen Reader Engine

```
Citizen/User              AccessibleVoiceBar / SpeakerButton              Web Speech API
    │                                     │                                      │
    │── 1. Tap Speaker Icon or ──────────►│                                      │
    │   "Read Screen Aloud"               │                                      │
    │                                     │── 2. Look up localized prompt text   │
    │                                     │   from VOICE_GUIDANCE_DICTIONARY     │
    │                                     │                                      │
    │                                     │── 3. Resolve BCP-47 locale code      │
    │                                     │   (hi-IN, mr-IN, bn-IN, te-IN, en-IN)│
    │                                     │                                      │
    │                                     │── 4. Instantiate SpeechSynthesisUtterance
    │                                     │   with speechRate (0.7x - 0.95x) ───►│
    │                                     │                                      │
    │                                     │── 5. Broadcast speaking state: true  │
    │◄── 6. Pulsing sound wave animation ─│      (Button pulses in amber)        │
    │                                     │                                      │
    │◄── 7. Spoken voice audio playback ─────────────────────────────────────────│
    │                                     │                                      │
    │                                     │◄── 8. OnEnd event fired ─────────────│
    │                                     │── 9. Broadcast speaking state: false │
    │◄── 10. Sound wave resets to idle ───│      (Button returns to green)       │
```
