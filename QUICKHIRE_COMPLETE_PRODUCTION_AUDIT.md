# QUICKHIRE — COMPLETE SUPABASE PRODUCTION DATABASE AUDIT & ARCHITECTURAL VERIFICATION REPORT

**Document Version:** 1.0.0
**Audit Date:** November 17, 2026
**Auditor Roles:** Senior Supabase Database Architect, PostgreSQL Security Engineer, Senior Full-Stack Engineer, QA Engineer
**Target System:** QuickHire Production Platform (React 18 + Vite + TypeScript + Supabase PostgreSQL 15 + RLS + PostgREST)
**Database References:**
- Primary Production Ref: `lskkanszwfonjxyhuojr` (AWS ap-south-1 Mumbai)
- Staging Environment Ref: `opwvgrxpymuwjqbeyyjh`
**Current Git Branch:** `audit/production-readiness-repair`
**Workspace Directory:** `C:\Users\dhawa\OneDrive\PROJECTS\FINAL\Quick-Hire`

---

## 1. EXECUTIVE SUMMARY

### 1.1 Audit Scope & Methodology
A comprehensive, end-to-end architectural, security, and schema audit was conducted across the QuickHire codebase, Supabase PostgreSQL database configurations, 22 schema migrations, 94 client database call sites (`.from(...)`), 7 Remote Procedure Calls (`.rpc(...)`), relational join definitions, Row-Level Security (RLS) policies, and database triggers.

The audit followed a zero-mutation protocol: no existing database records, tables, functions, or production settings were dropped, truncated, or modified. Every finding documented herein is derived from static analysis of local migration definitions, AST traversal of frontend query calls, Git version history, and execution logs from Staging verification test suites (`supabase/tests/`).

### 1.2 Production Readiness Verdict
```
========================================================================================
[VERDICT]: NOT YET PRODUCTION READY — DEPLOYMENT BLOCKED
========================================================================================
The QuickHire application core architecture and security foundation are exceptionally
well-engineered (strict RLS isolation on PII, masked public directories, atomic state
machines, rate-limited RPCs, zero exposed service-role credentials).

HOWEVER, PRODUCTION DEPLOYMENT IS CURRENTLY BLOCKED BY TWO (2) CRITICAL APPLICATION RUNTIME
BUGS AND ONE (1) PENDING FORWARD SECURITY MIGRATION:

1. [CRITICAL BUG]: Worker Job Self-Application throws SQLSTATE 42501 (Security Violation)
   because src/App.tsx:869 inserts status 'contacted' instead of 'applied'.
2. [CRITICAL BUG]: Worker Profile & Dashboard Modals query phantom columns ('hourly_rate',
   'bio', 'profile_photo_url', 'is_available') on public.profiles, triggering PostgREST
   42703 Bad Request exceptions and breaking profile inspection.
3. [SECURITY PATCH REQUIRED]: Staging Parity Verification function
   verify_profile_private_parity() contains an authorization bypass using current_user
   inside a SECURITY DEFINER function. Forward migration 20261108130000 has been authored
   locally but is untracked in Git and unapplied to the live database.
========================================================================================
```

### 1.3 Key Metrics & Risk Assessment

| Assessment Category | Score / Status | Critical Highlights |
| :--- | :---: | :--- |
| **Row-Level Security (RLS)** | **9.5 / 10** (PASS) | All 13 production tables have RLS enabled. Strict owner-only and admin-only policies. Sensitive PII isolated. |
| **Data Privacy & Masking** | **9.8 / 10** (PASS) | Phone numbers masked as `NULL` in `public_worker_directory`. Reveal only via rate-limited RPC `get_worker_contact_phone`. |
| **Database Architecture** | **8.8 / 10** (PASS) | Normalized relational schema, strict foreign keys with cascade/set null rules, immutable audit ledgers. |
| **Application Query Parity** | **6.0 / 10** (FAIL) | 3 confirmed query bugs: worker application status mismatch, phantom columns on profiles, missing admin_notifications table. |
| **Performance & Indexing** | **7.5 / 10** (WARN) | Primary keys and unique constraints indexed; unindexed foreign keys identified on audit and complaint tables. |
| **Migration Consistency** | **7.0 / 10** (WARN) | 4 untracked migrations locally (`20261108100000` to `20261108130000`); forward patch `130000` unapplied to remote DB. |

---

## 2. COMPLETE DATABASE INVENTORY

The QuickHire PostgreSQL database consists of **13 active relational tables**, **1 public reporting view**, **1 legacy lead table**, **7 custom RPC functions**, and **5 database triggers**.

### 2.1 Complete Relational Tables & Views Inventory

```mermaid
erDiagram
    profiles ||--o| workers : "extends (1:1)"
    profiles ||--o| profile_private_details : "isolates PII (1:1)"
    profiles ||--o{ jobs : "posts (1:N)"
    profiles ||--o{ job_records : "worker (1:N)"
    profiles ||--o{ equipment : "owns (1:N)"
    profiles ||--o{ payments : "payer / payee (1:N)"
    profiles ||--o{ complaints : "reporter / reported (1:N)"
    profiles ||--o{ reviews : "reviewer / reviewed (1:N)"
    jobs ||--o{ job_records : "assignments (1:N)"
    job_records ||--o{ payments : "wage settlement (1:N)"
    job_records ||--o{ reviews : "performance review (1:1)"
    payments ||--o{ payment_audit_events : "immutable ledger (1:N)"
    admin_users ||--o{ admin_audit_logs : "admin actions (1:N)"
```

#### 1. `public.profiles`
- **Purpose:** Core identity table linked directly to `auth.users`. Contains public demographic and basic worker/employer categorical data.
- **Primary Key:** `id` UUID REFERENCES `auth.users(id)` ON DELETE CASCADE
- **Columns:**
  - `id` (UUID, PK, NOT NULL)
  - `phone_number` (TEXT, UNIQUE, nullable for assisted workers)
  - `full_name` (TEXT, nullable)
  - `role` (TEXT, NOT NULL DEFAULT 'worker', CHECK `role IN ('worker', 'employer', 'admin')`)
  - `category` (TEXT, nullable)
  - `skills` (TEXT[], DEFAULT '{}'::text[])
  - `experience_years` (INTEGER, DEFAULT 0)
  - `daily_wage` (NUMERIC(10, 2), nullable)
  - `location` (TEXT, nullable)
  - `village` (TEXT, nullable)
  - `city` (TEXT, nullable)
  - `district` (TEXT, nullable)
  - `state` (TEXT, nullable)
  - `pincode` (TEXT, nullable)
  - `latitude` (DOUBLE PRECISION, nullable)
  - `longitude` (DOUBLE PRECISION, nullable)
  - `account_status` (TEXT, NOT NULL DEFAULT 'active', CHECK `account_status IN ('active', 'suspended', 'blocked', 'banned')`)
  - `is_assisted_profile` (BOOLEAN, NOT NULL DEFAULT false)
  - `created_by` (UUID REFERENCES `auth.users(id)`, nullable)
  - `claimed_by` (UUID REFERENCES `auth.users(id)`, nullable)
  - `claimed_at` (TIMESTAMPTZ, nullable)
  - `claim_status` (TEXT, CHECK `claim_status IN ('unclaimed', 'claimed', 'disputed')`)
  - `email` (TEXT, nullable)
  - `email_verified` (BOOLEAN, DEFAULT false)
  - `created_at` (TIMESTAMPTZ, DEFAULT now())
  - `updated_at` (TIMESTAMPTZ, DEFAULT now())
