import type { ExtractedNode, ComputedStyles, RGBA } from '@sigma/shared';
import { createFigmaNode, parseHTML } from '../converter';
import { extractNodeToJSON } from '../extractor/extract';
import { convertExtractedNodeToHTML } from '../extractor/html-export';

interface RoundtripTestResult {
  success: boolean;
  identical: boolean;
  differences: string[];
  original: unknown;
  extracted: unknown;
  createdFrameId?: string;
}

/**
 * JSON 라운드트립 테스트
 * 1. JSON → Figma Frame 생성
 * 2. 생성된 Frame → JSON 재추출
 * 3. 원본과 비교
 */
export async function testRoundtripJSON(originalNode: ExtractedNode, name?: string): Promise<RoundtripTestResult> {
  const differences: string[] = [];

  try {
    // 1. 프레임 생성
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

    const frame = await createFigmaNode(originalNode);
    if (!frame) {
      return {
        success: false,
        identical: false,
        differences: ['프레임 생성 실패'],
        original: originalNode,
        extracted: null,
      };
    }

    frame.name = name || 'RoundtripTest-JSON';

    // 뷰포트 중앙에 배치
    const center = figma.viewport.center;
    frame.x = center.x - frame.width / 2;
    frame.y = center.y - frame.height / 2;
    figma.currentPage.appendChild(frame);

    // 2. 재추출
    const extractedNode = extractNodeToJSON(frame);
    if (!extractedNode) {
      return {
        success: false,
        identical: false,
        differences: ['추출 실패'],
        original: originalNode,
        extracted: null,
        createdFrameId: frame.id,
      };
    }

    // 3. 비교
    compareNodes(originalNode, extractedNode, '', differences);

    return {
      success: true,
      identical: differences.length === 0,
      differences,
      original: originalNode,
      extracted: extractedNode,
      createdFrameId: frame.id,
    };
  } catch (error) {
    return {
      success: false,
      identical: false,
      differences: [`오류: ${error instanceof Error ? error.message : 'Unknown error'}`],
      original: originalNode,
      extracted: null,
    };
  }
}

/**
 * HTML 라운드트립 테스트
 * 1. HTML → Figma Frame 생성
 * 2. 생성된 Frame → HTML 재추출
 * 3. 원본과 비교
 */
export async function testRoundtripHTML(originalHTML: string, name?: string): Promise<RoundtripTestResult> {
  const differences: string[] = [];

  try {
    // 1. HTML 파싱 및 프레임 생성
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

    const parsedNode = parseHTML(originalHTML);
    if (!parsedNode) {
      return {
        success: false,
        identical: false,
        differences: ['HTML 파싱 실패'],
        original: originalHTML,
        extracted: '',
      };
    }

    const frame = await createFigmaNode(parsedNode);
    if (!frame) {
      return {
        success: false,
        identical: false,
        differences: ['프레임 생성 실패'],
        original: originalHTML,
        extracted: '',
      };
    }

    frame.name = name || 'RoundtripTest-HTML';

    const center = figma.viewport.center;
    frame.x = center.x - frame.width / 2;
    frame.y = center.y - frame.height / 2;
    figma.currentPage.appendChild(frame);

    // 2. 재추출 (JSON으로 추출 후 HTML로 변환)
    const extractedNode = extractNodeToJSON(frame);
    if (!extractedNode) {
      return {
        success: false,
        identical: false,
        differences: ['추출 실패'],
        original: originalHTML,
        extracted: '',
        createdFrameId: frame.id,
      };
    }

    const extractedHTML = convertExtractedNodeToHTML(extractedNode);

    // 3. 비교 (정규화 후 비교)
    const normalizedOriginal = normalizeHTMLForCompare(originalHTML);
    const normalizedExtracted = normalizeHTMLForCompare(extractedHTML);

    if (normalizedOriginal !== normalizedExtracted) {
      differences.push('HTML 구조가 다름');
      differences.push(`원본 길이: ${normalizedOriginal.length}, 추출 길이: ${normalizedExtracted.length}`);
    }

    // 세부 비교를 위해 JSON으로도 비교
    compareNodes(parsedNode, extractedNode, '', differences);

    return {
      success: true,
      identical: differences.length === 0,
      differences,
      original: originalHTML,
      extracted: extractedHTML,
      createdFrameId: frame.id,
    };
  } catch (error) {
    return {
      success: false,
      identical: false,
      differences: [`오류: ${error instanceof Error ? error.message : 'Unknown error'}`],
      original: originalHTML,
      extracted: '',
    };
  }
}

