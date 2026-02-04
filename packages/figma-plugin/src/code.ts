import type { ExtractedNode, ComputedStyles, RGBA } from '@sigma/shared';

// UI 표시
figma.showUI(__html__, { width: 320, height: 400 });

// 마지막 생성 위치 추적
let lastCreatedPosition: { x: number; y: number } | null = null;
const OFFSET_X = 20; // 다음 프레임 X 오프셋
const OFFSET_Y = 20; // 다음 프레임 Y 오프셋

// Plugin Data Key
const PLUGIN_DATA_KEY = 'sigma-file-key';

// 저장된 fileKey 가져오기
function getStoredFileKey(): string | null {
  const stored = figma.root.getPluginData(PLUGIN_DATA_KEY);
  return stored || null;
}

// fileKey 저장하기
function saveFileKey(fileKey: string) {
  figma.root.setPluginData(PLUGIN_DATA_KEY, fileKey);
}

// 유효한 fileKey 가져오기 (Figma API > 저장된 값)
function getEffectiveFileKey(): { fileKey: string | null; source: 'api' | 'stored' | 'none' } {
  if (figma.fileKey) {
    return { fileKey: figma.fileKey, source: 'api' };
  }
  const stored = getStoredFileKey();
  if (stored) {
    return { fileKey: stored, source: 'stored' };
  }
  return { fileKey: null, source: 'none' };
}

// 파일 정보 전달
function sendFileInfo() {
  const { fileKey, source } = getEffectiveFileKey();
  figma.ui.postMessage({
    type: 'file-info',
    fileKey,
    fileKeySource: source,
    storedFileKey: getStoredFileKey(),
    fileName: figma.root.name,
    pageId: figma.currentPage.id,
    pageName: figma.currentPage.name,
  });
}

// 초기 파일 정보 전달
sendFileInfo();

// 페이지 변경 시 업데이트
figma.on('currentpagechange', () => {
  sendFileInfo();
});

// 메시지 핸들러
figma.ui.onmessage = async (msg: { type: string; [key: string]: unknown }) => {
  switch (msg.type) {
    case 'create-from-json': {
      const position = msg.position as { x: number; y: number } | undefined;
      await createFrameFromJSON(msg.data as ExtractedNode, msg.name as string | undefined, position);
      break;
    }

    case 'create-from-html': {
      const htmlPosition = msg.position as { x: number; y: number } | undefined;
      await createFrameFromHTML(msg.data as string, msg.name as string | undefined, htmlPosition);
      break;
    }

    case 'get-frames':
      // 현재 페이지의 모든 최상위 프레임 정보 반환
      const frames = figma.currentPage.children
        .filter((node): node is FrameNode => node.type === 'FRAME')
        .map((frame) => ({
          id: frame.id,
          name: frame.name,
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height,
        }));
      figma.ui.postMessage({ type: 'frames-list', frames });
      break;

    case 'delete-frame':
      const nodeId = msg.nodeId as string;
      if (!nodeId) {
        figma.ui.postMessage({
          type: 'delete-result',
          success: false,
          error: 'nodeId가 필요합니다',
        });
        break;
      }

      const nodeToDelete = figma.getNodeById(nodeId);
      if (!nodeToDelete) {
        figma.ui.postMessage({
          type: 'delete-result',
          success: false,
          error: `노드를 찾을 수 없습니다: ${nodeId}`,
        });
        break;
      }

      const deletedName = nodeToDelete.name;
      nodeToDelete.remove();
      figma.ui.postMessage({
        type: 'delete-result',
        success: true,
        result: { nodeId, name: deletedName },
      });
      break;

    case 'get-file-info':
      sendFileInfo();
      break;

    case 'save-file-key':
      const newFileKey = msg.fileKey as string;
      if (newFileKey && newFileKey.trim()) {
        saveFileKey(newFileKey.trim());
        figma.ui.postMessage({ type: 'success', message: 'File Key가 저장되었습니다.' });
        // 저장 후 파일 정보 다시 전달
        sendFileInfo();
      } else {
        figma.ui.postMessage({ type: 'error', message: 'File Key를 입력해주세요.' });
      }
      break;

    case 'resize':
      const { width, height } = msg.data as { width: number; height: number };
      figma.ui.resize(width, height);
      break;

    case 'reset-position':
      lastCreatedPosition = null;
      figma.ui.postMessage({ type: 'info', message: '위치가 리셋되었습니다.' });
      break;

    case 'cancel':
      figma.closePlugin();
      break;
  }
};

