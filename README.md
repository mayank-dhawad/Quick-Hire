# QuickHire – Rural Employment & Equipment Rental DPI Portal

> **🚀 Live Production URL:** [https://quick-hire-khaki.vercel.app](https://quick-hire-khaki.vercel.app)

QuickHire is an operational, rural-first employment and agricultural equipment rental portal engineered with React 18, TypeScript, Tailwind CSS, Framer Motion, and Supabase PostgreSQL. It provides a direct, 0%-commission digital public infrastructure (DPI) tailored for rural workers, agricultural laborers, smallholder farmers, and rural contractors across India.

---

## 🌟 Key Highlights & Innovations

### 1. 📱 Dual Authentication with Live Fast2SMS & Demo Toggle
- **Mobile OTP (+91) Authentication:** Native phone verification using Fast2SMS API with Supabase DB storage and automatic expiration.
- **One-Click Real-Time SMS Toggle:** Instant floating admin badge (`Live SMS: ON 🟢` vs `SMS Demo Mode ⚪`) to switch on-the-fly:
  - **Live SMS ON:** Dispatches real SMS text messages via the Fast2SMS gateway.
  - **SMS Demo Mode:** Skips external network calls to conserve wallet credits, saves the OTP to the database, and provides an on-screen OTP card with a 1-click **Auto-fill** button for fast testing and live demonstrations.
- **Email & Password Login:** Dual-tab support for administrators and employers with password recovery and account restoration.

### 2. 🔊 5-Language Voice Guidance & GIGW Accessibility
- **Regional Languages Supported:** English, हिन्दी (Hindi), मराठी (Marathi), বাংলা (Bengali), and తెలుగు (Telugu).
- **Web Speech API Text-to-Speech:** Instant audio guidance on form fields, roles, wages, and modal interactions.
- **Floating Audio Companion (`AccessibleVoiceBar`):** Read-screen-aloud capability with adjustable playback rate (0.7x 🐢 / 0.8x 🐇).
- **GIGW Accessibility Strip:** Multi-level font size zoom (A- / A / A+), skip to main content, and emergency helplines.

### 3. 🚜 Rural Workforce & Equipment Discovery
- **Categorized Workforces:** Agriculture, Construction, Daily work, and Skilled self-employed with localized skill filters.
- **Direct Employer Contact:** Direct phone dialing (`tel:`) without intermediate aggregators or platform fees.
- **Direct Wage Settlement:** Bank details and direct benefit transfer (DBT) wage payout flows.
- **Heavy Agricultural Equipment Sharing:** Listings for tractors, rotavators, high-pressure orchard power sprayers, concrete mixers, plate compactors, and pallet jacks.

### 4. 🛡️ Labor Welfare, Safety & Deactivation Management
- **Emergency Helplines:** Immediate access to All-in-One Emergency (112), Medical Ambulance (108), Kisan Call Center (1800-180-1551), National Labor Helpline (14434), and Women Safety (1091).
- **Data-Retentive Account Deactivation:** Compliant soft-delete mechanism that archives worker profiles while preserving job records and payment histories, with 1-click account restoration on re-login.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend Framework** | [React 18](https://react.dev/), [Vite 5](https://vitejs.dev/) |
| **Language & Typing** | [TypeScript 5](https://www.typescriptlang.org/) (Strict Mode) |
| **Styling & UI** | [Tailwind CSS 3](https://tailwindcss.com/), [Lucide React Icons](https://lucide.dev/) |
| **Animation & Micro-interactions** | [Framer Motion 13](https://www.framer.com/motion/) |
| **Backend & Database** | [Supabase](https://supabase.com/) PostgreSQL with Row-Level Security (RLS) |
| **SMS Gateway** | [Fast2SMS](https://www.fast2sms.com/) Bulk V2 OTP API |
| **Audio Guidance** | Web Speech API (`speechSynthesis`) with multi-locale fallback |
| **Testing** | [Vitest 2](https://vitest.dev/), [@testing-library/react](https://testing-library.com/) (468+ automated unit & integration tests) |
| **Deployment** | [Vercel](https://vercel.com/) |

---

## 📂 Project Structure

```
Quick-Hire/
├── .env                          # Supabase & Fast2SMS API configurations
├── index.html                    # Application entry HTML with SEO meta tags
├── src/
│   ├── App.tsx                   # Main layout, routing, floating SMS toggle & voice bar
│   ├── components/
│   │   ├── AccessibleVoiceBar.tsx# Floating screen reader companion with rate controls
│   │   ├── Auth.tsx              # Dual mobile OTP + email login with Fast2SMS integration
│   │   ├── BankDetailsTab.tsx    # Direct bank account management & verification
│   │   ├── DashboardTab.tsx      # Employer analytics and worker application tracking
│   │   ├── DirectPaymentModal.tsx# 0% commission direct wage settlement modal
│   │   ├── EquipmentRentalTab.tsx# Agricultural machinery rental registry
│   │   ├── HomeTab.tsx           # Institutional hero banner, quick category discovery
│   │   ├── PostEquipmentModal.tsx# Machinery listing modal
│   │   ├── PostJobTab.tsx        # Employer job creation workflow
│   │   ├── SafetyTab.tsx         # National helpline directory & worker safety standards
│   │   ├── VoiceSpeakerButton.tsx# Accessibility audio button next to form inputs
│   │   ├── WorkerDiscoveryModal.tsx # Filtered modal worker search
│   │   ├── WorkerProfileModal.tsx# Worker profile editor & account deactivation
│   │   └── WorkersTab.tsx        # Searchable grid of verified rural workers
│   └── lib/
│       ├── database.types.ts     # Supabase auto-generated schema type definitions
│       ├── smsConfig.ts          # SMS toggle state helper (localStorage + real-time bus)
│       ├── speech.ts             # Web Speech TTS synthesis & audio guidance maps
│       ├── supabase.ts           # Supabase client initialization
│       └── translations.ts       # 5-language dictionary (English, Hindi, Marathi, Bengali, Telugu)
└── supabase/
    └── migrations/               # PostgreSQL schema migrations, indexes & RLS policies
```

---

## ⚙️ Environment Variables

Create a `.env` file in the project root:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Fast2SMS OTP Configuration
VITE_FAST2SMS_API_KEY=your_fast2sms_api_key

# Fast2SMS Live Delivery Default ('true' for live SMS, 'false' for demo mode)
VITE_ENABLE_LIVE_SMS=true
```

> **Note:** The Fast2SMS delivery mode can be toggled on-the-fly directly in the UI using the floating badge without requiring an application rebuild or environment change.

---

## 🚀 Getting Started

### 1. Clone the repository & install dependencies
```bash
git clone https://github.com/your-username/quick-hire.git
cd quick-hire
npm install
```

### 2. Start the local development server
```bash
npm run dev
```

### 3. Run the test suite
```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch
```

### 4. Build for production
```bash
npm run build
```

---

## 🧪 Automated Test Suite

QuickHire contains comprehensive automated tests for speech synthesis, multilingual translations, bank details validation, SMS toggle state persistence, and authentication flows:

```bash
✓ src/lib/smsConfig.test.ts (6 tests)
✓ src/lib/speech.test.ts (13 tests)
✓ src/lib/translations.test.ts (426 tests)
✓ src/components/SmsAdminToggle.test.tsx (3 tests)
✓ src/components/BankDetailsTab.test.tsx (8 tests)
✓ src/components/Auth.test.tsx (12 tests)

Test Files  6 passed (6)
Tests       468 passed (468)
```

---

## 📜 License

Designed and developed for rural digital public infrastructure empowerment. Distributed under the MIT License.
