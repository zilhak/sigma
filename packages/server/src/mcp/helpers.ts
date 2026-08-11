import { tokenStore, type SigmaTokenBinding } from '../auth/token.js';
import type { FigmaWebSocketServer } from '../websocket/server.js';

/**
 * MCP 도구 실행 컨텍스트
 */
export interface ToolContext {
  wsServer: FigmaWebSocketServer;
}

/**
 * MCP 도구 응답 타입
 */
export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
};

/**
 * JSON 데이터를 ToolResult로 변환하는 헬퍼
 */
export function jsonResponse(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
  };
}

/**
 * 토큰 검증 결과
 */
interface TokenValidationResult {
  valid: boolean;
  binding: SigmaTokenBinding | null;
  error?: string;
}

/**
 * 토큰 검증 헬퍼
 */
export function validateToken(token: string): TokenValidationResult {
  if (!token) {
    return { valid: false, binding: null, error: '토큰이 필요합니다' };
  }

  const tokenData = tokenStore.validateToken(token);
  if (!tokenData) {
    return { valid: false, binding: null, error: '유효하지 않거나 만료된 토큰입니다' };
  }

  return { valid: true, binding: tokenData.binding };
}

/**
 * 바인딩에서 대상 플러그인/페이지 추출
 */
export function getTargetFromBinding(binding: SigmaTokenBinding | null): { pluginId?: string; pageId?: string } {
  if (!binding) {
    return {};  // 바인딩 없으면 기본값 사용 (첫 번째 플러그인, 현재 페이지)
  }
  return {
    pluginId: binding.pluginId,
    pageId: binding.pageId,
  };
}

/**
 * Figma 접근 검증 결과
 */
interface FigmaAccessResult {
  pluginId?: string;
  pageId?: string;
  error?: ToolResult;
}

/**
 * 토큰 검증 + Figma 연결 확인 + 플러그인 확인을 통합한 헬퍼.
 * 12개 이상의 핸들러에서 반복되는 ~20줄의 보일러플레이트를 대체합니다.
 */
export function validateFigmaAccess(
  token: string,
  wsServer: FigmaWebSocketServer,
  options: { allowUnbound?: boolean } = {}
): FigmaAccessResult {
  // 토큰 검증
  const validation = validateToken(token);
  if (!validation.valid) {
    return { error: jsonResponse({ error: validation.error }) };
  }

  // Figma 연결 확인
  // ⚠️ 「연결되어 있지 않습니다」로 끝내지 말 것 — 그건 "아직 안 켰다" 와 "죽었다" 를 구분하지 못한다.
  // 배경: docs/history/020-plugin-vm-aborted-after-a-long-lived-session.md
  if (!wsServer.isFigmaConnected()) {
    return { error: jsonResponse({ error: `Figma Plugin이 연결되어 있지 않습니다. ${wsServer.describePluginLoss()}` }) };
  }

  // ⚠️ 바인딩이 **없으면** 대상이 "첫 번째 플러그인 + 현재 열린 페이지"로 정해진다.
  // 그건 sigma 의 원칙("열려 있는 페이지·선택 상태는 어떤 도구에도 영향을 주지 않는다")을 깨고,
  // 남이 열어 둔 페이지에 노드를 만든다. 플러그인 재연결마다 pluginId 가 바뀌어 **바인딩 실패는
  // 드문 사고가 아니라 자주 있는 상태**이므로 기본값은 거부다. 바인딩 전에 쓰는 조회 도구만
  // allowUnbound 로 연다(빠뜨리면 "바인딩하라"는 오류가 날 뿐, 남의 페이지를 건드리지는 않는다).
  if (!validation.binding && !options.allowUnbound) {
    return {
      error: jsonResponse({
        error: '토큰이 바인딩되어 있지 않습니다. sigma_bind(token, pluginId, pageId) 로 대상 플러그인·페이지를 먼저 정하세요 — 바인딩 없이 실행하면 대상이 "현재 열려 있는 페이지"가 되어 다른 작업의 페이지를 건드릴 수 있습니다.',
      }),
    };
  }

  // 바인딩에서 대상 추출
  const { pluginId, pageId } = getTargetFromBinding(validation.binding);

  // 바인딩된 플러그인이 있으면 연결 확인
  if (pluginId) {
    const targetPlugin = wsServer.getPluginById(pluginId);
    if (!targetPlugin) {
      return {
        error: jsonResponse({
          error: `바인딩된 플러그인(${pluginId})이 연결되어 있지 않습니다. ${wsServer.describePluginLoss(pluginId)}`,
        }),
      };
    }
  }

  return { pluginId, pageId };
}

/**
 * 바이트 크기를 사람이 읽기 쉬운 형식으로 변환
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
