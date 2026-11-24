import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const app = read('src/App.tsx');
const auth = read('src/components/Auth.tsx');

for (const source of [app, auth]) {
  assert.doesNotMatch(source, /quickhire_user_session/, 'Browser-persisted user objects must never restore authentication');
  assert.doesNotMatch(source, /quickhire_user_role/, 'Browser-persisted role markers must not determine authorization');
}
assert.match(app, /supabase\.auth\s*\.getSession\(/, 'App must restore sessions through Supabase Auth');
assert.match(app, /profile\.account_status === 'suspended'/, 'Restored suspended users must be signed out');
assert.match(auth, /existingProfile\?\.account_status === 'suspended'/, 'Suspended users must be blocked during sign-in');
assert.match(auth, /Your QuickHire account is suspended/i, 'Suspension must show a clear user-facing message');

console.log('QuickHire auth security verification passed: Supabase-only sessions and suspended-account gating.');
