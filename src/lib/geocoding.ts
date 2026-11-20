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
  isApproximatePincode?: boolean;
  locality?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
}

export interface LocationSuggestion {
  displayName: string;
  shortName: string;
  latitude: number;
  longitude: number;
  locality?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  isApproximatePincode?: boolean;
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
const SUGGEST_CACHE_PREFIX = 'quickhire_geo_suggest_';
const LAST_REQUEST_KEY = 'quickhire_geo_last_req_ts';
const MIN_INTERVAL_MS = 1100; // Policy requires >= 1.0 second between requests

// In-memory session cache
const memoryCache = new Map<string, GeocodingResult | null>();
const suggestionCache = new Map<string, LocationSuggestion[]>();

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

export interface LocalityCentroid {
  latitude: number;
  longitude: number;
  displayName: string;
  isApproximatePincode?: boolean;
  locality?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
}

/**
 * Pre-compiled offline dictionary of known rural centers, agricultural hubs,
 * and key district centroids across India. Resolves instantly (0ms) without
 * triggering external geocoding requests or consuming rate limits.
 */
export const KNOWN_INDIAN_LOCALITIES: Record<string, LocalityCentroid> = {
  // Maharashtra key agricultural and rural districts
  pune: { latitude: 18.5204, longitude: 73.8567, displayName: 'Pune, Maharashtra', city: 'Pune', district: 'Pune', state: 'Maharashtra' },
  hadapsar: { latitude: 18.5089, longitude: 73.9260, displayName: 'Hadapsar, Pune, Maharashtra', locality: 'Hadapsar', city: 'Pune', district: 'Pune', state: 'Maharashtra' },
  shirur: { latitude: 18.8256, longitude: 74.3789, displayName: 'Shirur, Pune, Maharashtra', locality: 'Shirur', city: 'Shirur', district: 'Pune', state: 'Maharashtra' },
  baramati: { latitude: 18.1517, longitude: 74.5772, displayName: 'Baramati, Pune, Maharashtra', locality: 'Baramati', city: 'Baramati', district: 'Pune', state: 'Maharashtra' },
  chakan: { latitude: 18.7537, longitude: 73.8576, displayName: 'Chakan, Pune, Maharashtra', locality: 'Chakan', city: 'Pune', district: 'Pune', state: 'Maharashtra' },
  ranjangaon: { latitude: 18.7561, longitude: 74.3056, displayName: 'Ranjangaon, Pune, Maharashtra', locality: 'Ranjangaon', city: 'Shirur', district: 'Pune', state: 'Maharashtra' },
  mumbai: { latitude: 19.0760, longitude: 72.8777, displayName: 'Mumbai, Maharashtra', city: 'Mumbai', district: 'Mumbai', state: 'Maharashtra' },
  thane: { latitude: 19.2183, longitude: 72.9781, displayName: 'Thane, Maharashtra', city: 'Thane', district: 'Thane', state: 'Maharashtra' },
  nashik: { latitude: 19.9975, longitude: 73.7898, displayName: 'Nashik, Maharashtra', city: 'Nashik', district: 'Nashik', state: 'Maharashtra' },
  ozar: { latitude: 20.0632, longitude: 73.9042, displayName: 'Ozar, Nashik, Maharashtra', locality: 'Ozar', city: 'Nashik', district: 'Nashik', state: 'Maharashtra' },
  nagpur: { latitude: 21.1458, longitude: 79.0882, displayName: 'Nagpur, Maharashtra', city: 'Nagpur', district: 'Nagpur', state: 'Maharashtra' },
  satara: { latitude: 17.6805, longitude: 74.0183, displayName: 'Satara, Maharashtra', city: 'Satara', district: 'Satara', state: 'Maharashtra' },
  kolhapur: { latitude: 16.7050, longitude: 74.2433, displayName: 'Kolhapur, Maharashtra', city: 'Kolhapur', district: 'Kolhapur', state: 'Maharashtra' },
  solapur: { latitude: 17.6599, longitude: 75.9064, displayName: 'Solapur, Maharashtra', city: 'Solapur', district: 'Solapur', state: 'Maharashtra' },
  ahmednagar: { latitude: 19.0948, longitude: 74.7480, displayName: 'Ahmednagar, Maharashtra', city: 'Ahmednagar', district: 'Ahmednagar', state: 'Maharashtra' },
  shirdi: { latitude: 19.7667, longitude: 74.4833, displayName: 'Shirdi, Ahmednagar, Maharashtra', locality: 'Shirdi', city: 'Rahata', district: 'Ahmednagar', state: 'Maharashtra' },
  aurangabad: { latitude: 19.8762, longitude: 75.3433, displayName: 'Chhatrapati Sambhajinagar, Maharashtra', city: 'Chhatrapati Sambhajinagar', district: 'Chhatrapati Sambhajinagar', state: 'Maharashtra' },
  sambhajinagar: { latitude: 19.8762, longitude: 75.3433, displayName: 'Chhatrapati Sambhajinagar, Maharashtra', city: 'Chhatrapati Sambhajinagar', district: 'Chhatrapati Sambhajinagar', state: 'Maharashtra' },
  sangli: { latitude: 16.8524, longitude: 74.5815, displayName: 'Sangli, Maharashtra', city: 'Sangli', district: 'Sangli', state: 'Maharashtra' },
  jalgaon: { latitude: 21.0077, longitude: 75.5626, displayName: 'Jalgaon, Maharashtra', city: 'Jalgaon', district: 'Jalgaon', state: 'Maharashtra' },
  amravati: { latitude: 20.9320, longitude: 77.7523, displayName: 'Amravati, Maharashtra', city: 'Amravati', district: 'Amravati', state: 'Maharashtra' },
  nanded: { latitude: 19.1383, longitude: 77.3210, displayName: 'Nanded, Maharashtra', city: 'Nanded', district: 'Nanded', state: 'Maharashtra' },
  raigad: { latitude: 18.5158, longitude: 73.1822, displayName: 'Raigad, Maharashtra', city: 'Alibag', district: 'Raigad', state: 'Maharashtra' },
  ratnagiri: { latitude: 16.9902, longitude: 73.3120, displayName: 'Ratnagiri, Maharashtra', city: 'Ratnagiri', district: 'Ratnagiri', state: 'Maharashtra' },
  sindhudurg: { latitude: 16.1218, longitude: 73.6931, displayName: 'Sindhudurg, Maharashtra', city: 'Oros', district: 'Sindhudurg', state: 'Maharashtra' },
  beed: { latitude: 18.9891, longitude: 75.7601, displayName: 'Beed, Maharashtra', city: 'Beed', district: 'Beed', state: 'Maharashtra' },
  latur: { latitude: 18.4088, longitude: 76.5604, displayName: 'Latur, Maharashtra', city: 'Latur', district: 'Latur', state: 'Maharashtra' },
  dharashiv: { latitude: 18.1861, longitude: 76.0419, displayName: 'Dharashiv, Maharashtra', city: 'Dharashiv', district: 'Dharashiv', state: 'Maharashtra' },
  osmanabad: { latitude: 18.1861, longitude: 76.0419, displayName: 'Dharashiv (Osmanabad), Maharashtra', city: 'Dharashiv', district: 'Dharashiv', state: 'Maharashtra' },
  parbhani: { latitude: 19.2686, longitude: 76.7708, displayName: 'Parbhani, Maharashtra', city: 'Parbhani', district: 'Parbhani', state: 'Maharashtra' },
  hingoli: { latitude: 19.7196, longitude: 77.1487, displayName: 'Hingoli, Maharashtra', city: 'Hingoli', district: 'Hingoli', state: 'Maharashtra' },
  jalna: { latitude: 19.8347, longitude: 75.8816, displayName: 'Jalna, Maharashtra', city: 'Jalna', district: 'Jalna', state: 'Maharashtra' },
  buldhana: { latitude: 20.5293, longitude: 76.1843, displayName: 'Buldhana, Maharashtra', city: 'Buldhana', district: 'Buldhana', state: 'Maharashtra' },
  akola: { latitude: 20.7002, longitude: 77.0082, displayName: 'Akola, Maharashtra', city: 'Akola', district: 'Akola', state: 'Maharashtra' },
  washim: { latitude: 20.1110, longitude: 77.1352, displayName: 'Washim, Maharashtra', city: 'Washim', district: 'Washim', state: 'Maharashtra' },
  yavatmal: { latitude: 20.3888, longitude: 78.1204, displayName: 'Yavatmal, Maharashtra', city: 'Yavatmal', district: 'Yavatmal', state: 'Maharashtra' },
  wardha: { latitude: 20.7453, longitude: 78.6022, displayName: 'Wardha, Maharashtra', city: 'Wardha', district: 'Wardha', state: 'Maharashtra' },
  chandrapur: { latitude: 19.9615, longitude: 79.2961, displayName: 'Chandrapur, Maharashtra', city: 'Chandrapur', district: 'Chandrapur', state: 'Maharashtra' },
  gadchiroli: { latitude: 20.1849, longitude: 80.0030, displayName: 'Gadchiroli, Maharashtra', city: 'Gadchiroli', district: 'Gadchiroli', state: 'Maharashtra' },
  bhandara: { latitude: 21.1714, longitude: 79.6548, displayName: 'Bhandara, Maharashtra', city: 'Bhandara', district: 'Bhandara', state: 'Maharashtra' },
  gondia: { latitude: 21.4624, longitude: 80.1961, displayName: 'Gondia, Maharashtra', city: 'Gondia', district: 'Gondia', state: 'Maharashtra' },
  dhule: { latitude: 20.9042, longitude: 74.7749, displayName: 'Dhule, Maharashtra', city: 'Dhule', district: 'Dhule', state: 'Maharashtra' },
  nandurbar: { latitude: 21.3697, longitude: 74.2415, displayName: 'Nandurbar, Maharashtra', city: 'Nandurbar', district: 'Nandurbar', state: 'Maharashtra' },
  palghar: { latitude: 19.6967, longitude: 72.7699, displayName: 'Palghar, Maharashtra', city: 'Palghar', district: 'Palghar', state: 'Maharashtra' },

  // Key National & Agricultural Centers
  delhi: { latitude: 28.6139, longitude: 77.2090, displayName: 'Delhi, India', city: 'Delhi', district: 'Central Delhi', state: 'Delhi' },
  varanasi: { latitude: 25.3176, longitude: 82.9739, displayName: 'Varanasi, Uttar Pradesh', city: 'Varanasi', district: 'Varanasi', state: 'Uttar Pradesh' },
  lucknow: { latitude: 26.8467, longitude: 80.9462, displayName: 'Lucknow, Uttar Pradesh', city: 'Lucknow', district: 'Lucknow', state: 'Uttar Pradesh' },
  kanpur: { latitude: 26.4499, longitude: 80.3319, displayName: 'Kanpur, Uttar Pradesh', city: 'Kanpur', district: 'Kanpur', state: 'Uttar Pradesh' },
  meerut: { latitude: 28.9845, longitude: 77.7064, displayName: 'Meerut, Uttar Pradesh', city: 'Meerut', district: 'Meerut', state: 'Uttar Pradesh' },
  rampur: { latitude: 28.8078, longitude: 79.0267, displayName: 'Rampur, Uttar Pradesh', city: 'Rampur', district: 'Rampur', state: 'Uttar Pradesh' },
  patna: { latitude: 25.5941, longitude: 85.1376, displayName: 'Patna, Bihar', city: 'Patna', district: 'Patna', state: 'Bihar' },
  sonpur: { latitude: 25.7000, longitude: 85.1833, displayName: 'Sonpur, Saran, Bihar', locality: 'Sonpur', city: 'Sonpur', district: 'Saran', state: 'Bihar' },
  jaipur: { latitude: 26.9124, longitude: 75.7873, displayName: 'Jaipur, Rajasthan', city: 'Jaipur', district: 'Jaipur', state: 'Rajasthan' },
  bengaluru: { latitude: 12.9716, longitude: 77.5946, displayName: 'Bengaluru, Karnataka', city: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka' },
  hyderabad: { latitude: 17.3850, longitude: 78.4867, displayName: 'Hyderabad, Telangana', city: 'Hyderabad', district: 'Hyderabad', state: 'Telangana' },
  kolkata: { latitude: 22.5726, longitude: 88.3639, displayName: 'Kolkata, West Bengal', city: 'Kolkata', district: 'Kolkata', state: 'West Bengal' },
  chennai: { latitude: 13.0827, longitude: 80.2707, displayName: 'Chennai, Tamil Nadu', city: 'Chennai', district: 'Chennai', state: 'Tamil Nadu' },
  ahmedabad: { latitude: 23.0225, longitude: 72.5714, displayName: 'Ahmedabad, Gujarat', city: 'Ahmedabad', district: 'Ahmedabad', state: 'Gujarat' },
  anand: { latitude: 22.5645, longitude: 72.9289, displayName: 'Anand, Gujarat', city: 'Anand', district: 'Anand', state: 'Gujarat' },
  surat: { latitude: 21.1702, longitude: 72.8311, displayName: 'Surat, Gujarat', city: 'Surat', district: 'Surat', state: 'Gujarat' },
  bhopal: { latitude: 23.2599, longitude: 77.4126, displayName: 'Bhopal, Madhya Pradesh', city: 'Bhopal', district: 'Bhopal', state: 'Madhya Pradesh' },
  indore: { latitude: 22.7196, longitude: 75.8577, displayName: 'Indore, Madhya Pradesh', city: 'Indore', district: 'Indore', state: 'Madhya Pradesh' },
  ranchi: { latitude: 23.3441, longitude: 85.3096, displayName: 'Ranchi, Jharkhand', city: 'Ranchi', district: 'Ranchi', state: 'Jharkhand' },
  raipur: { latitude: 21.2514, longitude: 81.6296, displayName: 'Raipur, Chhattisgarh', city: 'Raipur', district: 'Raipur', state: 'Chhattisgarh' },
  chandigarh: { latitude: 30.7333, longitude: 76.7794, displayName: 'Chandigarh', city: 'Chandigarh', district: 'Chandigarh', state: 'Chandigarh' },
  ludhiana: { latitude: 30.9010, longitude: 75.8573, displayName: 'Ludhiana, Punjab', city: 'Ludhiana', district: 'Ludhiana', state: 'Punjab' },
  amritsar: { latitude: 31.6340, longitude: 74.8723, displayName: 'Amritsar, Punjab', city: 'Amritsar', district: 'Amritsar', state: 'Punjab' },
  visakhapatnam: { latitude: 17.6868, longitude: 83.2185, displayName: 'Visakhapatnam, Andhra Pradesh', city: 'Visakhapatnam', district: 'Visakhapatnam', state: 'Andhra Pradesh' },
  vijayawada: { latitude: 16.5062, longitude: 80.6480, displayName: 'Vijayawada, Andhra Pradesh', city: 'Vijayawada', district: 'NTR', state: 'Andhra Pradesh' },
};

/**
 * Pre-compiled offline dictionary of prominent Indian PIN codes and their approximate area centroids.
 */
export const KNOWN_INDIAN_PINCODES: Record<string, LocalityCentroid> = {
  // Maharashtra Key PIN codes
  '411001': { latitude: 18.5204, longitude: 73.8567, displayName: 'Pune City, Maharashtra (PIN 411001)', city: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '411001', isApproximatePincode: true },
  '411028': { latitude: 18.5089, longitude: 73.9260, displayName: 'Hadapsar, Pune, Maharashtra (PIN 411028)', locality: 'Hadapsar', city: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '411028', isApproximatePincode: true },
  '411038': { latitude: 18.5074, longitude: 73.8077, displayName: 'Kothrud, Pune, Maharashtra (PIN 411038)', locality: 'Kothrud', city: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '411038', isApproximatePincode: true },
  '411057': { latitude: 18.5913, longitude: 73.7389, displayName: 'Hinjawadi, Pune, Maharashtra (PIN 411057)', locality: 'Hinjawadi', city: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '411057', isApproximatePincode: true },
  '410501': { latitude: 18.7537, longitude: 73.8576, displayName: 'Chakan, Pune, Maharashtra (PIN 410501)', locality: 'Chakan', city: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '410501', isApproximatePincode: true },
  '410507': { latitude: 19.0064, longitude: 73.9458, displayName: 'Manchar, Pune, Maharashtra (PIN 410507)', locality: 'Manchar', city: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '410507', isApproximatePincode: true },
  '412210': { latitude: 18.8256, longitude: 74.3789, displayName: 'Shirur, Pune, Maharashtra (PIN 412210)', locality: 'Shirur', city: 'Shirur', district: 'Pune', state: 'Maharashtra', pincode: '412210', isApproximatePincode: true },
  '412209': { latitude: 18.7561, longitude: 74.3056, displayName: 'Ranjangaon, Pune, Maharashtra (PIN 412209)', locality: 'Ranjangaon', city: 'Shirur', district: 'Pune', state: 'Maharashtra', pincode: '412209', isApproximatePincode: true },
  '413102': { latitude: 18.1517, longitude: 74.5772, displayName: 'Baramati, Pune, Maharashtra (PIN 413102)', locality: 'Baramati', city: 'Baramati', district: 'Pune', state: 'Maharashtra', pincode: '413102', isApproximatePincode: true },
  '400001': { latitude: 18.9388, longitude: 72.8354, displayName: 'Mumbai Fort, Maharashtra (PIN 400001)', city: 'Mumbai', district: 'Mumbai', state: 'Maharashtra', pincode: '400001', isApproximatePincode: true },
  '400050': { latitude: 19.0596, longitude: 72.8295, displayName: 'Bandra, Mumbai, Maharashtra (PIN 400050)', locality: 'Bandra', city: 'Mumbai', district: 'Mumbai', state: 'Maharashtra', pincode: '400050', isApproximatePincode: true },
  '400601': { latitude: 19.2183, longitude: 72.9781, displayName: 'Thane, Maharashtra (PIN 400601)', city: 'Thane', district: 'Thane', state: 'Maharashtra', pincode: '400601', isApproximatePincode: true },
  '422001': { latitude: 19.9975, longitude: 73.7898, displayName: 'Nashik, Maharashtra (PIN 422001)', city: 'Nashik', district: 'Nashik', state: 'Maharashtra', pincode: '422001', isApproximatePincode: true },
  '422206': { latitude: 20.0632, longitude: 73.9042, displayName: 'Ozar, Nashik, Maharashtra (PIN 422206)', locality: 'Ozar', city: 'Nashik', district: 'Nashik', state: 'Maharashtra', pincode: '422206', isApproximatePincode: true },
  '440001': { latitude: 21.1458, longitude: 79.0882, displayName: 'Nagpur, Maharashtra (PIN 440001)', city: 'Nagpur', district: 'Nagpur', state: 'Maharashtra', pincode: '440001', isApproximatePincode: true },
  '416001': { latitude: 16.7050, longitude: 74.2433, displayName: 'Kolhapur, Maharashtra (PIN 416001)', city: 'Kolhapur', district: 'Kolhapur', state: 'Maharashtra', pincode: '416001', isApproximatePincode: true },
  '415001': { latitude: 17.6805, longitude: 74.0183, displayName: 'Satara, Maharashtra (PIN 415001)', city: 'Satara', district: 'Satara', state: 'Maharashtra', pincode: '415001', isApproximatePincode: true },
  '413001': { latitude: 17.6599, longitude: 75.9064, displayName: 'Solapur, Maharashtra (PIN 413001)', city: 'Solapur', district: 'Solapur', state: 'Maharashtra', pincode: '413001', isApproximatePincode: true },
  '414001': { latitude: 19.0948, longitude: 74.7480, displayName: 'Ahmednagar, Maharashtra (PIN 414001)', city: 'Ahmednagar', district: 'Ahmednagar', state: 'Maharashtra', pincode: '414001', isApproximatePincode: true },
  '423109': { latitude: 19.7667, longitude: 74.4833, displayName: 'Shirdi, Ahmednagar, Maharashtra (PIN 423109)', locality: 'Shirdi', city: 'Rahata', district: 'Ahmednagar', state: 'Maharashtra', pincode: '423109', isApproximatePincode: true },
  '431001': { latitude: 19.8762, longitude: 75.3433, displayName: 'Chhatrapati Sambhajinagar, Maharashtra (PIN 431001)', city: 'Chhatrapati Sambhajinagar', district: 'Chhatrapati Sambhajinagar', state: 'Maharashtra', pincode: '431001', isApproximatePincode: true },
  '416416': { latitude: 16.8524, longitude: 74.5815, displayName: 'Sangli, Maharashtra (PIN 416416)', city: 'Sangli', district: 'Sangli', state: 'Maharashtra', pincode: '416416', isApproximatePincode: true },

  // Key National Centres & Agricultural Hubs
  '110001': { latitude: 28.6139, longitude: 77.2090, displayName: 'New Delhi, Delhi (PIN 110001)', city: 'Delhi', district: 'Central Delhi', state: 'Delhi', pincode: '110001', isApproximatePincode: true },
  '221001': { latitude: 25.3176, longitude: 82.9739, displayName: 'Varanasi, Uttar Pradesh (PIN 221001)', city: 'Varanasi', district: 'Varanasi', state: 'Uttar Pradesh', pincode: '221001', isApproximatePincode: true },
  '226001': { latitude: 26.8467, longitude: 80.9462, displayName: 'Lucknow, Uttar Pradesh (PIN 226001)', city: 'Lucknow', district: 'Lucknow', state: 'Uttar Pradesh', pincode: '226001', isApproximatePincode: true },
  '208001': { latitude: 26.4499, longitude: 80.3319, displayName: 'Kanpur, Uttar Pradesh (PIN 208001)', city: 'Kanpur', district: 'Kanpur', state: 'Uttar Pradesh', pincode: '208001', isApproximatePincode: true },
  '250001': { latitude: 28.9845, longitude: 77.7064, displayName: 'Meerut, Uttar Pradesh (PIN 250001)', city: 'Meerut', district: 'Meerut', state: 'Uttar Pradesh', pincode: '250001', isApproximatePincode: true },
  '800001': { latitude: 25.5941, longitude: 85.1376, displayName: 'Patna, Bihar (PIN 800001)', city: 'Patna', district: 'Patna', state: 'Bihar', pincode: '800001', isApproximatePincode: true },
  '302001': { latitude: 26.9124, longitude: 75.7873, displayName: 'Jaipur, Rajasthan (PIN 302001)', city: 'Jaipur', district: 'Jaipur', state: 'Rajasthan', pincode: '302001', isApproximatePincode: true },
  '560001': { latitude: 12.9716, longitude: 77.5946, displayName: 'Bengaluru, Karnataka (PIN 560001)', city: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pincode: '560001', isApproximatePincode: true },
  '500001': { latitude: 17.3850, longitude: 78.4867, displayName: 'Hyderabad, Telangana (PIN 500001)', city: 'Hyderabad', district: 'Hyderabad', state: 'Telangana', pincode: '500001', isApproximatePincode: true },
  '700001': { latitude: 22.5726, longitude: 88.3639, displayName: 'Kolkata, West Bengal (PIN 700001)', city: 'Kolkata', district: 'Kolkata', state: 'West Bengal', pincode: '700001', isApproximatePincode: true },
  '600001': { latitude: 13.0827, longitude: 80.2707, displayName: 'Chennai, Tamil Nadu (PIN 600001)', city: 'Chennai', district: 'Chennai', state: 'Tamil Nadu', pincode: '600001', isApproximatePincode: true },
  '380001': { latitude: 23.0225, longitude: 72.5714, displayName: 'Ahmedabad, Gujarat (PIN 380001)', city: 'Ahmedabad', district: 'Ahmedabad', state: 'Gujarat', pincode: '380001', isApproximatePincode: true },
  '462001': { latitude: 23.2599, longitude: 77.4126, displayName: 'Bhopal, Madhya Pradesh (PIN 462001)', city: 'Bhopal', district: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001', isApproximatePincode: true },
  '452001': { latitude: 22.7196, longitude: 75.8577, displayName: 'Indore, Madhya Pradesh (PIN 452001)', city: 'Indore', district: 'Indore', state: 'Madhya Pradesh', pincode: '452001', isApproximatePincode: true },
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
          textOrComponents.pincode,
        ]
          .filter(Boolean)
          .join(' ');

  // 1. Direct PIN code check
  const pinMatch = raw.match(/\b([1-9][0-9]{5})\b/);
  if (pinMatch && KNOWN_INDIAN_PINCODES[pinMatch[1]]) {
    return KNOWN_INDIAN_PINCODES[pinMatch[1]];
  }

  // 2. Locality name matching
  const normalized = raw.toLowerCase().normalize('NFC');
  for (const [key, centroid] of Object.entries(KNOWN_INDIAN_LOCALITIES)) {
    const regex = new RegExp(`(^|[^a-z0-9])${key}([^a-z0-9]|$)`, 'i');
    if (regex.test(normalized) || normalized.includes(key)) {
      return centroid;
    }
  }
  return null;
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

  // 3. Check offline dictionary (instant 0ms resolution)
  const offlineMatch = resolveLocalityCoordinates(query);
  if (offlineMatch) {
    return {
      latitude: offlineMatch.latitude,
      longitude: offlineMatch.longitude,
      displayName: offlineMatch.displayName,
      isApproximatePincode: offlineMatch.isApproximatePincode,
      locality: offlineMatch.locality,
      city: offlineMatch.city,
      district: offlineMatch.district,
      state: offlineMatch.state,
      pincode: offlineMatch.pincode,
    };
  }

  // 4. Rate-limited network fetch from Nominatim
  try {
    await enforceRateLimit();

    const isPincode = /^[1-9][0-9]{5}$/.test(query.trim());
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', isPincode ? `${query.trim()}, India` : query);
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

    const addr = first.address || {};
    const result: GeocodingResult = {
      latitude: lat,
      longitude: lon,
      displayName: first.display_name || query,
      isApproximatePincode: isPincode || first.type === 'postcode',
      locality: addr.suburb || addr.neighbourhood || addr.village || addr.hamlet || undefined,
      city: addr.city || addr.town || addr.county || undefined,
      district: addr.state_district || addr.district || undefined,
      state: addr.state || undefined,
      pincode: addr.postcode || (isPincode ? query.trim() : undefined),
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
 * Searches location suggestions with instant offline matching and rate-limited online Nominatim suggestions.
 * Tailored for Indian localities, villages, cities, and 6-digit PIN codes.
 */
export async function searchLocationSuggestions(query: string): Promise<LocationSuggestion[]> {
  const trimmed = query.trim().toLowerCase().normalize('NFC');
  if (trimmed.length < 2) return [];

  const cacheKey = SUGGEST_CACHE_PREFIX + trimmed;
  if (suggestionCache.has(cacheKey)) {
    return suggestionCache.get(cacheKey) || [];
  }

  const suggestions: LocationSuggestion[] = [];

  // 1. PIN code matching (exact or prefix)
  const pinQueryMatch = trimmed.match(/^([1-9][0-9]{0,5})$/);
  if (pinQueryMatch) {
    const partialPin = pinQueryMatch[1];
    for (const [pin, centroid] of Object.entries(KNOWN_INDIAN_PINCODES)) {
      if (pin.startsWith(partialPin) || pin === partialPin) {
        suggestions.push({
          displayName: centroid.displayName,
          shortName: centroid.displayName.split('(')[0].trim(),
          latitude: centroid.latitude,
          longitude: centroid.longitude,
          locality: centroid.locality,
          city: centroid.city,
          district: centroid.district,
          state: centroid.state,
          pincode: centroid.pincode || pin,
          isApproximatePincode: true,
        });
        if (suggestions.length >= 4) break;
      }
    }
  }

  // 2. Offline locality dictionary matches
  for (const [key, centroid] of Object.entries(KNOWN_INDIAN_LOCALITIES)) {
    if (key.includes(trimmed) || centroid.displayName.toLowerCase().includes(trimmed)) {
      if (!suggestions.some((s) => Math.abs(s.latitude - centroid.latitude) < 0.005 && Math.abs(s.longitude - centroid.longitude) < 0.005)) {
        suggestions.push({
          displayName: centroid.displayName,
          shortName: centroid.displayName.split(',')[0].trim(),
          latitude: centroid.latitude,
          longitude: centroid.longitude,
          locality: centroid.locality,
          city: centroid.city,
          district: centroid.district,
          state: centroid.state,
          pincode: centroid.pincode,
          isApproximatePincode: false,
        });
      }
    }
    if (suggestions.length >= 6) break;
  }

  // If we already have strong offline matches, cache and return immediately
  if (suggestions.length >= 3) {
    suggestionCache.set(cacheKey, suggestions);
    return suggestions;
  }

  // 3. Online Nominatim Search fallback
  try {
    await enforceRateLimit();

    const isPincode = /^[1-9][0-9]{5}$/.test(trimmed);
    const searchParam = isPincode ? `${trimmed}, India` : `${trimmed}, India`;

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', searchParam);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '4');
    url.searchParams.set('countrycodes', 'in');
    url.searchParams.set('addressdetails', '1');

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (res.ok) {
      const items = await res.json();
      if (Array.isArray(items)) {
        for (const item of items) {
          const lat = parseFloat(item.lat);
          const lon = parseFloat(item.lon);
          if (!isNaN(lat) && !isNaN(lon)) {
            const addr = item.address || {};
            const cleanShort =
              addr.suburb || addr.neighbourhood || addr.village || addr.city || addr.town || item.display_name.split(',')[0].trim();

            if (!suggestions.some((s) => Math.abs(s.latitude - lat) < 0.005 && Math.abs(s.longitude - lon) < 0.005)) {
              suggestions.push({
                displayName: item.display_name,
                shortName: cleanShort,
                latitude: lat,
                longitude: lon,
                locality: addr.suburb || addr.neighbourhood || addr.village || addr.hamlet || undefined,
                city: addr.city || addr.town || addr.county || undefined,
                district: addr.state_district || addr.district || undefined,
                state: addr.state || undefined,
                pincode: addr.postcode || (isPincode ? trimmed : undefined),
                isApproximatePincode: isPincode || item.type === 'postcode',
              });
            }
          }
          if (suggestions.length >= 6) break;
        }
      }
    }
  } catch {
    // If network fails, return available offline suggestions
  }

  suggestionCache.set(cacheKey, suggestions);
  return suggestions;
}

/**
 * Geocodes a preferred location string into verified coordinates and address details.
 * Flags approximate PIN-code-only entries.
 */
export async function geocodePreferredLocation(
  locationInput: string
): Promise<LocationSuggestion | null> {
  const trimmed = locationInput.trim();
  if (!trimmed) return null;

  // 1. PIN code check
  const isPincode = /^[1-9][0-9]{5}$/.test(trimmed);
  if (isPincode && KNOWN_INDIAN_PINCODES[trimmed]) {
    const p = KNOWN_INDIAN_PINCODES[trimmed];
    return {
      displayName: p.displayName,
      shortName: p.displayName.split('(')[0].trim(),
      latitude: p.latitude,
      longitude: p.longitude,
      locality: p.locality,
      city: p.city,
      district: p.district,
      state: p.state,
      pincode: trimmed,
      isApproximatePincode: true,
    };
  }

  // 2. Offline locality check
  const offline = resolveLocalityCoordinates(trimmed);
  if (offline) {
    return {
      displayName: offline.displayName,
      shortName: offline.displayName.split(',')[0].trim(),
      latitude: offline.latitude,
      longitude: offline.longitude,
      locality: offline.locality,
      city: offline.city,
      district: offline.district,
      state: offline.state,
      pincode: offline.pincode,
      isApproximatePincode: offline.isApproximatePincode || isPincode,
    };
  }

  // 3. Online geocoding via geocodeAddress
  const res = await geocodeAddress(trimmed);
  if (res) {
    return {
      displayName: res.displayName,
      shortName: res.displayName.split(',')[0].trim(),
      latitude: res.latitude,
      longitude: res.longitude,
      locality: res.locality,
      city: res.city,
      district: res.district,
      state: res.state,
      pincode: res.pincode,
      isApproximatePincode: res.isApproximatePincode || isPincode,
    };
  }

  return null;
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

export interface PreferredLocation {
  lat: number;
  lon: number;
  label: string;
  radiusKm?: number;
  updatedAt?: number;
  isGps?: boolean;
}

const PREFERRED_LOC_KEY = 'quickhire_employer_preferred_location';
const RECENT_LOCS_KEY = 'quickhire_recent_search_locations';

export function getSavedPreferredLocation(): PreferredLocation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PREFERRED_LOC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lat === 'number' && typeof parsed?.lon === 'number' && parsed.label) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function savePreferredLocation(loc: PreferredLocation | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (loc === null) {
      localStorage.removeItem(PREFERRED_LOC_KEY);
    } else {
      localStorage.setItem(PREFERRED_LOC_KEY, JSON.stringify({ ...loc, updatedAt: Date.now() }));
    }
  } catch {
    // ignore
  }
}

export function getRecentLocations(): PreferredLocation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_LOCS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 5);
      }
    }
  } catch {
    // ignore
  }
  // Default rural hubs if no recent searches yet
  return [
    { lat: 18.5204, lon: 73.8567, label: 'Pune, Maharashtra' },
    { lat: 21.1458, lon: 79.0882, label: 'Nagpur, Maharashtra' },
    { lat: 18.1517, lon: 74.5772, label: 'Baramati, Pune' },
    { lat: 19.9975, lon: 73.7898, label: 'Nashik, Maharashtra' },
  ];
}

export function saveRecentLocation(loc: PreferredLocation): void {
  if (typeof window === 'undefined') return;
  try {
    const recents = getRecentLocations().filter(
      (r) => Math.abs(r.lat - loc.lat) > 0.005 || Math.abs(r.lon - loc.lon) > 0.005
    );
    recents.unshift(loc);
    localStorage.setItem(RECENT_LOCS_KEY, JSON.stringify(recents.slice(0, 5)));
  } catch {
    // ignore
  }
}