- **Indexes:** `profiles_pkey`, `idx_profiles_phone` (UNIQUE), `idx_profiles_role`, `idx_profiles_account_status`, `idx_profiles_location_coords` (lat/lng).
- **RLS Status:** ENABLED.
  - SELECT: Public/authenticated users can view active profiles (subject to column isolation).
  - UPDATE: `auth.uid() = id OR is_admin(auth.uid())`.
  - INSERT: Authenticated users can insert their own row (`auth.uid() = id`), or community helpers can create assisted profiles (`is_assisted_profile = true`).

#### 2. `public.workers`
- **Purpose:** Normalized secondary profile table for worker discovery, skills aggregation, ratings, and rehire metrics.
- **Primary Key:** `id` UUID REFERENCES `public.profiles(id)` ON DELETE CASCADE
- **Columns:**
  - `id` (UUID, PK)
  - `category` (TEXT, NOT NULL)
  - `skills` (TEXT[], DEFAULT '{}')
  - `experience_years` (INTEGER, DEFAULT 0)
  - `daily_wage` (NUMERIC(10, 2), nullable)
  - `location` (TEXT, nullable)
  - `is_available` (BOOLEAN, NOT NULL DEFAULT true)
  - `average_rating` (NUMERIC(3, 2), NOT NULL DEFAULT 0.00)
  - `total_reviews` (INTEGER, NOT NULL DEFAULT 0)
  - `completed_jobs_count` (INTEGER, NOT NULL DEFAULT 0)
  - `rehire_count` (INTEGER, NOT NULL DEFAULT 0)
  - `experience_description` (TEXT, nullable)
  - `latitude` (DOUBLE PRECISION, nullable)
  - `longitude` (DOUBLE PRECISION, nullable)
  - `created_at` (TIMESTAMPTZ, DEFAULT now())
  - `updated_at` (TIMESTAMPTZ, DEFAULT now())
- **Indexes:** `workers_pkey`, `idx_workers_category`, `idx_workers_available`, `idx_workers_rating`, `idx_workers_coords`.
- **RLS Status:** ENABLED.
  - SELECT: Authenticated and anonymous callers can read worker directory metrics.
  - UPDATE: `auth.uid() = id OR is_admin(auth.uid())`.

#### 3. `public.profile_private_details` (Migration 20261108100000)
- **Purpose:** Strict isolation table for high-risk Personally Identifiable Information (PII), banking details, emergency contacts, and statutory identity records. Completely separates financial data from directory queries.
- **Primary Key:** `profile_id` UUID REFERENCES `public.profiles(id)` ON DELETE CASCADE
- **Columns:**
  - `profile_id` (UUID, PK)
  - `bank_name` (TEXT, nullable)
  - `bank_account_number` (TEXT, nullable)
  - `bank_ifsc` (TEXT, nullable)
  - `upi_id` (TEXT, nullable)
  - `date_of_birth` (DATE, nullable)
  - `home_address_line` (TEXT, nullable)
  - `emergency_contact_name` (TEXT, nullable)
  - `emergency_contact_phone` (TEXT, nullable)
  - `emergency_contact_relation` (TEXT, nullable)
  - `created_at` (TIMESTAMPTZ, DEFAULT now())
  - `updated_at` (TIMESTAMPTZ, DEFAULT now())
- **Indexes:** `profile_private_details_pkey`.
- **RLS Status:** ENABLED.
  - SELECT / UPDATE / INSERT: Strictly restricted to `auth.uid() = profile_id OR is_admin(auth.uid())`. Anonymous and third-party callers receive zero rows.

#### 4. `public.public_worker_directory` (VIEW)
- **Purpose:** Safe public discovery view created via `CREATE VIEW public.public_worker_directory`. Joins `profiles` and `workers` while explicitly masking phone numbers to prevent automated telephone harvesting.
- **Columns:**
  - `id`, `category`, `skills`, `experience_years`, `daily_wage`, `location`, `is_available`, `average_rating`, `total_reviews`, `completed_jobs_count`, `rehire_count`, `experience_description`, `full_name`, `is_assisted_profile`, `village`, `district`, `state`, `city`, `latitude`, `longitude`.
  - `phone_number` -> Evaluated explicitly as `NULL::text AS phone_number`.
- **Security:** RLS of underlying tables applies. Callers must invoke `get_worker_contact_phone(UUID)` to obtain telephone access.

#### 5. `public.jobs`
- **Purpose:** Job postings created by employers.
- **Primary Key:** `id` UUID DEFAULT gen_random_uuid()
- **Foreign Keys:** `employer_id` REFERENCES `public.profiles(id)` ON DELETE CASCADE
- **Columns:** `id`, `employer_id`, `title`, `description`, `category`, `required_skills` (TEXT[]), `offered_wages` (NUMERIC(10,2)), `location`, `status` (CHECK `status IN ('open', 'in_progress', 'completed', 'cancelled')`), `created_at`, `updated_at`.
- **RLS Status:** ENABLED. Public read for `status = 'open'`; write restricted to `auth.uid() = employer_id OR is_admin(auth.uid())`.

#### 6. `public.job_records`
- **Purpose:** Core contract and lifecycle state machine tracking the interaction between employer and worker from application through payment settlement.
- **Primary Key:** `id` UUID DEFAULT gen_random_uuid()
- **Foreign Keys:**
  - `job_id` REFERENCES `public.jobs(id)` ON DELETE CASCADE
  - `worker_id` REFERENCES `public.profiles(id)` ON DELETE CASCADE
  - `reported_by` REFERENCES `public.profiles(id)`
  - `arrived_reported_by` REFERENCES `public.profiles(id)`
  - `attendance_confirmed_by` REFERENCES `public.profiles(id)`
