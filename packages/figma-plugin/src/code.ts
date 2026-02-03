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
    case 'create-from-json':
      const position = msg.position as { x: number; y: number } | undefined;
      await createFrameFromJSON(msg.data as ExtractedNode, msg.name as string | undefined, position);
      break;

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
 * 레이아웃 모드 적용
 */
function applyLayoutMode(frame: FrameNode, styles: ComputedStyles) {
  const { display, flexDirection } = styles;

  if (display === 'flex' || display === 'inline-flex') {
    frame.layoutMode = flexDirection === 'column' ? 'VERTICAL' : 'HORIZONTAL';
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
    const borderColor =
      styles.borderTopColor ||
      styles.borderRightColor ||
      styles.borderBottomColor ||
      styles.borderLeftColor;

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
