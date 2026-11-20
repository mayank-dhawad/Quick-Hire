# 03 — Project Structure & Source Inventory

## 1. Complete Directory Tree

```
Quick-Hire/
├── .env                                       # Environment configuration (Supabase & Fast2SMS)
├── .git/                                      # Git repository data & configuration
├── .gitignore                                 # Git ignore patterns (node_modules, dist, .env)
├── .vscode/
│   └── settings.json                          # IDE CSS unknownAtRules lint suppression
├── dist/                                      # Compiled production distribution bundle
├── eslint.config.js                           # ESLint 9 flat configuration
├── index.html                                 # HTML5 document entry with SEO & viewport meta
├── node_modules/                              # Installed npm dependencies
├── package.json                               # npm project manifest, scripts & dependencies
├── package-lock.json                          # Exact locked dependency graph (lockfileVersion 3)
├── postcss.config.js                          # PostCSS config for Tailwind CSS & Autoprefixer
├── README.md                                  # Production documentation & project highlights
├── src/
│   ├── App.tsx                                # Main application shell, router, global layout & state
│   ├── index.css                              # Design tokens, fonts, Tailwind imports & CSS utilities
│   ├── main.tsx                               # React 18 createRoot DOM entry
│   ├── vite-env.d.ts                          # Vite client ambient type declarations
│   ├── components/
│   │   ├── AccessibleVoiceBar.tsx             # Floating audio companion with playback speed controls
│   │   ├── Auth.tsx                           # Dual authentication modal (Fast2SMS OTP & Email/Pass)
│   │   ├── Auth.test.tsx                      # Automated unit tests for Auth modal & OTP flows
│   │   ├── BankDetailsTab.tsx                 # Bank account management & passbook payment ledger
│   │   ├── BankDetailsTab.test.tsx            # Unit tests for IFSC/UPI validation & bank saving
│   │   ├── DashboardTab.tsx                   # Employer dashboard: jobs posted, applicants, settlements
│   │   ├── DirectPaymentModal.tsx             # 0% commission direct wage / equipment settlement modal
│   │   ├── EquipmentRentalTab.tsx             # Agricultural & construction machinery rental directory
│   │   ├── HomeTab.tsx                        # Official citizen advisory, hero banner, category cards
│   │   ├── PostEquipmentModal.tsx             # Machinery listing modal with presets & owner contact
│   │   ├── PostJobTab.tsx                     # Employer job creation form with voice guidance
│   │   ├── SafetyTab.tsx                      # National emergency helplines & worker safety standards
│   │   ├── SmsAdminToggle.test.tsx            # Unit tests for floating Live/Demo SMS admin badge
│   │   ├── VoiceSpeakerButton.tsx             # Reusable animated audio speaker button
│   │   ├── WorkerDiscoveryModal.tsx           # Category & skill filter modal worker discovery
│   │   ├── WorkerProfileModal.tsx             # Worker profile editor, skill chips & soft deactivation
│   │   └── WorkersTab.tsx                     # Searchable grid of verified rural workers with NFC search
│   ├── lib/
│   │   ├── database.types.ts                  # Supabase TypeScript schema definitions
│   │   ├── smsConfig.ts                       # SMS toggle state helper (localStorage + event bus)
│   │   ├── smsConfig.test.ts                  # Unit tests for SMS toggle persistence & event dispatch
│   │   ├── speech.ts                          # Web Speech API TTS synthesis engine & localized prompts
│   │   ├── speech.test.ts                     # Unit tests for speech normalization & audio prompts
│   │   ├── supabase.ts                        # Supabase client instantiation
│   │   ├── translations.ts                    # 5-language dictionary (En, Hi, Mr, Bn, Te)
│   │   └── translations.test.ts               # 426 automated tests for translation completeness
│   └── test/
│       └── setup.ts                           # Vitest JSDOM environment setup & SpeechSynthesis mock
├── supabase/
│   └── migrations/
│       ├── 20260830095418_create_quickhire_interest.sql
│       ├── 20261019000000_add_account_status_to_profiles.sql
│       ├── 20261019120000_ensure_unicode_and_location.sql
│       ├── 20261019130000_unified_base_schema.sql
│       └── 20261019140000_create_phone_otps.sql
├── tailwind.config.js                         # Tailwind design tokens, brand colors & fonts
├── tsconfig.app.json                          # TypeScript compiler settings for application code
├── tsconfig.json                              # TypeScript project references root
├── tsconfig.node.json                         # TypeScript compiler settings for Vite config
├── vite.config.ts                             # Vite 5 configuration with @ alias
└── vitest.config.ts                           # Vitest configuration with JSDOM & setup file
```

