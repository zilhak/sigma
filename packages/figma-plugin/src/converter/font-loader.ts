import type { ExtractedNode } from '@sigma/shared';

// ── 제네릭/시스템 폰트 (Figma에서 로드 불가) ──
const GENERIC_FAMILIES = new Set([
  'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy',
  'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded',
  '-apple-system', '.sfnstext-regular', 'blinkmacsystemfont',
]);

// CSS fontFamily → Figma font family 이름 캐시
const fontFamilyCache = new Map<string, string>();

// 로드 완료된 font key (family:style) 캐시
const loadedFontKeys = new Set<string>();

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
 */
function getStyleCandidates(weight: number): string[] {
  if (weight >= 900) return ['Black', 'Heavy', 'ExtraBold', 'Extra Bold'];
  if (weight >= 800) return ['ExtraBold', 'Extra Bold'];
  if (weight >= 700) return ['Bold'];
  if (weight >= 600) return ['SemiBold', 'Semi Bold', 'Semibold', 'DemiBold'];
  if (weight >= 500) return ['Medium'];
  if (weight >= 300) return ['Light'];
  if (weight >= 200) return ['ExtraLight', 'Extra Light', 'Thin'];
  if (weight >= 100) return ['Thin', 'Hairline'];
  return ['Regular'];
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
 * 특정 폰트의 기본 weight들을 모두 로드 시도
 */
async function loadFontWeights(family: string): Promise<void> {
  const weights = [400, 500, 600, 700];
  for (const w of weights) {
    const candidates = getStyleCandidates(w);
    for (const style of candidates) {
      if (await tryLoadFont(family, style)) break;
    }
  }
}

/**
 * ExtractedNode 트리에서 모든 고유 fontFamily 값 수집
 */
function collectFontFamilies(node: ExtractedNode): Set<string> {
  const families = new Set<string>();
  function walk(n: ExtractedNode) {
    if (n.styles && n.styles.fontFamily) {
      families.add(n.styles.fontFamily);
    }
    if (n.children) {
      for (const child of n.children) walk(child);
    }
  }
  walk(node);
  return families;
}

/**
 * ExtractedNode 트리에 사용된 모든 폰트를 Figma에 로드
 * frame.ts의 createFrameFromJSON/HTML에서 변환 전에 호출
 */
export async function loadFontsForTree(node: ExtractedNode): Promise<void> {
  // Inter는 항상 fallback으로 로드
  await loadFontWeights('Inter');

  // 트리에서 사용된 fontFamily 수집
  const cssFamilies = collectFontFamilies(node);

  for (const cssFamily of cssFamilies) {
    if (fontFamilyCache.has(cssFamily)) continue;

    const families = parseFontFamilies(cssFamily);
    let resolved = false;

    for (const family of families) {
      if (GENERIC_FAMILIES.has(family.toLowerCase())) continue;
      if (family === 'Inter') {
        fontFamilyCache.set(cssFamily, 'Inter');
        resolved = true;
        break;
      }

      // Regular 로드 시도로 폰트 존재 여부 확인
      const available = await tryLoadFont(family, 'Regular');
      if (available) {
        await loadFontWeights(family);
        fontFamilyCache.set(cssFamily, family);
        resolved = true;
        break;
      }
    }

    if (!resolved) {
      fontFamilyCache.set(cssFamily, 'Inter');
    }
  }
}

/**
 * CSS fontFamily + weight로 Figma FontName 결정
 * createTextNode에서 사용
 */
export function resolveFigmaFontName(cssFamily: string, weight: number): FontName {
  const family = cssFamily ? (fontFamilyCache.get(cssFamily) || 'Inter') : 'Inter';
  const candidates = getStyleCandidates(weight);

  // 해당 family에서 사용 가능한 스타일 탐색
  for (const style of candidates) {
    const key = family + ':' + style;
    if (loadedFontKeys.has(key)) {
      return { family: family, style: style };
    }
  }

  // 해당 weight의 스타일이 없으면 Regular로 fallback
  const regularKey = family + ':Regular';
  if (loadedFontKeys.has(regularKey)) {
    return { family: family, style: 'Regular' };
  }

  // 최종 fallback: Inter
  for (const style of candidates) {
    const key = 'Inter:' + style;
    if (loadedFontKeys.has(key)) {
      return { family: 'Inter', style: style };
    }
  }

  return { family: 'Inter', style: 'Regular' };
}
