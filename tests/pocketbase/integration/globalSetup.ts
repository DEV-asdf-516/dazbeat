import { ensurePocketBaseBinary } from './pocketBaseBinary.js';

// Runs once before all test files so parallel files never write the binary cache at the same time.
export async function setup(): Promise<void> {
  await ensurePocketBaseBinary();
}
