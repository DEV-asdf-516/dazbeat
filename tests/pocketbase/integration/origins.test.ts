import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTempDir, removeTempDir, startPocketBase } from './pocketBaseServer.js';
import type { PocketBaseServer } from './pocketBaseServer.js';
import { excludeLoopbackFromRateLimits } from './testData.js';

const ALLOWED_ORIGIN = 'http://localhost:5173';
const OTHER_ALLOWED_ORIGIN = 'https://dazbeat.example';
const DISALLOWED_ORIGIN = 'https://evil.example';
// Surrounding spaces and empty entries are ignored.
const ALLOWED_ORIGINS_ENV = ` ${ALLOWED_ORIGIN} ,, ${OTHER_ALLOWED_ORIGIN},`;
// PocketBase keeps its default `--origins=*`, so an allowed origin gets a wildcard allow header.
const PUBLIC_PATH = '/api/collections/songs/records';

interface OriginServer {
  dataDir: string;
  server: PocketBaseServer;
}

async function startOriginServer(prefix: string, allowedOrigins: string): Promise<OriginServer> {
  const dataDir = await createTempDir(prefix);
  const server = await startPocketBase({
    dataDir,
    env: { DAZBEAT_ALLOWED_ORIGINS: allowedOrigins },
  });
  await excludeLoopbackFromRateLimits(server.superuser);
  return {
    dataDir,
    server,
  };
}

async function stopOriginServer(instance: OriginServer | undefined): Promise<void> {
  if (instance === undefined) {
    return;
  }
  await instance.server.stop();
  await removeTempDir(instance.dataDir);
}

function get(server: PocketBaseServer, origin?: string): Promise<Response> {
  return fetch(`${server.url}${PUBLIC_PATH}`, {
    headers: origin === undefined ? {} : { Origin: origin },
  });
}

function preflight(server: PocketBaseServer, origin: string): Promise<Response> {
  return fetch(`${server.url}${PUBLIC_PATH}`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
    },
  });
}

async function expectRejected(response: Response): Promise<void> {
  expect(response.status).toBe(403);
  expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  expect(await response.json()).toMatchObject({
    status: 403,
    code: 'origin_not_allowed',
  });
}

describe('with DAZBEAT_ALLOWED_ORIGINS set', () => {
  let instance: OriginServer;

  beforeAll(async () => {
    instance = await startOriginServer('origins', ALLOWED_ORIGINS_ENV);
  });

  afterAll(async () => {
    await stopOriginServer(instance);
  });

  it('answers the preflight of an allowed origin with CORS headers', async () => {
    for (const origin of [ALLOWED_ORIGIN, OTHER_ALLOWED_ORIGIN]) {
      const response = await preflight(instance.server, origin);
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).not.toBeNull();
    }
  });

  it('serves a request from an allowed origin with CORS headers', async () => {
    const response = await get(instance.server, ALLOWED_ORIGIN);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).not.toBeNull();
  });

  it('rejects the preflight of a disallowed origin', async () => {
    await expectRejected(await preflight(instance.server, DISALLOWED_ORIGIN));
  });

  it('rejects requests from a disallowed origin, including "null" and near matches', async () => {
    for (const origin of [DISALLOWED_ORIGIN, 'null', `${ALLOWED_ORIGIN}/`, 'http://localhost']) {
      await expectRejected(await get(instance.server, origin));
    }
  });

  it('serves a request without an Origin header', async () => {
    const response = await get(instance.server);
    expect(response.status).toBe(200);
  });

  it('serves a same-host request such as the admin UI', async () => {
    const response = await get(instance.server, instance.server.url);
    expect(response.status).toBe(200);
  });
});

describe('without DAZBEAT_ALLOWED_ORIGINS', () => {
  let instance: OriginServer;

  beforeAll(async () => {
    instance = await startOriginServer('origins-unset', '');
  });

  afterAll(async () => {
    await stopOriginServer(instance);
  });

  it('rejects every cross-origin request', async () => {
    await expectRejected(await preflight(instance.server, ALLOWED_ORIGIN));
    await expectRejected(await get(instance.server, ALLOWED_ORIGIN));
  });

  it('still serves requests without an Origin header and from the same host', async () => {
    expect((await get(instance.server)).status).toBe(200);
    expect((await get(instance.server, instance.server.url)).status).toBe(200);
  });
});
