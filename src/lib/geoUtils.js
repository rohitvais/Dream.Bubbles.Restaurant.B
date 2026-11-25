const MAP_RESOLVE_TIMEOUT_MS = 10000;

const CITY_REFERENCE_COORDS = {
  kolkata: { lat: 22.5726, lng: 88.3639 },
  calcutta: { lat: 22.5726, lng: 88.3639 },
  howrah: { lat: 22.5958, lng: 88.2636 },
  'salt lake': { lat: 22.5867, lng: 88.4172 },
  bidhannagar: { lat: 22.5867, lng: 88.4172 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  'navi mumbai': { lat: 19.033, lng: 73.0297 },
  thane: { lat: 19.2183, lng: 72.9781 },
  delhi: { lat: 28.6139, lng: 77.209 },
  'new delhi': { lat: 28.6139, lng: 77.209 },
  gurugram: { lat: 28.4595, lng: 77.0266 },
  gurgaon: { lat: 28.4595, lng: 77.0266 },
  noida: { lat: 28.5355, lng: 77.391 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  pune: { lat: 18.5204, lng: 73.8567 },
  ahmedabad: { lat: 23.0225, lng: 72.5714 },
  jaipur: { lat: 26.9124, lng: 75.7873 },
  siliguri: { lat: 26.7271, lng: 88.3953 },
  durgapur: { lat: 23.5204, lng: 87.3119 },
  bhubaneswar: { lat: 20.2961, lng: 85.8245 },
};

const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
};

const isValidCoordPair = (lat, lng) =>
  typeof lat === 'number' &&
  typeof lng === 'number' &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180;

const isAllowedGoogleMapsUrl = (rawUrl) => {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'maps.app.goo.gl') return true;
    if (host === 'goo.gl' && parsed.pathname.toLowerCase().startsWith('/maps')) return true;
    if (/^(www\.|maps\.)?google\.[a-z.]{2,}$/.test(host)) return true;
    return false;
  } catch {
    return false;
  }
};

/**
 * Extracts lat/lng from a Google Maps URL or HTML text.
 * Priority:
 *  1. Place pin `!3d<lat>!4d<lng>`
 *  2. Viewport `@<lat>,<lng>`
 *  3. Query parameter `q=lat,lng` / `query=lat,lng` / `ll=lat,lng` / `center=lat,lng`
 */
const extractCoordsFromText = (text) => {
  if (!text || typeof text !== 'string') return null;

  // 1. Place pin coordinates (!3d<lat>!4d<lng>) — check all occurrences, last pin is most specific on place URLs
  const pinMatches = [...text.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
  if (pinMatches.length > 0) {
    const lastPin = pinMatches[pinMatches.length - 1];
    const lat = parseFloat(lastPin[1]);
    const lng = parseFloat(lastPin[2]);
    if (isValidCoordPair(lat, lng)) return { lat, lng, source: 'place-pin' };
  }

  // 2. Viewport coordinates (@lat,lng)
  const atMatch = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (isValidCoordPair(lat, lng)) return { lat, lng, source: 'viewport' };
  }

  // 3. Query params (q=lat,lng | query=lat,lng | ll=lat,lng | center=lat,lng)
  const qMatch = text.match(
    /[?&](?:q|query|ll|center)=(-?\d+(?:\.\d+)?)(?:%2C|,|%20|\s)+(-?\d+(?:\.\d+)?)/i
  );
  if (qMatch) {
    const lat = parseFloat(qMatch[1]);
    const lng = parseFloat(qMatch[2]);
    if (isValidCoordPair(lat, lng)) return { lat, lng, source: 'query' };
  }

  return null;
};

/**
 * Resolves a Google Maps share/short/full URL (including server-side redirect following
 * with a 10s timeout) and returns { lat, lng, resolvedUrl }.
 */
