import 'dotenv/config';
import { loadConfig } from './config';
import { buildServer } from './server';

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.googleApiKey) console.warn('GOOGLE_MAPS_API_KEY is empty — Google-backed endpoints will fail.');
  const app = await buildServer(config, { logger: true });
  await app.listen({ host: '0.0.0.0', port: config.port });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
