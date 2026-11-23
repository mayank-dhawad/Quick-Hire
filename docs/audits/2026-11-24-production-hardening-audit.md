# QuickHire production hardening audit

Audit date: 2026-11-24
Repository: `mayank-dhawad/Quick-Hire`
Baseline `main`: `5afdda01fe0e336544e52b5ab89f71f95954ab38`
Production Vercel deployment: `dpl_2RXYmUXSGFe77XGk9kGsdFcUfcn9` (READY; same commit)
Working branch: `audit/quickhire-production-hardening`

## Scope and limitations

Reviewed GitHub source/configuration, Supabase production schema/policies/advisors/migration history, and Vercel deployment records. This is a static/configuration and database-metadata audit, not a completed authenticated browser end-to-end test. No production writes were made during this audit.

## Confirmed findings

### Critical: profile private data access
- `public.profiles` contains legacy financial and personal columns (bank name, account number, IFSC, UPI, DOB, address, emergency contacts).
- Existing authenticated SELECT policy is not column-scoped.
- `profile_private_details` exists with owner/admin RLS and contains 2 migrated rows, but legacy sensitive columns remain in `profiles`.
- Do not revoke profile SELECT or drop legacy columns until every frontend read/write path is migrated and verified.

### Critical: job_records authorization and lifecycle
- Current INSERT/UPDATE policies are broader than a relationship-based policy should be. INSERT does not adequately bind a record to the authenticated actor/job; UPDATE lacks adequate ownership/participant checks.
- The open draft PR #13 attempts a security migration, but restricts authenticated updates to `status` only. Current app lifecycle fields include ETA, arrival, attendance, work start/completion, breaks, overtime, hours, wage, payable/paid totals and payment status. That proposed grant would break legitimate lifecycle operations unless those transitions are moved to narrowly scoped RPCs and verified.
- Design policies around employer/job ownership, worker identity, and server-validated status transitions. Validate every workflow before deployment.

### Critical: phone_otps
- An unrestricted ALL policy exists for the public role. Inspect usage and retention without exposing OTP values, then remove broad access and move verification to a server-side/Edge Function flow if still needed.
- PR #13 assumes the table is deprecated and unused. Do not rely on that assumption without checking all code, edge functions, and historical usage.

### High: rental_records
- A SELECT policy with an always-true predicate exposes rows to roles covered by that policy. Replace with owner/participant/admin access after confirming all UI read and update workflows.

### High: profile role changes
- Profile update permissions do not sufficiently isolate role changes. Prevent self-service privilege escalation and enforce role assignment through trusted server-side/admin workflow.

### High: auth/profile parity
- Current counts observed: 12 auth users and 8 profiles. Investigate missing profile rows and signup trigger exception handling; do not auto-create/backfill records until orphan identities and metadata are reviewed.

### High: SECURITY DEFINER RPC review
- Four SECURITY DEFINER functions are executable by authenticated users: `get_worker_contact_phone`, `grant_admin_role`, `is_admin`, and `revoke_admin_role`. Their internal authorization, fixed search_path, grants, and input validation require function-by-function review. Grants alone do not prove exploitability.

### High: existing security PR requires correction, not blind merge
- PR #13 remains open and draft, and its own description says the migration was not applied to production.
- Its proposed migration must be reconciled with the actual live schema and frontend lifecycle before reuse. It revokes direct payment INSERT while its comments assume a validated server RPC; verify that such RPCs exist and are used before removing the current write path.
- It replaces profile reads with `public_profile_directory`; confirm view semantics and authenticated worker/employer UI behavior in a test database before cutover.
- PR #13's CI summary reported 24 full dependency-audit vulnerabilities (2 critical, 13 high, 7 moderate, 2 low), while production-only audit reported zero. Run a current audit on the baseline and address compatible upgrades separately.

### High: auth password protection
- Supabase Auth leaked-password protection is disabled. Enable after checking current Auth configuration and testing expected signup/password-reset behavior.

### Medium: RLS and database performance
- Security advisor reported 4 RLS-enabled tables with no policies: `notifications`, `reviews`, `worker_contact_logs`, and `worker_contact_rate_limits`.
- Security advisor reported 4 authenticated-executable SECURITY DEFINER functions listed above.
- Performance advisor reported 14 unindexed foreign keys, 25 RLS init-plan warnings, 6 unused indexes, and 6 multiple-permissive-policy warnings. Tune only after query/policy review; do not drop indexes solely because the advisor labels them unused.

### Migration governance
- Repository contains 25 migration files while production migration history records only 2 versions: `20261123191747` and `20261123191816`.
- Establish a reconciled baseline before applying historical migrations. Never replay the entire migration directory blindly against production.

### CI and runtime coverage
- CI currently runs npm ci, typecheck, lint, Vitest, and build.
- No authenticated browser E2E or isolated Supabase integration test is evident in the reviewed workflow.
- Latest production Vercel deployment is READY and points to the current `main` commit.
- Vercel reported no runtime error clusters in the inspected 7-day window; this is not proof of zero client-side or workflow errors.
- Supabase health advisor returned no health lint findings in the inspected result.

### Frontend error handling observation
- In `src/App.tsx`, `fetchOpenJobs` catches network errors and silently ignores Supabase errors. This can make a failed jobs feed appear as an empty feed. Replace silent failure with typed logging/user-visible retry states, without exposing sensitive backend details.

## Safe implementation sequence

1. Establish isolated database test environment and reconcile migration baseline.
2. Build policy tests for anonymous, worker, employer, and admin roles.
3. Harden profile private data, job_records, phone_otps, rental_records, and role changes.
4. Repair auth/profile parity and signup error visibility.
5. Review SECURITY DEFINER functions and payment RPC authorization.
6. Add Supabase integration and browser E2E workflows.
7. Run current dependency/security audits and perform compatibility-safe upgrades.
8. Optimize indexes/RLS based on query plans.
9. Verify PWA updates and mobile/browser workflows on real devices.
10. Open reviewed PR; deploy only after all checks and owner approval.

## Explicit non-actions

- No production schema or row changes were made as part of this audit.
- No production migrations were replayed.
- No production RLS policies were changed.
- No live user/payment/bank records were edited or deleted.
- PR #13 was not merged or applied.

## Next gate

A Supabase development branch is preferred for database policy and migration testing. Creating it may incur hourly compute charges. The Supabase tool requires the organization ID to quote the cost, then explicit user agreement to that exact cost before creation. If a branch is not approved, use a separately provisioned local/test Supabase environment instead.
