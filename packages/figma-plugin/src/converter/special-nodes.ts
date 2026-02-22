import type { ExtractedNode, ComputedStyles } from '@sigma/shared';
import { createSolidPaint } from '../utils';
import { applyBackground, applyBorder, applyBorderOverlays, applyCornerRadius, applyPadding } from './styles';
import { createTextNode } from './node-creator';

/**
 * 폰트 weight 값을 Figma 폰트 스타일 문자열로 변환
 * createTextNode, createInputNode 등에서 공통 사용
 */
export function resolveFontStyle(weight: number): string {
  if (weight >= 700) return 'Bold';
  if (weight >= 600) return 'Semi Bold';
  if (weight >= 500) return 'Medium';
  return 'Regular';
}

/**
 * SVG 문자열에서 CSS 변수를 fallback 값으로 치환
 * Figma의 createNodeFromSvg()는 CSS 변수를 처리하지 못하므로
 * var(--name, fallback) → fallback 으로 변환
 */
export function resolveCssVariablesInSvg(svgString: string): string {
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
export function createSvgNode(node: ExtractedNode): FrameNode | null {
  if (!node.svgString) return null;

  try {
    // CSS 변수를 fallback 값으로 치환
    const processedSvg = resolveCssVariablesInSvg(node.svgString);

    // Figma API로 SVG 문자열을 노드로 변환
    const svgFrame = figma.createNodeFromSvg(processedSvg);

    // 라운드트립 보존: 원본 svgString을 pluginData에 저장
    // (createNodeFromSvg는 SVG를 네이티브 벡터로 변환하므로 재추출 시 원본 복구 불가)
    svgFrame.setPluginData('sigma:svg', node.svgString);

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
export function createImageNode(node: ExtractedNode): FrameNode {
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

/**
 * input 요소 (radio, checkbox, text 등) 시각적 렌더링
 * 네이티브 폼 컨트롤은 자식이 없어 빈 프레임이 되므로 별도 처리
 *
 * text input: 추출된 실제 CSS 스타일(배경, 테두리, 라운드)을 적용하고,
 * placeholder/value 텍스트를 자식 TextNode로 렌더링.
 * (하드코딩 스타일을 사용하면 래퍼 div 테두리와 합쳐져 이중 테두리 발생)
 */
export function createInputNode(node: ExtractedNode): FrameNode {
  const { styles, boundingRect, attributes } = node;
  const inputType = (attributes && attributes.type) ? attributes.type : 'text';

  const frame = figma.createFrame();
  const w = Math.max(boundingRect.width, 13);
  const h = Math.max(boundingRect.height, 13);
  frame.resize(w, h);

  if (inputType === 'radio') {
    // 라디오 버튼: 원형
    frame.cornerRadius = Math.round(w / 2);
    frame.strokes = [{ type: 'SOLID', color: { r: 0.55, g: 0.55, b: 0.55 } }];
    frame.strokeWeight = 1.5;
    frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  } else if (inputType === 'checkbox') {
    // 체크박스: 라운드 사각형
    frame.cornerRadius = 2;
    frame.strokes = [{ type: 'SOLID', color: { r: 0.55, g: 0.55, b: 0.55 } }];
    frame.strokeWeight = 1.5;
    frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  } else {
    // text input: 추출된 실제 스타일 사용 (이중 테두리 방지)
    applyBackground(frame, styles, false);
    applyBorder(frame, styles);
    applyCornerRadius(frame, styles);

    // placeholder 또는 value 텍스트 렌더링
    const value = attributes && attributes.value;
    const placeholder = attributes && attributes.placeholder;
    const displayText = value || placeholder;
    const isPlaceholder = !value && !!placeholder;

    if (displayText) {
      // Auto Layout으로 텍스트 수직 중앙 배치
      frame.layoutMode = 'HORIZONTAL';
      frame.counterAxisAlignItems = 'CENTER';
      frame.layoutSizingHorizontal = 'FIXED';
      frame.layoutSizingVertical = 'FIXED';
      applyPadding(frame, styles);

      const textNode = figma.createText();
      textNode.characters = displayText;
      textNode.fontSize = styles.fontSize || 14;

      const weight = parseInt(styles.fontWeight) || 400;
      textNode.fontName = { family: 'Inter', style: resolveFontStyle(weight) };

      if (isPlaceholder) {
        // placeholder: 회색 텍스트
        textNode.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
      } else if (styles.color) {
        textNode.fills = [createSolidPaint(styles.color)];
      }

      textNode.textAutoResize = 'WIDTH_AND_HEIGHT';
      frame.appendChild(textNode);
    }
  }

  frame.name = '[INPUT] ' + inputType;

  if (styles.opacity < 1) {
    frame.opacity = styles.opacity;
  }

  return frame;
}

/**
 * Pseudo-element (::before, ::after) 노드 생성
 * CSS pseudo-elements는 주로 장식 요소나 아이콘으로 사용됨
 */
export function createPseudoElementNode(node: ExtractedNode): FrameNode | TextNode | null {
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
