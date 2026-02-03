import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

const commonConfig: esbuild.BuildOptions = {
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  sourcemap: true,
};

async function build() {
  // Ensure dist directory exists
  mkdirSync(join(__dirname, 'dist'), { recursive: true });

  // Copy static files
  cpSync(join(__dirname, 'src/manifest.json'), join(__dirname, 'dist/manifest.json'));
  cpSync(join(__dirname, 'src/popup/popup.html'), join(__dirname, 'dist/popup.html'));
  cpSync(join(__dirname, 'src/popup/popup.css'), join(__dirname, 'dist/popup.css'));
  cpSync(join(__dirname, 'src/icons'), join(__dirname, 'dist/icons'), { recursive: true });

  // Build configurations
  const configs: esbuild.BuildOptions[] = [
    {
      ...commonConfig,
      entryPoints: [join(__dirname, 'src/background.ts')],
      outfile: join(__dirname, 'dist/background.js'),
    },
    {
      ...commonConfig,
      entryPoints: [join(__dirname, 'src/content.ts')],
      outfile: join(__dirname, 'dist/content.js'),
    },
    {
      ...commonConfig,
      entryPoints: [join(__dirname, 'src/popup/popup.ts')],
      outfile: join(__dirname, 'dist/popup.js'),
    },
  ];

  if (isWatch) {
    console.log('Watching for changes...');
    for (const config of configs) {
      const ctx = await esbuild.context(config);
      await ctx.watch();
    }
  } else {
    for (const config of configs) {
      await esbuild.build(config);
    }
    console.log('Build complete!');
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
