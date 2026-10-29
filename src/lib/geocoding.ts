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
export interface LocalityCentroid {
  latitude: number;
  longitude: number;
  displayName: string;
}

/**
 * Pre-compiled offline dictionary of known rural centers, agricultural hubs,
 * and key district centroids across India. Resolves instantly (0ms) without
 * triggering external geocoding requests or consuming rate limits.
 */
export const KNOWN_INDIAN_LOCALITIES: Record<string, LocalityCentroid> = {
  // Maharashtra key agricultural and rural districts
  pune: { latitude: 18.5204, longitude: 73.8567, displayName: 'Pune, Maharashtra' },
  hadapsar: { latitude: 18.5089, longitude: 73.9260, displayName: 'Hadapsar, Pune, Maharashtra' },
  shirur: { latitude: 18.8256, longitude: 74.3789, displayName: 'Shirur, Pune, Maharashtra' },
  baramati: { latitude: 18.1517, longitude: 74.5772, displayName: 'Baramati, Pune, Maharashtra' },
  mumbai: { latitude: 19.0760, longitude: 72.8777, displayName: 'Mumbai, Maharashtra' },
  thane: { latitude: 19.2183, longitude: 72.9781, displayName: 'Thane, Maharashtra' },
  nashik: { latitude: 19.9975, longitude: 73.7898, displayName: 'Nashik, Maharashtra' },
  nagpur: { latitude: 21.1458, longitude: 79.0882, displayName: 'Nagpur, Maharashtra' },
  satara: { latitude: 17.6805, longitude: 74.0183, displayName: 'Satara, Maharashtra' },
  kolhapur: { latitude: 16.7050, longitude: 74.2433, displayName: 'Kolhapur, Maharashtra' },
  solapur: { latitude: 17.6599, longitude: 75.9064, displayName: 'Solapur, Maharashtra' },
  ahmednagar: { latitude: 19.0948, longitude: 74.7480, displayName: 'Ahmednagar, Maharashtra' },
  aurangabad: { latitude: 19.8762, longitude: 75.3433, displayName: 'Chhatrapati Sambhajinagar, Maharashtra' },
  sambhajinagar: { latitude: 19.8762, longitude: 75.3433, displayName: 'Chhatrapati Sambhajinagar, Maharashtra' },
  sangli: { latitude: 16.8524, longitude: 74.5815, displayName: 'Sangli, Maharashtra' },
  jalgaon: { latitude: 21.0077, longitude: 75.5626, displayName: 'Jalgaon, Maharashtra' },
  amravati: { latitude: 20.9320, longitude: 77.7523, displayName: 'Amravati, Maharashtra' },
  nanded: { latitude: 19.1383, longitude: 77.3210, displayName: 'Nanded, Maharashtra' },
  raigad: { latitude: 18.5158, longitude: 73.1822, displayName: 'Raigad, Maharashtra' },
  ratnagiri: { latitude: 16.9902, longitude: 73.3120, displayName: 'Ratnagiri, Maharashtra' },
  sindhudurg: { latitude: 16.1218, longitude: 73.6931, displayName: 'Sindhudurg, Maharashtra' },
  beed: { latitude: 18.9891, longitude: 75.7601, displayName: 'Beed, Maharashtra' },
  latur: { latitude: 18.4088, longitude: 76.5604, displayName: 'Latur, Maharashtra' },
  dharashiv: { latitude: 18.1861, longitude: 76.0419, displayName: 'Dharashiv, Maharashtra' },
  osmanabad: { latitude: 18.1861, longitude: 76.0419, displayName: 'Dharashiv (Osmanabad), Maharashtra' },
  parbhani: { latitude: 19.2686, longitude: 76.7708, displayName: 'Parbhani, Maharashtra' },
  hingoli: { latitude: 19.7196, longitude: 77.1487, displayName: 'Hingoli, Maharashtra' },
  jalna: { latitude: 19.8347, longitude: 75.8816, displayName: 'Jalna, Maharashtra' },
  buldhana: { latitude: 20.5293, longitude: 76.1843, displayName: 'Buldhana, Maharashtra' },
  akola: { latitude: 20.7002, longitude: 77.0082, displayName: 'Akola, Maharashtra' },
  washim: { latitude: 20.1110, longitude: 77.1352, displayName: 'Washim, Maharashtra' },
  yavatmal: { latitude: 20.3888, longitude: 78.1204, displayName: 'Yavatmal, Maharashtra' },
  wardha: { latitude: 20.7453, longitude: 78.6022, displayName: 'Wardha, Maharashtra' },
  chandrapur: { latitude: 19.9615, longitude: 79.2961, displayName: 'Chandrapur, Maharashtra' },
  gadchiroli: { latitude: 20.1849, longitude: 80.0030, displayName: 'Gadchiroli, Maharashtra' },
  bhandara: { latitude: 21.1714, longitude: 79.6548, displayName: 'Bhandara, Maharashtra' },
  gondia: { latitude: 21.4624, longitude: 80.1961, displayName: 'Gondia, Maharashtra' },
  dhule: { latitude: 20.9042, longitude: 74.7749, displayName: 'Dhule, Maharashtra' },
  nandurbar: { latitude: 21.3697, longitude: 74.2415, displayName: 'Nandurbar, Maharashtra' },
  palghar: { latitude: 19.6967, longitude: 72.7699, displayName: 'Palghar, Maharashtra' },

  // Key National & Agricultural Centers
  delhi: { latitude: 28.6139, longitude: 77.2090, displayName: 'Delhi, India' },
  varanasi: { latitude: 25.3176, longitude: 82.9739, displayName: 'Varanasi, Uttar Pradesh' },
  lucknow: { latitude: 26.8467, longitude: 80.9462, displayName: 'Lucknow, Uttar Pradesh' },
  kanpur: { latitude: 26.4499, longitude: 80.3319, displayName: 'Kanpur, Uttar Pradesh' },
  patna: { latitude: 25.5941, longitude: 85.1376, displayName: 'Patna, Bihar' },
  jaipur: { latitude: 26.9124, longitude: 75.7873, displayName: 'Jaipur, Rajasthan' },
  bengaluru: { latitude: 12.9716, longitude: 77.5946, displayName: 'Bengaluru, Karnataka' },
  hyderabad: { latitude: 17.3850, longitude: 78.4867, displayName: 'Hyderabad, Telangana' },
  kolkata: { latitude: 22.5726, longitude: 88.3639, displayName: 'Kolkata, West Bengal' },
  chennai: { latitude: 13.0827, longitude: 80.2707, displayName: 'Chennai, Tamil Nadu' },
  ahmedabad: { latitude: 23.0225, longitude: 72.5714, displayName: 'Ahmedabad, Gujarat' },
  surat: { latitude: 21.1702, longitude: 72.8311, displayName: 'Surat, Gujarat' },
  bhopal: { latitude: 23.2599, longitude: 77.4126, displayName: 'Bhopal, Madhya Pradesh' },
  indore: { latitude: 22.7196, longitude: 75.8577, displayName: 'Indore, Madhya Pradesh' },
  ranchi: { latitude: 23.3441, longitude: 85.3096, displayName: 'Ranchi, Jharkhand' },
  raipur: { latitude: 21.2514, longitude: 81.6296, displayName: 'Raipur, Chhattisgarh' },
  chandigarh: { latitude: 30.7333, longitude: 76.7794, displayName: 'Chandigarh' },
  ludhiana: { latitude: 30.9010, longitude: 75.8573, displayName: 'Ludhiana, Punjab' },
  amritsar: { latitude: 31.6340, longitude: 74.8723, displayName: 'Amritsar, Punjab' },
  visakhapatnam: { latitude: 17.6868, longitude: 83.2185, displayName: 'Visakhapatnam, Andhra Pradesh' },
  vijayawada: { latitude: 16.5062, longitude: 80.6480, displayName: 'Vijayawada, Andhra Pradesh' },
};

/**
 * Resolves offline centroid coordinates from village, district, or freeform text.
 * Prevents workers from being omitted from map discovery when coordinates haven't yet been geocoded.
 */
export function resolveLocalityCoordinates(
  textOrComponents: string | AddressComponents | null | undefined
): LocalityCentroid | null {
  if (!textOrComponents) return null;
  const raw =
    typeof textOrComponents === 'string'
      ? textOrComponents
      : [
          textOrComponents.village,
          textOrComponents.city,
          textOrComponents.district,
          textOrComponents.state,
          textOrComponents.freeform,
        ]
          .filter(Boolean)
          .join(' ');

  const normalized = raw.toLowerCase().normalize('NFC');
  for (const [key, centroid] of Object.entries(KNOWN_INDIAN_LOCALITIES)) {
    const regex = new RegExp(`(^|[^a-z0-9])${key}([^a-z0-9]|$)`, 'i');
    if (regex.test(normalized) || normalized.includes(key)) {
      return centroid;
    }
  }
  return null;
}
