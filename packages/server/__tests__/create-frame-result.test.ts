/**
 * `sigma_create_frame` 이 **실제로 만든 것**을 응답에 싣는지, 그리고 만들 수 없는 입력을
 * 미리 거부하는지에 대한 회귀 테스트.
 *
 * 왜 있는가: 이 도구는 **어떤 실패도 보고할 수 없는 상태**였다.
 *  - UI 브리지가 플러그인에 메시지를 전달한 **직후** `{type:'RESULT', success:true}` 를 쏴서
 *    서버의 pending 이 즉시 풀렸다(실측: MCP 응답 0.00초).
 *  - 플러그인의 `create-from-json` 케이스엔 try/catch 도 결과 전송도 없어, 그 안에서 던진
 *    예외(`data:{}` → createFigmaNode null → '프레임 생성 실패')가 어디에도 실리지 않았다.
 *  - 서버 응답은 플러그인 결과 대신 **요청받은 pageId 를 되울렸다**.
 * 그래서 `data:{}` 로 부르면 노드가 하나도 안 생겼는데 응답은 성공이었다(파일 전 페이지를
 * 고유 이름으로 훑어 "어디에도 없음"을 확인). 이 테스트는 그 세 가지 중 서버에서 검증
 * 가능한 두 가지 — 사전 거부와 결과 되울림 금지 — 를 고정한다.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { tokenStore } from '../src/auth/token';
import { figmaHandlers } from '../src/mcp/handlers/figma';

function parse(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0].text);
}

type Call = { data: unknown; pageId?: string };

function makeContext(calls: Call[], result?: unknown) {
  return {
    wsServer: {
      isFigmaConnected: () => true,
      getPluginById: () => ({ pluginId: 'p1' }),
      async createFrame(
        data: unknown,
        _name?: string,
        _position?: unknown,
        _format?: string,
        _pluginId?: string,
        pageId?: string,
      ) {
        calls.push({ data, pageId });
        return result ?? { nodeId: '1:23', name: 'made', childCount: 2, pageName: '실제 페이지' };
      },
    },
  } as unknown as Parameters<typeof figmaHandlers.sigma_create_frame>[1];
}

const VALID = {
  tagName: 'div',
  styles: { width: '10px' },
  boundingRect: { x: 0, y: 0, width: 10, height: 10 },
  children: [],
};

describe('sigma_create_frame — 결과 반환과 사전 거부', () => {
  let token: string;

  beforeEach(() => {
    token = tokenStore.createToken();
    tokenStore.bindToken(token, 'p1', 'page1', 'f.fig', 'Page');
  });

  test('빈 객체 data 는 거부하고 플러그인에 아예 보내지 않는다', async () => {
    const calls: Call[] = [];
    const res = parse(await figmaHandlers.sigma_create_frame({ token, data: {} }, makeContext(calls)));
    expect(res.error).toBeString();
    expect(res.success).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  test('변환에 쓰이지 않는 키만 있는 객체도 거부한다', async () => {
    const calls: Call[] = [];
    const res = parse(await figmaHandlers.sigma_create_frame({ token, data: { width: 100 } }, makeContext(calls)));
    expect(res.error).toBeString();
    expect(calls).toHaveLength(0);
  });

  test('json 포맷에 배열·문자열을 주면 거부한다', async () => {
    const calls: Call[] = [];
    for (const data of [[], 'not-a-node'] as unknown[]) {
      const res = parse(await figmaHandlers.sigma_create_frame({ token, data }, makeContext(calls)));
      expect(res.error).toBeString();
    }
    expect(calls).toHaveLength(0);
  });

  test('html 포맷은 비어 있지 않은 문자열을 요구한다', async () => {
    const calls: Call[] = [];
    const blank = parse(await figmaHandlers.sigma_create_frame({ token, html: '   ' }, makeContext(calls)));
    expect(blank.error).toBeString();
    expect(calls).toHaveLength(0);

    const ok = parse(await figmaHandlers.sigma_create_frame({ token, html: '<div>x</div>' }, makeContext(calls)));
    expect(ok.success).toBe(true);
    expect(calls).toHaveLength(1);
  });

  test('유효한 data 면 플러그인이 만든 노드를 응답에 싣는다 (요청 pageId 되울림 금지)', async () => {
    const calls: Call[] = [];
    const res = parse(await figmaHandlers.sigma_create_frame({ token, data: VALID }, makeContext(calls)));
    expect(calls).toHaveLength(1);
    expect(res.success).toBe(true);
    // 핵심: 응답의 created 는 플러그인이 돌려준 실측값이다. 바인딩 pageId('page1')가 아니라
    // 플러그인이 알려준 pageName('실제 페이지')이 실린다 — 되울림이면 이 단정이 깨진다.
    expect(res.created).toEqual({ nodeId: '1:23', name: 'made', childCount: 2, pageName: '실제 페이지' });
    expect(res.message).toContain('1:23');
  });

  test('플러그인이 실패를 던지면 그 에러가 그대로 올라온다', async () => {
    const ctx = {
      wsServer: {
        isFigmaConnected: () => true,
        getPluginById: () => ({ pluginId: 'p1' }),
        async createFrame() {
          throw new Error('프레임 생성 실패');
        },
      },
    } as unknown as Parameters<typeof figmaHandlers.sigma_create_frame>[1];
    await expect(figmaHandlers.sigma_create_frame({ token, data: VALID }, ctx)).rejects.toThrow('프레임 생성 실패');
  });
});
