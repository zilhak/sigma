import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { VERSION } from '@sigma/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

async function build() {
  // Ensure dist directory exists
  mkdirSync(join(__dirname, 'dist'), { recursive: true });

  // Copy manifest.json
  cpSync(join(__dirname, 'src/manifest.json'), join(__dirname, 'dist/manifest.json'));

  // Build code.ts (main plugin code - runs in Figma sandbox)
  const codeConfig: esbuild.BuildOptions = {
    entryPoints: [join(__dirname, 'src/code.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2017',
    outfile: join(__dirname, 'dist/code.js'),
    sourcemap: false,
  };

  // Build ui.ts (UI code - runs in iframe)
  const uiConfig: esbuild.BuildOptions = {
    entryPoints: [join(__dirname, 'src/ui.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2017',
    outfile: join(__dirname, 'dist/ui.js'),
    sourcemap: false,
  };

  if (isWatch) {
    console.log('Watching for changes...');

    const codeCtx = await esbuild.context(codeConfig);
    const uiCtx = await esbuild.context(uiConfig);

    await codeCtx.watch();
    await uiCtx.watch();

    // Initial build of HTML
    buildHTML();
  } else {
    await esbuild.build(codeConfig);
    await esbuild.build(uiConfig);
    buildHTML();
    console.log('Build complete!');
  }
}

function buildHTML() {
  // Read the built UI JS
  const uiJs = readFileSync(join(__dirname, 'dist/ui.js'), 'utf-8');

  // Read the HTML template
  let html = readFileSync(join(__dirname, 'src/ui.html'), 'utf-8');

  // Inject version into HTML
  html = html.replace(/>v0\.0\.1<\/span>/g, `>${VERSION}</span>`);

  // Inline the JS into the HTML
  html = html.replace(
    '<script src="ui.js"></script>',
    `<script>${uiJs}</script>`
  );

  writeFileSync(join(__dirname, 'dist/ui.html'), html);
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
