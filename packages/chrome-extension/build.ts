import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

/**
 * popup 헤더와 manifest 에 박히는 버전의 단일 출처 = 이 패키지의 package.json.
 * src/manifest.json 의 version 은 빌드가 덮어쓰므로 자리표시자(0.0.0)로 둔다 —
 * 예전엔 거기 '0.1.0' 이 손으로 적혀 있어서 popup 표시('v1.0')와 서로 달랐다.
 */
const PKG_VERSION: string = JSON.parse(
  readFileSync(join(__dirname, 'package.json'), 'utf-8')
).version;

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
  cpSync(join(__dirname, 'src/popup/popup.css'), join(__dirname, 'dist/popup.css'));
  cpSync(join(__dirname, 'src/icons'), join(__dirname, 'dist/icons'), { recursive: true });

  // manifest 는 그냥 복사하지 않고 version 을 package.json 값으로 채워 쓴다.
  // src/manifest.json 의 version 은 자리표시자('0.0.0')다 — 거기서 손으로 고쳐도 반영되지 않는다.
  // (주석 키를 manifest 에 넣으면 Chrome 이 unrecognized key 경고를 내므로 설명은 여기 둔다.)
  const manifest = JSON.parse(readFileSync(join(__dirname, 'src/manifest.json'), 'utf-8'));
  manifest.version = PKG_VERSION;
  writeFileSync(join(__dirname, 'dist/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  // Process popup.html with version injection
  let popupHtml = readFileSync(join(__dirname, 'src/popup/popup.html'), 'utf-8');
  popupHtml = popupHtml.replace(/>__VERSION__<\/span>/g, `>v${PKG_VERSION}</span>`);
  writeFileSync(join(__dirname, 'dist/popup.html'), popupHtml);

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
    {
      ...commonConfig,
      format: 'iife', // 페이지 컨텍스트에서 실행되므로 IIFE
      entryPoints: [join(__dirname, 'src/injected.ts')],
      outfile: join(__dirname, 'dist/injected.js'),
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
