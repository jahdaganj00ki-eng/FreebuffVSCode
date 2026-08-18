// Phase 1 unit tests.
// We intentionally do not load `vscode` here — all tested modules
// are pure and platform-independent.

import { describe, it, expect } from 'vitest';

import { discoverCli, candidatePaths } from '../../src/freebuff/CliDiscovery';
import {
  EXTENSION_VERSION,
  EXTENSION_NAME,
  CLI_PACKAGE_NAME,
  CLI_MIN_NODE_MAJOR,
  CLI_RECOMMENDED_INSTALL,
} from '../../src/version';
import { RELEASE_NOTES } from '../../src/diagnostics/ReleaseNotes';

describe('CliDiscovery (pure)', () => {
  it('lists three known candidate paths', () => {
    const candidates = candidatePaths();
    expect(candidates.length).toBeGreaterThanOrEqual(3);
    // On win32, freebuff.cmd is preferred; on linux/darwin, freebuff.
    if (process.platform === 'win32') {
      expect(candidates[0]).toBe('freebuff.cmd');
    } else {
      expect(candidates[0]).toBe('freebuff');
    }
  });

  it('returns found + path when a candidate is present', () => {
    const result = discoverCli(['/usr/local/bin/freebuff']);
    expect(result.found).toBe(true);
    expect(result.path).toBe('/usr/local/bin/freebuff');
    expect(result.resolution).toBe('which-fallback');
  });

  it('returns not-found when no candidate matches', () => {
    const result = discoverCli(['/nope/bin/freebuff']);
    expect(result.found).toBe(false);
    expect(result.resolution).toBe('binary-name');
  });
});

describe('Version constants', () => {
  it('declares the expected extension metadata', () => {
    expect(EXTENSION_NAME).toBe('Freebuff');
    expect(EXTENSION_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('targets the Freebuff CLI as the primary integration', () => {
    expect(CLI_PACKAGE_NAME).toBe('freebuff');
    expect(CLI_MIN_NODE_MAJOR).toBe(18);
    expect(CLI_RECOMMENDED_INSTALL).toMatch(/^npm install -g freebuff$/);
  });
});

describe('Release notes', () => {
  it('is non-empty and never begins with `Secret` or `Token`', () => {
    expect(RELEASE_NOTES.length).toBeGreaterThan(0);
    for (const line of RELEASE_NOTES) {
      expect(line).not.toMatch(/\bsecret\b/i);
      expect(line).not.toMatch(/\btoken\b/i);
      expect(line).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
    }
  });
});
