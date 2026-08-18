// `CliDiscovery.ts` — passive discovery of the Freebuff CLI.
// Used by tests and the status command. **Never** spawns the binary.

// We deliberately do not import `child_process` here. Discovery is
// exposed as a small pure function that takes the platform-supplied
// PATH-like input (so the unit tests are deterministic).

export interface DiscoveryResult {
  readonly found: boolean;
  readonly path?: string;
  readonly resolution: 'which-fallback' | 'binary-name';
}

/**
 * Returns the candidate paths under which the Freebuff CLI might
 * exist on the current platform. Order matters: first match wins.
 */
export function candidatePaths(platform: NodeJS.Platform = process.platform): string[] {
  const exe = platform === 'win32' ? 'freebuff.cmd' : 'freebuff';
  return [exe, `/usr/local/bin/${exe}`, `/opt/homebrew/bin/${exe}`];
}

/**
 * Tests provide their own PATH mock via `available`. We do not
 * attempt to invoke the binary.
 */
export function discoverCli(available: ReadonlyArray<string>): DiscoveryResult {
  for (const candidate of candidatePaths()) {
    if (available.includes(candidate)) {
      return { found: true, path: candidate, resolution: 'which-fallback' };
    }
  }
  // Fall back to bare binary name (resolved by the OS at exec time).
  return { found: false, resolution: 'binary-name' };
}
