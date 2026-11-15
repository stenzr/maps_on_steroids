import { z } from 'zod';

const EnvSchema = z.object({
  GOOGLE_MAPS_API_KEY: z.string().default(''),
  PROXY_SHARED_SECRET: z.string().min(16, 'PROXY_SHARED_SECRET must be at least 16 characters (use: openssl rand -hex 32)'),
  PORT: z.coerce.number().int().positive().default(8787),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
});

export interface ProxyConfig {
  googleApiKey: string;
  sharedSecret: string;
  port: number;
  rateLimitPerMinute: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ProxyConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid proxy configuration:\n${issues}\nSee apps/proxy/.env.example`);
  }
  const e = parsed.data;
  return {
    googleApiKey: e.GOOGLE_MAPS_API_KEY,
    sharedSecret: e.PROXY_SHARED_SECRET,
    port: e.PORT,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
  };
}
