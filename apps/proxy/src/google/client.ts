export type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
  }
}

/**
 * POST to a Google Maps Platform REST endpoint with an API key and a field mask.
 * Field masks are mandatory for Routes/Places (New) and are what we're billed on, so every
 * caller passes the smallest mask it needs.
 */
export async function googlePost<T>(
  fetchFn: FetchFn,
  apiKey: string,
  url: string,
  fieldMask: string,
  body: unknown,
  timeoutMs = 10_000,
): Promise<T> {
  if (!apiKey) throw new UpstreamError('Server is missing GOOGLE_MAPS_API_KEY', 503, 'NOT_CONFIGURED');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': fieldMask },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string } };
    if (!res.ok) {
      const msg = json.error?.message ?? `Google returned HTTP ${res.status}`;
      if (res.status === 429) throw new UpstreamError('Google quota exceeded, try again shortly', 503, 'UPSTREAM_QUOTA');
      if (res.status === 400) throw new UpstreamError(msg, 400, 'UPSTREAM_BAD_REQUEST');
      if (res.status === 403) throw new UpstreamError('Google rejected the server API key (check APIs enabled and restrictions)', 502, 'UPSTREAM_AUTH');
      throw new UpstreamError(msg, 502, 'UPSTREAM_ERROR');
    }
    return json as T;
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    if (e instanceof Error && e.name === 'AbortError') throw new UpstreamError('Google took too long to respond', 504, 'UPSTREAM_TIMEOUT');
    throw new UpstreamError('Could not reach Google', 502, 'UPSTREAM_UNREACHABLE');
  } finally {
    clearTimeout(timer);
  }
}

/** Google duration strings look like "1234s" or "12.5s". */
export function parseDurationS(d: string | undefined | null): number {
  if (!d) return 0;
  const n = parseFloat(d.replace(/s$/, ''));
  return Number.isFinite(n) ? n : 0;
}
