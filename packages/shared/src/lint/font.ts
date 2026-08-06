/**
 * font_not_default — 파일이 정한 기본 폰트와 **다른 폰트를 쓰는 TEXT** 를 찾는다.
 *
 * 폰트는 파일의 디자인 시스템에 속하는 결정이고, sigma 는 그 결정을 문서 노드
 * `fonts.default`(sigma_set_page_data, pageId:"document") 에 둔다. 그런데 그 설정이
 * 적용되는 것은 **새로 만들 때**뿐이라, 설정 이전에 만들어진 텍스트는 그대로 남는다.
 *
 * 실제로: 폰트 파이프라인을 고친 뒤 component-spec 마스터 704개는 재등록으로 전부 바뀌었지만,
 * 화면 프레임에 **직접 그려 넣은 raw TEXT**(페이지 제목 등)는 옛 폰트 그대로였다. 그걸 찾는 일이
 * 지금까지 "섹션마다 텍스트를 훑어 사람이 거르기" 였다 — scope:"file" 한 번이면 될 일이다.
 *
 * 기본 OFF(opt-in): 기본 폰트가 정해진 파일에서만 의미가 있다.
 * 의도적으로 다른 폰트를 쓰는 곳(코드 블록의 고정폭 폰트 등)은 노드 lint-ignore 로 사유와 함께 면제한다.
 */
import type { LintNode, Violation } from './types';

export interface FontNotDefaultConfig {
  /** 기대 패밀리. 생략하면 서버가 문서 `fonts.default` 에서 읽어 넣는다. */
  family?: string;
  /** 함께 허용할 패밀리(정확히 일치). 예: 코드용 고정폭 폰트. */
  allow?: string[];
  /** 한 텍스트 안에 폰트가 섞인 경우(figma.mixed)도 위반으로 볼지. 기본 true. */
  flagMixed?: boolean;
}

/** get_nodes_info 의 fontName — {family, style} 이거나, 구간마다 다르면 'mixed' 문자열 */
function familyOf(fontName: unknown): { family: string | null; mixed: boolean } {
  if (fontName === 'mixed') return { family: null, mixed: true };
  if (fontName && typeof fontName === 'object') {
    const f = (fontName as { family?: unknown }).family;
    if (typeof f === 'string') return { family: f, mixed: false };
  }
  return { family: null, mixed: false };
}

export function fontNotDefaultRule(nodes: LintNode[], config: FontNotDefaultConfig = {}): Violation[] {
  const expected = config.family;
  // 기대값을 모르면 판정하지 않는다 — "다르다"의 기준이 없으면 전부 위반으로 만들 뿐이다.
  if (!expected) return [];

  const allowed = new Set<string>([expected, ...(config.allow || [])]);
  const flagMixed = config.flagMixed !== false;
  const out: Violation[] = [];

  for (const n of nodes) {
    if (n.type !== 'TEXT') continue;
    const { family, mixed } = familyOf(n.fontName);

    if (mixed) {
      if (!flagMixed) continue;
      out.push({
        rule: 'font_not_default', source: 'builtin',
        message: `"${n.name}" (${n.id}) 는 한 텍스트 안에 폰트가 섞여 있다 — 구간마다 다른 폰트가 남아 있으면 기본 폰트(${expected}) 적용 여부를 확인할 수 없다.`,
        nodes: [n.id],
      });
      continue;
    }
    if (family === null) continue;      // 상세 조회가 안 실린 노드는 판정 보류
    if (allowed.has(family)) continue;

    const preview = typeof n.characters === 'string' && n.characters.length > 0
      ? ` ("${n.characters.length > 20 ? n.characters.slice(0, 20) + '…' : n.characters}")`
      : '';
    out.push({
      rule: 'font_not_default', source: 'builtin',
      message: `"${n.name}" (${n.id})${preview} 의 폰트가 ${family} 다 — 이 파일의 기본 폰트는 ${expected}. 의도한 것이면 노드에 lint-ignore 로 사유를 남겨라.`,
      nodes: [n.id],
    });
  }

  return out;
}
