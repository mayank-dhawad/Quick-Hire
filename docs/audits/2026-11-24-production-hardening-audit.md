# QuickHire production hardening audit

Audit date: 2026-11-24
Baseline: `main` at the production deployment reviewed during this audit.
Working branch: `audit/quickhire-production-hardening`

## Scope and limitations

Reviewed GitHub source/configuration, Supabase production schema/policies/advisors/migration history, and Vercel deployment/runtime telemetry. This is a static/configuration and database-metadata audit, not a completed authenticated browser end-to-end test. No production writes were made during this audit.

## Confirmed findings

### Critical: profile private data access
- `public.profiles` contains legacy financial and personal columns (bank name, account number, IFSC, UPI, DOB, address, emergency contacts).
- Existing authenticated SELECT policy is not column-scoped.
- `profile_private_details` exists, but migration `20261108100000_create_profile_private_details.sql` explicitly defers column-level SELECT revocation to a later cutover migration.
- Do not revoke profile SELECT or drop legacy columns until every frontend read/write path is migrated and verified.

### Critical: job_records authorization
- Current INSERT/UPDATE policies are broader than a relationship-based policy should be. INSERT does not adequately bind a record to the authenticated actor/job; UPDATE lacks adequate ownership/participant checks.
- Design policies around employer/job ownership, worker identity, authorized status transitions, and admin authority. Validate against all lifecycle flows before deployment.

### Critical: phone_otps
- An unrestricted ALL policy exists for the public role. Determine whether this table is used, inspect retention and access patterns without exposing OTP values, then remove broad access and move verification to a server-side/Edge Function flow if still needed.

### High: rental_records
- A SELECT policy with an always-true predicate exposes rows to roles covered by that policy. Replace with owner/participant/admin access after confirming all UI read use cases.

### High: profile role changes
- Profile update permissions do not sufficiently isolate role changes. Prevent self-service privilege escalation and enforce role assignment through trusted server-side/admin workflow.

### High: auth/profile parity
- Current counts observed: 12 auth users and 8 profiles. Investigate missing profile rows and the signup trigger's exception handling; do not auto-create/backfill records until orphan identities and metadata are reviewed.

### High: SECURITY DEFINER RPC review
- Four SECURITY DEFINER functions are executable by authenticated users. Their internal authorization, fixed search_path, grants, and input validation require function-by-function review. Grants alone do not prove exploitability.

### Medium: RLS and database performance
- Performance advisor reported 14 unindexed foreign keys, 25 RLS init-plan warnings, 6 unused indexes, and 6 multiple-permissive-policy warnings. Tune only after query/policy review; do not drop indexes solely because the advisor labels them unused.

### Migration governance
- Repository contains 25 migration files while production migration history records only 2 versions. Establish a reconciled baseline before applying historical migrations. Never replay the entire migration directory blindly against production.

### CI and runtime coverage
- CI currently runs npm ci, typecheck, lint, Vitest, and build.
- No authenticated browser E2E or isolated Supabase integration test is evident in the reviewed workflow.
- Vercel reported no runtime error clusters in the inspected 7-day window; this is not proof of zero client-side or workflow errors.
- The Supabase health advisor returned no health lint findings in the inspected result.

### Frontend error handling observation
- In `src/App.tsx`, `fetchOpenJobs` catches network errors and silently ignores Supabase errors. This can make a failed jobs feed appear as an empty feed. Replace silent failure with typed logging/user-visible retry states, without exposing sensitive backend details.

## Safe implementation sequence

1. Establish isolated database test environment and reconcile migration baseline.
2. Build policy tests for anonymous, worker, employer, and admin roles.
3. Harden profile private data, job_records, phone_otps, rental_records, and role changes.
4. Repair auth/profile parity and signup error visibility.
5. Review SECURITY DEFINER functions and payment RPC authorization.
6. Add Supabase integration and browser E2E workflows.
7. Optimize indexes/RLS based on query plans.
8. Verify PWA updates and mobile/browser workflows on real devices.
9. Open reviewed PR; deploy only after all checks and owner approval.

## Explicit non-actions

- No production schema or row changes were made as part of this audit.
- No production migrations were replayed.
- No production RLS policies were changed.
- No live user/payment/bank records were edited or deleted.

## Next gate

A Supabase development branch is preferred for database policy and migration testing. Creating it may incur hourly compute charges. Obtain the organization ID and disclose the exact quoted cost before confirming branch creation. If a branch is not approved, use a separately provisioned local/test Supabase environment instead.
