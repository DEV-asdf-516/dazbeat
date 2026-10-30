import { readFile } from 'node:fs/promises';
import PocketBase from 'pocketbase';
import { z } from 'zod';
import { toParseIssue } from '../../src/data/parseIssue.js';
import { parseJson } from '../../src/json.js';
import { SONGS } from '../../src/pbCollections.js';
import { select } from '../../src/pbQuery.js';
import { readLocalTarget } from './seed.js';
import { requireDefined } from '../../src/invariant.js';

const previewStarts = z.record(z.string(), z.looseObject({ previewStartMs: z.int().min(0) }));

async function patchPreviewStarts(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): Promise<void> {
  const filePath = requireDefined(
    args[0],
    'Usage: patchPreviewStarts.ts <preview-starts.json path>',
  );
  const { url, email, password } = readLocalTarget(env);
  const input = requireDefined(
    parseJson(await readFile(filePath, 'utf8')),
    'Invalid preview starts, not JSON',
    filePath,
  );
  const result = previewStarts.safeParse(input);
  if (!result.success) {
    const { path, reason } = toParseIssue(result.error, 'previewStarts');
    throw new Error(`Invalid preview starts: ${filePath}: ${path} ${reason}`);
  }

  const pb = new PocketBase(url);
  await pb.collection('_superusers').authWithPassword(email, password);
  const songs = await pb
    .collection(SONGS.name)
    .getFullList(select(SONGS, ['id', 'key', 'previewStartMs']));
  const missingKeys: string[] = [];
  for (const [key, { previewStartMs }] of Object.entries(result.data)) {
    const song = songs.find((record) => record['key'] === key);
    if (song === undefined) {
      missingKeys.push(key);
      continue;
    }
    if (song['previewStartMs'] !== previewStartMs) {
      await pb.collection(SONGS.name).update(song.id, { previewStartMs });
    }
  }
  if (missingKeys.length > 0) {
    console.warn(`No songs with these keys, skipped: ${missingKeys.join(', ')}`);
  }
}

if (import.meta.main) {
  patchPreviewStarts(process.argv.slice(2), process.env).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
