# 11 — Step-by-Step Reconstruction Manual

This document provides the exact, sequential roadmap to recreate the **QuickHire** application from scratch in a fresh Antigravity notebook or empty workspace.

---

## Reconstruction Phase Dependency Graph

```
[Phase 1: Project Scaffolding]
             │
             ▼
[Phase 2: Dependency Installation]
             │
             ▼
[Phase 3: Toolchain & Project Configuration]
             │
             ▼
[Phase 4: Supabase Database & Migrations]
             │
             ▼
[Phase 5: Core Libraries & Utility Engines]
             │
             ▼
[Phase 6: UI Foundations & HTML Entry]
             │
             ▼
[Phase 7: Reusable Components & Modals]
             │
             ▼
[Phase 8: Application Shell & Tab Integration]
             │
             ▼
[Phase 9: Automated Test Suite Execution]
             │
             ▼
[Phase 10: Environment Configuration]
             │
             ▼
[Phase 11: GitHub Version Control]
             │
             ▼
[Phase 12: Vercel Production Deployment]
```

---

## Phase 1: Workspace Initialization & Scaffolding

### Prerequisites:
- Node.js `>= 18.0.0` and `npm >= 9.0.0` installed.

### Tasks:
1. Initialize a new Vite React TypeScript project:
   ```bash
   npm create vite@latest Quick-Hire -- --template react-ts
   cd Quick-Hire
   ```

### Acceptance Criteria:
- `package.json`, `tsconfig.json`, `src/App.tsx`, and `index.html` are created.

---

## Phase 2: Dependency Installation

### Tasks:
1. Install production dependencies:
   ```bash
   npm install @supabase/supabase-js@^2.117.2 framer-motion@^13.4.6 lucide-react@^0.446.0 react@^18.3.1 react-dom@^18.3.1
   ```
2. Install development dependencies:
   ```bash
   npm install -D tailwindcss@^3.4.1 postcss@^8.4.35 autoprefixer@^10.4.18 vitest@^2.1.9 jsdom@^29.1.1 @testing-library/react@^16.3.3 @testing-library/jest-dom@^7.0.1 eslint@^9.9.1 @eslint/js@^9.9.1 typescript-eslint@^8.3.0 eslint-plugin-react-hooks@^5.1.0-rc.0 eslint-plugin-react-refresh@^0.4.11 globals@^15.9.0
   ```

### Acceptance Criteria:
- All packages resolve cleanly without version conflicts in `package-lock.json`.

---

## Phase 3: Toolchain & Project Configuration

### Tasks:
1. **Configure `tailwind.config.js`:**
   Add brand color palette (`brand-50` through `brand-800`), neutral surface tokens (`#fbfcf8`), and custom font families (`DM Sans`, `Manrope`). Reference: [02-TECH-STACK-AND-DEPENDENCIES.md](./02-TECH-STACK-AND-DEPENDENCIES.md).
2. **Configure `postcss.config.js`:**
   Export `tailwindcss` and `autoprefixer` plugins.
3. **Configure `vite.config.ts`:**
   Set `@` path alias pointing to `./src`, and exclude `lucide-react` from `optimizeDeps`.
4. **Configure `vitest.config.ts`:**
   Set test environment to `jsdom`, enable `globals: true`, and point `setupFiles` to `./src/test/setup.ts`.
5. **Configure `tsconfig.app.json` & `tsconfig.json`:**
   Set `paths: { "@/*": ["src/*"] }`, `strict: true`, `noUnusedLocals: false`, `noUnusedParameters: false`.
6. **Configure `.vscode/settings.json`:**
   Add `"css.lint.unknownAtRules": "ignore"` to silence editor warnings for Tailwind CSS imports.

### Acceptance Criteria:
- `npx tailwindcss --help` and `npm run typecheck` run without syntax errors.

---

## Phase 4: Supabase Database Setup & Schema Deployment

