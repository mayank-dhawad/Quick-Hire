# QuickHire live hardening findings

Date: 2026-11-24
Production project: `lskkanszwfonjxyhuojr`
Repository baseline: `main` at `5afdda01fe0e336544e52b5ab89f71f95954ab38`
Work branch: `fix/quickhire-live-hardening`

## Scope

This pass used read-only queries against the live Supabase schema and source inspection on the current GitHub main branch. No production rows, schema, policies, functions, or settings were changed.

## Confirmed live database findings

1. **Profile privacy:** `profiles` has an authenticated SELECT policy with `USING (true)`. The table still contains bank account, IFSC, UPI, DOB, address, and phone fields. This exposes more profile data than a directory needs. A reviewed migration must move all client reads/writes to least-privilege views/private tables before revoking access.
2. **Job record access:** `job_records` has an authenticated SELECT policy with `USING (true)`, an INSERT policy that only checks the authenticated role, and an UPDATE policy that checks only that `auth.uid()` is not null. These policies do not enforce job participant relationships.
3. **Job lifecycle schema gap:** Production `job_records` currently has only `id, job_id, worker_id, status, created_at, hiring_source, agreement_evidence_type`. The frontend requests additional lifecycle fields (ETA, arrival, attendance, work start/completion, break/overtime, hours, wage and payment totals), so its compatibility fallback cannot persist those fields on the live schema.
4. **Rental privacy:** `rental_records` has a public-role SELECT policy with `USING (true)`. Replace it only after validating borrower/owner/admin access and the complete rental lifecycle.
5. **OTP access:** `phone_otps` has a public-role ALL policy with both predicates set to true. The table currently has zero rows. Confirm all Edge Function and legacy callsites before removing client access.
6. **Payment workflow is incomplete on production:** the frontend calls `get_payment_recipient_details` and `record_direct_payment`, but neither function exists in the live public schema. The live `payments` table also needs to be reconciled with the richer fields expected by the UI. Do not revoke payment INSERT until the replacement RPC and full payment flow are deployed and tested together.
7. **Private profile schema mismatch:** `profile_private_details` contains bank fields and timestamps, but not `date_of_birth` or `address_line`, which the worker profile UI currently selects. This causes private-details loading to fail.
8. **Auth/profile parity:** 12 Auth users and 8 profile rows were observed; 4 Auth identities have no matching profile. Investigate signup trigger behavior before backfilling. No identity data was copied or modified.
9. **Admin role protection:** The live profile role trigger only prevents promotion to `admin`; the client-side admin setup path also attempts to update `profiles.role` directly and reports success without re-verifying the admin grant. The app-side fallback was removed in this work branch so a missing admin grant fails closed.
10. **Privileged functions:** `get_worker_contact_phone`, `grant_admin_role`, `is_admin`, and `revoke_admin_role` are SECURITY DEFINER and executable by authenticated users. The worker-contact RPC checks caller/worker/job relationship and rate-limits calls; the admin-management functions check active super-admin status. Continue a function-by-function review and keep fixed search paths.
11. **Migration drift:** Production records only two migration versions (`20261123191747`, `20261123191816`), while the repository contains a larger migration history. Do not replay all repository migrations against production.

## Work started on this branch

- Removed the client-side fallback that attempted to grant `profiles.role = 'admin'`; the setup flow now signs out and returns an explicit error unless the server-side admin grant already exists.
- Changed open-job and employer-job fetch failures from silent catches to logged, user-visible errors.
- Changed job-completion failures from silent ignores to visible errors.

## Required verification before production deployment

- Run GitHub CI (typecheck, lint, unit tests, production build) on this branch.
- Inspect the Vercel preview and test login, worker profile create/edit, worker directory/contact authorization, employer job posting/application, job status/lifecycle, equipment rental, payment and admin workflows.
- Build a fresh local/test Supabase environment with a reconciled migration baseline; no paid Supabase branch was created.
- Add policy tests for anonymous, worker, employer and admin roles.
- Reconcile payment RPCs and profile-private fields before applying security grants.
- Only apply a reviewed, forward-only migration after the exact SQL has passed in the test database and backup/rollback steps are ready.

## Explicit non-actions

- No production SQL writes or DDL.
- No production policy or function changes.
- No production user/profile/job/payment data changed.
- No deployment or promotion to production.


## Additional verified workflow and policy findings

12. **Direct phone hiring cannot persist on the live schema:** production `jobs` lacks `scheduled_date`, `start_time`, `expected_duration_hours`, `workers_needed`, and `hiring_source`, while `PostCallDirectHireModal` inserts those fields. The same modal inserts wage and lifecycle fields into `job_records`, which are also absent. This feature needs the additive Phase 2 schema and its transition/capacity triggers before frontend use.
13. **Ratings cannot be submitted:** `RateWorkerModal` inserts and updates `public.reviews`, but the live table has RLS enabled and no policies. The repository migration `20261026120000_worker_ratings_and_rehire_history.sql` contains participant-validated policies and the rating aggregation trigger.
14. **Rental payments are intentionally blocked:** the equipment UI opens `DirectPaymentModal` with `payment_for_type = 'machine_rental'`. The repository's `record_direct_payment` migration explicitly rejects machine rentals until an authoritative booking relationship exists. The frontend does not create `rental_records`; the live table only has equipment, borrower, status and timestamps, with no dates, duration, agreed total or payment relationship. Do not remove the RPC rejection without implementing a real booking contract and authorization model.
15. **Existing phone OTP deprecation migration misses the live policy name:** production has a permissive policy named `Allow public otp management`. The repository migration drops three different names, so replaying it unchanged would leave this public ALL policy in place.
16. **Existing profile update policies are too permissive:** `Users can update own profile` permits either `auth.uid() = id` or `auth.uid() = created_by` and has no explicit `WITH CHECK`; a second policy also allows self-updates. Replace both with a single validated ownership/admin policy and prevent changes to role, owner, assisted-profile attribution and account status through client updates.
17. **The worker directory views depend on the broad profile SELECT policy:** both `public_profile_directory` and `public_worker_directory` currently use `security_invoker=true`. Restricting base `profiles` SELECT without first converting these to sanitized, security-barrier views would make worker discovery and equipment owner names disappear. The view cutover and frontend field inventory must happen before revoking base-table access.
18. **Admin private-profile access is incomplete:** live `profile_private_details` SELECT/INSERT/UPDATE policies only allow the profile owner, but the admin user-management UI also queries this table. The repository's intended private-details migration includes admin access; the live policies need a safe admin branch.
19. **Payment INSERT remains directly available:** production has two authenticated/public INSERT policies on `payments` that only require `auth.uid() = payer_id`. These must not be revoked until the missing `record_direct_payment` RPC, its required payment columns, recipient-details RPC, and reconciliation workflow are deployed and verified together.

## Updated rollout dependencies

- First reconcile the database baseline and run the full repository migration chain in a disposable local Supabase stack. The existing repository SQL tests are psql scripts, not pgTAP files; execute them in their intended order after migrations.
- Adapt the private-details migration for the live pre-existing partial table (add missing columns before backfill) and verify masked parity/conflict counts before changing profile column privileges.
- Apply the Phase 2 jobs/job_records lifecycle schema before enabling direct-hire UI.
- Apply payment schema, recipient-details RPC, and direct-payment RPC as one tested unit; keep machine rentals disabled until a booking contract exists.
- Apply the reviews RLS/aggregation migration and add regression tests.
- Replace exact live policy names, including `Allow public otp management`, rather than relying on guessed historical names.
- Convert sanitized directory views before restricting direct `profiles` SELECT.
