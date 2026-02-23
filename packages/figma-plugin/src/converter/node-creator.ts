import type { ExtractedNode, ComputedStyles } from '@sigma/shared';
import { createSolidPaint } from '../utils';
import { applyBackground, applyBorder, applyBorderOverlays, applyCornerRadius, applyBoxShadow, applyPadding } from './styles';
import { applyLayoutMode, applySizingMode, applyAlignment, applyChildMargins, createGridLayout } from './layout';
import { createSvgNode, createImageNode, createInputNode, createPseudoElementNode, resolveFontStyle } from './special-nodes';

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

  // input 요소 처리 (radio, checkbox 등 네이티브 폼 컨트롤)
  if (node.tagName === 'input') {
    return createInputNode(node);
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
  } else if (children.length > 0 && hasAbsoluteChildren(children)) {
    // ── position: absolute 자식 감지 → 절대 위치 배치 ──
    // CSS absolute 요소는 document flow에서 빠지며, Figma Auto Layout으로 표현 불가.
    // 모든 자식을 boundingRect 기반으로 절대 배치
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

    // 프레임 크기를 자식의 실제 위치 기반으로 재조정
    // (absolute 자식이 부모 boundingRect 밖으로 나가는 경우 확장)
    let maxRight = width;
    let maxBottom = height;
    for (let i = 0; i < frame.children.length; i++) {
      const fChild = frame.children[i];
      maxRight = Math.max(maxRight, fChild.x + fChild.width);
      maxBottom = Math.max(maxBottom, fChild.y + fChild.height);
    }
    if (maxRight > width || maxBottom > height) {
      frame.resize(Math.max(maxRight, 1), Math.max(maxBottom, 1));
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

    // 프레임 크기를 자식의 실제 위치 기반으로 재조정
    let maxRight2 = width;
    let maxBottom2 = height;
    for (let i = 0; i < frame.children.length; i++) {
      const fChild = frame.children[i];
      maxRight2 = Math.max(maxRight2, fChild.x + fChild.width);
      maxBottom2 = Math.max(maxBottom2, fChild.y + fChild.height);
    }
    if (maxRight2 > width || maxBottom2 > height) {
      frame.resize(Math.max(maxRight2, 1), Math.max(maxBottom2, 1));
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

          // table-cell 부모의 block/flex 자식: CSS에서 셀 전체 너비를 채우므로 STRETCH 적용
          if (styles.display === 'table-cell' && frame.layoutMode === 'VERTICAL' && childStyles) {
            const cd = childStyles.display;
            if (cd === 'block' || cd === 'flex' || cd === 'inline-flex' || cd === 'grid') {
              childFrame.layoutAlign = 'STRETCH';
            }
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

    // overflow: visible인 Auto Layout 프레임에서,
    // Figma의 균일 itemSpacing이 브라우저의 가변 간격보다 커서
    // 콘텐츠가 프레임을 초과하는 경우 HUG 모드로 전환하여 프레임이 콘텐츠를 감싸도록 함
    if (!isRoot && frame.layoutMode !== 'NONE' &&
        styles.overflow !== 'hidden' && styles.overflow !== 'clip' &&
        styles.overflow !== 'scroll' && styles.overflow !== 'auto') {
      frame.primaryAxisSizingMode = 'AUTO';
    }
  }

  // strokesIncludedInLayout: layoutMode가 HORIZONTAL/VERTICAL일 때만 설정 가능
  // 원본 Figma 값이 있으면 그대로 복원, 없으면 CSS box-model 기본값(true) 사용
  if (frame.layoutMode !== 'NONE' && frame.strokes.length > 0) {
    const strokesAttr = node.attributes && node.attributes['data-figma-strokes-in-layout'];
    frame.strokesIncludedInLayout = strokesAttr !== undefined ? strokesAttr === 'true' : true;
  }

  // 면별 다른 border 색상 처리 (Auto Layout + 자식 추가 후에 overlay 추가)
  applyBorderOverlays(frame, styles);

  return frame;
}

/**
 * 자식 중 position: absolute가 있는지 확인
 * CSS absolute 요소는 document flow에서 빠지므로 Auto Layout으로 표현 불가.
 * 부모가 position: relative이고 자식이 absolute인 패턴 (캔버스, 오버레이 등) 감지.
 */
function hasAbsoluteChildren(children: ExtractedNode[]): boolean {
  return children.some(function(child) {
    const s = child.styles;
    if (!s) return false;
    return s.position === 'absolute';
  });
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

  // flex/grid 컨테이너는 프레임으로 처리 (내부 레이아웃 정보 유지 → 시각적 정렬 보존)
  const { styles } = node;
  if (styles.display === 'flex' || styles.display === 'inline-flex' || styles.display === 'grid') return false;

  // 배경색, 패딩, 테두리가 있으면 프레임으로 처리 (TextNode는 stroke 미지원)
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

  // 폰트 스타일 (resolveFontStyle 헬퍼 사용)
  const weight = parseInt(styles.fontWeight) || 400;
  textNode.fontName = { family: 'Inter', style: resolveFontStyle(weight) };

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
