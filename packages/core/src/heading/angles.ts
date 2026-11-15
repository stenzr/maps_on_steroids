/** Wrap any angle into [0, 360). */
export function normalizeDegrees(deg: number): number {
  const r = deg % 360;
  const n = r < 0 ? r + 360 : r;
  // -0 and floating-point 360 both collapse to 0
  return n >= 360 || Object.is(n, -0) ? 0 : n;
}

/** Signed shortest rotation from `from` to `to`, in (-180, 180]. */
export function angleDelta(from: number, to: number): number {
  const d = normalizeDegrees(to - from);
  return d > 180 ? d - 360 : d;
}

/** Valid course/heading: finite and non-negative (platforms use -1 or null for "unknown"). */
export function isValidAngle(deg: number | null | undefined): deg is number {
  return typeof deg === 'number' && Number.isFinite(deg) && deg >= 0;
}

/**
 * Weighted circular mean of angles, computed on unit vectors so 350° and 10° average to 0°,
 * not 180°. Returns null if the vectors cancel out.
 */
export function circularWeightedMean(items: readonly { deg: number; weight: number }[]): number | null {
  let x = 0;
  let y = 0;
  for (const { deg, weight } of items) {
    const r = (deg * Math.PI) / 180;
    x += Math.cos(r) * weight;
    y += Math.sin(r) * weight;
  }
  if (Math.hypot(x, y) < 1e-9) return null;
  return normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI);
}

/**
 * Exponential smoothing for angles. Smooths the sine and cosine components, not raw
 * degrees, so 359° → 1° moves 2° through north instead of 358° the long way round.
 */
export interface AngleFilterState {
  /** Smoothed cos/sin components; null until the first sample arrives. */
  cos: number | null;
  sin: number | null;
}

export const emptyAngleFilter = (): AngleFilterState => ({ cos: null, sin: null });

/**
 * @param alpha weight of the new sample, 0 < alpha ≤ 1 (1 = no smoothing).
 */
export function smoothAngle(
  state: AngleFilterState,
  deg: number,
  alpha: number,
): { state: AngleFilterState; value: number } {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  if (state.cos === null || state.sin === null) {
    return { state: { cos: c, sin: s }, value: normalizeDegrees(deg) };
  }
  let nc = state.cos + alpha * (c - state.cos);
  let ns = state.sin + alpha * (s - state.sin);
  // Exactly opposite samples can cancel to ~0; fall back to the new sample.
  if (Math.hypot(nc, ns) < 1e-9) {
    nc = c;
    ns = s;
  }
  return { state: { cos: nc, sin: ns }, value: normalizeDegrees((Math.atan2(ns, nc) * 180) / Math.PI) };
}
