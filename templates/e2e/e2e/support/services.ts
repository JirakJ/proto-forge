import { test } from "@playwright/test";

// @adr 001 - tool-gated runtime: the suites need a RUNNING pair they do not own
//
// The workspace provides the services (its `pnpm ws:up`); these suites only
// point at them. Policy, in one place:
//   locally  — an unreachable service SKIPS the test with a note naming the fix
//   CI=1     — an unreachable service FAILS: the workspace CI brought the pair
//              up (or promised to), so absence there is a broken pipeline,
//              never a shrug
// The same policy covers the contract file: pre-workspace it is legitimately
// absent locally, and never legitimately absent in CI.

export const webUrl = (): string => process.env.E2E_WEB_URL ?? "http://localhost:4173";
export const apiUrl = (): string => process.env.E2E_API_URL ?? "http://localhost:3000";

async function reachable(url: string): Promise<boolean> {
  try {
    // Any HTTP response counts — a 404 still proves something is listening.
    await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return true;
  } catch {
    return false;
  }
}

/** Call from beforeEach: skips locally, throws under CI, passes when the service answers. */
export async function ensureService(url: string, name: string): Promise<void> {
  if (await reachable(url)) return;
  const fix = `start the pair from the workspace repo: pnpm ws:up --exec (or export E2E_WEB_URL / E2E_API_URL)`;
  if (process.env.CI) {
    throw new Error(`${name} at ${url} is unreachable — CI runs expect the pair; ${fix}`);
  }
  test.skip(true, `${name} at ${url} is unreachable — ${fix}`);
}

/** The contract-file half of the same policy. */
export function ensureContract<T>(load: () => T, path: string): T | undefined {
  try {
    return load();
  } catch (error) {
    if (process.env.CI) {
      throw new Error(`the contract at ${path} is unreadable — CI runs expect the pair's artifact: ${String(error)}`);
    }
    test.skip(true, `the contract at ${path} is unreachable — pre-workspace state; the workspace pair provides it`);
    return undefined;
  }
}
