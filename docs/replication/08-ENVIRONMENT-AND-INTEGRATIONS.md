# 08 — Environment Variables & External Integrations

## 1. Environment Variables Reference

The application requires four environment variables defined in `.env` (or configured in the Vercel Project Settings for production):

| Variable Name | Purpose | Required For | Configuration Location | Example / Placeholder Format |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project API gateway endpoint URL. | Database queries, real-time sync, and authentication. | `.env` (Local) & Vercel Dashboard (Production) | `https://YOUR_PROJECT_ID.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase public anonymous API key (JWT). | Authenticating client-side requests to PostgreSQL with Row Level Security. | `.env` (Local) & Vercel Dashboard (Production) | `sb_publishable_...` or `eyJhbGciOi...` |
| `VITE_FAST2SMS_API_KEY` | Fast2SMS Developer API authorization key. | Sending live SMS text messages containing the 6-digit OTP code to Indian mobile numbers (+91). | `.env` (Local) & Vercel Dashboard (Production) | `YOUR_FAST2SMS_WALLET_API_KEY` |
| `VITE_ENABLE_LIVE_SMS` | Boolean flag (`true` or `false`) defining default SMS delivery mode. | Setting default state for `SmsAdminToggleBadge`. If `false`, starts in credit-saving Demo Mode. | `.env` (Local) & Vercel Dashboard (Production) | `true` or `false` |

---

## 2. Sanitized `.env.example` Template

Create a file named `.env` in the root of the project with the following structure:

```env
# ==============================================================================
# QuickHire Environment Configuration Template
# Do NOT commit live keys to public version control
# ==============================================================================

# 1. Supabase PostgreSQL & Auth Credentials
# Obtain these from: https://app.supabase.com -> Project Settings -> API
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_PUBLIC_KEY

# 2. Fast2SMS Developer Gateway Credentials
# Obtain this from: https://www.fast2sms.com/dashboard/dev-api
VITE_FAST2SMS_API_KEY=YOUR_FAST2SMS_WALLET_API_KEY

# 3. SMS Gateway Default Mode Flag
# 'true'  = Dispatches real text messages via Fast2SMS (consumes wallet credits)
# 'false' = Skips HTTP calls and shows on-screen OTP card with 1-click auto-fill
VITE_ENABLE_LIVE_SMS=true
```

---

## 3. External Service Integrations

### 1. Supabase Backend Integration
- **Client Initialization:** `src/lib/supabase.ts`
  ```ts
  import { createClient } from '@supabase/supabase-js';
  import { Database } from './database.types';

  export const supabase = createClient<Database>(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );
  ```
- **Authentication Redirects:** Supabase Site URL must be set to:
  - Local: `http://localhost:5173`
  - Production: `https://quick-hire-khaki.vercel.app` (or your new Vercel domain).
- **CORS Allowed Origins:** Supabase automatically accepts requests from domains configured in Site URL and Additional Redirect URLs.

### 2. Fast2SMS Bulk V2 OTP Gateway
- **Provider:** [Fast2SMS](https://www.fast2sms.com/)
- **Documentation:** `https://www.fast2sms.com/dashboard/dev-api`
- **Endpoint Structure:**
  ```
  GET https://www.fast2sms.com/dev/bulkV2?authorization=${FAST2SMS_API_KEY}&route=otp&variables_values=${generatedOtp}&numbers=${cleanPhone}
  ```
- **HTTP Request Method:** `GET`
- **Request Headers:**
  - `Accept: application/json`
- **Expected Success Response:**
  ```json
  {
    "return": true,
    "request_id": "req_...",
    "message": ["SMS sent successfully."]
  }
  ```
- **Error Handling & Fallbacks:**
  - If wallet credits are zero or the API returns an error message, `Auth.tsx` displays the generated OTP on screen and continues the verification flow so testing is never blocked.
  - Toggling `SMS Demo Mode` via `SmsAdminToggleBadge` completely avoids calling this external endpoint.

### 3. Web Speech API (Browser Native Speech Synthesis)
- **Engine:** Built-in browser `window.speechSynthesis`.
- **External Dependencies:** Zero external API keys or network latency. Operates offline and client-side.
- **Voice Mapping Table:**
  | Language | BCP-47 Locale | Fallback Speech Key |
  |---|---|---|
  | English | `en-IN` | `en-IN` |
  | हिन्दी (Hindi) | `hi-IN` | `hi-IN` |
  | मराठी (Marathi) | `mr-IN` | `mr-IN` |
  | বাংলা (Bengali) | `bn-IN` | `bn-IN` |
  | తెలుగు (Telugu) | `te-IN` | `te-IN` |

### 4. Indian Net Banking Portals (Direct IMPS/NEFT Launchers)
Deep links integrated into `DirectPaymentModal.tsx` for zero-commission wage transfers:
- **State Bank of India (SBI):** `https://retail.onlinesbi.sbi/`
- **Bank of Baroda:** `https://www.bobibanking.com/`
- **Punjab National Bank (PNB):** `https://netpnb.com/`
- **HDFC Bank:** `https://netbanking.hdfcbank.com/`
- **ICICI Bank:** `https://infinity.icicibank.com/`
- **Canara Bank:** `https://netbanking.canarabank.in/`

---

## 4. Manual Setup Required in a New Environment

When creating a fresh deployment:
1. **Supabase Project:** Create a new project at [database.new](https://database.new) and execute `supabase-migrations/00_consolidated_full_schema.sql` in the SQL Editor.
2. **Fast2SMS Account:** Create a free account at [fast2sms.com](https://www.fast2sms.com), obtain a Dev API key, and deposit minimal wallet credits (or test freely using `SMS Demo Mode`).
3. **Vercel Project:** Link the GitHub repository and supply the 4 environment variables in the Project Settings -> Environment Variables screen.