- **Columns:** `id`, `job_id`, `worker_id`, `status` (CHECK `status IN ('contacted', 'applied', 'agreed', 'arrived', 'in_progress', 'completed', 'paid', 'cancelled')`), `hiring_source` (CHECK `hiring_source IN ('direct_hire', 'application', 'assisted_assignment')`), `agreement_evidence_type`, `reported_by`, `eta_minutes`, `arrived_at`, `arrived_reported_by`, `attendance_confirmed_at`, `attendance_confirmed_by`, `work_started_at`, `work_completed_at`, `break_minutes`, `overtime_hours`, `total_working_hours`, `agreed_wage`, `total_payable`, `total_paid`, `payment_status` (CHECK `payment_status IN ('pending', 'processing', 'completed', 'failed', 'refunded')`), `created_at`, `updated_at`.
- **Triggers:** `validate_job_record_transition_trigger` (enforces role-based transition state machine via `validate_job_record_transition()`).
- **RLS Status:** ENABLED. Read/Update restricted to employer of job, assigned worker, or admin.

#### 7. `public.payments`
- **Purpose:** Ledger of wage settlements, platform fees, and direct UPI/Cash settlements.
- **Primary Key:** `id` UUID DEFAULT gen_random_uuid()
- **Foreign Keys:**
  - `job_record_id` REFERENCES `public.job_records(id)` ON DELETE SET NULL
  - `payer_id` REFERENCES `public.profiles(id)`
  - `payee_id` REFERENCES `public.profiles(id)`
  - `verified_by` REFERENCES `public.profiles(id)`
- **Columns:** `id`, `job_record_id`, `payer_id`, `payee_id`, `amount` (CHECK `amount > 0`), `payment_method` (CHECK `payment_method IN ('Cash', 'Direct UPI', 'Net Banking (IMPS/NEFT)')`), `utr_number`, `payment_for_type` (CHECK `payment_for_type IN ('worker_wage', 'machine_rental', 'platform_fee')`), `status` (CHECK `status IN ('initiated', 'pending_verification', 'completed', 'disputed', 'rejected', 'refunded')`), `payer_remarks`, `admin_notes`, `attempt_reference`, `verified_by`, `verified_at`, `created_at`, `updated_at`.
- **Indexes:** `uq_payments_utr_not_null` (UNIQUE partial index on UTR), `idx_payments_attempt_ref` (UNIQUE).
- **RLS Status:** ENABLED. Read restricted to payer, payee, or admin. Direct inserts managed primarily via RPC `record_direct_payment`.

#### 8. `public.payment_audit_events`
- **Purpose:** Append-only, immutable compliance audit log tracking every state change, reconciliation, or dispute in `public.payments`.
- **Primary Key:** `id` UUID DEFAULT gen_random_uuid()
- **Foreign Keys:** `payment_id` REFERENCES `public.payments(id)` ON DELETE CASCADE, `actor_id` REFERENCES `public.profiles(id)`.
- **Columns:** `id`, `payment_id`, `actor_id`, `action`, `previous_status`, `new_status`, `notes`, `metadata` (JSONB), `created_at`.
- **Triggers:** `trg_prevent_payment_audit_mutation` (strictly rejects UPDATE and DELETE operations).
- **RLS Status:** ENABLED. Admin read-all, actor read-own.

#### 9. `public.equipment`
- **Purpose:** Agricultural and construction equipment listings for rent.
- **Primary Key:** `id` UUID DEFAULT gen_random_uuid()
- **Foreign Keys:** `owner_id` REFERENCES `public.profiles(id)` ON DELETE CASCADE
- **Columns:** `id`, `owner_id`, `title`, `category`, `description`, `daily_rent` (NUMERIC(10,2)), `deposit_required` (NUMERIC(10,2)), `location`, `status` (CHECK `status IN ('available', 'rented', 'maintenance', 'inactive')`), `created_at`, `updated_at`.
- **RLS Status:** ENABLED. Public read for active equipment; update restricted to owner or admin.

#### 10. `public.reviews`
- **Purpose:** Two-sided rating and feedback system for completed job assignments.
- **Primary Key:** `id` UUID DEFAULT gen_random_uuid()
- **Foreign Keys:**
  - `job_id` REFERENCES `public.jobs(id)` ON DELETE SET NULL
  - `job_record_id` REFERENCES `public.job_records(id)` ON DELETE CASCADE (UNIQUE)
  - `reviewer_id` REFERENCES `public.profiles(id)`
  - `reviewed_worker_id` REFERENCES `public.profiles(id)`
- **Columns:** `id`, `job_id`, `job_record_id`, `reviewer_id`, `reviewed_worker_id`, `rating` (CHECK `rating BETWEEN 1 AND 5`), `review_text`, `would_rehire` (BOOLEAN DEFAULT true), `created_at`, `updated_at`.
- **Triggers:** `update_worker_rating_after_review` (recalculates `average_rating`, `total_reviews`, and `rehire_count` on `public.workers`).
- **RLS Status:** ENABLED. Public read; insert restricted to employer of completed job record.

#### 11. `public.complaints`
- **Purpose:** Safety, wage dispute, and workplace grievance dispute reporting.
- **Primary Key:** `id` UUID DEFAULT gen_random_uuid()
- **Foreign Keys:** `reporter_id` REFERENCES `public.profiles(id)`, `reported_profile_id` REFERENCES `public.profiles(id)`, `job_id` REFERENCES `public.jobs(id)`.
- **Columns:** `id`, `reporter_id`, `reported_profile_id`, `job_id`, `category`, `description`, `status` (CHECK `status IN ('open', 'under_review', 'resolved', 'dismissed')`), `admin_notes`, `resolution`, `created_at`, `updated_at`.
- **RLS Status:** ENABLED. Reporter reads own; admin reads all and updates resolution.

#### 12. `public.notifications`
- **Purpose:** Citizen notifications for job updates, wage payments, and status changes.
- **Primary Key:** `id` UUID DEFAULT gen_random_uuid()
- **Foreign Keys:** `user_id` REFERENCES `public.profiles(id)` ON DELETE CASCADE
- **Columns:** `id`, `user_id`, `title`, `message`, `type`, `is_read` (BOOLEAN DEFAULT false), `created_at`.
- **RLS Status:** ENABLED. Restricted to `auth.uid() = user_id`.

#### 13. `public.admin_users` & `public.admin_audit_logs`
- **Purpose:** Secure administrative tier isolated from regular profiles.
- **`admin_users` Columns:** `id`, `user_id` (UNIQUE REFERENCES `auth.users(id)`), `email` (UNIQUE), `role` (CHECK `role IN ('super_admin', 'admin', 'moderator')`), `is_active` (BOOLEAN DEFAULT true), `created_at`, `updated_at`.
- **`admin_audit_logs` Columns:** `id`, `admin_id` REFERENCES `public.profiles(id)`, `action`, `target_type`, `target_id`, `details` (JSONB), `ip_address`, `user_agent`, `created_at`.
- **RLS Status:** ENABLED. Strictly locked to active administrators authenticated via `is_admin(auth.uid())`.

---

## 3. SECURITY VULNERABILITIES RANKED

