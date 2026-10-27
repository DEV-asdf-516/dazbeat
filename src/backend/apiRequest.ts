import type PocketBase from 'pocketbase';
import type { SendOptions } from 'pocketbase';
import type { z } from 'zod';

export async function sendApiRequest<T>(
  pb: PocketBase,
  path: string,
  options: SendOptions,
  schema: z.ZodType<T>,
  toError: (error: unknown) => unknown,
): Promise<T> {
  let response: unknown;
  try {
    response = await pb.send(path, options);
  } catch (error) {
    throw toError(error);
  }
  return schema.parse(response);
}
