/**
 * Sigma Shared - Build Script
 *
 * extractor-standalone-entry.ts → dist/extractor.standalone.js (IIFE)
 */
import * as esbuild from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function build() {
  const outfile = resolve(__dirname, 'dist/extractor.standalone.js');

  await esbuild.build({
    entryPoints: [resolve(__dirname, 'src/extractor-standalone-entry.ts')],
    outfile,
    bundle: true,
    format: 'iife',
    target: 'chrome120',
    minify: false, // 디버깅 용이하게 minify 안 함
    sourcemap: false,
    logLevel: 'info',
  });

  console.log(`✅ Built: ${outfile}`);
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
