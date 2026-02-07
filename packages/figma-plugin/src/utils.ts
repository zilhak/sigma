import type { ComputedStyles, RGBA } from '@sigma/shared';

/**
 * Solid Paint 생성
 */
export function createSolidPaint(color: RGBA): SolidPaint {
  return {
    type: 'SOLID',
    color: { r: color.r, g: color.g, b: color.b },
    opacity: color.a,
  };
}

/**
 * CSS 색상 문자열 파싱
 */
export function parseColorFromCSS(colorStr: string): RGBA | null {
  const rgbaMatch = colorStr.match(
    /rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/
  );

  if (rgbaMatch) {
    return {
      r: parseFloat(rgbaMatch[1]) / 255,
      g: parseFloat(rgbaMatch[2]) / 255,
      b: parseFloat(rgbaMatch[3]) / 255,
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
    };
  }

  return null;
}

/**
 * CSS spacing 값 파싱 (padding, margin, border-radius)
 */
export function parseSpacing(value: string): [number, number, number, number] {
  const parts = value.split(/\s+/).map((v) => parseFloat(v) || 0);

  switch (parts.length) {
    case 1:
      return [parts[0], parts[0], parts[0], parts[0]];
    case 2:
      return [parts[0], parts[1], parts[0], parts[1]];
    case 3:
      return [parts[0], parts[1], parts[2], parts[1]];
    case 4:
      return [parts[0], parts[1], parts[2], parts[3]];
    default:
      return [0, 0, 0, 0];
  }
}

/**
 * style 속성에서 width/height 추출
 */
export function extractBoundingFromStyle(attrsString: string): { x: number; y: number; width: number; height: number } {
  const result = { x: 0, y: 0, width: 0, height: 0 };
  const styleMatch = attrsString.match(/style\s*=\s*["']([^"']*)["']/i);

  if (styleMatch) {
    const widthMatch = styleMatch[1].match(/width\s*:\s*([\d.]+)/);
    const heightMatch = styleMatch[1].match(/height\s*:\s*([\d.]+)/);
    if (widthMatch) result.width = parseFloat(widthMatch[1]);
    if (heightMatch) result.height = parseFloat(heightMatch[1]);
  }

  return result;
}

/**
 * 기본 스타일 생성
 */
export function createDefaultStyles(): ComputedStyles {
  return {
    // 레이아웃
    display: 'block',
    position: 'static',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    flexWrap: 'nowrap',
    gap: 0,

    // 크기
    width: 'auto',
    height: 'auto',
    minWidth: 0,
    minHeight: 0,
    maxWidth: 0,
    maxHeight: 0,

    // 패딩
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,

    // 마진
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,

    // 배경
    backgroundColor: { r: 0, g: 0, b: 0, a: 0 },
    backgroundImage: null,

    // 테두리 두께
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,

    // 테두리 색상
    borderTopColor: { r: 0, g: 0, b: 0, a: 0 },
    borderRightColor: { r: 0, g: 0, b: 0, a: 0 },
    borderBottomColor: { r: 0, g: 0, b: 0, a: 0 },
    borderLeftColor: { r: 0, g: 0, b: 0, a: 0 },

    // 테두리 라운드
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 0,

    // 텍스트
    color: { r: 0, g: 0, b: 0, a: 1 },
    fontSize: 14,
    fontFamily: 'Inter',
    fontWeight: '400',
    fontStyle: 'normal',
    textAlign: 'left',
    textDecoration: 'none',
    lineHeight: 0,
    letterSpacing: 0,

    // 기타
    opacity: 1,
    overflow: 'visible',
    boxShadow: 'none',
    transform: 'none',
  };
}