### Prerequisites:
- Access to a Supabase project at [database.new](https://database.new).

### Tasks:
1. Open the Supabase SQL Editor.
2. Execute the consolidated schema script from this documentation set:
   [supabase-migrations/00_consolidated_full_schema.sql](./supabase-migrations/00_consolidated_full_schema.sql).
3. Verify that the following 10 tables are created with Row-Level Security enabled:
   - `profiles`, `workers`, `jobs`, `job_records`, `equipment`, `payments`, `reviews`, `notifications`, `phone_otps`, `quickhire_interest`.
4. Verify that custom ENUMs are registered: `job_status`, `user_role`, `worker_category`, `equipment_status`.

### Acceptance Criteria:
- Schema tables display in Supabase Table Editor with correct foreign keys and RLS shields.

---

## Phase 5: Core Libraries & Utility Engines

### Tasks:
1. **Create `src/lib/database.types.ts`:**
   Define strongly typed TypeScript interfaces matching the Supabase schema.
2. **Create `src/lib/supabase.ts`:**
   Initialize Supabase client reading `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. **Create `src/lib/smsConfig.ts`:**
   Implement `isLiveSmsEnabled`, `setLiveSmsEnabled`, `toggleLiveSms`, event bus dispatch `quickhire:sms-config-changed`, and hook `useLiveSms`.
4. **Create `src/lib/translations.ts`:**
   Implement the 426-key multilingual dictionary for English, Hindi, Marathi, Bengali, and Telugu, along with helper `getTranslation`.
5. **Create `src/lib/speech.ts`:**
   Implement `speakText`, `stopSpeaking`, `subscribeToSpeech`, `getLocaleForLanguage`, rate controls, and localized voice guidance dictionary.

### Acceptance Criteria:
- TypeScript compiles all library files cleanly.

---

## Phase 6: UI Foundations & HTML Entry

### Tasks:
1. **Configure `index.html`:**
   Include meta tags for viewport, theme color (`#087a5b`), SEO title `QuickHire — Local work, made simple`, and mount `<div id="root"></div>`.
2. **Configure `src/index.css`:**
   Import Google Fonts (`DM Sans`, `Manrope`), import Tailwind directives (`@import "tailwindcss/base"; @import "tailwindcss/components"; @import "tailwindcss/utilities";`), set `:root` surface styling and scrollbar suppression classes (`.no-scrollbar`).
3. **Configure `src/test/setup.ts`:**
   Mock `window.speechSynthesis` and `SpeechSynthesisUtterance` for JSDOM test runs.

### Acceptance Criteria:
- Global fonts and base styles render properly.

---

## Phase 7: Reusable Components & Modals Implementation

### Implementation Order:
1. `src/components/VoiceSpeakerButton.tsx` (Micro-animated speaker button).
2. `src/components/AccessibleVoiceBar.tsx` (Floating screen reader companion).
3. `src/components/Auth.tsx` (Dual mobile Fast2SMS OTP + Email modal with on-screen demo OTP card).
4. `src/components/WorkerProfileModal.tsx` (Worker profile editor, skill chips, soft deactivation).
5. `src/components/DirectPaymentModal.tsx` (0% commission wage & machinery settlement modal).
6. `src/components/PostEquipmentModal.tsx` (Tool & machinery listing modal).
7. `src/components/WorkerDiscoveryModal.tsx` (Category modal explorer).
8. `src/components/HomeTab.tsx` (Advisory marquee, hero banner, category cards, how-it-works).
9. `src/components/WorkersTab.tsx` (Directory grid with NFC Unicode search and call triggers).
10. `src/components/EquipmentRentalTab.tsx` (Machinery rental grid with rent settlement).
11. `src/components/PostJobTab.tsx` (Job posting form with audio prompts).
12. `src/components/DashboardTab.tsx` (Employer applicant tracker and job completion).
13. `src/components/BankDetailsTab.tsx` (Bank settings with IFSC regex validation and passbook ledger).
14. `src/components/SafetyTab.tsx` (Emergency SOS directory with direct 112/108/Kisan Call Center links).

### Acceptance Criteria:
- All components export their respective interfaces and render without missing prop errors.

---

## Phase 8: Main Application Assembly (`App.tsx`)

### Tasks:
1. Connect all lazy-loaded tab components using React `Suspense` and fallback loaders.
2. Wire global navigation bar with language dropdown, GIGW zoom controls, active tab pills, and login button.
3. Wire `SmsAdminToggleBadge` to float in the header with live/demo state updates.
4. Mount `AccessibleVoiceBar` at the bottom-right corner.
5. Implement toast notifications container with audio speech output.
6. Verify profile session persistence in `localStorage`.

### Acceptance Criteria:
- Application loads into `HomeTab`, responds to language switching, and changes tabs with Framer Motion transitions.

---

## Phase 9: Automated Testing & Verification

### Tasks:
1. Implement test files:
   - `src/lib/smsConfig.test.ts`
   - `src/lib/speech.test.ts`
   - `src/lib/translations.test.ts`
   - `src/components/SmsAdminToggle.test.tsx`
   - `src/components/BankDetailsTab.test.tsx`
   - `src/components/Auth.test.tsx`
2. Run automated test suite:
   ```bash
   npm test
   ```

### Acceptance Criteria:
- All 6 test suites pass with **468+ passing tests**.

---

## Phase 10: Environment Configuration

### Tasks:
1. Create `.env` in the project root:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_FAST2SMS_API_KEY=your-fast2sms-key
   VITE_ENABLE_LIVE_SMS=true
   ```

### Acceptance Criteria:
- Supabase queries fetch live records and Fast2SMS/Demo OTP functions seamlessly.

---

## Phase 11: GitHub Repository Setup

### Tasks:
1. Commit all files to git:
   ```bash
   git init
   git add .
   git commit -m "Complete QuickHire: Dual auth, Fast2SMS OTP, unit tests, and UI enhancements"
   ```
2. Push to remote GitHub repository.

### Acceptance Criteria:
- Clean GitHub repository with verified `main` branch.

---

## Phase 12: Vercel Production Deployment

### Tasks:
1. Import repository in [Vercel](https://vercel.com/).
2. Select `Vite` preset and `./` root directory.
3. Configure the 4 environment variables in Vercel settings.
4. Deploy and verify live production URL.

### Acceptance Criteria:
- Production deployment succeeds, audio plays in browser, and dual authentication works live.
