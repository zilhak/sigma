import { describe, it, expect } from 'bun:test';
import { formatPluginLossHint } from '../src/websocket/server';
import type { PluginDisconnectRecord } from '../src/websocket/server';

// 배경: docs/history/020-plugin-vm-aborted-after-a-long-lived-session.md
// 「연결되어 있지 않습니다」가 "아직 안 켰다"와 "죽었다"를 구분하지 못한 것이 이 안내의 이유다.

const NOW = 1_800_000_000_000;

function record(over: Partial<PluginDisconnectRecord> = {}): PluginDisconnectRecord {
  return {
    pluginId: 'figma-abc-1234',
    at: NOW - 5 * 60_000,
    code: 1001,
    livedSec: 10476,
    commands: 55123,
    bytesIn: 812 * 1024 * 1024,
    lastCommandType: 'GET_TREE',
    msSinceLastCommand: 16,
    ...over,
  };
}

describe('formatPluginLossHint', () => {
  it('기록이 없으면 재실행 안내만 준다 (죽었다고 단정하지 않는다)', () => {
    const hint = formatPluginLossHint(undefined, NOW);
    expect(hint).toContain('다시 실행');
    expect(hint).toContain('sigma_list_plugins');
    expect(hint).not.toContain('죽었을 수 있습니다');
  });

  it('close code 1001 이면 런타임 사망 가능성과 정황(수명·명령 수)을 함께 준다', () => {
    const hint = formatPluginLossHint(record(), NOW);
    expect(hint).toContain('figma-abc-1234');
    expect(hint).toContain('5분 전');
    expect(hint).toContain('close code 1001');
    expect(hint).toContain('2.9시간');
    expect(hint).toContain('55123건');
    expect(hint).toContain('죽었을 수 있습니다');
    expect(hint).toContain('Plugin runtime aborted');
  });

  it('비정상 절단(1006)도 사망 가능성을 말한다', () => {
    expect(formatPluginLossHint(record({ code: 1006 }), NOW)).toContain('죽었을 수 있습니다');
  });

  it('그 밖의 close code 는 사망을 단정하지 않는다 — 사람이 창을 닫은 경우가 섞인다', () => {
    const hint = formatPluginLossHint(record({ code: 1000 }), NOW);
    expect(hint).toContain('close code 1000');
    expect(hint).not.toContain('죽었을 수 있습니다');
  });

  it('한 시간 미만 수명은 분으로 적는다', () => {
    expect(formatPluginLossHint(record({ livedSec: 900 }), NOW)).toContain('수명 15분');
  });

  it('방금 끊겼으면 분 단위로 반올림하지 않고 "방금" 이라고 한다', () => {
    expect(formatPluginLossHint(record({ at: NOW - 3_000 }), NOW)).toContain('방금 끊겼습니다');
  });

  it('close reason 이 있으면 함께 싣는다', () => {
    expect(formatPluginLossHint(record({ reason: 'plugin closed' }), NOW)).toContain('(plugin closed)');
  });
});
