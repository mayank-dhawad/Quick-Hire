import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('PWA Web App Manifest Configuration', () => {
  const manifestJsonPath = path.resolve(__dirname, '../../public/manifest.json');
  const manifestWebmanifestPath = path.resolve(__dirname, '../../public/manifest.webmanifest');

  it('verifies that public/manifest.json exists and contains correct PWA properties', () => {
    expect(fs.existsSync(manifestJsonPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(manifestJsonPath, 'utf-8'));

    expect(content.name).toBe('QuickHire');
    expect(content.short_name).toBe('QuickHire');
    expect(content.display).toBe('standalone');
    expect(content.start_url).toBe('/');
    expect(content.scope).toBe('/');
    expect(content.orientation).toBe('natural');
    expect(content.theme_color).toBe('#0f2942');
    expect(content.background_color).toBe('#fbfcf8');

    // Check icons
    expect(Array.isArray(content.icons)).toBe(true);
    expect(content.icons.length).toBeGreaterThanOrEqual(4);

    const icon192 = content.icons.find((i: { sizes: string; purpose?: string }) => i.sizes === '192x192' && (!i.purpose || i.purpose === 'any'));
    const icon512 = content.icons.find((i: { sizes: string; purpose?: string }) => i.sizes === '512x512' && (!i.purpose || i.purpose === 'any'));
    const maskable192 = content.icons.find((i: { sizes: string; purpose?: string }) => i.sizes === '192x192' && i.purpose?.includes('maskable'));
    const maskable512 = content.icons.find((i: { sizes: string; purpose?: string }) => i.sizes === '512x512' && i.purpose?.includes('maskable'));

    expect(icon192).toBeTruthy();
    expect(icon512).toBeTruthy();
    expect(maskable192).toBeTruthy();
    expect(maskable512).toBeTruthy();
  });

  it('verifies that public/manifest.webmanifest exists and matches standalone PWA standards', () => {
    expect(fs.existsSync(manifestWebmanifestPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(manifestWebmanifestPath, 'utf-8'));

    expect(content.name).toBe('QuickHire');
    expect(content.short_name).toBe('QuickHire');
    expect(content.display).toBe('standalone');
    expect(content.start_url).toBe('/');
    expect(content.scope).toBe('/');
  });
});
