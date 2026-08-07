import { validateFigmaAccess, jsonResponse, type ToolContext, type ToolResult } from '../helpers.js';
import { resolveBaseConfig, type ConfigMode } from '../../lint/resolve-config.js';
import { runPageLint, runFileLint } from '../../lint/run.js';

/**
 * sigma_lint — 빌트인 규칙 카탈로그 24종(기본 ON 15종 = 기하 8 + 구조/이름/가시성 6 + occlusion 1, opt-in 9종) + config.custom
 * (JSON shorthand / JS predicate) 커스텀 규칙을 함께 실행한다.
 *
 * scope: 'page'(바인딩된 1페이지, 기본) | 'file'(전 페이지 순회)
 * configMode: 'merge'(base+페이지 override, 기본) | 'per-page'(페이지 저장 config) | 'uniform'(명시 config 하나, 페이지 저장 무시)
 * config 출처: inline `config` 객체 > `configPath` 파일 > 문서 저장 'lint' (merge/per-page 의 base).
 * 파일 lint 결과는 md 리포트 파일로 떨구고 응답엔 요약+경로만 싣는다.
 *
 * 실행 자체는 `server/src/lint/` 가 한다 — 여기는 인자 파싱과 MCP 응답 래핑만 담당한다.
 */
export const lintHandlers: Record<string, (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>> = {
  async sigma_lint(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;
    const { pluginId, pageId } = access;

    const scope = (args.scope as string) === 'file' ? 'file' : 'page';
    // 기본은 merge — base(inline/파일/문서) + 페이지 저장 config 를 rule id 단위로 병합.
    // ⚠️ 예전 기본은 uniform 이라 **페이지 저장 config 를 통째로 무시**했다. 같은 페이지가
    // 인자 하나 차이로 3217건 ↔ 0건이 되는데 응답에는 그 이유가 없어, 규칙을 껐다고 기록해 둔
    // 페이지를 재검할 때 없던 결함이 무더기로 보였다. 페이지가 자기 config 를 갖고 있으면
    // 그건 그 페이지의 뜻이므로 기본값이 존중하는 쪽이 맞다. uniform 은 이제 명시해야 한다.
    const configMode = (['uniform', 'per-page', 'merge'].includes(args.configMode as string)
      ? args.configMode : 'merge') as ConfigMode;

    const baseResolved = await resolveBaseConfig(args, wsServer, pluginId);
    // uniform 은 base 필수. per-page/merge 는 base 없어도 페이지 저장 config 로 동작 가능.
    if (configMode === 'uniform' && !baseResolved.config) {
      return jsonResponse({
        error: baseResolved.error
          ? `base config 를 로드할 수 없습니다: ${baseResolved.error}`
          : 'config 가 필요합니다 — inline `config` 객체, `configPath` 파일, 또는 문서 저장 lint config 중 하나.',
      });
    }
    const baseConfig = baseResolved.config;

    try {
      const result = scope === 'file'
        ? await runFileLint(args, wsServer, pluginId, configMode, baseConfig, baseResolved.label)
        : await runPageLint(args, wsServer, pluginId, pageId, configMode, baseConfig);
      return jsonResponse(result);
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : String(error) });
    }
  },
};
