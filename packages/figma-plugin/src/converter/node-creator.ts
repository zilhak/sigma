import type { ExtractedNode, ComputedStyles } from '@sigma/shared';
import { createSolidPaint } from '../utils';
import { applyBackground, applyBorder, applyBorderOverlays, applyCornerRadius, applyBoxShadow, applyPadding, applyChildMargins } from './styles';
import { applyLayoutMode, applySizingMode, applyAlignment, createGridLayout } from './layout';

/**
 * ExtractedNode를 Figma 노드로 변환
 * @param node - 추출된 노드 데이터
 * @param isRoot - 루트(최상위) 노드 여부 (기본값: true)
 */
export async function createFigmaNode(node: ExtractedNode, isRoot: boolean = true): Promise<FrameNode | TextNode | null> {
  const { styles, textContent, boundingRect } = node;
  const children = node.children || [];

  // SVG 요소인 경우: createNodeFromSvg 사용
  if (node.svgString && node.tagName === 'svg') {
    return createSvgNode(node);
  }

  // 이미지 요소 처리 (img, canvas)
  if (node.tagName === 'img' || node.tagName === 'canvas') {
    return createImageNode(node);
  }

  // Pseudo-element 처리 (::before, ::after)
  if (node.isPseudo || node.tagName === '::before' || node.tagName === '::after') {
    return createPseudoElementNode(node);
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

  // Grid 컨테이너인 경우 별도 처리
  const isGridContainer = styles.display === 'grid' || styles.display === 'inline-grid';

  // overflow → clipsContent: hidden/clip/scroll/auto면 클리핑, visible이면 해제
  if (styles.overflow === 'hidden' || styles.overflow === 'clip' ||
      styles.overflow === 'scroll' || styles.overflow === 'auto') {
    frame.clipsContent = true;
  } else {
    frame.clipsContent = false;
  }

  // 배경색 설정 (루트 프레임은 투명 배경을 흰색으로 대체)
  applyBackground(frame, styles, isRoot);

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

  if (isGridContainer && children.length > 0) {
    // ── CSS Grid → 중첩 Auto Layout 변환 ──
    // 패딩은 grid 부모에도 적용
    applyPadding(frame, styles);

    // 정렬 설정
    applyAlignment(frame, styles, children);

    // Grid 레이아웃 생성 (내부에서 layoutMode 설정)
    await createGridLayout(frame, node, isRoot, createFigmaNode);

    // Auto Layout 크기 모드 설정
    if (frame.layoutMode !== 'NONE') {
      applySizingMode(frame, styles, isRoot);
    }
  } else if (children.length > 0 && hasNegativeMargins(children)) {
    // ── 음수 마진 감지 → 절대 위치 배치 ──
    // Figma Auto Layout은 음수 간격/가변 간격을 지원하지 않으므로
    // boundingRect 기반으로 자식을 절대 위치에 배치
    frame.layoutMode = 'NONE';

    // 부모 텍스트 콘텐츠 추가 (있는 경우)
    if (textContent) {
      const textNode = createTextNode(textContent, styles);
      if (textNode) {
        frame.appendChild(textNode);
      }
    }

    // 자식 노드를 boundingRect 기반으로 절대 배치
    const parentRect = node.boundingRect;
    for (const child of children) {
      const childNode = await createFigmaNode(child, false);
      if (childNode) {
        frame.appendChild(childNode);
        childNode.x = child.boundingRect.x - parentRect.x;
        childNode.y = child.boundingRect.y - parentRect.y;
      }
    }
  } else {
    // ── 기존 Flex/Block 레이아웃 경로 ──
    // 레이아웃 모드 설정 (children 전달하여 inline-block 자식 감지)
    applyLayoutMode(frame, styles, children);

    // Auto Layout 크기 모드 설정 (FIXED가 아닌 적절한 모드 사용)
    if (frame.layoutMode !== 'NONE') {
      applySizingMode(frame, styles, isRoot);
    }

    // 정렬 설정 (children 전달하여 space-between 보정)
    applyAlignment(frame, styles, children);

    // 패딩 설정
    applyPadding(frame, styles);

    // 부모의 텍스트 콘텐츠 먼저 추가 (자식이 있어도 부모 텍스트가 있으면 추가)
    if (textContent) {
      const textNode = createTextNode(textContent, styles);
      if (textNode) {
        frame.appendChild(textNode);

        // table-cell 내부 텍스트: VERTICAL 레이아웃일 때만 셀 너비를 채워 textAlign 반영
        if (styles.display === 'table-cell' && frame.layoutMode === 'VERTICAL') {
          textNode.layoutAlign = 'STRETCH';
          textNode.textAutoResize = 'HEIGHT';
        }
      }
    }

    // 자식 노드 추가 (isRoot: false로 호출하여 투명 배경 유지)
    for (const child of children) {
      const childNode = await createFigmaNode(child, false);
      if (childNode) {
        frame.appendChild(childNode);

        // 부모의 정렬 설정에 따라 자식의 layoutAlign 설정
        // Figma에서 자식 요소가 부모의 정렬을 따르도록 명시적 설정
        if (frame.layoutMode !== 'NONE' && 'layoutAlign' in childNode) {
          const childFrame = childNode as FrameNode;

          // 부모가 center 정렬인 경우 자식도 center로 설정
          if (frame.counterAxisAlignItems === 'CENTER') {
            childFrame.layoutAlign = 'INHERIT';
          }

          // table-cell: 행 내 공간을 균등 분배 (table-row 부모 또는 anonymous table box)
          const childStyles = child.styles;
          if (childStyles && childStyles.display === 'table-cell') {
            childFrame.layoutGrow = 1;
            childFrame.layoutAlign = 'STRETCH';
          }

          // flexGrow 적용: CSS flex-grow > 0이면 Figma에서 FILL로 설정
          if (childStyles && childStyles.flexGrow > 0) {
            childFrame.layoutGrow = childStyles.flexGrow;
          }

          // alignSelf 적용: 개별 아이템의 교차축 정렬
          if (childStyles && childStyles.alignSelf) {
            switch (childStyles.alignSelf) {
              case 'center':
                childFrame.layoutAlign = 'CENTER';
                break;
              case 'flex-start':
              case 'start':
                childFrame.layoutAlign = 'MIN';
                break;
              case 'flex-end':
              case 'end':
                childFrame.layoutAlign = 'MAX';
                break;
              case 'stretch':
                childFrame.layoutAlign = 'STRETCH';
                break;
              // 'auto'나 다른 값은 부모의 alignItems를 따름 (INHERIT)
            }
          }

          // NOTE: 자동 중앙 정렬 휴리스틱 제거됨
          // 이전에 자식 위치 기반으로 CENTER를 강제 적용하는 로직이 있었으나,
          // 이는 원본 CSS 스타일을 무시하고 잘못된 정렬을 만들었음.
          // 이제는 원본 스타일의 justifyContent/alignItems만 반영함.
        }
      }
    }

    // 자식 요소의 CSS margin을 부모의 itemSpacing/padding으로 변환
    applyChildMargins(frame, children);
  }

  // 면별 다른 border 색상 처리 (Auto Layout + 자식 추가 후에 overlay 추가)
  applyBorderOverlays(frame, styles);

  return frame;
}

/**
 * 자식 중 음수 마진이 있는지 확인
 * 음수 마진은 CSS border-collapse 등에서 사용되며, Figma Auto Layout으로 표현 불가
 */
function hasNegativeMargins(children: ExtractedNode[]): boolean {
  return children.some(function(child) {
    const s = child.styles;
    if (!s) return false;
    return (s.marginLeft < 0) || (s.marginTop < 0) ||
           (s.marginRight < 0) || (s.marginBottom < 0);
  });
}

/**
 * 텍스트 전용 요소인지 확인
 */
export function isTextOnlyElement(node: ExtractedNode): boolean {
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
export function createTextNode(text: string, styles: ComputedStyles): TextNode | null {
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

  // 텍스트 자동 리사이즈 모드 설정 (텍스트 잘림 방지)
  // WIDTH_AND_HEIGHT: 텍스트 내용에 맞게 너비와 높이 자동 조정
  textNode.textAutoResize = 'WIDTH_AND_HEIGHT';

  return textNode;
}

/**
 * Pseudo-element (::before, ::after) 노드 생성
 * CSS pseudo-elements는 주로 장식 요소나 아이콘으로 사용됨
 */
function createPseudoElementNode(node: ExtractedNode): FrameNode | TextNode | null {
  const { styles, textContent, boundingRect } = node;

  // 텍스트 콘텐츠만 있는 경우 (예: content: "•" 같은 장식 문자)
  if (textContent && !hasVisualStyles(styles)) {
    return createTextNode(textContent, styles);
  }

  // 시각적 스타일이 있는 경우 프레임으로 생성
  const frame = figma.createFrame();
  frame.name = node.tagName; // '::before' 또는 '::after'

  // 크기 설정 (pseudo-element는 주로 고정 크기)
  const width = typeof styles.width === 'number' && styles.width > 0
    ? styles.width
    : boundingRect.width > 0 ? boundingRect.width : 16;
  const height = typeof styles.height === 'number' && styles.height > 0
    ? styles.height
    : boundingRect.height > 0 ? boundingRect.height : 16;

  frame.resize(Math.max(width, 1), Math.max(height, 1));

  // 배경색 적용
  if (styles.backgroundColor && styles.backgroundColor.a > 0) {
    frame.fills = [createSolidPaint(styles.backgroundColor)];
  } else {
    frame.fills = [];
  }

  // 테두리 적용
  applyBorder(frame, styles);

  // 모서리 라운드 적용
  applyCornerRadius(frame, styles);

  // 불투명도
  if (styles.opacity < 1) {
    frame.opacity = styles.opacity;
  }

  // 텍스트 콘텐츠가 있으면 내부에 추가
  if (textContent) {
    const textNode = createTextNode(textContent, styles);
    if (textNode) {
      frame.layoutMode = 'HORIZONTAL';
      // 원본 스타일의 textAlign을 반영
      switch (styles.textAlign) {
        case 'center':
          frame.primaryAxisAlignItems = 'CENTER';
          break;
        case 'right':
        case 'end':
          frame.primaryAxisAlignItems = 'MAX';
          break;
        default:
          // 'left', 'start', 기타: 좌측 정렬
          frame.primaryAxisAlignItems = 'MIN';
      }
      frame.counterAxisAlignItems = 'CENTER';
      frame.appendChild(textNode);
    }
  }

  // 면별 다른 border 색상 처리 (Auto Layout + 자식 추가 후에 overlay 추가)
  applyBorderOverlays(frame, styles);

  return frame;
}

/**
 * 시각적 스타일이 있는지 확인 (배경, 테두리 등)
 */
function hasVisualStyles(styles: ComputedStyles): boolean {
  // 배경색이 있는 경우
  if (styles.backgroundColor && styles.backgroundColor.a > 0) {
    return true;
  }

  // 테두리가 있는 경우
  if (styles.borderTopWidth > 0 || styles.borderRightWidth > 0 ||
      styles.borderBottomWidth > 0 || styles.borderLeftWidth > 0) {
    return true;
  }

  // 고정 크기가 있는 경우 (장식 박스일 수 있음)
  if (typeof styles.width === 'number' && styles.width > 0 &&
      typeof styles.height === 'number' && styles.height > 0) {
    return true;
  }

  return false;
}

/**
 * SVG 문자열에서 CSS 변수를 fallback 값으로 치환
 * Figma의 createNodeFromSvg()는 CSS 변수를 처리하지 못하므로
 * var(--name, fallback) → fallback 으로 변환
 */
function resolveCssVariablesInSvg(svgString: string): string {
  // var(--variable-name, fallback-value) 패턴 매칭
  // fallback 값에 괄호가 포함될 수 있으므로 (예: rgb()), 재귀적으로 처리
  let result = svgString;
  let prevResult = '';

  // 변경이 없을 때까지 반복 (중첩 var() 처리)
  while (result !== prevResult) {
    prevResult = result;
    // var( 뒤에 변수명, 그리고 fallback 값 추출
    result = result.replace(/var\(\s*--[^,)]+\s*,\s*([^)]+)\)/g, (match, fallback) => {
      // fallback 값이 또 다른 var()일 경우 재귀 처리됨
      return fallback.trim();
    });
  }

  return result;
}

