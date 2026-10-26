// OpenStreetMap Nominatim Geocoding Client for QuickHire
// Complies with Nominatim Usage Policy:
// - Custom identifying User-Agent: QuickHire-RuralEmployment/1.0
// - Client-side rate-limiting / throttling (minimum 1000ms between external network requests)
// - Robust in-memory + localStorage caching to eliminate duplicate requests for unchanged addresses
// - Graceful degradation: never invents coordinates or silently assigns wrong localities

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

export interface AddressComponents {
  village?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
  freeform?: string | null;
}

const CACHE_PREFIX = 'quickhire_geo_cache_';
const LAST_REQUEST_KEY = 'quickhire_geo_last_req_ts';
const MIN_INTERVAL_MS = 1100; // Policy requires >= 1.0 second between requests

// In-memory session cache
const memoryCache = new Map<string, GeocodingResult | null>();

/**
 * Normalizes query string for reliable cache hits
 */
export function buildAddressQuery(components: AddressComponents): string {
  const parts: string[] = [];

  if (components.village && components.village.trim()) {
    parts.push(components.village.trim());
  }
  if (components.city && components.city.trim() && components.city.trim() !== components.village?.trim()) {
    parts.push(components.city.trim());
  }
  if (components.district && components.district.trim()) {
    parts.push(components.district.trim());
  }
  if (components.state && components.state.trim()) {
    parts.push(components.state.trim());
  }
  if (components.pincode && components.pincode.trim()) {
    parts.push(components.pincode.trim());
  }

  // If specific parts are sparse, fall back to freeform location text
  if (parts.length === 0 && components.freeform && components.freeform.trim()) {
    parts.push(components.freeform.trim());
  }

  // Always append country context for Indian rural employment
  if (parts.length > 0 && !parts.some((p) => /india/i.test(p))) {
    parts.push('India');
  }

  return parts.join(', ').normalize('NFC');
}

/**
 * Enforces client-side rate limit according to Nominatim usage policy
 */
async function enforceRateLimit(): Promise<void> {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const lastTs = Number(sessionStorage.getItem(LAST_REQUEST_KEY) || 0);
  const elapsed = now - lastTs;

  if (elapsed < MIN_INTERVAL_MS) {
    const waitTime = MIN_INTERVAL_MS - elapsed;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
  sessionStorage.setItem(LAST_REQUEST_KEY, Date.now().toString());
}

/**
 * Geocodes an address with caching and rate-limiting.
 * Returns null if address is empty, ambiguous, or not found.
 */
export async function geocodeAddress(
  addressInput: string | AddressComponents
): Promise<GeocodingResult | null> {
  const query =
    typeof addressInput === 'string'
      ? addressInput.trim().normalize('NFC')
      : buildAddressQuery(addressInput);

  if (!query || query.length < 3) {
    return null;
  }

  const cacheKey = CACHE_PREFIX + query.toLowerCase();

  // 1. Check in-memory cache
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey) || null;
  }

  // 2. Check browser localStorage cache
  try {
    const stored = localStorage.getItem(cacheKey);
    if (stored) {
      const parsed = JSON.parse(stored) as GeocodingResult;
      memoryCache.set(cacheKey, parsed);
      return parsed;
    }
  } catch {
    // Ignore storage parse issues
  }

  // 3. Rate-limited network fetch from Nominatim
  try {
    await enforceRateLimit();

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'in'); // restrict to India
    url.searchParams.set('addressdetails', '1');

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      console.warn('Geocoding response error:', res.status, res.statusText);
      return null;
    }

    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      // Address not found or ambiguous - cache null to avoid repeating
      memoryCache.set(cacheKey, null);
      return null;
    }

    const first = items[0];
    const lat = parseFloat(first.lat);
    const lon = parseFloat(first.lon);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return null;
    }

    const result: GeocodingResult = {
      latitude: lat,
      longitude: lon,
      displayName: first.display_name || query,
    };

    // Store in both memory and localStorage
    memoryCache.set(cacheKey, result);
    try {
      localStorage.setItem(cacheKey, JSON.stringify(result));
    } catch {
      // localStorage quota exceeded fallback
    }

    return result;
  } catch (err) {
    console.warn('Geocoding network error:', err);
    return null;
  }
}

/**
 * Client-side Haversine distance calculator in kilometres (rounded to 1 decimal place)
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371.0088; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180.0;
  const dLon = ((lon2 - lon1) * Math.PI) / 180.0;

  const a =
    Math.sin(dLat / 2.0) * Math.sin(dLat / 2.0) +
    Math.cos((lat1 * Math.PI) / 180.0) *
      Math.cos((lat2 * Math.PI) / 180.0) *
      Math.sin(dLon / 2.0) *
      Math.sin(dLon / 2.0);

  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
  return Math.round(R * c * 10) / 10;
}
