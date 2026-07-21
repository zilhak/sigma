import { lintLayout, mergeFixesBySection, type LayoutFix, type TreeNode } from '@sigma/shared';
import { validateFigmaAccess, jsonResponse, type ToolContext, type ToolResult } from '../helpers.js';

/**
 * 레이아웃 공간 규약(spatial invariants) 도구.
 * - sigma_layout_lint : 위반 검출 (read-only)
 * - sigma_layout_fix  : 안전 자동수정(섹션 확장) — dry-run 기본
 *
 * 규칙 엔진은 @sigma/shared 의 lintLayout (순수 기하). 좌표계·규칙은 그쪽 주석 참조.
 */

/** grow_section fix 들을 플러그인 modify 작업으로 변환 (섹션 resize + move). */
function fixesToOps(fixes: LayoutFix[]): Array<{ nodeId: string; method: string; args: Record<string, unknown> }> {
  return fixes.flatMap((f) => [
    { nodeId: f.sectionId, method: 'resize', args: { width: f.width, height: f.height } },
    { nodeId: f.sectionId, method: 'move', args: { x: f.x, y: f.y } },
  ]);
}

export const layoutHandlers: Record<string, (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>> = {
  async sigma_layout_lint(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId, pageId } = access;
    const nodeId = args.nodeId as string | undefined;
    const path = args.path as string | string[] | undefined;
    const padding = args.padding as number | undefined;
    const sectionGap = args.sectionGap as number | undefined;

    try {
      const tree = await wsServer.getTree({ nodeId, path, depth: 'full', pageId }, pluginId);
      const result = lintLayout(tree.children as TreeNode[], { padding, sectionGap });
      return jsonResponse({
        page: tree.pageName,
        scope: nodeId || path || '(page root)',
        ...result,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return jsonResponse({ error: errMsg });
    }
  },

  async sigma_layout_fix(args, context) {
    const { wsServer } = context;
    const access = validateFigmaAccess(args.token as string, wsServer);
    if (access.error) return access.error;

    const { pluginId, pageId } = access;
    const apply = args.apply === true; // 기본 false = dry-run
    const padding = args.padding as number | undefined;
    const sectionGap = args.sectionGap as number | undefined;

    try {
      const tree = await wsServer.getTree({ depth: 'full', pageId }, pluginId);
      const lint = lintLayout(tree.children as TreeNode[], { padding, sectionGap });

      const fixable = lint.violations
        .map((v) => v.fix)
        .filter((f): f is LayoutFix => Boolean(f));
      const merged = mergeFixesBySection(fixable);
      const needsManual = lint.violations.filter((v) => !v.fix);
      const ops = fixesToOps(merged);

      if (!apply) {
        return jsonResponse({
          mode: 'dry-run',
          page: tree.pageName,
          totalViolations: lint.violationCount,
          autoFixable: merged.length,
          plannedOps: ops,
          mergedFixes: merged,
          needsManual,
          note: 'apply:true 로 실제 적용. 안전한 섹션 확장만 자동수정하며, 겹침/고아 등은 재배치 판단이 필요해 보고만 함(check-first). 확장이 옆 섹션과 겹칠 수 있어 적용 후 재검사 권장.',
        });
      }

      const applyResult = ops.length ? await wsServer.batchModifyNodes(ops, pluginId) : { skipped: true, reason: '자동수정 대상 없음' };
      // 적용 후 재검사 (확장이 옆 섹션과 겹쳤는지 등)
      const after = await wsServer.getTree({ depth: 'full', pageId }, pluginId);
      const afterLint = lintLayout(after.children as TreeNode[], { padding, sectionGap });

      return jsonResponse({
        mode: 'apply',
        page: tree.pageName,
        appliedSections: merged.length,
        applyResult,
        needsManual,
        before: lint.violationCount,
        after: afterLint.violationCount,
        remaining: afterLint.violations,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return jsonResponse({ error: errMsg });
    }
  },
};
