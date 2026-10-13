import { spawn, execFile } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import PocketBase from 'pocketbase';
import { REPO_ROOT, getPocketBaseBinaryPath } from './pocketBaseBinary.js';

const execFileAsync = promisify(execFile);

export const REPO_MIGRATIONS_DIR = join(REPO_ROOT, 'pocketbase/pb_migrations');
export const REPO_HOOKS_DIR = join(REPO_ROOT, 'pocketbase/pb_hooks');

const SUPERUSER_EMAIL = 'superuser@example.com';
const SUPERUSER_PASSWORD = 'superuser-password';
const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_INTERVAL_MS = 100;

export interface PocketBaseServerOptions {
  dataDir: string;
  migrationsDir?: string;
  hooksDir?: string;
  env?: Record<string, string>;
}

export interface PocketBaseServer {
  url: string;
  /** SDK client authenticated as a superuser. */
  superuser: PocketBase;
  /** Stops the process and keeps dataDir, so a later server can start on the same data. */
  stop(): Promise<void>;
}

export function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `dazbeat-${prefix}-`));
}

export function removeTempDir(dir: string): Promise<void> {
  return rm(dir, { recursive: true, force: true });
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Could not read the free port address'));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => child.once('exit', () => resolve()));
}

async function waitForHealth(
  url: string,
  child: ChildProcess,
  output: () => string,
): Promise<void> {
  const deadlineMs = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadlineMs) {
    if (child.exitCode !== null) {
      throw new Error(`PocketBase exited with ${child.exitCode}:\n${output()}`);
    }
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // The server is not listening yet; anything other than a connection failure is a real error.
      if (!(error instanceof TypeError)) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS));
  }
  throw new Error(`PocketBase did not become healthy in ${HEALTH_TIMEOUT_MS}ms:\n${output()}`);
}

export function createClient(url: string): PocketBase {
  const pb = new PocketBase(url);
  // Tests send identical requests concurrently; the SDK would otherwise cancel all but the last.
  pb.autoCancellation(false);
  return pb;
}

export async function startPocketBase(options: PocketBaseServerOptions): Promise<PocketBaseServer> {
  const {
    dataDir,
    migrationsDir = REPO_MIGRATIONS_DIR,
    hooksDir = REPO_HOOKS_DIR,
    env = {},
  } = options;
  const binaryPath = await getPocketBaseBinaryPath();
  // Without a superuser, `serve` opens the installer page in the default browser, so create it first.
  await execFileAsync(binaryPath, [
    'superuser',
    'upsert',
    SUPERUSER_EMAIL,
    SUPERUSER_PASSWORD,
    `--dir=${dataDir}`,
    `--migrationsDir=${migrationsDir}`,
  ]);
  const port = await findFreePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(
    binaryPath,
    [
      'serve',
      `--http=127.0.0.1:${port}`,
      `--dir=${dataDir}`,
      `--migrationsDir=${migrationsDir}`,
      `--hooksDir=${hooksDir}`,
      '--hooksWatch=false',
    ],
    { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const stop = async (): Promise<void> => {
    child.kill('SIGTERM');
    await waitForExit(child);
  };

  try {
    await waitForHealth(url, child, () => output);
    const superuser = createClient(url);
    await superuser.collection('_superusers').authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD);
    return { url, superuser, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
