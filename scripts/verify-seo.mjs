import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => {
  const fullPath = resolve(root, path);
  assert.ok(existsSync(fullPath), `Missing SEO file: ${path}`);
  return readFileSync(fullPath, 'utf8');
};

const html = read('index.html');
const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
assert.ok(canonical, 'A canonical URL is required');
assert.ok(canonical.startsWith('https://'), 'Canonical URL must use HTTPS');
assert.match(html, /<meta name="description" content="[^"]+"/i);
assert.match(html, /<meta property="og:url" content="[^"]+"/i);
assert.match(html, /<meta name="robots" content="index, follow/i);

const robots = read('public/robots.txt');
assert.match(robots, /^User-agent: \*/m);
assert.match(robots, /^Allow: \/$/m);
assert.match(robots, /^Disallow: \/admin\/?$/m);
assert.match(robots, /^Sitemap: https:\/\/[^\s]+\/sitemap\.xml$/m);

const sitemap = read('public/sitemap.xml');
assert.match(sitemap, /<urlset[^>]+xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
const locations = [...sitemap.matchAll(/<loc>(https:\/\/[^<]+)<\/loc>/g)].map((match) => match[1]);
assert.ok(locations.length > 0, 'Sitemap must contain at least one HTTPS URL');
assert.ok(locations.includes(canonical), 'Canonical homepage must be included in the sitemap');
assert.equal(new Set(locations).size, locations.length, 'Sitemap URLs must be unique');

console.log('QuickHire SEO verification passed: canonical metadata, crawler policy and sitemap.');
