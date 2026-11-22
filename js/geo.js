// Geographic helpers.

const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle (straight-line) distance in meters between {lat, lon} points. */
export function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

/** km/h -> meters per minute */
export const kmhToMpm = (kmh) => (kmh * 1000) / 60;

/** Pretty number: 1 decimal for small values, integer otherwise. */
export const fmt = (x) => (x < 10 ? x.toFixed(1) : Math.round(x).toString());
