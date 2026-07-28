/**
 * content_above_annotation — 기획용(anno/wire 프리셋) 컴포넌트는 같은 부모 안에서 항상
 * z-order 최상위 "그룹"이어야 한다. 단, 기획용 컴포넌트는 하나로 취급되지 않으므로(여러 개가
 * 한 프레임에 들어갈 수 있음) "마지막 자식인지"가 아니라 "기획용 뒤에(z-order 위에) 기획용이
 * 아닌 일반 콘텐츠가 있는지"를 본다 — 기획용들이 z-order 끝에 몰려있기만 하면 통과.
 *
 * 판별은 TreeNode.meta.specAlias(컴포넌트 스펙 pluginData 스탬프, 이름과 무관 — 리네임에 안전)로
 * 한다. 기존 geometric.ts의 ANNO_WIRE_NAMES(이름 휴리스틱)는 실측 결과 리네임된 실제 콘텐츠와
 * 어긋나는 걸 확인해 이번 규칙은 이름 대신 스탬프를 쓴다.
 */
import type { TreeNode } from '../types';
import type { Violation } from './types';

/** anno(region/marker/legend/label) + wire(box/section_title/item/kv/note) — spec-presets.ts와 동기화.
 *  alias 문자열만으로 판별하므로(스탬프에 namespace가 없음), 이론상 다른 namespace가 같은
 *  alias를 쓰면 오탐 가능 — 이 9개는 built-in 프리셋 전용 단어라 실질 위험은 낮음(문서화된 근사). */
const DEFAULT_ANNOTATION_ALIASES = new Set([
  'region', 'marker', 'legend', 'label',
  'box', 'section_title', 'item', 'kv', 'note',
]);

function isAnnotation(node: TreeNode, aliases: Set<string>): boolean {
  const alias = node.meta?.specAlias;
  return alias !== undefined && aliases.has(alias);
}

export function contentAboveAnnotationRule(roots: TreeNode[], extraAliases?: Iterable<string>): Violation[] {
  const aliases = new Set(DEFAULT_ANNOTATION_ALIASES);
  if (extraAliases) for (const a of extraAliases) aliases.add(a);

  const out: Violation[] = [];

  function walk(node: TreeNode) {
    const children = node.children;
    if (children && children.length > 1) {
      let sawAnnotation = false;
      for (const c of children) {
        if (isAnnotation(c, aliases)) {
          sawAnnotation = true;
        } else if (sawAnnotation) {
          out.push({
            rule: 'content_above_annotation', source: 'builtin',
            message: `"${c.name}" (${c.id}) 가 기획용(anno/wire) 컴포넌트보다 나중에 그려져(z-order 위) 가릴 수 있음`,
            nodes: [c.id],
          });
        }
      }
    }
    for (const c of children ?? []) walk(c);
  }

  for (const r of roots) walk(r);
  return out;
}
