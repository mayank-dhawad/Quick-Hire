import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateHaversineDistanceKm,
  buildAddressQuery,
  geocodeAddress,
  getSavedPreferredLocation,
  savePreferredLocation,
  getRecentLocations,
  saveRecentLocation,
  KNOWN_INDIAN_PINCODES,
  resolveLocalityCoordinates,
  searchLocationSuggestions,
  geocodePreferredLocation,
} from './geocoding';

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

  describe('Preferred and Recent Locations Management', () => {
    it('saves and retrieves employer preferred location', () => {
      const loc = { lat: 21.1458, lon: 79.0882, label: 'Nagpur, Maharashtra', radiusKm: 25 };
      savePreferredLocation(loc);

      const retrieved = getSavedPreferredLocation();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.lat).toBe(21.1458);
      expect(retrieved?.lon).toBe(79.0882);
      expect(retrieved?.label).toBe('Nagpur, Maharashtra');
      expect(retrieved?.radiusKm).toBe(25);

      // Clearing preferred location
      savePreferredLocation(null);
      expect(getSavedPreferredLocation()).toBeNull();
    });

    it('manages recent search locations history without duplicates', () => {
      const loc1 = { lat: 18.5204, lon: 73.8567, label: 'Pune' };
      const loc2 = { lat: 21.1458, lon: 79.0882, label: 'Nagpur' };

      saveRecentLocation(loc1);
      saveRecentLocation(loc2);

      const recents = getRecentLocations();
      expect(recents.length).toBeGreaterThanOrEqual(2);
      expect(recents[0].label).toBe('Nagpur');
      expect(recents[1].label).toBe('Pune');
    });
  });

  describe('Indian PIN codes and Offline Centroid Resolution', () => {
    it('resolves key Indian PIN codes to valid approximate centroids', () => {
      expect(KNOWN_INDIAN_PINCODES['411001']).toBeDefined();
      expect(KNOWN_INDIAN_PINCODES['411001'].city).toBe('Pune');
      expect(KNOWN_INDIAN_PINCODES['411001'].isApproximatePincode).toBe(true);
      expect(KNOWN_INDIAN_PINCODES['412210'].city).toBe('Shirur');
      expect(KNOWN_INDIAN_PINCODES['221001'].city).toBe('Varanasi');
      expect(KNOWN_INDIAN_PINCODES['560001'].city).toBe('Bengaluru');
    });

    it('resolveLocalityCoordinates matches 6-digit PIN code anywhere in query string', () => {
      const res = resolveLocalityCoordinates('Near Gram Panchayat, 412210, Maharashtra');
      expect(res).not.toBeNull();
      expect(res?.city).toBe('Shirur');
      expect(res?.isApproximatePincode).toBe(true);
    });

    it('resolveLocalityCoordinates matches prominent rural localities offline', () => {
      const res = resolveLocalityCoordinates('Ranjangaon');
      expect(res).not.toBeNull();
      expect(res?.city).toBe('Shirur');
      expect(res?.latitude).toBeCloseTo(18.7561, 2);
    });
  });

  describe('searchLocationSuggestions autocomplete', () => {
    it('returns empty array for blank or short queries', async () => {
      const emptyRes = await searchLocationSuggestions('');
      expect(emptyRes).toEqual([]);
      const shortRes = await searchLocationSuggestions('a');
      expect(shortRes).toEqual([]);
    });

    it('returns PIN code suggestion with isApproximatePincode flag when query matches 6-digit PIN', async () => {
      const suggestions = await searchLocationSuggestions('412210');
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].pincode).toBe('412210');
      expect(suggestions[0].isApproximatePincode).toBe(true);
      expect(suggestions[0].displayName).toContain('Shirur');
    });

    it('returns instant offline locality matches for known towns', async () => {
      const suggestions = await searchLocationSuggestions('Baramati');
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].city).toBe('Baramati');
      expect(suggestions[0].latitude).toBeCloseTo(18.1517, 2);
    });
  });

  describe('geocodePreferredLocation automatic geocoding', () => {
    it('resolves 6-digit PIN code with approximate coordinates', async () => {
      const res = await geocodePreferredLocation('411001');
      expect(res).not.toBeNull();
      expect(res?.isApproximatePincode).toBe(true);
      expect(res?.city).toBe('Pune');
      expect(res?.latitude).toBeCloseTo(18.5204, 2);
    });

    it('resolves offline locality without requiring network call', async () => {
      const res = await geocodePreferredLocation('Shirur');
      expect(res).not.toBeNull();
      expect(res?.city).toBe('Shirur');
      expect(res?.latitude).toBeCloseTo(18.8256, 2);
    });

    it('returns null gracefully for completely empty query', async () => {
      const res = await geocodePreferredLocation('');
      expect(res).toBeNull();
    });
  });
});
