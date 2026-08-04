import type { ExtractedNode } from '@sigma/shared';

// ── 제네릭/시스템 폰트 (Figma에서 로드 불가) ──
const GENERIC_FAMILIES = new Set([
  'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy',
  'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded',
  '-apple-system', '.sfnstext-regular', 'blinkmacsystemfont',
]);

/** 최종 폴백 — Figma에 항상 존재하는 패밀리이자, 파일 설정이 없을 때의 기본값 */
export const FALLBACK_FONT_FAMILY = 'Inter';

/**
 * 파일 단위 폰트 설정 키 — figma.root의 sharedPluginData('sigma') 네임스페이스.
 *
 * CSS가 폰트를 지정하지 않았을 때 쓸 패밀리를 **파일마다** 정한다:
 *   sigma_set_page_data(pageId: "document", key: "fonts", value: '{"default":"Pretendard"}')
 * lint config(키 `lint`)와 같은 자리·같은 방식이다.
 *
 * 설정이 없으면 Inter(Figma 기본)를 쓴다 — 도구가 특정 폰트를 강요하지 않는다.
 * 폰트는 파일의 디자인 시스템에 속하는 결정이지 변환기의 결정이 아니다.
 */
const FONT_CONFIG_KEY = 'fonts';

/** 트리가 어떤 weight를 쓰든 항상 확보해 두는 기본 weight */
const BASE_WEIGHTS = [400, 700];

// CSS fontFamily → Figma font family 이름 캐시
const fontFamilyCache = new Map<string, string>();

// 로드 완료된 font key (family:style) 캐시
const loadedFontKeys = new Set<string>();

// 패밀리별 사용 가능 여부 (Regular 로드 시도 결과)
const familyAvailability = new Map<string, boolean>();

// 설정을 읽고 가용성까지 확인한 기본 폰트 — resolveFigmaFontName(동기)이 참조한다
let activeDefaultFamily = FALLBACK_FONT_FAMILY;

/**
 * CSS font-family 문자열에서 개별 폰트명 배열 추출
 * "Pretendard, -apple-system, sans-serif" → ["Pretendard", "-apple-system", "sans-serif"]
 */