/**
 * JSON 데이터로 Figma 프레임 생성
 */
async function createFrameFromJSON(node: ExtractedNode, name?: string, position?: { x: number; y: number }) {
  try {
    // 폰트 로드 (영문 + 한글)
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

    // 노드 생성
    const frame = await createFigmaNode(node);

    if (frame) {
      // 이름 설정
      frame.name = name || node.className || node.tagName;

      // 위치 결정: 명시적 좌표 > 이전 위치 오프셋 > 뷰포트 중앙
      if (position) {
        frame.x = position.x;
        frame.y = position.y;
      } else if (lastCreatedPosition) {
        frame.x = lastCreatedPosition.x + OFFSET_X;
        frame.y = lastCreatedPosition.y + OFFSET_Y;
      } else {
        const center = figma.viewport.center;
        frame.x = center.x - frame.width / 2;
        frame.y = center.y - frame.height / 2;
      }

      // 마지막 위치 저장
      lastCreatedPosition = { x: frame.x, y: frame.y };

      // 페이지에 추가
      figma.currentPage.appendChild(frame);
      figma.currentPage.selection = [frame];
      figma.viewport.scrollAndZoomIntoView([frame]);

      figma.ui.postMessage({ type: 'success', message: '프레임이 생성되었습니다!' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    figma.ui.postMessage({ type: 'error', message });
  }
}

/**
 * ExtractedNode를 Figma 노드로 변환
 */
async function createFigmaNode(node: ExtractedNode): Promise<FrameNode | TextNode | null> {
  const { styles, textContent, boundingRect } = node;
  const children = node.children || [];

  // SVG 요소인 경우: createNodeFromSvg 사용
  if (node.svgString && node.tagName === 'svg') {
    return createSvgNode(node);
  }

  // 텍스트만 있는 요소 (자식 없고 텍스트만)
  if (isTextOnlyElement(node)) {
    return createTextNode(textContent, styles);
  }

  // 프레임 생성
  const frame = figma.createFrame();

  // 크기 설정
  const width = typeof styles.width === 'number' ? styles.width : boundingRect.width;
  const height = typeof styles.height === 'number' ? styles.height : boundingRect.height;
  frame.resize(Math.max(width, 1), Math.max(height, 1));

  // 레이아웃 모드 설정
  applyLayoutMode(frame, styles);

  // Auto Layout에서 크기 고정 (HUG 방지)
  if (frame.layoutMode !== 'NONE') {
    frame.primaryAxisSizingMode = 'FIXED';
    frame.counterAxisSizingMode = 'FIXED';
  }

  // 정렬 설정
  applyAlignment(frame, styles);

  // 패딩 설정
  applyPadding(frame, styles);

  // 배경색 설정
  applyBackground(frame, styles);

  // 테두리 설정
  applyBorder(frame, styles);

  // 모서리 라운드 설정
  applyCornerRadius(frame, styles);

  // 그림자 설정
  applyBoxShadow(frame, styles);

  // 불투명도 설정
  if (styles.opacity < 1) {
    frame.opacity = styles.opacity;
  }

  // 부모의 텍스트 콘텐츠 먼저 추가 (자식이 있어도 부모 텍스트가 있으면 추가)
  if (textContent) {
    const textNode = createTextNode(textContent, styles);
    if (textNode) {
      frame.appendChild(textNode);
    }
  }

  // 자식 노드 추가
  for (const child of children) {
    const childNode = await createFigmaNode(child);
    if (childNode) {
      frame.appendChild(childNode);
    }
  }

  return frame;
}

/**
 * 텍스트 전용 요소인지 확인
 */
function isTextOnlyElement(node: ExtractedNode): boolean {
  const textTags = ['span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'label', 'strong', 'em', 'b', 'i'];

  if (!textTags.includes(node.tagName)) return false;
  if (node.children && node.children.length > 0) return false;
  if (!node.textContent) return false;

  // 배경색, 패딩, 테두리가 있으면 프레임으로 처리 (TextNode는 stroke 미지원)
  const { styles } = node;
  if (styles.backgroundColor && styles.backgroundColor.a > 0) return false;
  if (styles.paddingTop > 0 || styles.paddingBottom > 0) return false;
  if (styles.paddingLeft > 0 || styles.paddingRight > 0) return false;
  if (styles.borderTopWidth > 0 || styles.borderRightWidth > 0 ||
      styles.borderBottomWidth > 0 || styles.borderLeftWidth > 0) return false;

  return true;
}

/**
 * 텍스트 노드 생성
 */
function createTextNode(text: string, styles: ComputedStyles): TextNode | null {
  if (!text) return null;

  const textNode = figma.createText();
  textNode.characters = text;

  // 폰트 크기
  textNode.fontSize = styles.fontSize || 14;

  // 폰트 스타일
  const weight = parseInt(styles.fontWeight) || 400;
  let fontStyle = 'Regular';
  if (weight >= 700) fontStyle = 'Bold';
  else if (weight >= 600) fontStyle = 'Semi Bold';
  else if (weight >= 500) fontStyle = 'Medium';

  textNode.fontName = { family: 'Inter', style: fontStyle };

  // 텍스트 색상
  if (styles.color) {
    textNode.fills = [createSolidPaint(styles.color)];
  }

  // 줄 높이
  if (styles.lineHeight != null && styles.lineHeight > 0) {
    textNode.lineHeight = { value: styles.lineHeight, unit: 'PIXELS' };
  }

  // 자간
  if (styles.letterSpacing != null && styles.letterSpacing !== 0) {
    textNode.letterSpacing = { value: styles.letterSpacing, unit: 'PIXELS' };
  }

  // 텍스트 정렬
  switch (styles.textAlign) {
    case 'center':
      textNode.textAlignHorizontal = 'CENTER';
      break;
    case 'right':
      textNode.textAlignHorizontal = 'RIGHT';
      break;
    case 'justify':
      textNode.textAlignHorizontal = 'JUSTIFIED';
      break;
    default:
      textNode.textAlignHorizontal = 'LEFT';
  }

  return textNode;
}

/**
 * SVG 노드 생성
 * createNodeFromSvg는 SVG 문자열을 직접 Figma FrameNode로 변환
 */
function createSvgNode(node: ExtractedNode): FrameNode | null {
  if (!node.svgString) return null;

  try {
    // Figma API로 SVG 문자열을 노드로 변환
    const svgFrame = figma.createNodeFromSvg(node.svgString);

    // 위치 및 크기는 SVG 자체에서 결정됨
    // 필요시 boundingRect로 크기 조정
    if (node.boundingRect.width > 0 && node.boundingRect.height > 0) {
      const currentWidth = svgFrame.width;
      const currentHeight = svgFrame.height;
      const targetWidth = node.boundingRect.width;
      const targetHeight = node.boundingRect.height;

      // SVG 크기가 추출된 크기와 다르면 스케일 조정
      if (Math.abs(currentWidth - targetWidth) > 1 || Math.abs(currentHeight - targetHeight) > 1) {
        svgFrame.resize(targetWidth, targetHeight);
      }
    }

    return svgFrame;
  } catch (error) {
    console.error('SVG 변환 실패:', error);
    // SVG 변환 실패 시 빈 프레임 반환
    const fallbackFrame = figma.createFrame();
    fallbackFrame.resize(
      node.boundingRect.width || 24,
      node.boundingRect.height || 24
    );
    fallbackFrame.name = 'SVG (변환 실패)';
    return fallbackFrame;
  }
}

/**
 * 레이아웃 모드 적용
 */
function applyLayoutMode(frame: FrameNode, styles: ComputedStyles) {
  const { display, flexDirection } = styles;

  if (display === 'flex' || display === 'inline-flex') {
    frame.layoutMode = flexDirection === 'column' ? 'VERTICAL' : 'HORIZONTAL';
  } else if (display === 'grid' || display === 'inline-grid') {
    // CSS Grid는 기본적으로 행(row) 방향으로 아이템을 배치
    // grid-auto-flow: column인 경우 VERTICAL이지만, 기본값은 HORIZONTAL
    frame.layoutMode = 'HORIZONTAL';
  } else if (display === 'table' || display === 'table-row-group') {
    frame.layoutMode = 'VERTICAL';
  } else if (display === 'table-row') {
    frame.layoutMode = 'HORIZONTAL';
  } else if (display === 'inline' || display === 'inline-block') {
    frame.layoutMode = 'HORIZONTAL';
  } else {
    // block 등 기본값
    frame.layoutMode = 'VERTICAL';
  }

  // 갭 설정
  if (styles.gap > 0) {
    frame.itemSpacing = styles.gap;
  }
}

/**
 * 정렬 적용
 */
function applyAlignment(frame: FrameNode, styles: ComputedStyles) {
  const { justifyContent, alignItems } = styles;

  // 주축 정렬
  switch (justifyContent) {
    case 'center':
      frame.primaryAxisAlignItems = 'CENTER';
      break;
    case 'flex-end':
    case 'end':
      frame.primaryAxisAlignItems = 'MAX';
      break;
    case 'space-between':
      frame.primaryAxisAlignItems = 'SPACE_BETWEEN';
      break;
    default:
      frame.primaryAxisAlignItems = 'MIN';
  }

  // 교차축 정렬
  switch (alignItems) {
    case 'center':
      frame.counterAxisAlignItems = 'CENTER';
      break;
    case 'flex-end':
    case 'end':
      frame.counterAxisAlignItems = 'MAX';
      break;
    default:
      frame.counterAxisAlignItems = 'MIN';
  }
}

/**
 * 패딩 적용
 */
function applyPadding(frame: FrameNode, styles: ComputedStyles) {
  frame.paddingTop = styles.paddingTop || 0;
  frame.paddingRight = styles.paddingRight || 0;
  frame.paddingBottom = styles.paddingBottom || 0;
  frame.paddingLeft = styles.paddingLeft || 0;
}

/**
 * 배경색 적용
 */
function applyBackground(frame: FrameNode, styles: ComputedStyles) {
  if (styles.backgroundColor && styles.backgroundColor.a > 0) {
    frame.fills = [createSolidPaint(styles.backgroundColor)];
  } else {
    frame.fills = [];
  }
}

/**
 * 테두리 적용
 */
function applyBorder(frame: FrameNode, styles: ComputedStyles) {
  const borderWidth = Math.max(
    styles.borderTopWidth || 0,
    styles.borderRightWidth || 0,
    styles.borderBottomWidth || 0,
    styles.borderLeftWidth || 0
  );

  if (borderWidth > 0) {
    // 개별 border 색상들을 수집
    const borderColors = [
      styles.borderTopColor,
      styles.borderRightColor,
      styles.borderBottomColor,
      styles.borderLeftColor
    ].filter(Boolean) as RGBA[];

    // 가장 불투명한 색상 선택 (스피너 등에서 주요 색상 표시)
    // Figma는 면별 stroke 색상을 지원하지 않으므로 가장 의미있는 색상 선택
    let borderColor = borderColors[0];
    if (borderColors.length > 1) {
      // 불투명도가 가장 높은 색상 선택
      borderColor = borderColors.reduce((best, current) => {
        const bestAlpha = best && best.a !== undefined ? best.a : 0;
        const currentAlpha = current && current.a !== undefined ? current.a : 0;
        return currentAlpha > bestAlpha ? current : best;
      }, borderColors[0]);
    }

    if (borderColor) {
      frame.strokes = [createSolidPaint(borderColor)];
      frame.strokeWeight = borderWidth;
    }
  }
}

/**
 * 모서리 라운드 적용
 */
function applyCornerRadius(frame: FrameNode, styles: ComputedStyles) {
  const { borderTopLeftRadius, borderTopRightRadius, borderBottomRightRadius, borderBottomLeftRadius } = styles;

  // 모두 같은 경우
  if (
    borderTopLeftRadius === borderTopRightRadius &&
    borderTopRightRadius === borderBottomRightRadius &&
    borderBottomRightRadius === borderBottomLeftRadius
  ) {
    frame.cornerRadius = borderTopLeftRadius || 0;
  } else {
    // 개별 설정
    frame.topLeftRadius = borderTopLeftRadius || 0;
    frame.topRightRadius = borderTopRightRadius || 0;
    frame.bottomRightRadius = borderBottomRightRadius || 0;
    frame.bottomLeftRadius = borderBottomLeftRadius || 0;
  }
}

/**
 * 그림자 적용 (다중 그림자 지원)
 */
function applyBoxShadow(frame: FrameNode, styles: ComputedStyles) {
  const { boxShadow } = styles;

  if (!boxShadow || boxShadow === 'none') return;

  const shadows = parseBoxShadows(boxShadow);
  if (shadows.length > 0) {
    frame.effects = shadows;
  }
}

/**
 * 다중 box-shadow CSS 파싱
 */
function parseBoxShadows(shadowStr: string): DropShadowEffect[] {
  const effects: DropShadowEffect[] = [];

  // 쉼표로 구분된 다중 그림자 분리 (rgba 내부의 쉼표 제외)
  const shadowParts = splitShadows(shadowStr);

  for (const part of shadowParts) {
    const shadow = parseSingleShadow(part.trim());
    if (shadow) {
      effects.push(shadow);
    }
  }

  return effects;
}

/**
 * 다중 그림자 문자열 분리 (rgba 내부 쉼표 무시)
 */
function splitShadows(shadowStr: string): string[] {
  const results: string[] = [];
  let current = '';
  let parenDepth = 0;

  for (const char of shadowStr) {
    if (char === '(') parenDepth++;
    else if (char === ')') parenDepth--;
    else if (char === ',' && parenDepth === 0) {
      results.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    results.push(current.trim());
  }

  return results;
}

/**
 * 단일 box-shadow 파싱
 */
function parseSingleShadow(shadowStr: string): DropShadowEffect | null {
  // "rgba(0, 0, 0, 0.1) 0px 4px 6px 0px" 또는 "0px 4px 6px rgba(0, 0, 0, 0.1)" 형식

  // 색상 먼저 추출
  const colorMatch = shadowStr.match(/rgba?\s*\([^)]+\)/);
  if (!colorMatch) return null;

  const colorStr = colorMatch[0];
  const color = parseColorFromCSS(colorStr);
  if (!color) return null;

  // 색상 제거 후 숫자만 추출
  const numbersStr = shadowStr.replace(colorStr, '').trim();
  const numbers = numbersStr.match(/-?[\d.]+/g);

  if (!numbers || numbers.length < 2) return null;

  const offsetX = parseFloat(numbers[0]) || 0;
  const offsetY = parseFloat(numbers[1]) || 0;
  const blur = parseFloat(numbers[2]) || 0;
  const spread = parseFloat(numbers[3]) || 0;

  return {
    type: 'DROP_SHADOW',
    color: { r: color.r, g: color.g, b: color.b, a: color.a },
    offset: { x: offsetX, y: offsetY },
    radius: blur,
    spread: spread,
    visible: true,
    blendMode: 'NORMAL',
  };
}

/**
 * CSS 색상 문자열 파싱
 */
function parseColorFromCSS(colorStr: string): RGBA | null {
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
 * Solid Paint 생성
 */
function createSolidPaint(color: RGBA): SolidPaint {
  return {
    type: 'SOLID',
    color: { r: color.r, g: color.g, b: color.b },
    opacity: color.a,
  };
}

// ============================================================
// HTML → Figma 변환
// ============================================================

/**
 * HTML 문자열로 Figma 프레임 생성
 */
async function createFrameFromHTML(html: string, name?: string, position?: { x: number; y: number }) {
  try {
    // 폰트 로드
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

    // HTML 파싱 → ExtractedNode 변환
    const node = parseHTML(html);
    if (!node) {
      figma.ui.postMessage({ type: 'error', message: 'HTML 파싱 실패' });
      return;
    }

    // 기존 JSON 변환 로직 재사용
    const frame = await createFigmaNode(node);

    if (frame) {
      frame.name = name || 'HTML Import';

      // 위치 결정
      if (position) {
        frame.x = position.x;
        frame.y = position.y;
      } else if (lastCreatedPosition) {
        frame.x = lastCreatedPosition.x + OFFSET_X;
        frame.y = lastCreatedPosition.y + OFFSET_Y;
      } else {
        const center = figma.viewport.center;
        frame.x = center.x - frame.width / 2;
        frame.y = center.y - frame.height / 2;
      }

      lastCreatedPosition = { x: frame.x, y: frame.y };

      figma.currentPage.appendChild(frame);
      figma.currentPage.selection = [frame];
      figma.viewport.scrollAndZoomIntoView([frame]);

      figma.ui.postMessage({ type: 'success', message: 'HTML에서 프레임이 생성되었습니다!' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    figma.ui.postMessage({ type: 'error', message: `HTML 변환 오류: ${message}` });
  }
}

/**
 * HTML 문자열을 ExtractedNode로 파싱
 * Figma Plugin 환경에서는 DOMParser가 없으므로 간단한 파서 구현
 */
function parseHTML(html: string): ExtractedNode | null {
  let cleaned = html.trim();
  if (!cleaned) return null;

  // DOCTYPE 제거
  cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, '');

  // HTML 주석 제거
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // CDATA 섹션 제거
  cleaned = cleaned.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');

  cleaned = cleaned.trim();
  if (!cleaned) return null;

  return parseElement(cleaned, 0).node;
}

/**
 * HTML 엔티티 디코딩
 */
function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&copy;': '\u00A9',      // ©
    '&reg;': '\u00AE',       // ®
    '&trade;': '\u2122',     // ™
    '&mdash;': '\u2014',     // —
    '&ndash;': '\u2013',     // –
    '&hellip;': '\u2026',    // …
    '&lsquo;': '\u2018',     // '
    '&rsquo;': '\u2019',     // '
    '&ldquo;': '\u201C',     // "
    '&rdquo;': '\u201D',     // "
    '&bull;': '\u2022',      // •
    '&middot;': '\u00B7',    // ·
  };

  let result = text;

  // Named entities
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'gi'), char);
  }

  // Numeric entities (&#123; or &#x7B;)
  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));

  return result;
}

