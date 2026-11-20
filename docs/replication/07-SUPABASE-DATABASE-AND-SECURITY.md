# 07 — Supabase Database, Schema & Security Blueprint

This document details the PostgreSQL schema, table structures, column definitions, constraints, indexes, and Row-Level Security (RLS) policies implemented in **QuickHire**.

---

## 1. PostgreSQL Character Encoding & Unicode Verification

- **Database Encoding:** `UTF-8` (`SERVER_ENCODING = 'UTF8'`).
- **Client Encoding:** `UTF-8`.
- **Regional Script Support:** Verified for full multi-byte character representation:
  - **Devanagari (Hindi, Marathi):** e.g., `रामेश्वर पाटिल`, `फसल कटाई`, `ट्रैक्टर चालक`.
  - **Bengali script (বাংলা):** e.g., `রমেশ ঘোষ`, `ফসল কাটা`, `রাজমিস্ত্রি`.
  - **Telugu script (తెలుగు):** e.g., `రమేష్ కుమార్`, `పంట కోత`, `తాపీ పని`.
- All text columns (`full_name`, `location`, `title`, `description`, `skills`, `required_skills`) are typed as `TEXT`, `VARCHAR`, or `TEXT[]`, providing native multi-byte UTF-8 storage without byte corruption.

---

## 2. Custom Enumeration Types (`ENUM`)

Defined in PostgreSQL:

| Enum Name | Allowed Values |
|---|---|
| `public.job_status` | `'open'`, `'in_progress'`, `'completed'`, `'cancelled'` |
| `public.user_role` | `'employer'`, `'worker'`, `'admin'` |
| `public.worker_category` | `'Agriculture'`, `'Construction'`, `'Daily work'`, `'Skilled self-employed'` |
| `public.equipment_status` | `'available'`, `'rented'`, `'maintenance'` |

---

## 3. Database Tables & Column Specifications

### 1. `public.profiles`
Stores citizen profiles, contact numbers, banking details, and account status.

| Column Name | Data Type | Nullable | Default | Constraints & Relationships |
|---|---|---|---|---|
| `id` | `uuid` | No | None | **Primary Key**, References `auth.users(id) ON DELETE CASCADE` |
| `role` | `text` | Yes | None | `CHECK (role IN ('worker', 'employer', 'admin'))` |
| `full_name` | `text` | No | `''` | Full citizen name (Unicode UTF-8) |
| `phone_number` | `text` | Yes | `NULL` | Clean mobile number with +91 country code |
| `is_assisted_profile` | `boolean`| Yes | `false` | True if registered by an intermediary |
| `created_by` | `uuid` | Yes | `NULL` | References `auth.users(id) ON DELETE SET NULL` |
| `location` | `text` | Yes | `NULL` | Village, block, or district location |
| `account_status` | `text` | Yes | `'active'` | `'active'` or `'deactivated'` (soft deletion) |
| `bank_name` | `text` | Yes | `NULL` | Name of Indian bank (e.g., SBI, BOB, PNB) |
| `bank_account_no` | `text` | Yes | `NULL` | Bank account number |
| `bank_ifsc` | `text` | Yes | `NULL` | 11-character Indian IFSC code |
| `upi_id` | `text` | Yes | `NULL` | UPI virtual payment address (e.g., user@oksbi) |
| `created_at` | `timestamptz` | Yes | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | Yes | `now()` | Record last updated timestamp |

- **Indexes:**
  - `CREATE INDEX profiles_phone_number_idx ON public.profiles (phone_number);`
  - `CREATE INDEX profiles_role_idx ON public.profiles (role);`

---

### 2. `public.workers`
Stores verified worker skill profiles, category, ratings, and real-time availability.

| Column Name | Data Type | Nullable | Default | Constraints & Relationships |
|---|---|---|---|---|
| `id` | `uuid` | No | None | **Primary Key**, References `public.profiles(id) ON DELETE CASCADE` |
| `category` | `text` | No | None | `CHECK (category IN ('Agriculture', 'Construction', 'Daily work', 'Skilled self-employed'))` |
| `skills` | `text[]` | Yes | `'{}'::text[]` | Array of skill tags (supports regional scripts) |
| `experience_years` | `integer` | Yes | `1` | Total years of field work experience |
| `daily_wage` | `numeric` | Yes | `500` | Standard expected daily wage in ₹ |
| `average_rating` | `numeric` | Yes | `5.0` | Citizen average feedback rating (1.0 to 5.0) |
| `is_available` | `boolean` | Yes | `true` | Real-time work availability flag |
| `location` | `text` | Yes | `NULL` | Village/block operational base |
| `created_at` | `timestamptz` | Yes | `now()` | Profile creation timestamp |
| `updated_at` | `timestamptz` | Yes | `now()` | Last updated timestamp |

