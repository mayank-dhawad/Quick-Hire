import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => {
  const fullPath = resolve(root, path);
  assert.ok(existsSync(fullPath), \`Missing PWA file: \${path}\`);
  return readFileSync(fullPath);
};
const text = (path) => read(path).toString('utf8');

const manifest = JSON.parse(text('public/manifest.webmanifest'));
assert.equal(manifest.name, 'QuickHire');
assert.equal(manifest.short_name, 'QuickHire');
assert.equal(manifest.start_url, '/');
assert.equal(manifest.scope, '/');
assert.equal(manifest.display, 'standalone');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 4);

for (const icon of manifest.icons) {
  const bytes = read(\`public\${icon.src}\`);
  if (icon.type === 'image/png') {
    assert.equal(bytes.readUInt32BE(0), 0x89504e47, \`Invalid PNG signature: \${icon.src}\`);
    if (icon.sizes === '192x192' || icon.sizes === '512x512') {
      assert.equal(bytes.readUInt32BE(16), Number(icon.sizes.split('x')[0]), \`Wrong icon width: \${icon.src}\`);
      assert.equal(bytes.readUInt32BE(20), Number(icon.sizes.split('x')[1]), \`Wrong icon height: \${icon.src}\`);
    }
  }
}

for (const shortcut of manifest.shortcuts ?? []) {
  assert.ok(shortcut.url.startsWith('/'), \`Shortcut must stay within app scope: \${shortcut.url}\`);
}

const html = text('index.html');
assert.equal((html.match(/rel="manifest"/g) ?? []).length, 1, 'Use exactly one canonical manifest link');
assert.match(html, /href="\/manifest\.webmanifest"/);
assert.match(html, /name="theme-color"/);

const main = text('src/main.tsx');
assert.match(main, /registerServiceWorker/);
const registration = text('src/lib/pwaRegister.ts');
assert.match(registration, /serviceWorker\.register\('\/sw\.js'/);
assert.match(registration, /controllerchange/);

const sw = text('public/sw.js');
for (const protectedPath of ['.supabase.co', '/auth/v1/', '/rest/v1/', '/storage/v1/']) {
  assert.ok(sw.includes(protectedPath), \`Service worker must bypass sensitive endpoint: \${protectedPath}\`);
}
assert.match(sw, /request\.method !== 'GET'/);
assert.match(sw, /SKIP_WAITING/);
assert.match(sw, /\/offline\.html/);

const offline = text('public/offline.html').toLowerCase();
assert.match(offline, /require an active internet connection/);
assert.doesNotMatch(offline, /saved forms are held safely on your device/);

const installBanner = text('src/components/PwaInstallBanner.tsx').toLowerCase();
assert.match(installBanner, /need internet/);
assert.doesNotMatch(installBanner, /instant offline access/);

console.log('QuickHire PWA verification passed: manifest, icons, install metadata, service worker security and offline messaging.');
