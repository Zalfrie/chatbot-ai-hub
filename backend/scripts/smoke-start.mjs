// Boots the compiled server the way `npm start` does and waits for GET /health.
// Usage: npm run build && npm run smoke (needs the DB_* and REDIS_* env vars of a reachable Postgres and Redis)
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = process.env.PORT ?? '3000';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 30_000);
const PROBE_TIMEOUT_MS = 2_000;
const SHUTDOWN_GRACE_MS = 10_000;
const HEALTH_URL = `http://127.0.0.1:${PORT}/health`;

async function isHealthy() {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false; // not listening yet, or no answer in time
  }
}

// Another server on the port (e.g. `npm run dev`) would answer for a build that cannot start
if (await isHealthy()) {
  console.error(`Smoke test failed: ${HEALTH_URL} already answers before the build is started; free the port or set PORT`);
  process.exit(1);
}

const server = spawn(process.execPath, ['dist/index.js'], {
  env: { ...process.env, PORT },
  stdio: ['ignore', 'inherit', 'inherit'],
});

const hasExited = () => server.exitCode !== null || server.signalCode !== null;

async function waitForHealth(deadline) {
  while (Date.now() < deadline) {
    if (hasExited()) {
      throw new Error(`dist/index.js exited before it was healthy (code ${server.exitCode}, signal ${server.signalCode})`);
    }
    if (await isHealthy()) return;
    await sleep(500);
  }
  throw new Error(`no 2xx from ${HEALTH_URL} within ${TIMEOUT_MS} ms`);
}

async function stop() {
  if (hasExited()) return;
  const exited = once(server, 'exit');
  server.kill('SIGTERM');
  const outcome = await Promise.race([exited, sleep(SHUTDOWN_GRACE_MS, 'timeout', { ref: false })]);
  if (outcome === 'timeout') {
    console.error(`dist/index.js did not exit within ${SHUTDOWN_GRACE_MS} ms of SIGTERM, killing it`);
    server.kill('SIGKILL');
  }
}

try {
  await waitForHealth(Date.now() + TIMEOUT_MS);
  console.log(`Smoke test passed: ${HEALTH_URL} answered`);
} catch (err) {
  console.error(`Smoke test failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await stop();
}
