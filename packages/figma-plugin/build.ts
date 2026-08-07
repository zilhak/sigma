import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

/**
 * UI 헤더에 박히는 버전의 단일 출처 = 이 패키지의 package.json.
 * 루트 CLAUDE.md 의 버전 규칙이 플러그인 축을 올리면 그 값이 그대로 보인다.
 * 예전엔 shared 의 공용 상수 하나(`'v1.0'`)를 서버·확장과 함께 썼는데,
 * 추적 축이 플러그인/서버로 갈라진 뒤로는 어느 쪽에도 맞지 않는 값이었다.
 */
const PKG_VERSION: string = JSON.parse(
  readFileSync(join(__dirname, 'package.json'), 'utf-8')
).version;

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
    assertSandboxBundleIsLowered();
    console.log('Build complete!');
  }
}

/**
 * Figma 샌드박스는 esbuild 가 lowering 하지 못한 문법을 실행하지 못한다.
 * 산출물을 직접 검사한다 — "소스에 쓰지 말 것"이라는 사람 규칙 대신
 * "산출물에 남지 않을 것"이라는 기계 검증으로 불변식을 지킨다.
 *
 * 왜 소스가 아니라 산출물인가: esbuild target(현재 es2017)이 `??` 를 실제로 삼항으로
 * 바꾼다(code.ts:405 → dist/code.js 의 `(_a = msg.data) != null ? _a : ""`). 즉 소스의 `??` 는
 * 문제가 아니고, **target 이나 esbuild 버전이 바뀌어 lowering 이 멈추는 것**이 문제다.
 * 그건 소스를 아무리 봐도 안 보이고 산출물에만 나타난다.
 *
 * 주의: 문자열/정규식 리터럴 안의 '??' 도 잡힐 수 있다. 실제로 걸리면
 * 그 리터럴을 보고 예외 처리할 것 — 검사를 지우지 말 것.
 */
function assertSandboxBundleIsLowered() {
  const codeJs = readFileSync(join(__dirname, 'dist/code.js'), 'utf-8');
  const banned: Array<[string, RegExp]> = [
    ['?? (nullish coalescing)', /\?\?[^=]/],
    ['??= (nullish assignment)', /\?\?=/],
  ];
  const found = banned.filter(([, re]) => re.test(codeJs)).map(([label]) => label);
  if (found.length > 0) {
    console.error(
      `[build] dist/code.js 에 변환되지 않은 문법이 남았습니다: ${found.join(', ')}\n` +
      `        esbuild target(현재 es2017)이 바뀌었거나 esbuild 버전이 달라졌을 수 있습니다.`
    );
    process.exit(1);
  }
}

function buildHTML() {
  // Read the built UI JS
  const uiJs = readFileSync(join(__dirname, 'dist/ui.js'), 'utf-8');

  // Read the HTML template
  let html = readFileSync(join(__dirname, 'src/ui.html'), 'utf-8');

  // Inject version into HTML
  html = html.replace(/>__VERSION__<\/span>/g, `>v${PKG_VERSION}</span>`);

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