interface ParseResult {
  node: ExtractedNode | null;
  endIndex: number;
}

/**
 * 고유 ID 생성
 */
let nodeIdCounter = 0;
function generateNodeId(): string {
  return `html-node-${Date.now()}-${++nodeIdCounter}`;
}

/**
 * HTML 요소 파싱 (재귀)
 */
function parseElement(html: string, startIndex: number): ParseResult {
  const rest = html.slice(startIndex);

  // 텍스트 노드 (태그 아님)
  if (!rest.startsWith('<') || rest.startsWith('</')) {
    const textEnd = rest.indexOf('<');
    const text = textEnd === -1 ? rest : rest.slice(0, textEnd);
    const trimmedText = decodeHTMLEntities(text.trim());

    if (trimmedText) {
      return {
        node: {
          id: generateNodeId(),
          tagName: 'span',
          className: '',
          textContent: trimmedText,
          attributes: {},
          styles: createDefaultStyles(),
          boundingRect: { x: 0, y: 0, width: 0, height: 0 },
          children: [],
        },
        endIndex: startIndex + (textEnd === -1 ? text.length : textEnd),
      };
    }
    return { node: null, endIndex: startIndex + (textEnd === -1 ? text.length : textEnd) };
  }

  // 시작 태그 파싱
  const tagMatch = rest.match(/^<(\w+)([^>]*)>/);
  if (!tagMatch) {
    return { node: null, endIndex: startIndex + 1 };
  }

  const tagName = tagMatch[1].toLowerCase();
  const attrsString = tagMatch[2];
  const afterOpenTag = startIndex + tagMatch[0].length;

  // 자기 종료 태그 체크 (br, img, input 등)
  const selfClosingTags = ['br', 'hr', 'img', 'input', 'meta', 'link'];
  if (selfClosingTags.includes(tagName) || attrsString.endsWith('/')) {
    return {
      node: {
        id: generateNodeId(),
        tagName,
        className: extractClass(attrsString),
        textContent: '',
        attributes: extractAttributes(attrsString),
        styles: parseInlineStyles(attrsString),
        boundingRect: { x: 0, y: 0, width: 0, height: 0 },
        children: [],
      },
      endIndex: afterOpenTag,
    };
  }

  // 자식 노드 파싱
  const children: ExtractedNode[] = [];
  let textContent = '';
  let currentIndex = afterOpenTag;
  const closingTag = `</${tagName}>`;

  while (currentIndex < html.length) {
    const remaining = html.slice(currentIndex);

    // 종료 태그 발견
    if (remaining.toLowerCase().startsWith(closingTag)) {
      break;
    }

    // 다음 태그 또는 텍스트
    if (remaining.startsWith('<') && !remaining.startsWith('</')) {
      const childResult = parseElement(html, currentIndex);
      if (childResult.node) {
        children.push(childResult.node);
      }
      currentIndex = childResult.endIndex;
    } else if (remaining.startsWith('</')) {
      // 다른 종료 태그 (잘못된 HTML)
      break;
    } else {
      // 텍스트 노드
      const nextTagIndex = remaining.indexOf('<');
      const text = nextTagIndex === -1 ? remaining : remaining.slice(0, nextTagIndex);
      const trimmedText = decodeHTMLEntities(text.trim());
      if (trimmedText) {
        textContent += (textContent ? ' ' : '') + trimmedText;
      }
      currentIndex += text.length;
    }
  }

  // 종료 태그 이후 인덱스
  const closingTagIndex = html.toLowerCase().indexOf(closingTag, currentIndex);
  const endIndex = closingTagIndex === -1 ? html.length : closingTagIndex + closingTag.length;

  return {
    node: {
      id: generateNodeId(),
      tagName,
      className: extractClass(attrsString),
      textContent: children.length === 0 ? textContent : '',
      attributes: extractAttributes(attrsString),
      styles: parseInlineStyles(attrsString),
      boundingRect: extractBoundingFromStyle(attrsString),
      children,
    },
    endIndex,
  };
}

