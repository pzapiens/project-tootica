/**
 * One-command local backend setup. Run after `npm install`:
 *
 *   npm run setup
 *
 * It is idempotent and does the machine-reproducible parts:
 *   1. Create .env from .env.example (if missing) and generate JWT secrets.
 *   2. Start the Docker services (Postgres + MailHog).
 *   3. Wait for Postgres to be healthy.
 *   4. Apply migrations.
 *   5. Seed dev data.
 *
 * Prerequisites it can't do for you: install Node 20+, install Docker Desktop,
 * and have Docker running.
 */
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const step = (n, msg) => console.log(`\n[${n}/5] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

function tryRun(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// 1. .env + secrets ----------------------------------------------------------
step(1, 'Environment file');
if (existsSync('.env')) {
  console.log('  .env already exists — leaving it untouched.');
} else {
  copyFileSync('.env.example', '.env');
  let env = readFileSync('.env', 'utf8');
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'JWT_ACTION_SECRET']) {
    env = env.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${randomBytes(48).toString('hex')}`);
  }
  writeFileSync('.env', env);
  console.log('  Created .env from .env.example and generated JWT secrets.');
}

// 2. Docker services ---------------------------------------------------------
step(2, 'Starting Docker services (Postgres + MailHog)');
if (!tryRun('docker info')) {
  console.error('  ✗ Docker daemon not reachable. Start Docker Desktop and re-run `npm run setup`.');
  process.exit(1);
}
run('docker compose up -d');

// 3. Wait for Postgres -------------------------------------------------------
step(3, 'Waiting for Postgres to be healthy');
let healthy = false;
for (let i = 0; i < 30; i++) {
  let status = '';
  try {
    status = execSync('docker inspect --format "{{.State.Health.Status}}" tootica-postgres', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    status = 'starting';
  }
  if (status === 'healthy') {
    healthy = true;
    break;
  }
  process.stdout.write('.');
  await sleep(2000);
}
if (!healthy) {
  console.error('\n  ✗ Postgres did not become healthy in time. Check `docker compose logs postgres`.');
  process.exit(1);
}
console.log('\n  Postgres is healthy.');

// 4. Migrations --------------------------------------------------------------
step(4, 'Applying database migrations');
run('npx prisma migrate deploy');

// 5. Seed --------------------------------------------------------------------
step(5, 'Seeding dev data');
run('npm run db:seed');

console.log('\n✅ Backend ready. Start it with:  npm run dev');
