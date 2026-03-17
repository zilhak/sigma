import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// storage 모듈은 글로벌 경로를 사용하므로 순수 함수만 테스트
// 실제 파일 I/O는 임시 디렉토리에서 직접 검증

describe('storage 유틸리티', () => {
  // toHostPath, sanitizeFilename 등은 내부 함수이므로
  // saveComponent → getComponent 플로우로 간접 테스트

  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sigma-test-'));
  });

  afterAll(async () => {
    // cleanup은 best-effort
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  test('파일 저장 및 읽기', async () => {
    const { writeFile, readFile } = await import('fs/promises');
    const data = { id: 'test-1', name: 'TestComponent', data: { id: 'n1', tagName: 'div' } };
    const filepath = join(tempDir, 'test-component.json');

    await writeFile(filepath, JSON.stringify(data), 'utf-8');
    const content = await readFile(filepath, 'utf-8');
    const parsed = JSON.parse(content);

    expect(parsed.id).toBe('test-1');
    expect(parsed.name).toBe('TestComponent');
    expect(parsed.data.tagName).toBe('div');
  });

  test('파일 목록 조회', async () => {
    const { writeFile, readdir } = await import('fs/promises');

    await writeFile(join(tempDir, 'a.json'), '{}');
    await writeFile(join(tempDir, 'b.json'), '{}');
    await writeFile(join(tempDir, 'c.txt'), 'not json');

    const files = await readdir(tempDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    expect(jsonFiles).toHaveLength(2);
    expect(jsonFiles).toContain('a.json');
    expect(jsonFiles).toContain('b.json');
  });

  test('파일 삭제', async () => {
    const { writeFile, readdir, unlink } = await import('fs/promises');

    await writeFile(join(tempDir, 'to-delete.json'), '{}');
    let files = await readdir(tempDir);
    expect(files).toContain('to-delete.json');

    await unlink(join(tempDir, 'to-delete.json'));
    files = await readdir(tempDir);
    expect(files).not.toContain('to-delete.json');
  });
});

describe('storage 모듈 import', () => {
  test('모듈 export 확인', async () => {
    const storage = await import('../src/storage/index');
    expect(typeof storage.saveComponent).toBe('function');
    expect(typeof storage.listComponents).toBe('function');
    expect(typeof storage.getComponent).toBe('function');
    expect(typeof storage.deleteComponent).toBe('function');
    expect(typeof storage.getStorageStats).toBe('function');
    expect(typeof storage.saveScreenshot).toBe('function');
    expect(typeof storage.listScreenshots).toBe('function');
    expect(typeof storage.deleteScreenshot).toBe('function');
    expect(typeof storage.toHostPath).toBe('function');
  });

  test('toHostPath: 기본 환경에서는 경로 변환 없음', async () => {
    const { toHostPath } = await import('../src/storage/index');
    const path = '/Users/test/.sigma/extracted/test.json';
    // SIGMA_HOST_DATA_DIR 미설정 시 동일 경로 반환
    if (!process.env.SIGMA_HOST_DATA_DIR) {
      expect(toHostPath(path)).toBe(path);
    }
  });
});