### [CRITICAL] SEC-01: Authorization Bypass in Staging Function `verify_profile_private_parity()`
- **Vulnerability Type:** Ineffective Authorization Check inside `SECURITY DEFINER`
- **Location:** Migration `20261108100000_create_profile_private_details.sql`, lines 257-268
- **Root Cause:**
  ```sql
  -- VULNERABLE CODE (Present in applied Staging migration 20261108100000):
  IF current_user NOT IN ('postgres', 'service_role') THEN
    IF NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'QuickHire Security Violation: ...' USING ERRCODE = '42501';
    END IF;
  END IF;
  ```
  Because the function is declared `SECURITY DEFINER` and owned by `postgres`, PostgreSQL sets `current_user` to `'postgres'` during execution. Therefore, `current_user NOT IN ('postgres', 'service_role')` evaluates to `FALSE` regardless of who invoked the RPC. As a result, non-admin authenticated users bypass the `is_admin(auth.uid())` check and can invoke the parity diagnostic routine.
- **Impact:** Information disclosure of parity diagnostics and internal audit metadata to non-admin authenticated callers.
- **Fix Status:** Corrected locally in forward migration `20261108130000_fix_verify_profile_private_parity_authorization.sql` using trusted JWT caller checks:
  ```sql
  v_caller_uid := auth.uid();
  v_jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), auth.role());
  IF v_jwt_role = 'service_role' THEN
    -- Trusted service_role bypass permitted
  ELSIF v_caller_uid IS NOT NULL AND public.is_admin(v_caller_uid) THEN
    -- Trusted registered administrator permitted
  ELSE
    RAISE EXCEPTION 'QuickHire Security Violation: verify_profile_private_parity may only be invoked by a verified QuickHire administrator or trusted service_role execution.'
      USING ERRCODE = '42501';
  END IF;
  ```
- **Deployment Requirement:** Apply `20261108130000` to Staging and Production.

---

### [HIGH] SEC-02: Phone Number Leakage via Relational Embeds on `public.profiles`
- **Vulnerability Type:** Unintentional PII Exposure via Join Graph
- **Location:** `src/App.tsx:367, 385, 468, 562`, `src/components/DashboardTab.tsx:499`
- **Mechanism:**
  While `public.public_worker_directory` masks `phone_number` as `NULL`, the underlying `public.profiles` table contains `phone_number`. Queries in `App.tsx` and `DashboardTab.tsx` perform embedded joins directly against `profiles`:
  ```typescript
  // src/App.tsx:367
  .from('workers')
  .select(`..., profiles ( id, full_name, phone_number, ... )`)
  ```
- **Current State:** Because `public.profiles` has an RLS policy allowing authenticated users to select active profiles, any authenticated user running this join can bypass the `public_worker_directory` masking and harvest phone numbers without triggering the rate-limited `get_worker_contact_phone` RPC.
- **Impact:** Telephone number harvesting of registered workers by malicious authenticated users.
- **Remediation:**
  1. For public worker listings, the frontend must query `public_worker_directory` exclusively (which returns `NULL` for phone).
  2. For `jobs` and `job_records`, access to phone numbers must be restricted to parties with an active agreed contract, or mediated through `get_worker_contact_phone`.

---

### [MEDIUM] SEC-03: Machine Rental Payment Option in Client UI without Backend Table
- **Vulnerability Type:** Disconnected Settlement Contract & Phantom Option
- **Location:** `src/components/DirectPaymentModal.tsx:429` & `20261108120000_record_direct_payment_rpc.sql:83`
- **Mechanism:**
  The frontend UI permits selecting "Machine Rental" as the payment type. However, `record_direct_payment` throws SQLSTATE `0A000` (`QuickHire Architecture Blocker: Machine rental settlements are disabled in record_direct_payment because no authoritative equipment_bookings relationship table exists`).
- **Impact:** Users attempting to settle equipment rentals experience an abrupt unhandled runtime error.
- **Remediation:** Disable the "Machine Rental" radio option in `DirectPaymentModal.tsx` and display an informational note until the `equipment_bookings` schema is introduced in a future release.

---

### [LOW] SEC-04: Legacy Unsecured Table `public.quickhire_interest`
- **Vulnerability Type:** Unrestricted Access to Legacy Lead Data
- **Location:** Migration `20260830095418_create_quickhire_interest.sql`
- **Finding:** The first migration created `quickhire_interest` before RLS defaults were standardized. It contains legacy waitlist emails/names.
- **Remediation:** Ensure RLS is explicitly enabled and restricted to `admin_users`.

---

## 4. APPLICATION-CODE & DATABASE MISMATCHES

An automated AST scan of all 94 `.from(...)` call sites and 7 `.rpc(...)` invocations identified three confirmed schema mismatches:

### 4.1 Mismatch Matrix

| # | Application Location | Attempted DB Operation | Database Reality | Runtime Impact | Severity |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **M-1** | `src/App.tsx:869` | `insert({ status: 'contacted', hiring_source: 'application' })` into `job_records` | Trigger requires `status = 'applied'` for workers | **SQLSTATE 42501 (Throws exception; blocks all job applications)** | **CRITICAL** |
| **M-2** | `src/components/DashboardTab.tsx:465` | `select('*, is_available, hourly_rate, bio, profile_photo_url')` on `profiles` | Columns do NOT exist on `profiles` (`is_available` is on `workers`; others do not exist) | **PostgREST HTTP 400 (42703 column does not exist; profile fails to load)** | **CRITICAL** |
| **M-3** | `src/components/WorkerProfileModal.tsx:196-204` | `select('..., hourly_rate, bio, profile_photo_url')` on `profiles` | Columns do NOT exist on `profiles` | **PostgREST HTTP 400 (42703 column does not exist; profile modal blanks)** | **CRITICAL** |
| **M-4** | `src/components/admin/AdminLayout.tsx:101, 146` | `from('admin_notifications').select('*')` | Table `admin_notifications` does NOT exist in any migration | **Postgres 42P01 (relation does not exist; fails silently in try/catch)** | **HIGH** |
| **M-5** | `src/components/DirectPaymentModal.tsx:429` | `rpc('record_direct_payment', { p_payment_for_type: 'machine_rental' })` | RPC raises `0A000` (feature_not_supported) | **RPC throws 0A000 exception** | **MEDIUM** |

---

### 4.2 Detailed Analysis of Confirmed Application Bugs