/**
 * SVG 노드 생성
 * createNodeFromSvg는 SVG 문자열을 직접 Figma FrameNode로 변환
 */
function createSvgNode(node: ExtractedNode): FrameNode | null {
  if (!node.svgString) return null;

  try {
    // CSS 변수를 fallback 값으로 치환
    const processedSvg = resolveCssVariablesInSvg(node.svgString);

    // Figma API로 SVG 문자열을 노드로 변환
    const svgFrame = figma.createNodeFromSvg(processedSvg);

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

    // SVG 요소의 opacity 적용 (createNodeFromSvg가 root SVG의 opacity를 무시하므로)
    if (node.styles && node.styles.opacity) {
      const opacityVal = typeof node.styles.opacity === 'string'
        ? parseFloat(node.styles.opacity)
        : node.styles.opacity;
      if (!isNaN(opacityVal) && opacityVal < 1) {
        svgFrame.opacity = opacityVal;
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
 * 이미지/캔버스 요소 처리
 * imageDataUrl이 있으면 실제 이미지를 Figma에 렌더링, 없으면 플레이스홀더 생성
 */
function createImageNode(node: ExtractedNode): FrameNode {
  const { styles, boundingRect, attributes } = node;

  const frame = figma.createFrame();

  // 크기 설정 (styles > boundingRect > 기본값)
  const width = typeof styles.width === 'number' && styles.width > 0
    ? styles.width
    : boundingRect.width > 0 ? boundingRect.width : 100;
  const height = typeof styles.height === 'number' && styles.height > 0
    ? styles.height
    : boundingRect.height > 0 ? boundingRect.height : 100;

  frame.resize(Math.max(width, 1), Math.max(height, 1));

  // imageDataUrl이 있으면 실제 이미지 렌더링
  if (node.imageDataUrl) {
    try {
      // data:image/png;base64,xxxxx 에서 base64 부분만 추출
      const commaIndex = node.imageDataUrl.indexOf(',');
      if (commaIndex >= 0) {
        const base64Data = node.imageDataUrl.substring(commaIndex + 1);
        const imageBytes = figma.base64Decode(base64Data);
        const image = figma.createImage(imageBytes);
        frame.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
      } else {
        // base64 prefix 없는 경우 fallback
        frame.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 }, opacity: 1 }];
      }
    } catch (error) {
      console.error('이미지 생성 실패:', error);
      // 실패 시 플레이스홀더
      frame.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 }, opacity: 1 }];
      frame.strokes = [{ type: 'SOLID', color: { r: 0.7, g: 0.7, b: 0.7 }, opacity: 1 }];
      frame.strokeWeight = 1;
    }
  } else {
    // imageDataUrl 없으면 플레이스홀더
    frame.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 }, opacity: 1 }];
    frame.strokes = [{ type: 'SOLID', color: { r: 0.7, g: 0.7, b: 0.7 }, opacity: 1 }];
    frame.strokeWeight = 1;
  }

  // 이름 설정
  const alt = attributes && attributes.alt ? attributes.alt : '';
  const src = attributes && attributes.src ? attributes.src : '';
  const tagPrefix = node.tagName === 'canvas' ? '[CANVAS]' : '[IMG]';
  const imageName = alt || (src ? (src.split('/').pop() || 'image') : (node.tagName === 'canvas' ? 'canvas' : 'image'));
  frame.name = tagPrefix + ' ' + imageName;

  // 모서리 라운드 적용
  applyCornerRadius(frame, styles);

  // 불투명도
  if (styles.opacity < 1) {
    frame.opacity = styles.opacity;
  }

  return frame;
}