async function resolveGoogleMapsLink(inputUrl, fetchImpl = global.fetch) {
  const cleanUrl = String(inputUrl || '').trim();
  const invalidMsg =
    "Couldn't read a location from this link. Copy the link from Google Maps' Share button.";

  if (!cleanUrl || !isAllowedGoogleMapsUrl(cleanUrl)) {
    const err = new Error(invalidMsg);
    err.statusCode = 400;
    throw err;
  }

  // If URL already contains explicit place/query coords and is not a goo.gl shortener, parse directly
  const parsedUrl = new URL(cleanUrl);
  const isShortLink =
    parsedUrl.hostname.toLowerCase() === 'maps.app.goo.gl' ||
    parsedUrl.hostname.toLowerCase() === 'goo.gl';

  if (!isShortLink) {
    const direct = extractCoordsFromText(cleanUrl);
    if (direct) {
      return { lat: direct.lat, lng: direct.lng, resolvedUrl: cleanUrl };
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAP_RESOLVE_TIMEOUT_MS);

  try {
    const res = await fetchImpl(cleanUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DreamBubblesMapsResolver/1.0)',
      },
    });

    const resolvedUrl = res.url || cleanUrl;
    const fromFinalUrl = extractCoordsFromText(resolvedUrl);
    if (fromFinalUrl) {
      return { lat: fromFinalUrl.lat, lng: fromFinalUrl.lng, resolvedUrl };
    }

    // Some Google Maps links embed the destination URL / pin coordinates in response HTML
    const bodyText = await res.text();
    const snippet = bodyText.slice(0, 200000);
    const fromHtml = extractCoordsFromText(snippet.replace(/\\u0026/g, '&').replace(/\\\//g, '/'));
    if (fromHtml) {
      return { lat: fromHtml.lat, lng: fromHtml.lng, resolvedUrl };
    }

    const err = new Error(invalidMsg);
    err.statusCode = 400;
    throw err;
  } catch (err) {
    if (err.statusCode === 400) throw err;
    const wrapped = new Error(invalidMsg);
    wrapped.statusCode = 400;
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
}

const buildGoogleMapsSearchUrl = (lat, lng) => {
  if (!isValidCoordPair(Number(lat), Number(lng))) return '';
  return `https://www.google.com/maps/search/?api=1&query=${Number(lat)},${Number(lng)}`;
};

/**
 * Checks whether (lat, lng) is roughly within 50 km of known reference city coordinates.
 */
const checkCityCoordinateDistance = (city, lat, lng) => {
  if (!city || !isValidCoordPair(Number(lat), Number(lng))) return null;
  const key = String(city).trim().toLowerCase();
  const ref = CITY_REFERENCE_COORDS[key];
  if (!ref) return null;

  const distanceKm = calculateDistanceKm(ref.lat, ref.lng, Number(lat), Number(lng));
  if (distanceKm > 50) {
    return {
      matchesCity: false,
      distanceKm,
      warning: `This location doesn't look like it's in ${city.trim()}. Double-check the link.`,
    };
  }
  return { matchesCity: true, distanceKm, warning: null };
};

/**
 * Normalizes Indian WhatsApp numbers to +91XXXXXXXXXX when 10 digits, 0-prefixed 11 digits,
 * or 91-prefixed 12 digits are supplied.
 */
const normalizeIndianWhatsApp = (raw) => {
  const str = String(raw || '').trim();
  if (!str) return '';
  const digits = str.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return str;
};

/**
 * Formats WhatsApp number strictly as digits with 91 prefix (91XXXXXXXXXX) for wa.me links.
 */
const buildWhatsAppDigits = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
};

module.exports = {
  CITY_REFERENCE_COORDS,
  calculateDistanceKm,
  isValidCoordPair,
  isAllowedGoogleMapsUrl,
  extractCoordsFromText,
  resolveGoogleMapsLink,
  buildGoogleMapsSearchUrl,
  checkCityCoordinateDistance,
  normalizeIndianWhatsApp,
  buildWhatsAppDigits,
};
