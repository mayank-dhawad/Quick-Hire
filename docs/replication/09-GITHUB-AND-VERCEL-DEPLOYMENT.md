# 09 — GitHub & Vercel Deployment Guide

## 1. Git Repository & Version Control Configuration

| Setting | Verified Repository Value |
|---|---|
| **Remote Origin URL** | `https://github.com/mayank-dhawad/Quick-Hire.git` |
| **Primary Deployment Branch** | `main` |
| **Commit on Remote `origin/main`** | `7ed3d89 Complete QuickHire: Dual auth, Fast2SMS OTP, unit tests, and UI enhancements` |
| **Latest Local Commit** | `55b1e3f Docs: Add live Vercel deployment URL to README header` |
| **Base Commit** | `8bad2a1 Start repository` |

### Working Tree Status
During documentation inspection, the local working tree has local modifications and enhancements that must be committed when creating a new clone:
- **Modified files:**
  - `src/App.tsx` (Lazy-loaded tab imports, SmsAdminToggleBadge wiring).
  - `src/components/Auth.tsx` (Fast2SMS OTP, demo mode auto-fill, deterministic credentials).
  - `src/components/Auth.test.tsx` (Expanded dual auth integration test coverage).
  - `src/index.css` (Cleaned Tailwind imports `@import "tailwindcss/base";`).
- **Untracked files:**
  - `src/lib/smsConfig.ts` & `src/lib/smsConfig.test.ts` (SMS state helper & test suite).
  - `src/components/SmsAdminToggle.test.tsx` (Admin toggle badge tests).

---

## 2. `.gitignore` Configuration

The verified `.gitignore` file includes:

```gitignore
# Dependencies
node_modules

# Build artifacts
dist
dist-ssr
*.local

# Editor directories
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Environment secrets
.env
.env.local
.env.*.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
```

---

## 3. Vercel Deployment Configuration

| Setting | Value / Recommended Setting | Notes |
|---|---|---|
| **Live Production Domain** | `https://quick-hire-khaki.vercel.app` | Verified live production URL. |
| **Framework Preset** | `Vite` | Auto-detects Vite configuration. |
| **Build Command** | `vite build` (or `npm run build`) | Generates optimized production assets. |
| **Output Directory** | `dist` | Default output path. |
| **Install Command** | `npm install` | Uses `package-lock.json`. |
| **Root Directory** | `./` (or `Quick-Hire` if mono-repo) | Points to where `package.json` resides. |
| **Node.js Version** | `20.x` | Recommended standard LTS. |

---

## 4. Connecting a New Workspace to Vercel (Safe Protocol)

To avoid accidentally overwriting or disconnecting the original `quick-hire-khaki` deployment when working in a new Antigravity workspace:

### Step 1: Create a New GitHub Repository
1. Initialize a clean git repository in your new workspace:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Recreated QuickHire DPI Platform"
   ```
2. Create a new personal GitHub repository (e.g., `https://github.com/YOUR_USERNAME/quick-hire-recreation.git`).
3. Push your main branch:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/quick-hire-recreation.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Import Project in Vercel Dashboard
1. Log in to your [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **Add New...** -> **Project**.
3. Select your new GitHub repository (`quick-hire-recreation`).
4. **Project Settings:**
   - Framework Preset: `Vite`
   - Root Directory: `./`
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. **Add Environment Variables:**
   Add the 4 variables from your `.env` file:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_FAST2SMS_API_KEY`
   - `VITE_ENABLE_LIVE_SMS`
6. Click **Deploy**. Vercel will build and assign a unique URL (e.g., `https://quick-hire-recreation.vercel.app`).

### Step 3: Update Supabase Redirect Settings
1. Open your Supabase Dashboard -> **Authentication** -> **URL Configuration**.
2. Set **Site URL** to your newly assigned Vercel URL.
3. Add your Vercel domain to **Redirect URLs**.
