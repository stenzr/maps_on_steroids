import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { SECRET_HEADER, secretMatches } from './auth';
import type { ProxyConfig } from './config';
import { UpstreamError, type FetchFn } from './google/client';
import { registerApiRoutes } from './routes/api';

export interface ApiError {
  error: { code: string; message: string };
}

const PUBLIC_PATHS = new Set(['/health']);

export async function buildServer(
  config: ProxyConfig,
  opts: { logger?: boolean; fetchFn?: FetchFn } = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? false,
    bodyLimit: 256 * 1024,
  });

  await app.register(rateLimit, {
    max: config.rateLimitPerMinute,
    timeWindow: '1 minute',
    // The plugin throws this object; setErrorHandler below turns it into our ApiError shape.
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: `Too many requests; retry in ${Math.ceil(ctx.ttl / 1000)} s`,
    }),
  });

  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0] ?? '';
    if (PUBLIC_PATHS.has(path)) return;
    const header = req.headers[SECRET_HEADER];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!secretMatches(provided, config.sharedSecret)) {
      await reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid app secret' } } satisfies ApiError);
    }
  });

  app.setErrorHandler((err: unknown, _req, reply) => {
    const e = (typeof err === 'object' && err !== null ? err : {}) as { statusCode?: unknown; code?: unknown; message?: unknown };
    const status = typeof e.statusCode === 'number' && e.statusCode >= 400 ? e.statusCode : 500;
    // Upstream (Google) errors carry a safe, user-facing message; other 5xx are hidden.
    const expose = status < 500 || err instanceof UpstreamError;
    if (status >= 500 && !(err instanceof UpstreamError)) app.log.error(err);
    const body: ApiError = {
      error: {
        code: typeof e.code === 'string' ? e.code : status >= 500 ? 'INTERNAL' : 'BAD_REQUEST',
        message: !expose ? 'Internal error' : typeof e.message === 'string' ? e.message : 'Bad request',
      },
    };
    return reply.code(status).send(body);
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } } satisfies ApiError),
  );

  app.get('/health', async () => ({
    ok: true,
    googleKeyConfigured: config.googleApiKey.length > 0,
  }));

  // Authenticated ping so the app can verify its PROXY_URL + secret in Settings.
  app.get('/v1/ping', async () => ({ ok: true }));

  registerApiRoutes(app, { fetchFn: opts.fetchFn ?? (globalThis.fetch as unknown as FetchFn), apiKey: config.googleApiKey });

  return app;
}
