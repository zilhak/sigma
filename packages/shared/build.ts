/**
 * Sigma Shared - Build Script
 *
 * extractor-standalone-entry.ts → dist/extractor.standalone.js (IIFE)
 * diff-standalone-entry.ts → dist/diff.standalone.js (IIFE)
 * storybook-standalone-entry.ts → dist/storybook.standalone.js (IIFE)
 */
import * as esbuild from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const commonOptions: esbuild.BuildOptions = {
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  minify: false,
  sourcemap: false,
  logLevel: 'info',
};

async function build() {
  // 1. Extractor Standalone
  const extractorOut = resolve(__dirname, 'dist/extractor.standalone.js');
  await esbuild.build({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'src/extractor-standalone-entry.ts')],
    outfile: extractorOut,
  });
  console.log(`✅ Built: ${extractorOut}`);

  // 2. Diff Standalone
  const diffOut = resolve(__dirname, 'dist/diff.standalone.js');
  await esbuild.build({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'src/diff-standalone-entry.ts')],
    outfile: diffOut,
  });
  console.log(`✅ Built: ${diffOut}`);

  // 3. Storybook Standalone
  const storybookOut = resolve(__dirname, 'dist/storybook.standalone.js');
  await esbuild.build({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'src/storybook-standalone-entry.ts')],
    outfile: storybookOut,
  });
  console.log(`✅ Built: ${storybookOut}`);

  // 4. CDP Enhancer Module (ESM — Playwright/Node.js에서 import하여 사용)
  const enhancerOut = resolve(__dirname, 'dist/enhancer.js');
  await esbuild.build({
    ...commonOptions,
    format: 'esm',
    entryPoints: [resolve(__dirname, 'src/enhancer/index.ts')],
    outfile: enhancerOut,
  });
  console.log(`✅ Built: ${enhancerOut}`);
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