export function parseFontFamilies(cssValue: string): string[] {
  if (!cssValue) return [];
  return cssValue.split(',')
    .map(function(f) { return f.trim().replace(/^['"]|['"]$/g, ''); })
    .filter(function(f) { return f.length > 0; });
}

/**
 * 폰트 weight를 Figma 스타일 이름 후보 배열로 변환
 * 폰트마다 스타일 이름이 다를 수 있으므로 여러 변형을 시도
 * (예: Pretendard는 "SemiBold", Inter는 "Semi Bold")
 */
export function getStyleCandidates(weight: number): string[] {
  if (weight >= 900) return ['Black', 'Heavy'];
  if (weight >= 800) return ['ExtraBold', 'Extra Bold', 'UltraBold', 'Ultra Bold'];
  if (weight >= 700) return ['Bold'];
  if (weight >= 600) return ['SemiBold', 'Semi Bold', 'Semibold', 'DemiBold', 'Demi Bold'];
  if (weight >= 500) return ['Medium'];
  if (weight >= 400) return ['Regular', 'Normal', 'Book'];
  if (weight >= 300) return ['Light'];
  if (weight >= 200) return ['ExtraLight', 'Extra Light', 'UltraLight', 'Ultra Light'];
  return ['Thin', 'Hairline'];
}

/**
 * Figma에서 특정 폰트+스타일 로드 시도
 */
async function tryLoadFont(family: string, style: string): Promise<boolean> {
  const key = family + ':' + style;
  if (loadedFontKeys.has(key)) return true;
  try {
    await figma.loadFontAsync({ family: family, style: style });
    loadedFontKeys.add(key);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 한 패밀리에 대해 주어진 weight들을 로드 시도.
 * weight마다 스타일 이름 후보를 순서대로 시도하고, 하나 성공하면 다음 weight로 넘어간다.
 */
async function loadFontWeights(family: string, weights: Iterable<number>): Promise<void> {
  const done = new Set<number>();
  for (const weight of weights) {
    if (done.has(weight)) continue;
    done.add(weight);
    for (const style of getStyleCandidates(weight)) {
      if (await tryLoadFont(family, style)) break;
    }
  }
}

/**
 * 이 파일에 설정된 기본 폰트 이름 (가용성은 확인하지 않은 값).
 * 설정이 없거나 형식이 깨졌으면 폴백 폰트.
 */
export function getDefaultFontFamily(): string {
  try {
    const raw = figma.root.getSharedPluginData('sigma', FONT_CONFIG_KEY);
    if (!raw) return FALLBACK_FONT_FAMILY;
    const parsed = JSON.parse(raw) as { default?: unknown };
    const family = parsed && typeof parsed.default === 'string' ? parsed.default.trim() : '';
    return family ? family : FALLBACK_FONT_FAMILY;
  } catch (e) {
    // 설정이 깨져 있어도 변환은 진행한다 (폴백 폰트로)
    return FALLBACK_FONT_FAMILY;
  }
}

/**
 * 패밀리가 이 환경에서 쓸 수 있는지 판정 (패밀리별 1회)
 */
async function isFamilyAvailable(family: string): Promise<boolean> {
  const cached = familyAvailability.get(family);
  if (cached !== undefined) return cached;
  const available = await tryLoadFont(family, 'Regular');
  familyAvailability.set(family, available);
  return available;
}

/**
 * 파일 설정을 읽어 기본 폰트를 확정한다 (설정 폰트가 없는 환경이면 폴백).
 * 설정은 언제든 바뀔 수 있으므로 변환할 때마다 다시 읽는다.
 */
async function resolveDefaultFamily(): Promise<string> {
  const configured = getDefaultFontFamily();
  activeDefaultFamily = (configured !== FALLBACK_FONT_FAMILY && await isFamilyAvailable(configured))
    ? configured
    : FALLBACK_FONT_FAMILY;
  return activeDefaultFamily;
}

/**
 * ExtractedNode 트리에서 (fontFamily → 사용된 weight 집합) 수집.
 * 폰트를 지정하지 않은 노드는 빈 문자열 키로 모여 기본 폰트 몫의 weight가 된다.
 */
function collectFontUsage(node: ExtractedNode): Map<string, Set<number>> {
  const usage = new Map<string, Set<number>>();

  function walk(n: ExtractedNode) {
    if (n.styles) {
      const family = n.styles.fontFamily || '';
      const weight = parseInt(n.styles.fontWeight, 10) || 400;
      let weights = usage.get(family);
      if (!weights) {
        weights = new Set<number>();
        usage.set(family, weights);
      }
      weights.add(weight);
    }
    if (n.children) {
      for (const child of n.children) walk(child);
    }
  }

  walk(node);
  return usage;
}

/**
 * ExtractedNode 트리에 사용된 모든 폰트를 Figma에 로드.
 *
 * createTextNode는 동기 함수라 폰트가 미리 로드돼 있어야 한다 —
 * 변환(createFigmaNode) **전에** 반드시 호출할 것.
 */
export async function loadFontsForTree(node: ExtractedNode): Promise<void> {
  const usage = collectFontUsage(node);

  // 이 트리가 쓰는 전체 weight — 폴백/기본 폰트는 어떤 노드가 떨어져도 받을 수 있어야
  // 하므로 합집합으로 로드한다.
  const allWeights = new Set<number>(BASE_WEIGHTS);
  for (const weights of usage.values()) {
    for (const weight of weights) allWeights.add(weight);
  }

  // 폴백은 항상 로드 — 어떤 해석 결과든 최후에는 여기로 떨어질 수 있다
  await loadFontWeights(FALLBACK_FONT_FAMILY, allWeights);

  // 파일에 설정된 기본 폰트 (미지정 노드가 여기로 간다)
  const defaultFamily = await resolveDefaultFamily();
  if (defaultFamily !== FALLBACK_FONT_FAMILY) {
    await loadFontWeights(defaultFamily, allWeights);
  }

  for (const entry of usage) {
    const cssFamily = entry[0];
    const weights = entry[1];

    // 미지정 → 기본 폰트가 담당 (위에서 이미 로드됨)
    if (!cssFamily) continue;

    const cached = fontFamilyCache.get(cssFamily);
    if (cached) {
      // 이미 해석된 패밀리라도 이번 트리에서 새로 쓰는 weight는 로드해야 한다
      await loadFontWeights(cached, weights);
      continue;
    }

    let resolved = '';
    for (const family of parseFontFamilies(cssFamily)) {
      if (GENERIC_FAMILIES.has(family.toLowerCase())) continue;
      // Regular 로드 시도로 폰트 존재 여부 확인
      if (await tryLoadFont(family, 'Regular')) {
        resolved = family;
        break;
      }
    }
    if (!resolved) {
      resolved = defaultFamily;
    }

    await loadFontWeights(resolved, weights);
    fontFamilyCache.set(cssFamily, resolved);
  }
}

/**
 * 패밀리+weight를 로드하고, 실제로 쓸 수 있는 FontName을 돌려준다.
 *
 * 스타일 이름은 폰트마다 다르므로(Pretendard "SemiBold" vs Inter "Semi Bold")
 * 후보를 순서대로 시도한다 — 이름 하나만 넘겨 loadFontAsync가 던지게 두면
 * "weight 600은 못 쓴다"는 식의 폰트별 함정이 생긴다.
 * 요청 패밀리를 쓸 수 없으면 기본 → 폴백 폰트로 내려간다.
 */
export async function loadFontForWeight(family: string, weight: number): Promise<FontName> {
  const candidates = getStyleCandidates(weight);

  for (const style of candidates) {
    if (await tryLoadFont(family, style)) return { family: family, style: style };
  }
  // 요청 weight의 스타일만 없는 경우 — 같은 패밀리의 Regular로
  if (await tryLoadFont(family, 'Regular')) return { family: family, style: 'Regular' };

  // 패밀리 자체를 쓸 수 없음 → 파일 기본 폰트, 그것도 안 되면 폴백
  const alt = await resolveDefaultFamily();
  for (const style of candidates) {
    if (await tryLoadFont(alt, style)) return { family: alt, style: style };
  }
  if (await tryLoadFont(alt, 'Regular')) return { family: alt, style: 'Regular' };

  await tryLoadFont(FALLBACK_FONT_FAMILY, 'Regular');
  return { family: FALLBACK_FONT_FAMILY, style: 'Regular' };
}

/**
 * 트리 없이 기본/폴백 폰트만 확보한다.
 * 변환 대상이 없거나(빈 트리) 텍스트를 나중에 붙이는 경로에서 사용.
 */
export async function loadBaseFonts(): Promise<void> {
  await loadFontWeights(FALLBACK_FONT_FAMILY, BASE_WEIGHTS);
  const defaultFamily = await resolveDefaultFamily();
  if (defaultFamily !== FALLBACK_FONT_FAMILY) {
    await loadFontWeights(defaultFamily, BASE_WEIGHTS);
  }
}

/**
 * CSS fontFamily + weight로 Figma FontName 결정
 * createTextNode에서 사용 (동기 — loadFontsForTree가 선행돼야 한다)
 */
export function resolveFigmaFontName(cssFamily: string, weight: number): FontName {
  const mapped = cssFamily ? fontFamilyCache.get(cssFamily) : undefined;
  const family = mapped || activeDefaultFamily;
  const candidates = getStyleCandidates(weight);

  // 해당 family에서 사용 가능한 스타일 탐색
  for (const style of candidates) {
    if (loadedFontKeys.has(family + ':' + style)) {
      return { family: family, style: style };
    }
  }

  // 해당 weight의 스타일이 없으면 Regular로 fallback
  if (loadedFontKeys.has(family + ':Regular')) {
    return { family: family, style: 'Regular' };
  }

  // 최종 fallback
  for (const style of candidates) {
    if (loadedFontKeys.has(FALLBACK_FONT_FAMILY + ':' + style)) {
      return { family: FALLBACK_FONT_FAMILY, style: style };
    }
  }

  return { family: FALLBACK_FONT_FAMILY, style: 'Regular' };
}