- **Indexes:**
  - `CREATE INDEX workers_category_idx ON public.workers (category);`
  - `CREATE INDEX workers_is_available_idx ON public.workers (is_available);`

---

### 3. `public.jobs`
Stores job postings published by employers, farmers, and contractors.

| Column Name | Data Type | Nullable | Default | Constraints & Relationships |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | **Primary Key** |
| `employer_id` | `uuid` | No | None | References `public.profiles(id) ON DELETE CASCADE` |
| `title` | `text` | No | None | Job listing title (Unicode UTF-8) |
| `category` | `text` | No | None | Category of work needed |
| `required_skills` | `text[]` | Yes | `'{}'::text[]` | Array of skill tags |
| `offered_wages` | `numeric` | No | `0` | Daily wage offered in ₹ |
| `description` | `text` | Yes | `NULL` | Work location, reporting hours, requirements |
| `status` | `text` | No | `'open'` | `CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled'))` |
| `created_at` | `timestamptz` | Yes | `now()` | Posting timestamp |
| `updated_at` | `timestamptz` | Yes | `now()` | Update timestamp |

- **Indexes:**
  - `CREATE INDEX jobs_status_created_at_idx ON public.jobs (status, created_at DESC);`
  - `CREATE INDEX jobs_employer_id_idx ON public.jobs (employer_id);`

---

### 4. `public.job_records`
Connects jobs with interested worker applicants.

| Column Name | Data Type | Nullable | Default | Constraints & Relationships |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | **Primary Key** |
| `job_id` | `uuid` | No | None | References `public.jobs(id) ON DELETE CASCADE` |
| `worker_id` | `uuid` | No | None | References `public.profiles(id) ON DELETE CASCADE` |
| `status` | `text` | No | `'contacted'` | Status tag (`contacted`, `accepted`, `rejected`) |
| `created_at` | `timestamptz` | Yes | `now()` | Timestamp |

- **Unique Constraint:** `CONSTRAINT job_records_unique_job_worker UNIQUE (job_id, worker_id)`
- **Indexes:**
  - `CREATE INDEX job_records_job_id_idx ON public.job_records (job_id);`
  - `CREATE INDEX job_records_worker_id_idx ON public.job_records (worker_id);`

---

### 5. `public.equipment`
Stores tool and agricultural machinery rental listings.

| Column Name | Data Type | Nullable | Default | Constraints & Relationships |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | **Primary Key** |
| `owner_id` | `uuid` | No | None | References `public.profiles(id) ON DELETE CASCADE` |
| `title` | `text` | No | None | Machinery name and specifications |
| `category` | `text` | No | None | Domain (Agriculture, Construction, etc.) |
| `description` | `text` | Yes | `NULL` | Technical details, HP, attachments |
| `daily_rent` | `numeric` | No | `0` | Daily rental fee in ₹ |
| `deposit_required` | `numeric` | Yes | `0` | Refundable security deposit in ₹ |
| `location` | `text` | No | `''` | Village or yard address |
| `status` | `text` | No | `'available'` | `CHECK (status IN ('available', 'rented', 'maintenance'))` |
| `created_at` | `timestamptz` | Yes | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | Yes | `now()` | Update timestamp |

- **Indexes:**
  - `CREATE INDEX equipment_owner_id_idx ON public.equipment (owner_id);`
  - `CREATE INDEX equipment_category_idx ON public.equipment (category);`
  - `CREATE INDEX equipment_status_idx ON public.equipment (status);`

---

### 6. `public.payments`
Direct 0% commission wage and equipment rental transaction ledger.

| Column Name | Data Type | Nullable | Default | Constraints & Relationships |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | **Primary Key** |
| `payer_id` | `uuid` | No | None | References `public.profiles(id) ON DELETE CASCADE` |
| `payee_id` | `uuid` | No | None | References `public.profiles(id) ON DELETE CASCADE` |
| `payment_for_type` | `text` | No | None | `CHECK (payment_for_type IN ('worker_wage', 'machine_rental'))` |
| `reference_id` | `text` | Yes | `NULL` | Associated job ID or equipment ID |
| `amount` | `numeric` | No | `0` | Settled amount in ₹ |
| `payment_method` | `text` | No | `'Net Banking (IMPS/NEFT)'` | `'Net Banking (IMPS/NEFT)'`, `'Direct UPI'`, `'Cash'` |
| `transaction_ref` | `text` | Yes | `NULL` | Bank UTR reference or UPI transaction ID |
| `status` | `text` | No | `'completed'` | Payment status (`completed`, `settled`) |
| `created_at` | `timestamptz` | Yes | `now()` | Timestamp of payment record |

- **Indexes:**
  - `CREATE INDEX payments_payer_id_idx ON public.payments (payer_id);`
  - `CREATE INDEX payments_payee_id_idx ON public.payments (payee_id);`
  - `CREATE INDEX payments_created_at_idx ON public.payments (created_at DESC);`

