import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DOCKERFILE_PATH = join(REPO_ROOT, 'pocketbase/Dockerfile');
const CACHE_ROOT = join(REPO_ROOT, 'node_modules/.cache/pocketbase');
const RELEASE_BASE_URL = 'https://github.com/pocketbase/pocketbase/releases/download';

const OS_NAMES: Partial<Record<NodeJS.Platform, string>> = {
  darwin: 'darwin',
  linux: 'linux',
};
const ARCH_NAMES: Partial<Record<NodeJS.Architecture, string>> = {
  arm64: 'arm64',
  x64: 'amd64',
};

// The Dockerfile is the single place that pins the PocketBase version.
async function readPocketBaseVersion(): Promise<string> {
  const dockerfile = await readFile(DOCKERFILE_PATH, 'utf8');
  const match = /^ARG PB_VERSION=(\S+)$/m.exec(dockerfile);
  if (match?.[1] === undefined) {
    throw new Error(`ARG PB_VERSION not found in ${DOCKERFILE_PATH}`);
  }
  return match[1];
}

function getReleaseAssetName(version: string): string {
  const os = OS_NAMES[process.platform];
  const arch = ARCH_NAMES[process.arch];
  if (os === undefined || arch === undefined) {
    throw new Error(`No PocketBase release for ${process.platform}/${process.arch}`);
  }
  return `pocketbase_${version}_${os}_${arch}.zip`;
}

export async function getPocketBaseBinaryPath(): Promise<string> {
  return join(CACHE_ROOT, await readPocketBaseVersion(), 'pocketbase');
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function findChecksum(checksums: string, assetName: string): string {
  const line = checksums.split('\n').find((entry) => entry.trim().endsWith(` ${assetName}`));
  const checksum = line?.trim().split(/\s+/)[0];
  if (checksum === undefined) {
    throw new Error(`checksums.txt has no entry for ${assetName}`);
  }
  return checksum;
}

export async function ensurePocketBaseBinary(): Promise<string> {
  const binaryPath = await getPocketBaseBinaryPath();
  if (existsSync(binaryPath)) {
    return binaryPath;
  }

  const version = await readPocketBaseVersion();
  const assetName = getReleaseAssetName(version);
  const releaseUrl = `${RELEASE_BASE_URL}/v${version}`;
  const [zip, checksums] = await Promise.all([
    download(`${releaseUrl}/${assetName}`),
    download(`${releaseUrl}/checksums.txt`),
  ]);
  const actual = createHash('sha256').update(zip).digest('hex');
  const expected = findChecksum(checksums.toString('utf8'), assetName);
  if (actual !== expected) {
    throw new Error(`${assetName} SHA-256 mismatch: expected ${expected}, got ${actual}`);
  }

  await mkdir(CACHE_ROOT, { recursive: true });
  const workDir = await mkdtemp(join(CACHE_ROOT, 'download-'));
  try {
    const zipPath = join(workDir, assetName);
    await writeFile(zipPath, zip);
    await execFileAsync('unzip', ['-o', zipPath, 'pocketbase', '-d', workDir]);
    await mkdir(join(CACHE_ROOT, version), { recursive: true });
    await rename(join(workDir, 'pocketbase'), binaryPath);
  } finally {
    await rm(workDir, {
      recursive: true,
      force: true,
    });
  }
  return binaryPath;
}