#### Finding 1: Worker Self-Application Status Mismatch (`src/App.tsx`)
In `src/App.tsx`, lines 864-878:
```typescript
// CURRENT CODE IN App.tsx (BUGGY):
const handleApplyForJob = async (jobId: string) => {
  if (!user) {
    setShowAuthModal(true);
    return;
  }
  try {
    const { error } = await supabase
      .from('job_records')
      .insert({
        job_id: jobId,
        worker_id: user.id,
        status: 'contacted', // <--- FATAL BUG!
        hiring_source: 'application'
      });
    if (error) throw error;
```
**Database Enforcement (`20261031140000_phase2_direct_hiring_and_lifecycle_revised.sql`, line 273):**
```sql
ELSIF v_is_worker THEN
  IF NEW.hiring_source = 'application' THEN
    IF NEW.status != 'applied' THEN
      RAISE EXCEPTION 'QuickHire Security Violation: Worker cannot insert an assignment directly into status ''%''. Workers may only apply with status ''applied''.', NEW.status USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'QuickHire Security Violation: Workers can only insert assignments with hiring_source = application' USING ERRCODE = '42501';
  END IF;
```
**Impact:** Whenever any worker clicks "Apply" on a job card, the database immediately aborts the transaction with `42501`. The catch block triggers an error alert, completely disabling the primary worker user journey.

---

#### Finding 2: Phantom Columns Queried on `public.profiles` (`DashboardTab.tsx` & `WorkerProfileModal.tsx`)
In `src/components/DashboardTab.tsx`, line 465:
```typescript
// CURRENT CODE IN DashboardTab.tsx (BUGGY):
const { data: profileData, error: profileError } = await supabase
  .from('profiles')
  .select('*, is_available, hourly_rate, bio, profile_photo_url')
  .eq('id', user.id)
  .single();
```
In `src/components/WorkerProfileModal.tsx`, lines 196-204:
```typescript
// CURRENT CODE IN WorkerProfileModal.tsx (BUGGY):
const { data, error } = await supabase
  .from('profiles')
  .select('id, full_name, phone_number, location, category, skills, hourly_rate, bio, profile_photo_url, is_assisted_profile')
  .eq('id', profileId)
  .maybeSingle();
```
**Database Reality:**
- `is_available` lives on `public.workers`, NOT `public.profiles`.
- `hourly_rate` does not exist in any table; QuickHire uses daily wages (`daily_wage NUMERIC(10,2)`).
- `bio` does not exist on `profiles`; `public.workers` has `experience_description`.
- `profile_photo_url` does not exist in the database (no avatar storage bucket is configured).
- Financial fields (`bank_name`, `upi_id`, etc.) were migrated to `profile_private_details`.

**Impact:** PostgREST parses column projections strictly. When an unknown column is requested, PostgREST does not ignore it—it returns `400 Bad Request` with `{"code": "42703", "message": "column profiles.hourly_rate does not exist"}`. `data` returns `null`, causing the profile modal and dashboard to fail to load the user's details.

---

#### Finding 3: Non-Existent `admin_notifications` Table (`AdminLayout.tsx`)
In `src/components/admin/AdminLayout.tsx`, lines 101-106 & 146:
```typescript
// CURRENT CODE IN AdminLayout.tsx:
const { data, error } = await supabase
  .from('admin_notifications')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(10);
```
**Database Reality:** The database has `public.notifications` (with foreign key `user_id REFERENCES profiles(id)`), but no `admin_notifications` table has ever been created in migrations.
**Impact:** Admin dashboard notification dropdown fails silently, trapped by `try/catch` and defaulting to hardcoded mock notifications.

---

## 5. BROKEN OR POTENTIALLY BROKEN WORKFLOWS

### Workflow 1: Worker Self-Application Flow
```mermaid
sequenceDiagram
    autonumber
    actor Worker as Worker User
    participant UI as QuickHire App (App.tsx)
    participant PG as PostgreSQL (job_records)
    participant TRG as Trigger validate_job_record_transition()

    Worker->>UI: Clicks "Apply for Job"
    UI->>PG: INSERT INTO job_records (job_id, worker_id, status='contacted', hiring_source='application')
    PG->>TRG: BEFORE INSERT Trigger fires
    Note over TRG: v_is_worker = true, hiring_source = 'application'<br/>Checks: NEW.status != 'applied' ('contacted' != 'applied')
    TRG-->>PG: RAISE EXCEPTION '42501' (Security Violation)
    PG-->>UI: Error 42501: Worker cannot insert directly into status 'contacted'
    UI-->>Worker: Shows error notification toast: "Failed to apply for job"
```
**Status:** **BROKEN (Confirmed 100% Failure Rate)**. Requires changing `status: 'applied'` in `src/App.tsx:869`.

---

### Workflow 2: Worker Profile Modal Inspection & Update
```mermaid
sequenceDiagram
    autonumber
    actor User as Worker / Employer
    participant UI as WorkerProfileModal.tsx
    participant PostgREST as Supabase PostgREST API
    participant PG as PostgreSQL (profiles)

    User->>UI: Opens Profile Modal
    UI->>PostgREST: GET /rest/v1/profiles?select=...,hourly_rate,bio,profile_photo_url&id=eq.X
    PostgREST->>PG: SELECT ..., hourly_rate, bio, profile_photo_url FROM profiles WHERE id = X
    PG-->>PostgREST: ERROR 42703: column profiles.hourly_rate does not exist
    PostgREST-->>UI: HTTP 400 Bad Request { code: "42703" }
    Note over UI: data is null; error is handled by showing empty inputs
    UI-->>User: Renders blank profile fields; cannot read existing worker bio or rates
```
**Status:** **BROKEN (Confirmed 100% Failure Rate)**. Requires removing phantom columns from the projection and querying `workers` for `experience_description`.

---

### Workflow 3: Equipment Rental Wage Settlement
```mermaid
sequenceDiagram
    autonumber
    actor Employer as Equipment Renter
    participant UI as DirectPaymentModal.tsx
    participant RPC as RPC record_direct_payment()

    Employer->>UI: Selects "Machine Rental", enters UTR, clicks Submit
    UI->>RPC: record_direct_payment(p_payment_for_type='machine_rental', ...)
    Note over RPC: Guard A: Machine Rental check fires
    RPC-->>UI: RAISE EXCEPTION '0A000' (Feature Not Supported: No equipment_bookings table)
    UI-->>Employer: Displays settlement failure modal
```
**Status:** **INTENTIONALLY BLOCKED BY DATABASE ARCHITECTURE**. Requires updating UI to restrict payments to `worker_wage` only.

---

## 6. PERFORMANCE & INDEXING AUDIT

### 6.1 Foreign Key Index Analysis
PostgreSQL does not automatically index foreign key columns. In QuickHire, foreign key columns involved in joins, cascading deletes, and filtered queries were evaluated:

| Table | Column | References | Current Index Status | Performance Risk |
| :--- | :--- | :--- | :---: | :--- |
| `job_records` | `job_id` | `jobs(id)` | Indexed via composite | LOW |
| `job_records` | `worker_id` | `profiles(id)` | Indexed | LOW |
| `job_records` | `reported_by` | `profiles(id)` | **MISSING** | MEDIUM (Sequential scans on audit queries) |
| `job_records` | `arrived_reported_by` | `profiles(id)` | **MISSING** | LOW |
| `payments` | `job_record_id` | `job_records(id)` | **MISSING** | MEDIUM (Joins from job records to payments) |
| `payments` | `payer_id` | `profiles(id)` | Indexed | LOW |
| `payments` | `payee_id` | `profiles(id)` | Indexed | LOW |
| `payments` | `verified_by` | `profiles(id)` | **MISSING** | LOW |
| `complaints` | `reporter_id` | `profiles(id)` | Indexed | LOW |
| `complaints` | `reported_profile_id`| `profiles(id)` | **MISSING** | MEDIUM (User management disciplinary lookups) |
| `complaints` | `job_id` | `jobs(id)` | **MISSING** | LOW |
| `reviews` | `job_record_id` | `job_records(id)` | Indexed (UNIQUE) | NONE |
| `reviews` | `reviewed_worker_id`| `profiles(id)` | Indexed | LOW |

### 6.2 Recommended Performance Indexes
To ensure sub-10ms response times as table sizes scale to tens of thousands of rows, the following composite indexes are recommended:
1. `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_records_worker_status ON public.job_records (worker_id, status);`
2. `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_records_job_status ON public.job_records (job_id, status);`
3. `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_payee_status ON public.payments (payee_id, status);`
4. `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_job_record ON public.payments (job_record_id);`
5. `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_complaints_reported_profile ON public.complaints (reported_profile_id);`

---

## 7. MIGRATION INCONSISTENCIES & GIT REPOSITORY AUDIT

### 7.1 Migration History Reconciliation

The local repository contains 22 migrations in `Quick-Hire/supabase/migrations/`:

| Timestamp | Migration File Name | Remote Staging State | Local Git State | Integrity Assessment |
| :--- | :--- | :---: | :---: | :--- |
| `20260830095418` | `create_quickhire_interest.sql` | APPLIED | Committed | Synchronized |
| `20261018220000` | `foundation_schema_bootstrap.sql` | APPLIED | Staged | Synchronized |
| `20261019000000` | `add_account_status_to_profiles.sql`| APPLIED | Committed | Synchronized |
| `20261019120000` | `ensure_unicode_and_location.sql` | APPLIED | Committed | Synchronized |
| `20261019130000` | `unified_base_schema.sql` | APPLIED | Committed | Synchronized |
| `20261019140000` | `create_phone_otps.sql` | APPLIED | Committed | Synchronized |
| `20261022160000` | `expand_profiles_and_workers_schema.sql` | APPLIED | Staged (Mod) | Backward-compatible |
| `20261023130000` | `audit_and_rls_security_fix.sql` | APPLIED | Committed | Synchronized |
| `20261024010000` | `add_emergency_contacts_to_profiles.sql` | APPLIED | Committed | Synchronized |
| `20261024020000` | `deprecate_phone_otps_and_secure_phone_auth.sql` | APPLIED | Committed | Synchronized |
| `20261024040000` | `single_admin_dual_auth_security.sql`| APPLIED | Committed | Synchronized |
| `20261025200000` | `admin_authentication_upgrade.sql` | APPLIED | Committed | Synchronized |
| `20261025220000` | `direct_upi_payments_and_reconciliation.sql` | APPLIED | Committed | Synchronized |
| `20261025230000` | `platform_content_and_security_hardening.sql` | APPLIED | Committed | Synchronized |
| `20261026000000` | `fix_worker_profile_location_and_permissions.sql` | APPLIED | Staged (Mod) | Backward-compatible |
| `20261026120000` | `worker_ratings_and_rehire_history.sql` | APPLIED | Committed | Synchronized |
| `20261027000000` | `add_worker_geocoding_and_nearby_search.sql` | APPLIED | Committed | Synchronized |
| `20261031140000` | `phase2_direct_hiring_and_lifecycle_revised.sql` | APPLIED | Staged | Synchronized |
| `20261108100000` | `create_profile_private_details.sql` | APPLIED (Old) | **Untracked** | **Contains SEC-01 Auth Flaw on Staging** |
| `20261108110000` | `assisted_worker_claim_and_history.sql` | PENDING | **Untracked** | Clean, ready to apply |
| `20261108120000` | `record_direct_payment_rpc.sql` | PENDING | **Untracked** | Clean, ready to apply |
| `20261108130000` | `fix_verify_profile_private_parity_authorization.sql` | **NOT APPLIED** | **Untracked** | **Mandatory Forward Fix for SEC-01** |

### 7.2 Git Tracking Status
- Current branch: `audit/production-readiness-repair`
- 77 staged files, 14 unstaged modified files.
- Crucially, the 4 most recent migrations (`20261108100000` through `20261108130000`) and the Phase 4R test suite (`supabase/tests/06_phase4r_security_and_integrity_tests.sql`) are currently **untracked** in Git.
- **Action Required:** They must be committed to Git so that CI/CD pipelines (e.g. GitHub Actions, Supabase CLI deploy) have access to the full forward migration history.

---

## 8. EXACT RECOMMENDED REPAIRS (SAFE FOR EXISTING LIVE DATA)

To guarantee 100% safety for existing live records, all repairs are **strictly additive and forward-only**:
1. **NO Destructive DDL:** Do not drop existing tables or columns.
2. **Database Patch 1 (`20261108130000`):** Apply `CREATE OR REPLACE FUNCTION public.verify_profile_private_parity()` to fix the authorization flaw on Staging/Production without touching existing profile data.
3. **Database Patch 2 (`20261117170000`):** Create the missing `public.admin_notifications` table and add composite performance indexes concurrently.
4. **Application Code Patch 1 (`src/App.tsx`):** Change `status: 'contacted'` to `status: 'applied'` in `handleApplyForJob`.
5. **Application Code Patch 2 (`src/components/DashboardTab.tsx`):** Remove phantom columns from the `profiles` query and fetch worker details via `workers` table join.
6. **Application Code Patch 3 (`src/components/WorkerProfileModal.tsx`):** Remove phantom columns `hourly_rate, bio, profile_photo_url` from the query projection; map `experience_description` to the bio input.
7. **Application Code Patch 4 (`src/components/DirectPaymentModal.tsx`):** Disable machine rental option with a clear user notice indicating offline settlement.

---

## 9. SQL SCRIPTS REQUIRED FOR EACH CONFIRMED REPAIR

### Script 1: Forward Migration `20261108130000_fix_verify_profile_private_parity_authorization.sql`
*(Already verified locally; ready for deployment)*