---

### 7. `public.phone_otps`
Stores temporary verification codes for the Fast2SMS gateway flow.

| Column Name | Data Type | Nullable | Default | Constraints & Relationships |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | **Primary Key** |
| `phone` | `text` | No | None | Clean 10-digit mobile number |
| `otp` | `text` | No | None | 6-digit numeric OTP code |
| `expires_at` | `timestamptz` | No | None | Expiration time (now + 10 mins) |
| `created_at` | `timestamptz` | Yes | `now()` | Insertion timestamp |

- **Indexes:**
  - `CREATE INDEX idx_phone_otps_phone ON public.phone_otps(phone);`

---

### 8. `public.reviews`
Peer and employer feedback and ratings.

| Column Name | Data Type | Nullable | Default | Constraints & Relationships |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | **Primary Key** |
| `job_id` | `uuid` | Yes | `NULL` | References `public.jobs(id) ON DELETE CASCADE` |
| `reviewer_profile_id` | `uuid` | No | None | References `public.profiles(id) ON DELETE CASCADE` |
| `reviewed_profile_id` | `uuid` | No | None | References `public.profiles(id) ON DELETE CASCADE` |
| `rating` | `numeric` | Yes | `NULL` | `CHECK (rating >= 1 AND rating <= 5)` |
| `comment` | `text` | Yes | `NULL` | Textual review |
| `created_at` | `timestamptz` | Yes | `now()` | Timestamp |

---

### 9. `public.notifications`
System and SMS delivery notification feed.

| Column Name | Data Type | Nullable | Default | Constraints & Relationships |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | **Primary Key** |
| `profile_id` | `uuid` | No | None | References `public.profiles(id) ON DELETE CASCADE` |
| `title` | `text` | No | None | Notification title |
| `message` | `text` | No | None | Notification body |
| `type` | `text` | Yes | `'system'` | Type (`system`, `job`, `sms`) |
| `is_read` | `boolean` | Yes | `false` | Read flag |
| `created_at` | `timestamptz` | Yes | `now()` | Timestamp |

---

### 10. `public.quickhire_interest`
Landing page interest and lead tracking.

| Column Name | Data Type | Nullable | Default | Constraints & Relationships |
|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | **Primary Key** |
| `role` | `text` | No | None | `CHECK (role IN ('worker', 'employer'))` |
| `name` | `text` | No | None | Citizen name |
| `phone` | `text` | No | None | Phone number |
| `village` | `text` | No | None | Village name |
| `created_at` | `timestamptz` | No | `now()` | Timestamp |

---

## 4. Row Level Security (RLS) Policies

All tables have RLS explicitly enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`).

### Summary of Access Rules
| Table | Public Read (Anon) | Insert Rule | Update Rule | Delete Rule |
|---|---|---|---|---|
| `profiles` | **Yes** (`USING (true)`) | `auth.uid() = id OR (is_assisted_profile = true AND auth.uid() = created_by)` | Same as insert | Cascade on auth user delete |
| `workers` | **Yes** (`USING (true)`) | `auth.uid() = id` | `auth.uid() = id` | Cascade on profile delete |
| `jobs` | **Yes** (`USING (true)`) | `auth.uid() = employer_id` | `auth.uid() = employer_id` | Cascade on employer delete |
| `job_records` | **Authenticated only** | `auth.uid() = worker_id` | Involved worker or employer | Cascade on job/worker delete |
| `equipment` | **Yes** (`USING (true)`) | `auth.uid() = owner_id` | `auth.uid() = owner_id` | Cascade on owner delete |
| `payments` | **Involved parties only** | `auth.uid() = payer_id` | Restricted | Cascade on profile delete |
| `reviews` | **Yes** (`USING (true)`) | `auth.uid() = reviewer_profile_id` | Restricted | Cascade on job/profile delete |
| `notifications` | **Owner only** | System / authenticated | `auth.uid() = profile_id` | Owner only |
| `phone_otps` | **Yes** (to verify) | **Yes** (to request OTP) | Restricted | **Yes** (delete on verify) |
| `quickhire_interest` | **Yes** | **Yes** | **Yes** | **Yes** |

---

## 5. Migration Execution Order

To rebuild the Supabase database sequentially:
1. `20260830095418_create_quickhire_interest.sql`
2. `20261019000000_add_account_status_to_profiles.sql`
3. `20261019120000_ensure_unicode_and_location.sql`
4. `20261019130000_unified_base_schema.sql`
5. `20261019140000_create_phone_otps.sql`

*Alternatively, execute the consolidated single-file master script located at `supabase-migrations/00_consolidated_full_schema.sql` in the Supabase SQL Editor for an instantaneous 1-click schema creation.*
