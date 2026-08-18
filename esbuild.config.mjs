// Reproducible ESM build for the Freebuff VS Code extension.
// Run via `npm run build` or `npm run watch`.

import { build, context } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('esbuild').BuildOptions} */
const baseOptions = {
  entryPoints: [resolve(here, 'src/extension.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
  // VS Code resolves `vscode` from its own module space at runtime.
  external: ['vscode'],
  // Defensive: never inline fs paths or secrets.
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
  },
  logLevel: 'info',
  metafile: false,
  treeShaking: true,
};

const watchMode = process.argv.includes('--watch');

if (watchMode) {
  const ctx = await context(baseOptions);
  await ctx.watch();
  console.log('[esbuild] watching…');
} else {
  await build(baseOptions);
}

try {
  const pkg = JSON.parse(readFileSync(resolve(here, 'package.json'), 'utf8'));
  console.log(
    `[esbuild] Freebuff v${pkg.version} bundled → dist/extension.js (target ${baseOptions.target})`,
  );
} catch {
  // pkg read is best-effort metadata only; we still emitted the bundle.
}
