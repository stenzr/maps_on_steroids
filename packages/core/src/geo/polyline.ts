import type { LatLng } from '../types';

/**
 * Google Encoded Polyline Algorithm Format (precision 1e5), as returned by the
 * Routes API `polyline.encodedPolyline` and accepted by Places search-along-route.
 */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const nextValue = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) throw new Error('Malformed polyline');
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += nextValue();
    lng += nextValue();
    points.push({ latitude: lat / factor, longitude: lng / factor });
  }
  return points;
}

export function encodePolyline(points: readonly LatLng[], precision = 5): string {
  const factor = 10 ** precision;
  let prevLat = 0;
  let prevLng = 0;
  let out = '';

  const encodeValue = (value: number): void => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
  };

  for (const p of points) {
    const lat = Math.round(p.latitude * factor);
    const lng = Math.round(p.longitude * factor);
    encodeValue(lat - prevLat);
    encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}
