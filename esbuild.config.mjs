// Reproducible build for the Freebuff VS Code extension.
// Produces:
//   dist/extension.js        (extension host, CJS, vscode external)
//   dist/webview/main.js     (webview client, IIFE, browser)
//   dist/webview/styles.css  (copied verbatim)
//
// Run via `npm run build` or `npm run watch`.

import { build, context } from 'esbuild';
import { copyFileSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

/** @type {import('esbuild').BuildOptions} */
const extensionOptions = {
  entryPoints: [resolve(here, 'src/extension.ts')],
  outfile: resolve(here, 'dist/extension.js'),
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  minify: isProd,
  external: ['vscode'],
  define: {
    'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
  },
  logLevel: 'info',
  treeShaking: true,
};

/** @type {import('esbuild').BuildOptions} */
const webviewOptions = {
  entryPoints: [resolve(here, 'src/ui/webview/main.ts')],
  outfile: resolve(here, 'dist/webview/main.js'),
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  sourcemap: true,
  minify: isProd,
  define: {
    'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
  },
  logLevel: 'info',
  treeShaking: true,
};

function copyStyles() {
  mkdirSync(resolve(here, 'dist/webview'), { recursive: true });
  copyFileSync(resolve(here, 'src/ui/webview/styles.css'), resolve(here, 'dist/webview/styles.css'));
}

const watchMode = process.argv.includes('--watch');

if (watchMode) {
  const ctxExt = await context(extensionOptions);
  const ctxWeb = await context(webviewOptions);
  await ctxExt.watch();
  await ctxWeb.watch();
  console.log('[esbuild] watching… (extension + webview)');
} else {
  await build(extensionOptions);
  await build(webviewOptions);
  copyStyles();
}

try {
  const pkg = JSON.parse(readFileSync(resolve(here, 'package.json'), 'utf8'));
  console.log(
    `[esbuild] Freebuff v${pkg.version}: dist/extension.js + dist/webview/main.js (${isProd ? 'production' : 'development'})`,
  );
} catch {
  // best-effort metadata only
}
