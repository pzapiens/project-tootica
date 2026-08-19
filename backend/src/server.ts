import { createApp } from './app';
import { env } from './config/env';

// Local / container entry point. On Lambda the same app is wrapped by lambda.ts.
const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`🦷 Tootica backend listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

// Graceful shutdown.
const shutdown = (signal: string): void => {
  console.log(`\n${signal} received, shutting down...`);
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