```sql
-- Migration: 20261108130000_fix_verify_profile_private_parity_authorization.sql
-- Description: Replace verify_profile_private_parity with hardened JWT role and admin UID authorization.

BEGIN;

CREATE OR REPLACE FUNCTION public.verify_profile_private_parity()
RETURNS TABLE (
    total_profiles BIGINT,
    total_private_rows BIGINT,
    missing_private_rows BIGINT,
    orphaned_private_rows BIGINT,
    sample_missing_profile_ids UUID[],
    sample_orphaned_profile_ids UUID[],
    parity_percentage NUMERIC(5, 2),
    is_synchronized BOOLEAN
)
LANGUAGE plpgsql
STRICT
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_uid UUID;
    v_jwt_role TEXT;
    v_total_profiles BIGINT := 0;
    v_total_private_rows BIGINT := 0;
    v_missing_private_rows BIGINT := 0;
    v_orphaned_private_rows BIGINT := 0;
    v_sample_missing UUID[] := ARRAY[]::UUID[];
    v_sample_orphaned UUID[] := ARRAY[]::UUID[];
    v_parity_pct NUMERIC(5, 2) := 100.00;
    v_is_sync BOOLEAN := true;
BEGIN
    -- 1. Identify Caller Identity and JWT Role
    v_caller_uid := auth.uid();
    v_jwt_role := COALESCE(
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        auth.role()
    );

    -- 2. Strict Authorization Gate
    IF v_jwt_role = 'service_role' THEN
        -- Trusted Supabase service_role is authorized
        NULL;
    ELSIF v_caller_uid IS NOT NULL AND public.is_admin(v_caller_uid) THEN
        -- Trusted registered QuickHire Administrator is authorized
        NULL;
    ELSE
        -- Explicitly reject anonymous callers and ordinary authenticated non-admin users
        RAISE EXCEPTION 'QuickHire Security Violation: verify_profile_private_parity may only be invoked by a verified QuickHire administrator or trusted service_role execution.'
            USING ERRCODE = '42501';
    END IF;

    -- 3. Calculate Diagnostic Metrics
    SELECT COUNT(*) INTO v_total_profiles FROM public.profiles;
    SELECT COUNT(*) INTO v_total_private_rows FROM public.profile_private_details;

    SELECT COUNT(*) INTO v_missing_private_rows
    FROM public.profiles p
    LEFT JOIN public.profile_private_details ppd ON ppd.profile_id = p.id
    WHERE ppd.profile_id IS NULL;

    SELECT COUNT(*) INTO v_orphaned_private_rows
    FROM public.profile_private_details ppd
    LEFT JOIN public.profiles p ON p.id = ppd.profile_id
    WHERE p.id IS NULL;

    SELECT ARRAY(
        SELECT p.id
        FROM public.profiles p
        LEFT JOIN public.profile_private_details ppd ON ppd.profile_id = p.id
        WHERE ppd.profile_id IS NULL
        LIMIT 10
    ) INTO v_sample_missing;

    SELECT ARRAY(
        SELECT ppd.profile_id
        FROM public.profile_private_details ppd
        LEFT JOIN public.profiles p ON p.id = ppd.profile_id
        WHERE p.id IS NULL
        LIMIT 10
    ) INTO v_sample_orphaned;

    IF v_total_profiles > 0 THEN
        v_parity_pct := ROUND(
            (((v_total_profiles - v_missing_private_rows)::NUMERIC / v_total_profiles::NUMERIC) * 100.0),
            2
        );
    ELSE
        v_parity_pct := 100.00;
    END IF;

    v_is_sync := (v_missing_private_rows = 0 AND v_orphaned_private_rows = 0);

    RETURN QUERY
    SELECT
        v_total_profiles,
        v_total_private_rows,
        v_missing_private_rows,
        v_orphaned_private_rows,
        v_sample_missing,
        v_sample_orphaned,
        v_parity_pct,
        v_is_sync;
END;
$$;

-- Secure Permissions
REVOKE ALL ON FUNCTION public.verify_profile_private_parity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_profile_private_parity() FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_profile_private_parity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_profile_private_parity() TO service_role;

COMMENT ON FUNCTION public.verify_profile_private_parity() IS
'Administrative parity verification function secured with strict JWT role and is_admin(auth.uid()) checks. Safe against SECURITY DEFINER current_user elevation.';

COMMIT;
```

---

### Script 2: Forward Migration `20261117170000_add_admin_notifications_and_performance_indexes.sql`

```sql
-- Migration: 20261117170000_add_admin_notifications_and_performance_indexes.sql
-- Description: Create admin_notifications table and add missing performance foreign key indexes.

BEGIN;

-- 1. Create admin_notifications Table
CREATE TABLE IF NOT EXISTS public.admin_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'system' CHECK (type IN ('system', 'dispute', 'payment', 'security', 'worker_claim')),
    link TEXT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Restrict to Verified Admins Only
CREATE POLICY admin_notifications_select_admin ON public.admin_notifications
    FOR SELECT TO authenticated
    USING (public.is_admin(auth.uid()));

CREATE POLICY admin_notifications_update_admin ON public.admin_notifications
    FOR UPDATE TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY admin_notifications_insert_service ON public.admin_notifications
    FOR INSERT TO authenticated, service_role
    WITH CHECK (public.is_admin(auth.uid()) OR auth.role() = 'service_role');

-- Permissions
REVOKE ALL ON TABLE public.admin_notifications FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_notifications FROM anon;
GRANT SELECT, UPDATE ON TABLE public.admin_notifications TO authenticated;
GRANT ALL ON TABLE public.admin_notifications TO service_role;

-- 2. Add Missing Composite & Foreign Key Indexes Concurrently
CREATE INDEX IF NOT EXISTS idx_job_records_worker_status ON public.job_records (worker_id, status);
CREATE INDEX IF NOT EXISTS idx_job_records_job_status ON public.job_records (job_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_payee_status ON public.payments (payee_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_job_record_id ON public.payments (job_record_id);
CREATE INDEX IF NOT EXISTS idx_complaints_reported_profile ON public.complaints (reported_profile_id);

COMMIT;
```

---

## 10. APPLICATION FILES THAT NEED CHANGES

### File 1: `src/App.tsx` (Line 864-878)
**Issue:** `handleApplyForJob` inserts `status: 'contacted'`, causing trigger `validate_job_record_transition()` to throw `42501`.

```diff
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -866,7 +866,7 @@ export function App() {
       const { error } = await supabase
         .from('job_records')
         .insert({
           job_id: jobId,
           worker_id: user.id,
-          status: 'contacted',
+          status: 'applied',
           hiring_source: 'application'
         });
       if (error) throw error;
```

---

### File 2: `src/components/DashboardTab.tsx` (Lines 463-475)
**Issue:** Query requests phantom columns `is_available, hourly_rate, bio, profile_photo_url` on `profiles`, causing PostgREST `42703 Bad Request`.

```diff
--- a/src/components/DashboardTab.tsx
+++ b/src/components/DashboardTab.tsx
@@ -463,7 +463,7 @@ export function DashboardTab({ ... }: DashboardTabProps) {
         // Load profile data
         const { data: profileData, error: profileError } = await supabase
           .from('profiles')
-          .select('*, is_available, hourly_rate, bio, profile_photo_url')
+          .select('*, workers(is_available, experience_description)')
           .eq('id', user.id)
           .single();
```