/**
 * class 속성 추출
 */
function extractClass(attrsString: string): string {
  const match = attrsString.match(/class\s*=\s*["']([^"']*)["']/i);
  return match ? match[1] : '';
}

/**
 * 모든 속성 추출
 */
function extractAttributes(attrsString: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  // 속성 매칭: name="value" 또는 name='value' 또는 name=value
  const attrRegex = /(\w[\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let match;

  while ((match = attrRegex.exec(attrsString)) !== null) {
    const name = match[1].toLowerCase();
    // ES2017 호환: ?? 대신 || 사용 (빈 문자열도 falsy이므로 마지막에 '' 처리)
    const value = match[2] !== undefined ? match[2]
                : match[3] !== undefined ? match[3]
                : match[4] !== undefined ? match[4]
                : '';
    // style과 class는 별도 처리하므로 제외
    if (name !== 'style' && name !== 'class') {
      attributes[name] = decodeHTMLEntities(value);
    }
  }

  return attributes;
}

/**
 * inline style 파싱
 */
function parseInlineStyles(attrsString: string): ComputedStyles {
  const styles = createDefaultStyles();
  const styleMatch = attrsString.match(/style\s*=\s*["']([^"']*)["']/i);

  if (!styleMatch) return styles;

  const styleStr = styleMatch[1];
  const rules = styleStr.split(';').filter(Boolean);

  for (const rule of rules) {
    const [prop, value] = rule.split(':').map((s) => s.trim());
    if (!prop || !value) continue;

    const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    applyStyleProperty(styles, camelProp, value);
  }

  return styles;
}

/**
 * 스타일 속성 적용
 */
function applyStyleProperty(styles: ComputedStyles, prop: string, value: string) {
  const numValue = parseFloat(value);

  switch (prop) {
    case 'width':
      styles.width = numValue || 0;
      break;
    case 'height':
      styles.height = numValue || 0;
      break;
    case 'backgroundColor':
    case 'background':
      if (value.includes('rgb') || value.includes('#')) {
        styles.backgroundColor = parseCSSColor(value);
      }
      break;
    case 'color':
      styles.color = parseCSSColor(value);
      break;
    case 'fontSize':
      styles.fontSize = numValue || 14;
      break;
    case 'fontWeight':
      styles.fontWeight = value;
      break;
    case 'lineHeight':
      styles.lineHeight = numValue || 0;
      break;
    case 'letterSpacing':
      styles.letterSpacing = numValue || 0;
      break;
    case 'textAlign':
      styles.textAlign = value;
      break;
    case 'display':
      styles.display = value;
      break;
    case 'flexDirection':
      styles.flexDirection = value;
      break;
    case 'justifyContent':
      styles.justifyContent = value;
      break;
    case 'alignItems':
      styles.alignItems = value;
      break;
    case 'gap':
      styles.gap = numValue || 0;
      break;
    case 'padding':
      const paddings = parseSpacing(value);
      styles.paddingTop = paddings[0];
      styles.paddingRight = paddings[1];
      styles.paddingBottom = paddings[2];
      styles.paddingLeft = paddings[3];
      break;
    case 'paddingTop':
      styles.paddingTop = numValue || 0;
      break;
    case 'paddingRight':
      styles.paddingRight = numValue || 0;
      break;
    case 'paddingBottom':
      styles.paddingBottom = numValue || 0;
      break;
    case 'paddingLeft':
      styles.paddingLeft = numValue || 0;
      break;
    case 'borderRadius':
      const radii = parseSpacing(value);
      styles.borderTopLeftRadius = radii[0];
      styles.borderTopRightRadius = radii[1];
      styles.borderBottomRightRadius = radii[2];
      styles.borderBottomLeftRadius = radii[3];
      break;
    case 'borderWidth':
      const bw = numValue || 0;
      styles.borderTopWidth = bw;
      styles.borderRightWidth = bw;
      styles.borderBottomWidth = bw;
      styles.borderLeftWidth = bw;
      break;
    case 'borderColor':
      const bc = parseCSSColor(value);
      styles.borderTopColor = bc;
      styles.borderRightColor = bc;
      styles.borderBottomColor = bc;
      styles.borderLeftColor = bc;
      break;
    case 'opacity':
      styles.opacity = numValue || 1;
      break;
    case 'boxShadow':
      styles.boxShadow = value;
      break;
  }
}

/**
 * CSS 색상 파싱 (hex, rgb, rgba)
 */
function parseCSSColor(colorStr: string): RGBA {
  // rgba
  const rgbaMatch = colorStr.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    return {
      r: parseFloat(rgbaMatch[1]) / 255,
      g: parseFloat(rgbaMatch[2]) / 255,
      b: parseFloat(rgbaMatch[3]) / 255,
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
    };
  }

  // hex
  const hexMatch = colorStr.match(/#([0-9a-fA-F]{3,8})/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16) / 255,
        g: parseInt(hex[1] + hex[1], 16) / 255,
        b: parseInt(hex[2] + hex[2], 16) / 255,
        a: 1,
      };
    } else if (hex.length >= 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255,
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
  }

  // 기본값 (투명)
  return { r: 0, g: 0, b: 0, a: 0 };
}

/**
 * CSS spacing 값 파싱 (padding, margin, border-radius)
 */
function parseSpacing(value: string): [number, number, number, number] {
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
function extractBoundingFromStyle(attrsString: string): { x: number; y: number; width: number; height: number } {
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
function createDefaultStyles(): ComputedStyles {
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
