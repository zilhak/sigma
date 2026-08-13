import { describe, it, expect } from 'bun:test';
import { shouldLogLifetime } from '../src/websocket/server';

// 배경: docs/history/022-lifetime-log-never-fired-and-peak-was-invisible.md
//
// 궤적 로그가 «2000 명령마다» 하나뿐이던 시절, 2026-08-13 사망(1,270 명령 / 576MB / 10분)
// 에서는 **한 줄도 찍히지 않았다.** 부하의 축이 «횟수» 가 아니라 «양» 인 경우가 실재한다.

const MB = 1024 * 1024;
const T0 = 1_800_000_000_000;

function stats(over: Partial<Parameters<typeof shouldLogLifetime>[0]> = {}) {
  return {
    commands: 0,
    bytesIn: 0,
    lastLifetimeLogAt: T0,
    lastLifetimeLogCommands: 0,
    lastLifetimeLogBytes: 0,
    ...over,
  };
}

describe('shouldLogLifetime — 셋 중 먼저 오는 것', () => {
  it('아무 조건도 안 차면 안 찍는다', () => {
    expect(shouldLogLifetime(stats({ commands: 500, bytesIn: 20 * MB }), T0 + 60_000)).toBe(false);
  });

  it('명령 수로 발화한다 (2000)', () => {
    expect(shouldLogLifetime(stats({ commands: 2000 }), T0 + 1000)).toBe(true);
    expect(shouldLogLifetime(stats({ commands: 1999 }), T0 + 1000)).toBe(false);
  });

  it('회귀: 명령은 적은데 양이 많은 경우에도 발화한다 — 022 가 놓친 축', () => {
    // 022 사망 시점의 실제 값: 1,270 명령 / 576.5MB / 633초
    const dying = stats({ commands: 1270, bytesIn: 576 * MB });
    expect(shouldLogLifetime(dying, T0 + 633_000)).toBe(true);
    // 명령 수 조건만 있었다면 못 잡았다는 것을 같이 고정한다
    expect(dying.commands - dying.lastLifetimeLogCommands).toBeLessThan(2000);
  });

  it('누적 바이트로 발화한다 (100MB)', () => {
    expect(shouldLogLifetime(stats({ bytesIn: 100 * MB }), T0 + 1000)).toBe(true);
    expect(shouldLogLifetime(stats({ bytesIn: 99 * MB }), T0 + 1000)).toBe(false);
  });

  it('경과 시간으로 발화한다 (5분)', () => {
    expect(shouldLogLifetime(stats(), T0 + 5 * 60_000)).toBe(true);
    expect(shouldLogLifetime(stats(), T0 + 5 * 60_000 - 1)).toBe(false);
  });

  it('기준점은 마지막 발화 시점이다 — 누적이 아니라 구간으로 센다', () => {
    // 이미 100MB 를 찍고 난 뒤라면, 총 150MB 여도 구간은 50MB 라 아직 아니다
    const after = stats({ commands: 2500, bytesIn: 150 * MB, lastLifetimeLogAt: T0, lastLifetimeLogCommands: 2000, lastLifetimeLogBytes: 100 * MB });
    expect(shouldLogLifetime(after, T0 + 60_000)).toBe(false);
  });
});