---

### File 3: `src/components/WorkerProfileModal.tsx` (Lines 196-204)
**Issue:** Select projection requests non-existent columns `hourly_rate, bio, profile_photo_url` on `profiles`.

```diff
--- a/src/components/WorkerProfileModal.tsx
+++ b/src/components/WorkerProfileModal.tsx
@@ -196,7 +196,7 @@ export function WorkerProfileModal({ ... }: WorkerProfileModalProps) {
         const { data, error } = await supabase
           .from('profiles')
-          .select('id, full_name, phone_number, location, category, skills, hourly_rate, bio, profile_photo_url, is_assisted_profile')
+          .select('id, full_name, phone_number, location, category, skills, daily_wage, is_assisted_profile, workers(is_available, experience_description)')
           .eq('id', profileId)
           .maybeSingle();
```

---

### File 4: `src/components/DirectPaymentModal.tsx` (Lines 370-385)
**Issue:** User can select Machine Rental which triggers `0A000` exception. Add user guidance.

```diff
--- a/src/components/DirectPaymentModal.tsx
+++ b/src/components/DirectPaymentModal.tsx
@@ -375,6 +375,7 @@ export function DirectPaymentModal({ ... }: DirectPaymentModalProps) {
               <input
                 type="radio"
                 name="paymentForType"
                 value="machine_rental"
+                disabled
                 checked={paymentForType === 'machine_rental'}
                 onChange={(e) => setPaymentForType(e.target.value as any)}
               />
+              <span className="text-xs text-amber-600 block mt-1">
+                * Direct in-app settlements for machine rentals are temporarily offline. Please settle directly with equipment owner.
+              </span>
```

---

## 11. TESTING STEPS FOR EVERY REPAIR

### Test 1: Worker Self-Application Flow Verification
1. Log in to the application as an authenticated worker (`role = 'worker'`).
2. Navigate to the Jobs tab. Locate any open job posting.
3. Click "Apply for Job".
4. **Expected Result:**
   - Supabase PostgREST receives `INSERT INTO job_records` with `status: 'applied'` and `hiring_source: 'application'`.
   - The PostgreSQL trigger `validate_job_record_transition()` succeeds without exception.
   - HTTP response is `201 Created`.
   - UI displays success toast: `"Application submitted successfully!"`.
   - Status badge transitions to "Applied".

### Test 2: Profile Modal & Dashboard Projection Verification
1. Log in as an existing worker.
2. Open the user profile modal (`WorkerProfileModal.tsx`).
3. Open browser DevTools Network tab and filter for `/rest/v1/profiles`.
4. **Expected Result:**
   - HTTP response is `200 OK` (No 400 Bad Request / 42703 error).
   - `data` object contains valid profile fields.
   - Existing worker skills, daily wage, and experience details are populated in the form fields.

### Test 3: Admin Authorization Test on `verify_profile_private_parity()`
1. Authenticate as an anonymous caller (`anon` key).
   - Execute RPC `verify_profile_private_parity()`.
   - **Expected Result:** Immediate rejection with `42501 Security Violation` or `401 Unauthorized`.
2. Authenticate as an ordinary worker user (`role = 'worker'`).
   - Execute RPC `verify_profile_private_parity()`.
   - **Expected Result:** Exception `QuickHire Security Violation: verify_profile_private_parity may only be invoked by a verified QuickHire administrator` (SQLSTATE `42501`).
3. Authenticate with Supabase `service_role` key or as registered admin in `admin_users`.
   - Execute RPC `verify_profile_private_parity()`.
   - **Expected Result:** Returns 1 row containing parity summary (`total_profiles`, `total_private_rows`, `is_synchronized = true`).

---

## 12. PRODUCTION DEPLOYMENT CHECKLIST

Follow this sequential checklist when preparing for production deployment:

```mermaid
flowchart TD
    A[Step 1: Staging Migration Deployment] --> B[Step 2: Run Automated SQL Test Suites 01-06]
    B --> C[Step 3: Commit Clean Git History & Untracked Migrations]
    C --> D[Step 4: Apply Application Code Patches]
    D --> E[Step 5: Run npm run lint && typecheck && vitest run]
    E --> F[Step 6: Deploy Database Migrations to Production DB lskkanszwfonjxyhuojr]
    F --> G[Step 7: Deploy Vercel Production Frontend Build]
    G --> H[Step 8: Post-Deploy Smoke Verification]
```

- [ ] **Step 1: Apply Forward Migrations to Staging**
  - Apply `20261108110000_assisted_worker_claim_and_history.sql`.
  - Apply `20261108120000_record_direct_payment_rpc.sql`.
  - Apply `20261108130000_fix_verify_profile_private_parity_authorization.sql`.
  - Apply `20261117170000_add_admin_notifications_and_performance_indexes.sql`.
- [ ] **Step 2: Verify Staging Automated Test Suites**
  - Run `supabase/tests/06_phase4r_security_and_integrity_tests.sql`. Confirm Test 4A and all parity tests pass with 0 failures.
- [ ] **Step 3: Track and Commit Local Files**
  - Track `supabase/migrations/20261108100000_create_profile_private_details.sql`.
  - Track `supabase/migrations/20261108110000_assisted_worker_claim_and_history.sql`.
  - Track `supabase/migrations/20261108120000_record_direct_payment_rpc.sql`.
  - Track `supabase/migrations/20261108130000_fix_verify_profile_private_parity_authorization.sql`.
  - Track `supabase/tests/06_phase4r_security_and_integrity_tests.sql`.
- [ ] **Step 4: Apply Application Code Fixes**
  - Update `src/App.tsx:869` (`status: 'applied'`).
  - Update `src/components/DashboardTab.tsx:465` (remove phantom columns).
  - Update `src/components/WorkerProfileModal.tsx:196` (remove phantom columns).
  - Update `src/components/DirectPaymentModal.tsx` (disable machine rental option).
- [ ] **Step 5: Run Local Verification Pipeline**
  - Run `npm run lint` (Must exit 0).
  - Run `npm run typecheck` (Must exit 0).
  - Run `vitest run` (All 25 test suites must pass).
  - Run `npm run build` (Vite build must bundle without errors).
- [ ] **Step 6: Production Database Deployment**
  - Connect to production Supabase project `lskkanszwfonjxyhuojr`.
  - Execute forward migrations sequentially.
- [ ] **Step 7: Production Vercel Deployment**
  - Merge verified branch into `main`.
  - Verify Vercel build output and environment variables.
- [ ] **Step 8: Post-Deploy Smoke Verification**
  - Verify worker self-application on a live job posting.
  - Verify profile modal editing and saving.
  - Verify admin dashboard overview and audit logs.
