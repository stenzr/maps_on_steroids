import type { LatLng } from '../../types';

/**
 * Approximate Pune (Shivajinagar) → Nashik waypoints along NH60
 * (Bhosari, Chakan, Rajgurunagar, Manchar, Narayangaon, Alephata, Sangamner, Sinnar).
 * Hand-placed and only roughly on the road (long segments are straight lines), about 210 km.
 * Used by test mode until the proxy can supply the real Routes API polyline.
 */
export const PUNE_NASHIK_WAYPOINTS: readonly LatLng[] = [
  { latitude: 18.5308, longitude: 73.8475 }, // Shivajinagar, Pune
  { latitude: 18.5402, longitude: 73.8497 }, // Wakdewadi
  { latitude: 18.5636, longitude: 73.8436 }, // Khadki
  { latitude: 18.5985, longitude: 73.8248 }, // Kasarwadi
  { latitude: 18.6158, longitude: 73.8200 }, // Nashik Phata
  { latitude: 18.6281, longitude: 73.8462 }, // Bhosari
  { latitude: 18.6725, longitude: 73.8530 }, // Moshi
  { latitude: 18.7601, longitude: 73.8622 }, // Chakan
  { latitude: 18.8530, longitude: 73.8842 }, // Rajgurunagar (Khed)
  { latitude: 18.9408, longitude: 73.9165 }, // Peth
  { latitude: 19.0043, longitude: 73.9441 }, // Manchar
  { latitude: 19.1152, longitude: 73.9703 }, // Narayangaon
  { latitude: 19.1783, longitude: 74.1145 }, // Alephata
  { latitude: 19.3302, longitude: 74.1700 }, // Bota
  { latitude: 19.4520, longitude: 74.2050 }, // Karjule Pathar
  { latitude: 19.5700, longitude: 74.2100 }, // Sangamner
  { latitude: 19.7300, longitude: 74.0800 }, // Nandur Shingote
  { latitude: 19.8460, longitude: 74.0000 }, // Sinnar
  { latitude: 19.9230, longitude: 73.8930 }, // Shinde
  { latitude: 19.9500, longitude: 73.8400 }, // Nashik Road
  { latitude: 19.9990, longitude: 73.7900 }, // Nashik CBS
];

export const PUNE_LABEL = 'Pune';
export const NASHIK_LABEL = 'Nashik';