/**
 * HTML 정규화 (비교용)
 */
function normalizeHTMLForCompare(html: string): string {
  return html
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim()
    .toLowerCase();
}

/**
 * 두 ExtractedNode 비교
 */
function compareNodes(original: ExtractedNode, extracted: ExtractedNode, path: string, differences: string[]) {
  const prefix = path ? `${path}.` : '';

  // 태그명 비교
  if (original.tagName !== extracted.tagName) {
    differences.push(`${prefix}tagName: "${original.tagName}" -> "${extracted.tagName}"`);
  }

  // 텍스트 비교
  if ((original.textContent || '').trim() !== (extracted.textContent || '').trim()) {
    differences.push(`${prefix}textContent: "${original.textContent}" -> "${extracted.textContent}"`);
  }

  // 주요 스타일 비교
  compareStyleProperty(original.styles, extracted.styles, 'display', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'flexDirection', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'justifyContent', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'alignItems', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'gap', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'paddingTop', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'paddingRight', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'paddingBottom', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'paddingLeft', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'borderTopLeftRadius', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'fontSize', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'fontWeight', prefix, differences);
  compareStyleProperty(original.styles, extracted.styles, 'opacity', prefix, differences);

  // 색상 비교 (허용 오차)
  compareColor(original.styles.backgroundColor, extracted.styles.backgroundColor, `${prefix}backgroundColor`, differences);
  compareColor(original.styles.color, extracted.styles.color, `${prefix}color`, differences);

  // 크기 비교 (허용 오차 1px)
  const origWidth = typeof original.styles.width === 'number' ? original.styles.width : original.boundingRect.width;
  const extWidth = typeof extracted.styles.width === 'number' ? extracted.styles.width : extracted.boundingRect.width;
  if (Math.abs(origWidth - extWidth) > 1) {
    differences.push(`${prefix}width: ${origWidth} -> ${extWidth}`);
  }

  const origHeight = typeof original.styles.height === 'number' ? original.styles.height : original.boundingRect.height;
  const extHeight = typeof extracted.styles.height === 'number' ? extracted.styles.height : extracted.boundingRect.height;
  if (Math.abs(origHeight - extHeight) > 1) {
    differences.push(`${prefix}height: ${origHeight} -> ${extHeight}`);
  }

  // 자식 노드 비교
  const origChildren = original.children || [];
  const extChildren = extracted.children || [];

  if (origChildren.length !== extChildren.length) {
    differences.push(`${prefix}children.length: ${origChildren.length} -> ${extChildren.length}`);
  }

  const minLen = Math.min(origChildren.length, extChildren.length);
  for (let i = 0; i < minLen; i++) {
    compareNodes(origChildren[i], extChildren[i], `${prefix}children[${i}]`, differences);
  }
}

/**
 * 스타일 속성 비교
 */
function compareStyleProperty(
  original: ComputedStyles,
  extracted: ComputedStyles,
  prop: keyof ComputedStyles,
  prefix: string,
  differences: string[]
) {
  const origVal = original[prop];
  const extVal = extracted[prop];

  // 숫자 비교 (허용 오차)
  if (typeof origVal === 'number' && typeof extVal === 'number') {
    if (Math.abs(origVal - extVal) > 0.1) {
      differences.push(`${prefix}styles.${prop}: ${origVal} -> ${extVal}`);
    }
    return;
  }

  // 문자열 비교
  if (origVal !== extVal) {
    differences.push(`${prefix}styles.${prop}: "${origVal}" -> "${extVal}"`);
  }
}

/**
 * 색상 비교 (허용 오차 0.02)
 */
function compareColor(original: RGBA | null | undefined, extracted: RGBA | null | undefined, path: string, differences: string[]) {
  if (!original && !extracted) return;
  if (!original || !extracted) {
    differences.push(`${path}: 색상 불일치`);
    return;
  }

  const tolerance = 0.02; // 색상 오차 허용
  if (Math.abs(original.r - extracted.r) > tolerance ||
      Math.abs(original.g - extracted.g) > tolerance ||
      Math.abs(original.b - extracted.b) > tolerance ||
      Math.abs(original.a - extracted.a) > tolerance) {
    differences.push(`${path}: rgba(${original.r.toFixed(2)},${original.g.toFixed(2)},${original.b.toFixed(2)},${original.a.toFixed(2)}) -> rgba(${extracted.r.toFixed(2)},${extracted.g.toFixed(2)},${extracted.b.toFixed(2)},${extracted.a.toFixed(2)})`);
  }
}
