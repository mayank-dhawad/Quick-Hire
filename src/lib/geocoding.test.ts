import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateHaversineDistanceKm, buildAddressQuery, geocodeAddress } from './geocoding';

describe('Geocoding & Geographic Distance Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('calculateHaversineDistanceKm', () => {
    it('calculates 0 km for identical coordinates', () => {
      const dist = calculateHaversineDistanceKm(18.5204, 73.8567, 18.5204, 73.8567);
      expect(dist).toBe(0);
    });

    it('accurately calculates distance between Pune and Mumbai (~120 km)', () => {
      // Pune: 18.5204° N, 73.8567° E
      // Mumbai: 19.0760° N, 72.8777° E
      const dist = calculateHaversineDistanceKm(18.5204, 73.8567, 19.0760, 72.8777);
      expect(dist).toBeGreaterThan(115);
      expect(dist).toBeLessThan(130);
    });

    it('accurately calculates short rural locality distance (~15 km)', () => {
      // Shirur (Pune): 18.8256° N, 74.3789° E
      // Ranjangaon: 18.7561° N, 74.3056° E
      const dist = calculateHaversineDistanceKm(18.8256, 74.3789, 18.7561, 74.3056);
      expect(dist).toBeGreaterThan(10);
      expect(dist).toBeLessThan(20);
    });
  });

  describe('buildAddressQuery', () => {
    it('constructs complete query with village, district, state, and country', () => {
      const query = buildAddressQuery({
        village: 'Rampur',
        district: 'Meerut',
        state: 'Uttar Pradesh',
        pincode: '250001',
      });
      expect(query).toBe('Rampur, Meerut, Uttar Pradesh, 250001, India');
    });

    it('falls back to freeform text when structured fields are sparse', () => {
      const query = buildAddressQuery({
        freeform: 'Shirur, Pune',
      });
      expect(query).toBe('Shirur, Pune, India');
    });

    it('returns empty string if all inputs are blank', () => {
      const query = buildAddressQuery({});
      expect(query).toBe('');
    });
  });

  describe('geocodeAddress caching and error handling', () => {
    it('returns null gracefully for blank or very short queries', async () => {
      const res = await geocodeAddress('');
      expect(res).toBeNull();
    });

    it('retrieves cached result from localStorage without making network calls', async () => {
      const cached = {
        latitude: 18.5204,
        longitude: 73.8567,
        displayName: 'Pune, Maharashtra, India',
      };
      localStorage.setItem('quickhire_geo_cache_pune, maharashtra', JSON.stringify(cached));

      const res = await geocodeAddress('Pune, Maharashtra');
      expect(res).toEqual(cached);
    });

    it('handles network failure gracefully without throwing errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const res = await geocodeAddress('Unresolvable Test Address 999XYZ');
      expect(res).toBeNull();
    });
  });
});
