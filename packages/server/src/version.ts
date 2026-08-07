import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * 서버 버전의 단일 출처 = packages/server/package.json 의 version.
 *
 * 루트 CLAUDE.md 의 버전 규칙이 커밋마다 올리는 그 값이 그대로
 * 시작 배너·GET /api/version·MCP serverInfo 에 나타나게 한다.
 * 어디서도 버전 문자열을 손으로 적지 않는다 — 예전에는 세 곳이 각자 하드코딩돼
 * 'v1.0'(shared 상수) / 'v0.1.0'(배너) / '0.1.0'(MCP) 로 전부 달랐다.
 *
 * `v` 접두사는 붙이지 않는다. package.json 의 version 은 패키지 매니저가 파싱하므로
 * 숫자만 두고, 표시할 때만 표시하는 쪽에서 붙인다.
 */
export const SERVER_VERSION: string = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8')
).version;
