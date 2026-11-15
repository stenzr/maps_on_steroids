import { loadConfig, type ProxyConfig } from '../config';
import { buildServer } from '../server';
import { secretMatches } from '../auth';

const SECRET = 'test-secret-0123456789abcdef';
const config: ProxyConfig = { googleApiKey: 'k', sharedSecret: SECRET, port: 0, rateLimitPerMinute: 1000 };

describe('proxy server', () => {
  it('serves /health without auth', async () => {
    const app = await buildServer(config);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, googleKeyConfigured: true });
    await app.close();
  });

  it('rejects API calls without the shared secret', async () => {
    const app = await buildServer(config);
    const res = await app.inject({ method: 'GET', url: '/v1/ping' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
    const wrong = await app.inject({ method: 'GET', url: '/v1/ping', headers: { 'x-app-secret': 'nope' } });
    expect(wrong.statusCode).toBe(401);
    await app.close();
  });

  it('accepts API calls with the shared secret', async () => {
    const app = await buildServer(config);
    const res = await app.inject({ method: 'GET', url: '/v1/ping', headers: { 'x-app-secret': SECRET } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('rate limits per client', async () => {
    const app = await buildServer({ ...config, rateLimitPerMinute: 2 });
    const hit = () => app.inject({ method: 'GET', url: '/health' });
    await hit();
    await hit();
    const res = await hit();
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('RATE_LIMITED');
    await app.close();
  });

  it('returns JSON 404 for unknown endpoints', async () => {
    const app = await buildServer(config);
    const res = await app.inject({ method: 'GET', url: '/v1/nope', headers: { 'x-app-secret': SECRET } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('config', () => {
  it('requires a strong shared secret', () => {
    expect(() => loadConfig({ PROXY_SHARED_SECRET: 'short' })).toThrow(/at least 16/);
  });
  it('applies defaults', () => {
    const c = loadConfig({ PROXY_SHARED_SECRET: SECRET });
    expect(c.port).toBe(8787);
    expect(c.googleApiKey).toBe('');
  });
});

describe('secretMatches', () => {
  it('compares exactly', () => {
    expect(secretMatches(SECRET, SECRET)).toBe(true);
    expect(secretMatches(SECRET + 'x', SECRET)).toBe(false);
    expect(secretMatches(undefined, SECRET)).toBe(false);
  });
});
