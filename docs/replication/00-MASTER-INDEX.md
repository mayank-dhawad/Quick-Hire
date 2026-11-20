# QuickHire – Master Replication Blueprint & Documentation Index

> **Project Identity:** QuickHire – Rural Employment & Equipment Rental DPI Portal  
> **Repository:** `https://github.com/mayank-dhawad/Quick-Hire.git` (Branch: `main`)  
> **Live Production URL:** [https://quick-hire-khaki.vercel.app](https://quick-hire-khaki.vercel.app)  
> **Core Stack:** React 18 (Vite 5) · TypeScript 5 (Strict) · Tailwind CSS 3 · Framer Motion 13 · Supabase PostgreSQL · Fast2SMS Bulk V2 · Web Speech API · Vitest 2  
> **Document Version:** 1.0.0 (Production Verified)  
> **Verification Status:** Fully Verified from Source Code, Test Suites, Database Migrations & Live Deployment

---

## Executive Summary & Document Purpose

This documentation package contains the complete, self-contained technical blueprint required to recreate the **QuickHire** project from scratch in a fresh Antigravity notebook, development environment, or cloud workspace without access to past conversation history.

QuickHire is an operational, rural-first employment and agricultural machinery rental portal designed as a **Digital Public Infrastructure (DPI)** solution for India. It operates on a **0%-commission** economic model, connecting rural laborers, harvesters, masons, and skilled artisans directly with farm owners, contractors, and local businesses. Key architectural innovations include **native Indian mobile OTP authentication via Fast2SMS with an on-the-fly demo mode toggle**, **5-language regional voice guidance powered by the Web Speech API**, **GIGW accessibility compliance**, **direct peer-to-peer bank/UPI wage settlements**, **agricultural equipment sharing**, and **data-retentive soft-deletion**.

---

## Document Navigation Index

Every facet of the codebase, design, database, integrations, and deployment workflows is exhaustively detailed in the 12 companion documents below:

| File | Title | Description & Scope |
|---|---|---|
| [01-PROJECT-OVERVIEW.md](./01-PROJECT-OVERVIEW.md) | **Project Overview & Purpose** | Mission, problems solved, target user personas, core value propositions, and verified feature inventory. |
| [02-TECH-STACK-AND-DEPENDENCIES.md](./02-TECH-STACK-AND-DEPENDENCIES.md) | **Tech Stack & Dependencies** | Complete inventory of runtime versions, npm packages, locked dependencies, scripts, and build tools. |
| [03-PROJECT-STRUCTURE.md](./03-PROJECT-STRUCTURE.md) | **Project Structure & File Inventory** | Comprehensive directory tree, per-file architecture breakdown, imports, exports, and reconstruction flags. |
| [04-UI-AND-DESIGN-SPECIFICATION.md](./04-UI-AND-DESIGN-SPECIFICATION.md) | **UI & Design System Specification** | Color palettes, typography tokens, layout grids, components, modals, audio companions, and animations. |
| [05-FEATURES-AND-BUSINESS-LOGIC.md](./05-FEATURES-AND-BUSINESS-LOGIC.md) | **Features & Business Logic** | Detailed specifications of all 12 core functional domains, validation rules, state management, and edge cases. |
| [06-SYSTEM-ARCHITECTURE-AND-DATA-FLOW.md](./06-SYSTEM-ARCHITECTURE-AND-DATA-FLOW.md) | **System Architecture & Data Flows** | Text-based architecture diagrams, component trees, and end-to-end data lifecycle sequence diagrams. |
| [07-SUPABASE-DATABASE-AND-SECURITY.md](./07-SUPABASE-DATABASE-AND-SECURITY.md) | **Supabase Database & Security** | PostgreSQL schema, tables, columns, foreign keys, indexes, enums, UTF-8 Unicode, and exact RLS policies. |
| [08-ENVIRONMENT-AND-INTEGRATIONS.md](./08-ENVIRONMENT-AND-INTEGRATIONS.md) | **Environment & External Integrations** | Environment variables reference, Fast2SMS gateway integration, Web Speech API setup, and Net Banking portals. |
| [09-GITHUB-AND-VERCEL-DEPLOYMENT.md](./09-GITHUB-AND-VERCEL-DEPLOYMENT.md) | **GitHub & Vercel Deployment** | Git repository structure, commit history, build settings, environment configuration, and Vercel hosting. |
| [10-TESTING-AND-KNOWN-ISSUES.md](./10-TESTING-AND-KNOWN-ISSUES.md) | **Testing Suite & Known Limitations** | Vitest test architecture, 468+ passing automated tests breakdown, mock setups, and known boundary conditions. |
| [11-STEP-BY-STEP-RECONSTRUCTION.md](./11-STEP-BY-STEP-RECONSTRUCTION.md) | **Step-by-Step Reconstruction Guide** | Ordered 12-phase rebuild roadmap from empty workspace to verified live production deployment. |
| [12-REPLICATION-ACCEPTANCE-CHECKLIST.md](./12-REPLICATION-ACCEPTANCE-CHECKLIST.md) | **Replication Acceptance Checklist** | Comprehensive verification checklists to confirm 100% feature and visual parity in the new workspace. |
| [supabase-migrations/](./supabase-migrations/) | **Database Migrations Directory** | Ordered SQL migration scripts plus a consolidated single-file master schema script (`00_consolidated_full_schema.sql`). |

---

## Critical Reconstruction Rules & Ground Rules

1. **Security & Secrets:** Never commit real API keys, Supabase service-role keys, or live Fast2SMS wallet credentials to public version control. Use `.env` with sanitized placeholders during initial setup.
2. **Unicode Multi-Byte Character Set:** All regional scripts (Devanagari for Hindi/Marathi, Bengali, Telugu) must be processed using **NFC Unicode normalization** (`String.prototype.normalize('NFC')`) when querying and filtering data.
3. **Tailwind CSS v3 Directives:** The application relies on Tailwind CSS 3.4.1. Use standard `@import "tailwindcss/base";` syntax in `src/index.css` and set `"css.lint.unknownAtRules": "ignore"` in `.vscode/settings.json` to prevent editor linter warnings.
4. **Deterministic Phone Authentication:** In this architecture, mobile OTP phone verification is mapped deterministically to Supabase Auth credentials (`<clean_phone>@quickhire.local`) while preserving seamless login and resilient session recovery.
5. **Credit Conservation (SMS Demo Mode):** Fast2SMS live credit consumption is controlled via a persistent state helper (`src/lib/smsConfig.ts`) with an on-screen OTP auto-fill card in Demo mode, enabling complete end-to-end testing without depleting paid wallet balances.

---

## Recommended Replication Roadmap

For an engineer or AI pair programmer starting with an empty repository:
1. **Understand:** Read `01-PROJECT-OVERVIEW.md` and `06-SYSTEM-ARCHITECTURE-AND-DATA-FLOW.md`.
2. **Scaffold:** Execute Phases 1–3 in `11-STEP-BY-STEP-RECONSTRUCTION.md` using packages listed in `02-TECH-STACK-AND-DEPENDENCIES.md`.
3. **Database:** Deploy the schema in Supabase using `supabase-migrations/00_consolidated_full_schema.sql` (detailed in `07-SUPABASE-DATABASE-AND-SECURITY.md`).
4. **Implement Code:** Implement libraries, components, and pages according to `03-PROJECT-STRUCTURE.md`, `04-UI-AND-DESIGN-SPECIFICATION.md`, and `05-FEATURES-AND-BUSINESS-LOGIC.md`.
5. **Verify:** Run the full automated test suite documented in `10-TESTING-AND-KNOWN-ISSUES.md` and complete the acceptance criteria in `12-REPLICATION-ACCEPTANCE-CHECKLIST.md`.
6. **Deploy:** Deploy to GitHub and Vercel following `09-GITHUB-AND-VERCEL-DEPLOYMENT.md`.
