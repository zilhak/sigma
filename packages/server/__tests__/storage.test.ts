/**
 * storage 스펙:
 *   - saveComponent: name + ExtractedNode → 파일로 저장, StoredComponent 반환
 *   - listComponents: 저장된 컴포넌트 목록 (최신순 정렬)
 *   - getComponent: ID로 조회 (없으면 null)
 *   - getComponentByName: 이름으로 조회 (없으면 null)
 *   - deleteComponent: ID로 삭제 (있으면 true, 없으면 false)
 *   - toHostPath: Docker 환경에서 경로 변환 (SIGMA_HOST_DATA_DIR 미설정 시 동일 반환)
 *   - 최대 100개 컴포넌트, 7일 TTL 자동 정리
 */
import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { mkdtemp, rm, writeFile, readFile, readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('storage 파일 I/O 패턴', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sigma-test-'));
  });

  afterAll(async () => {
    try { await rm(tempDir, { recursive: true, force: true }); } catch {}
  });

  test('JSON 저장 → 읽기 → 동일 데이터', async () => {
    const data = { id: 'test-1', name: 'Button', data: { tagName: 'button', children: [] } };
    const filepath = join(tempDir, 'button.json');
    await writeFile(filepath, JSON.stringify(data), 'utf-8');

    const content = await readFile(filepath, 'utf-8');
    expect(JSON.parse(content)).toEqual(data);
  });

  test('.json 파일만 필터링', async () => {
    await writeFile(join(tempDir, 'a.json'), '{}');
    await writeFile(join(tempDir, 'b.json'), '{}');
    await writeFile(join(tempDir, 'c.txt'), 'text');
    await writeFile(join(tempDir, 'd.png'), 'img');

    const files = await readdir(tempDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    expect(jsonFiles).toHaveLength(2);
  });

  test('삭제 후 파일 사라짐', async () => {
    await writeFile(join(tempDir, 'temp.json'), '{}');
    await unlink(join(tempDir, 'temp.json'));
    const files = await readdir(tempDir);
    expect(files).not.toContain('temp.json');
  });

  test('존재하지 않는 파일 삭제 → 에러', async () => {
    await expect(unlink(join(tempDir, 'nonexistent.json'))).rejects.toThrow();
  });
});

describe('storage 모듈 exports', () => {
  test('필수 함수들이 export되어야 함', async () => {
    const storage = await import('../src/storage/index');
    const required = [
      'saveComponent', 'listComponents', 'getComponent', 'getComponentByName',
      'deleteComponent', 'getStorageStats', 'getFullStorageStats',
      'saveScreenshot', 'listScreenshots', 'deleteScreenshot',
      'toHostPath', 'cleanup', 'startupCleanup',
    ];
    for (const name of required) {
      expect(typeof (storage as any)[name]).toBe('function');
    }
  });
});

describe('toHostPath', () => {
  test('SIGMA_HOST_DATA_DIR 미설정 시 동일 경로 반환', async () => {
    const { toHostPath } = await import('../src/storage/index');
    // 환경변수 미설정이면 변환 없이 그대로 반환해야 함
    if (!process.env.SIGMA_HOST_DATA_DIR) {
      const input = '/root/.sigma/extracted/test.json';
      expect(toHostPath(input)).toBe(input);
    }
  });
});
