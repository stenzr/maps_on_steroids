import type { LatLng } from '../types';

export interface NavStop {
  location: LatLng;
  placeId?: string | null;
  label?: string;
}

const ll = (p: LatLng): string => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;

/**
 * Google Maps directions URL (Maps URLs, api=1) that starts turn-by-turn navigation.
 * Waypoints are sent as coordinates plus `waypoint_place_ids`, so Google snaps them to the
 * right place. Android's `google.navigation:` intent can't carry waypoints, so it isn't used.
 */
export function googleMapsNavigationUrl(args: { origin?: LatLng | null; destination: NavStop; waypoints?: readonly NavStop[] }): string {
  // Built by hand: React Native's URLSearchParams is only partially implemented.
  const q: [string, string][] = [
    ['api', '1'],
    ['travelmode', 'driving'],
    ['dir_action', 'navigate'],
  ];
  if (args.origin) q.push(['origin', ll(args.origin)]);
  q.push(['destination', ll(args.destination.location)]);
  if (args.destination.placeId) q.push(['destination_place_id', args.destination.placeId]);
  const wps = args.waypoints ?? [];
  if (wps.length > 0) {
    q.push(['waypoints', wps.map((w) => ll(w.location)).join('|')]);
    if (wps.every((w) => w.placeId)) q.push(['waypoint_place_ids', wps.map((w) => w.placeId).join('|')]);
  }
  return `https://www.google.com/maps/dir/?${q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}