---

## 2. File Inventory & Architectural Classification

| Relative File Path | Size | Lines | Classification | Primary Architectural Role | Key Exports / Elements |
|---|---|---|---|---|---|
| `src/main.tsx` | 244 B | 11 | Scaffolded | Mounts `<App />` into DOM element `root` under `StrictMode`. | Root entry |
| `src/App.tsx` | 90.6 KB | 2108 | **Custom Core** | Top-level state coordinator, tab router, GIGW zoom, toast notifications, floating SMS badge, modal orchestration. | `default App`, `SmsAdminToggleBadge` |
| `src/index.css` | 743 B | 35 | **Custom Core** | Google Fonts import (DM Sans, Manrope), Tailwind CSS imports, base resets, scrollbar suppression. | Global CSS |
| `src/vite-env.d.ts` | 39 B | 3 | Scaffolded | TypeScript ambient reference for `vite/client`. | Global types |
| `src/lib/supabase.ts` | 520 B | 12 | **Custom Core** | Reads Supabase URL and anon key from env, exports typed Supabase client. | `supabase` |
| `src/lib/database.types.ts` | 11.3 KB | 364 | Generated/Typed | Strongly typed interface for Supabase PostgreSQL tables, enums, rows, inserts, updates. | `interface Database`, `Json` |
| `src/lib/smsConfig.ts` | 4.2 KB | 156 | **Custom Core** | Global SMS mode helper, localStorage persistence, window event bus, React hook `useLiveSms`. | `isLiveSmsEnabled`, `setLiveSmsEnabled`, `toggleLiveSms`, `useLiveSms` |
| `src/lib/speech.ts` | 55.6 KB | 631 | **Custom Core** | Web Speech API wrapper, locale mapping, global speech rate, localized field guidance dictionary. | `speakText`, `stopSpeaking`, `getVoiceGuidance`, `getLocaleForLanguage` |
| `src/lib/translations.ts` | 181.3 KB | 1874 | **Custom Core** | Complete 5-language translation dictionary for English, Hindi, Marathi, Bengali, Telugu. | `translations`, `getTranslation`, `SUPPORTED_LANGUAGES` |
| `src/components/AccessibleVoiceBar.tsx` | 4.9 KB | 134 | **Custom Core** | Floating audio screen reader companion, collapsible UI, playback rate toggling (0.7x / 0.8x). | `AccessibleVoiceBar` |
| `src/components/VoiceSpeakerButton.tsx` | 2.6 KB | 89 | **Custom Core** | Reusable speaker icon button with pulsing audio animation for field-level accessibility. | `VoiceSpeakerButton` |
| `src/components/Auth.tsx` | 50.6 KB | 1248 | **Custom Core** | Dual authentication modal: mobile phone OTP via Fast2SMS and email/password, role selector, account restoration. | `Auth` |
| `src/components/BankDetailsTab.tsx` | 51.5 KB | 1184 | **Custom Core** | Bank details editor (IFSC regex validation, UPI ID), passbook payment ledger, search, filters. | `BankDetailsTab`, `IFSC_REGEX` |
| `src/components/DirectPaymentModal.tsx` | 28.1 KB | 641 | **Custom Core** | 0% commission direct wage settlement modal, UPI QR deep-links, Net Banking portal launcher. | `DirectPaymentModal` |
| `src/components/HomeTab.tsx` | 20.6 KB | 455 | **Custom Core** | Official advisory marquee, institutional hero banner, stats strip, domain cards, recent jobs spotlight. | `HomeTab` |
| `src/components/WorkersTab.tsx` | 13.2 KB | 311 | **Custom Core** | Public rural workforce directory, domain dropdown, keyword search with Unicode NFC normalization. | `WorkersTab` |
| `src/components/WorkerDiscoveryModal.tsx` | 17.2 KB | 403 | **Custom Core** | Quick modal worker discovery launched from category cards with live domain chips and skill queries. | `WorkerDiscoveryModal` |
| `src/components/WorkerProfileModal.tsx` | 28.6 KB | 599 | **Custom Core** | Worker profile editor, category-specific skill chips, assisted profile toggle, soft-delete deactivation. | `WorkerProfileModal` |
| `src/components/EquipmentRentalTab.tsx` | 13.0 KB | 314 | **Custom Core** | Heavy machinery rental directory, category filter chips, search input, daily rent presets, owner contact. | `EquipmentRentalTab` |
| `src/components/PostEquipmentModal.tsx` | 19.4 KB | 460 | **Custom Core** | Machinery listing creation modal, pre-set rental rates, machinery presets by category. | `PostEquipmentModal` |
| `src/components/PostJobTab.tsx` | 13.3 KB | 323 | **Custom Core** | Employer job posting workflow, category selector, skill tags chip-adder, offered wage, worker count. | `PostJobTab` |
| `src/components/DashboardTab.tsx` | 13.7 KB | 327 | **Custom Core** | Employer management dashboard, active listings, worker applicant tracking, mark completed, pay wage. | `DashboardTab` |
| `src/components/SafetyTab.tsx` | 15.8 KB | 354 | **Custom Core** | 24x7 emergency SOS helpline directory (112, 108, 1800-180-1551, 14434, 1091) with direct `tel:` links. | `SafetyTab` |
| `src/test/setup.ts` | 1.5 KB | 50 | **Custom Test** | JSDOM test harness setup, Web Speech API mocks (`speechSynthesis`, `SpeechSynthesisUtterance`). | Test harness |
| `src/lib/smsConfig.test.ts` | 2.2 KB | 68 | **Custom Test** | Unit tests for SMS config defaults, localStorage persistence, event dispatch, toggle. | 6 tests |
| `src/lib/speech.test.ts` | 6.7 KB | 165 | **Custom Test** | Unit tests for speech normalization, locale mapping, guidance keys, voice fallbacks. | 13 tests |
| `src/lib/translations.test.ts` | 8.0 KB | 133 | **Custom Test** | Exhaustive tests verifying key parity across all 5 languages (English, Hindi, Marathi, Bengali, Telugu). | 426 tests |
| `src/components/SmsAdminToggle.test.tsx` | 1.7 KB | 45 | **Custom Test** | Unit tests for `SmsAdminToggleBadge` rendering, label states, and click toggling. | 3 tests |
| `src/components/BankDetailsTab.test.tsx` | 7.0 KB | 228 | **Custom Test** | Unit tests for Indian IFSC regex validation, UPI format validation, bank profile saving. | 8 tests |
| `src/components/Auth.test.tsx` | 10.8 KB | 280 | **Custom Test** | Integration tests for dual authentication: phone validation, demo OTP auto-fill, email login. | 12 tests |
| `supabase/migrations/*.sql` | ~25 KB | 500+ | **Custom Core** | 5 sequential PostgreSQL migration scripts defining schema, indexes, RLS policies. | DB Schema |

---

## 3. Preservation & Regeneration Classification

1. **Must be Preserved Exactly (Handwritten Core):**
   - All files under `src/components/` and `src/lib/`.
   - `src/App.tsx`, `src/index.css`, `index.html`.
   - `src/test/setup.ts` and all `*.test.ts` / `*.test.tsx` files.
   - `supabase/migrations/*.sql`.
   - `tailwind.config.js`.

2. **Can be Generated by Tooling:**
   - `src/vite-env.d.ts` (generated by Vite).
   - `package-lock.json` (regenerated via `npm install`).
   - `dist/` (generated via `npm run build`).
   - `node_modules/` (installed by npm).
