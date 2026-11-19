# QuickHire – Rural Employment & Equipment Rental DPI Portal

> **🚀 Live Production URL:** [https://quick-hire-khaki.vercel.app](https://quick-hire-khaki.vercel.app)

QuickHire is an operational, rural-first employment and agricultural equipment rental portal engineered with React 18, TypeScript, Tailwind CSS, Framer Motion, and Supabase PostgreSQL. It provides a direct, 0%-commission digital public infrastructure (DPI) tailored for rural workers, agricultural laborers, smallholder farmers, and rural contractors across India.

---

## 🌟 Key Highlights & Innovations

### 1. 📲 Progressive Web App (PWA) & Offline Capability
- **Installable Native-Like App:** Fully compatible with Android Chrome, Samsung Internet, Edge, and iOS Safari. Installable directly to home screen via custom branded install prompt or browser menu.
- **Service Worker (`/sw.js`):**
  - **Pre-cached App Shell:** Instant loading of core HTML, CSS, JavaScript, and icons even in zero-connectivity areas.
  - **Network-First Navigation with Offline Fallback:** Graceful fallback to `/offline.html` featuring one-click auto-reconnection and statutory carrier-voice emergency helplines.
  - **Cache-First Static Assets:** Versioned scripts, stylesheets, and icons served instantly from CacheStorage.
  - **Strict Network-Only Policy:** Dynamic mutation APIs, Supabase Auth/DB endpoints, and SMS calls always bypass CacheStorage to prevent security or data integrity issues.
- **Offline Resilience Banner:** Real-time online/offline indicator notifying users when cached data is active and celebrating connection restoration.
- **Safe-Area Insets & Mobile Hardening:** Enhanced with `viewport-fit=cover`, dynamic padding for modern notched devices, and `overscroll-behavior-y: contain`.

### 2. 🛡️ Fault Tolerance & Zero-Crash Architecture
- **React ErrorBoundary:** Global crash shield catching any runtime render exceptions without blank white screens, providing 1-click application recovery and cache purge options.
- **Auth Session Failsafe Timeout:** 2500ms timeout on Supabase session verification with automatic fail-soft resolution and a visible `"Skip to Home →"` button.
- **Sub-300kB Initial JavaScript Payload:** Heavy modals (`Auth`, `WorkerProfileModal`, `DirectPaymentModal`, `PostEquipmentModal`, `WorkerDiscoveryModal`) are code-split with `React.lazy()`, reducing the initial uncompressed bundle from 883 kB down to **263 kB** (gzip: **97 kB**).

### 3. 📱 Verified Multi-Method Authentication & Administration
- **Mobile OTP (+91) Authentication:** Native phone verification using Fast2SMS API with Supabase DB storage and automatic expiration.
- **Password & Email Authentication:** Dual-method login for citizens, contractors, and platform administrators.
- **Comprehensive Admin Governance Suite:** Dedicated routes (`/admin`, `/admin/login`, `/admin/users`, `/admin/jobs`) guarded by role-based access control and persistent admin sessions.

### 4. 🔊 5-Language Voice Guidance & GIGW Accessibility
- **Regional Languages Supported:** English, हिन्दी (Hindi), मराठी (Marathi), বাংলা (Bengali), and తెలుగు (Telugu).
- **Web Speech API Text-to-Speech:** Instant audio guidance on form fields, roles, wages, and modal interactions.
- **Floating Audio Companion (`AccessibleVoiceBar`):** Read-screen-aloud capability with adjustable playback rate (0.7x 🐢 / 0.8x 🐇).
- **GIGW Accessibility Strip:** Multi-level font size zoom (A- / A / A+), skip to main content, and emergency helplines.

### 5. 🚜 Rural Workforce & Equipment Discovery Map
- **Interactive Leaflet Workforce Map:** Geocoded radius-based worker discovery with automatic Leaflet container resizing (`invalidateSize`) and tile error resilience.
- **Direct Employer Contact:** Direct phone dialing (`tel:`) without intermediate aggregators or platform fees.
- **Direct 0%-Commission Wage Settlement:** Bank details and direct benefit transfer (DBT) wage payout flows.
- **Heavy Agricultural Equipment Sharing:** Listings for tractors, rotavators, high-pressure orchard power sprayers, concrete mixers, plate compactors, and pallet jacks.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend Framework** | [React 18](https://react.dev/), [Vite 5](https://vitejs.dev/) |
| **PWA Infrastructure** | Service Worker CacheStorage API, Web App Manifest (W3C), `beforeinstallprompt` lifecycle |
| **Language & Typing** | [TypeScript 5](https://www.typescriptlang.org/) (Strict Mode) |
| **Styling & UI** | [Tailwind CSS 3](https://tailwindcss.com/), [Lucide React Icons](https://lucide.dev/) |
| **Animation & Micro-interactions** | [Framer Motion 13](https://www.framer.com/motion/) |
| **Backend & Database** | [Supabase](https://supabase.com/) PostgreSQL with Row-Level Security (RLS) |
| **SMS Gateway** | [Fast2SMS](https://www.fast2sms.com/) Bulk V2 OTP API |
| **Audio Guidance** | Web Speech API (`speechSynthesis`) with multi-locale fallback |
| **Testing** | [Vitest 2](https://vitest.dev/), [@testing-library/react](https://testing-library.com/) (570 automated tests, 22 test files) |
| **Deployment & Edge CDN** | [Vercel](https://vercel.com/) with custom cache and security headers |

---

## 📂 Project Structure

```
Quick-Hire/
├── .env                          # Supabase & Fast2SMS API configurations
├── index.html                    # Application entry HTML with PWA meta & manifest tags
├── vercel.json                   # Edge routing, SPA rewrite, and PWA Cache-Control headers
├── vite.config.ts                # Build configuration with modular vendor manualChunks
├── public/
│   ├── favicon.svg               # SVG vector favicon
│   ├── offline.html              # Branded offline fallback with carrier-voice helplines
│   ├── sw.js                     # Production Service Worker (precache, network-first, cache-first)
│   ├── manifest.webmanifest      # W3C Web App Manifest (primary)
│   ├── manifest.json             # W3C Web App Manifest (compatibility mirror)
│   └── icons/                    # PWA Icon Suite (192, 512, maskable, apple-touch, favicons)
├── src/
│   ├── App.tsx                   # Main layout, router, lazy modals, auth timeout & PWA triggers
│   ├── main.tsx                  # Application entry point with ErrorBoundary & SW registration
│   ├── components/
│   │   ├── AccessibleVoiceBar.tsx# Floating screen reader companion with rate controls
│   │   ├── Auth.tsx              # Dual mobile OTP + email login modal
│   │   ├── BankDetailsTab.tsx    # Direct bank account management & verification
│   │   ├── DashboardTab.tsx      # Employer analytics and worker application tracking
│   │   ├── DirectPaymentModal.tsx# 0% commission direct wage settlement modal
│   │   ├── ErrorBoundary.tsx     # Global React crash protection & recovery screen
│   │   ├── EquipmentRentalTab.tsx# Agricultural machinery rental registry
│   │   ├── HomeTab.tsx           # Institutional hero banner, quick category discovery
│   │   ├── OfflineBanner.tsx     # Real-time online/offline network indicator
│   │   ├── PostEquipmentModal.tsx# Machinery listing modal
│   │   ├── PostJobTab.tsx        # Employer job creation workflow
│   │   ├── PwaInstallBanner.tsx  # Custom branded PWA install prompt & iOS Safari guide
│   │   ├── SafetyTab.tsx         # National helpline directory & worker safety standards
│   │   ├── VoiceSpeakerButton.tsx# Accessibility audio button next to form inputs
│   │   ├── WorkerDiscoveryModal.tsx # Filtered modal worker search
│   │   ├── WorkerProfileModal.tsx# Worker profile editor & account deactivation
│   │   ├── WorkersMapView.tsx    # Leaflet interactive geocoded workforce discovery map
│   │   └── WorkersTab.tsx        # Searchable grid of verified rural workers
│   ├── hooks/
│   │   └── usePwaInstall.ts      # Custom hook managing PWA installability, prompts & cooldown
│   └── lib/
│       ├── adminAuth.ts          # Admin session verification and PBKDF2/SHA-256 validation
│       ├── adminRouter.ts        # Admin route subscription and path checking
│       ├── database.types.ts     # Supabase auto-generated schema type definitions
│       ├── geocoding.ts          # Haversine distance and reverse geocoding with localStorage cache
│       ├── pwaRegister.ts        # Service worker lifecycle manager with auto-update detection
│       ├── smsConfig.ts          # SMS toggle state helper (localStorage + real-time bus)
│       ├── speech.ts             # Web Speech TTS synthesis & audio guidance maps
│       ├── supabase.ts           # Supabase client initialization
│       └── translations.ts       # 5-language dictionary (English, Hindi, Marathi, Bengali, Telugu)
└── supabase/
    └── migrations/               # PostgreSQL schema migrations, indexes & RLS policies
```

---

## 🧪 Automated Test Suite

QuickHire contains 570 automated unit, integration, and security tests across 22 test files:

```bash
✓ src/lib/adminAuth.test.ts (27 tests)
✓ src/lib/speech.test.ts (13 tests)
✓ src/lib/adminRouter.test.ts (7 tests)
✓ src/lib/translations.test.ts (426 tests)
✓ src/components/WorkersTab.test.tsx (7 tests)
✓ src/components/admin/AdminLogin.test.tsx (7 tests)
✓ src/components/WorkersMapView.test.tsx (6 tests)
✓ src/components/WorkerDiscoveryModal.test.tsx (3 tests)
✓ src/components/DirectPaymentModal.test.tsx (7 tests)
✓ src/components/WorkerProfileModal.test.tsx (6 tests)
✓ src/components/DashboardTab.test.tsx (2 tests)
✓ src/components/AppRouting.test.tsx (3 tests)
✓ src/components/Auth.test.tsx (11 tests)
✓ src/components/SafetyTab.test.tsx (5 tests)
✓ src/components/BankDetailsTab.test.tsx (8 tests)
✓ src/hooks/usePwaInstall.test.ts (6 tests)
✓ src/lib/smsConfig.test.ts (6 tests)
✓ src/lib/pwaRegister.test.ts (3 tests)
✓ src/lib/geocoding.test.ts (9 tests)
✓ src/components/ErrorBoundary.test.tsx (3 tests)
✓ src/components/OfflineBanner.test.tsx (3 tests)
✓ src/components/SmsAdminToggle.test.tsx (2 tests)

Test Files  22 passed (22)
Tests       570 passed (570)
```

---

## ⚡ Production Verification Commands

```bash
# 1. Typecheck the entire codebase
npm run typecheck

# 2. Run the complete test suite
npx vitest run

# 3. Build optimized production bundle
npm run build
```

---

## 📜 License

Designed and developed for rural digital public infrastructure empowerment. Distributed under the MIT License.
