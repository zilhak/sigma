import type { ExtractedNode, ComputedStyles } from '@sigma/shared';
import { createSolidPaint } from '../utils';
import { applyBackground, applyBorder, applyBorderOverlays, applyCornerRadius, applyBoxShadow, applyPadding } from './styles';
import { applyLayoutMode, applySizingMode, applyAlignment, applyChildMargins, createGridLayout } from './layout';
import { createSvgNode, createImageNode, createInputNode, createPseudoElementNode, resolveFontStyle } from './special-nodes';

/**
 * 절대 배치(forceAbsolute/fallback) 시 자식 노드 크기 보정.
 *
 * 텍스트 노드는 폭을 boundingRect(브라우저 계측 폭)로 강제하면 안 된다.
 * Figma는 Inter를 쓰는데 원본 폰트(Pretendard 등)보다 글리프가 넓어,
 * 브라우저 폭으로 고정하면 꼬리 글자가 두 번째 줄로 wrap된다(예: "override →"의 →).
 * - WIDTH_AND_HEIGHT(자동 폭 단일 줄): 크기 강제 없이 자연 크기 유지
 * - HEIGHT(고정 폭 래핑): 폭만 맞추고 높이는 자동(Inter가 더 넓어 줄 수가 늘 수 있음)
 * - 그 외 노드(FRAME 등): 기존대로 boundingRect 폭·높이로 강제
 */
function resizeAbsoluteChild(childNode: SceneNode, rect: { width: number; height: number }): void {
  if (childNode.type === 'TEXT') {
    const textNode = childNode as TextNode;
    if (textNode.textAutoResize === 'HEIGHT') {
      textNode.resize(Math.max(rect.width, 1), textNode.height);
    }
    return;
  }
  if ('resize' in childNode) {
    childNode.resize(Math.max(rect.width, 1), Math.max(rect.height, 1));
  }
}

/**
 * ExtractedNode를 Figma 노드로 변환
 * @param node - 추출된 노드 데이터
 * @param isRoot - 루트(최상위) 노드 여부 (기본값: true)
 * @param forceAbsolute - true이면 Auto Layout 없이 boundingRect 기반 절대 배치
 */
export async function createFigmaNode(node: ExtractedNode, isRoot: boolean = true, forceAbsolute: boolean = false): Promise<FrameNode | TextNode | null> {
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
    const textNode = createTextNode(textContent, styles);
    // 컴포넌트 스펙의 slot 마커: data-sigma-slot → pluginData로 보존
    // (빌드 후 slot 이름 → TextNode 매핑에 사용)
    const slotName = node.attributes ? node.attributes['data-sigma-slot'] : undefined;
    if (textNode && slotName) {
      textNode.setPluginData('sigma-slot', slotName);
    }
    return textNode;
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

  if (forceAbsolute && children.length > 0) {
    // ── forceAbsolute 모드: 모든 자식을 boundingRect 기반 절대 배치 ──
    frame.layoutMode = 'NONE';

    // 부모 텍스트 콘텐츠 추가 (있는 경우)
    if (textContent) {
      const textNode = createTextNode(textContent, styles);
      if (textNode) {
        frame.appendChild(textNode);
      }
    }

    // 자식 노드를 boundingRect 기반으로 절대 배치 (재귀적으로 forceAbsolute)
    const parentRect = node.boundingRect;
    for (const child of children) {
      const childNode = await createFigmaNode(child, false, true);
      if (childNode) {
        frame.appendChild(childNode);
        if (child.boundingRect) {
          childNode.x = child.boundingRect.x - parentRect.x;
          childNode.y = child.boundingRect.y - parentRect.y;
          resizeAbsoluteChild(childNode, child.boundingRect);
        }
      }
    }
  } else if (isGridContainer && children.length > 0) {
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

          // 부모의 align-items: stretch 처리:
          // CSS에서 align-self: auto인 자식은 부모의 교차축을 채움.
          // Figma의 counterAxisAlignItems에는 STRETCH가 없으므로 자식 개별 설정으로 구현.
          // 단, 모든 자식에 무조건 적용하면 HUG/FIXED 크기가 깨지므로,
          // 자식의 교차축 크기가 부모 내부 교차축과 일치할 때만 적용 (실제 stretch된 경우).
          if (styles.alignItems === 'stretch' && child.boundingRect) {
            const isHorizontal = frame.layoutMode === 'HORIZONTAL';
            // STRETCH + 교차축 FILL을 적용하는 공통 처리
            const applyStretch = function() {
              childFrame.layoutAlign = 'STRETCH';
              // layoutAlign: STRETCH만으로는 부족 — sizing도 FILL로 설정해야 실제로 늘어남
              if ('layoutSizingVertical' in childFrame) {
                if (isHorizontal) {
                  (childFrame as any).layoutSizingVertical = 'FILL';
                } else {
                  (childFrame as any).layoutSizingHorizontal = 'FILL';
                }
              }
            };
            if (hasValidBoundingRect(children)) {
              // 익스텐션 추출 데이터: 실측 교차축 크기가 부모 내부 교차축과
              // 일치할 때만(실제 stretch된 경우만) 적용 — HUG/FIXED 자식 보호.
              const parentCross = isHorizontal ? node.boundingRect.height : node.boundingRect.width;
              const crossPadding = isHorizontal
                ? (styles.paddingTop + styles.paddingBottom + styles.borderTopWidth + styles.borderBottomWidth)
                : (styles.paddingLeft + styles.paddingRight + styles.borderLeftWidth + styles.borderRightWidth);
              const parentInnerCross = parentCross - crossPadding;
              const childCross = isHorizontal ? child.boundingRect.height : child.boundingRect.width;
              if (parentInnerCross > 0 && Math.abs(childCross - parentInnerCross) < 2) {
                applyStretch();
              }
            } else {
              // 손-HTML(boundingRect 무효): CSS align-items:stretch 의미론을 직접 적용.
              // CSS는 교차축 크기가 auto(미명시)인 자식만 stretch하므로,
              // 교차축 크기가 명시된 자식은 제외한다.
              const cs = child.styles;
              const childCrossSize = cs ? (isHorizontal ? cs.height : cs.width) : 'auto';
              if (typeof childCrossSize !== 'number') {
                applyStretch();
              }
            }
          }

          // block-level 자식이 부모 너비를 채우는 CSS 기본 동작 재현:
          // VERTICAL 레이아웃에서 block/flex/grid 자식의 width가 부모 내부 width와 일치하면
          // Figma에서 STRETCH로 설정하여 부모 너비에 맞춤.
          // (CSS에서 block 요소는 자연스럽게 부모 너비를 채우지만, 추출 시 computed width가
          //  고정 픽셀값으로 변환되어 이 정보가 손실됨)
          // 단, 부모의 counter-axis(width)가 FIXED일 때만 적용.
          // HUG 부모에 FILL 자식을 넣으면 순환 참조로 Figma API 에러 발생.
          const childStyles = child.styles;
          if (frame.layoutMode === 'VERTICAL'
              && frame.counterAxisSizingMode === 'FIXED'
              && child.boundingRect && childStyles) {
            const cd = childStyles.display;
            const isBlockLevel = cd === 'block' || cd === 'flex' || cd === 'inline-flex'
              || cd === 'grid' || cd === 'table' || cd === 'list-item';
            if (isBlockLevel) {
              const parentInnerWidth = node.boundingRect.width
                - styles.paddingLeft - styles.paddingRight
                - styles.borderLeftWidth - styles.borderRightWidth;
              if (parentInnerWidth > 0 && Math.abs(child.boundingRect.width - parentInnerWidth) < 2) {
                childFrame.layoutAlign = 'STRETCH';
                if (childFrame.type === 'FRAME' && 'layoutSizingHorizontal' in childFrame) {
                  childFrame.layoutSizingHorizontal = 'FILL';
                }
              }
            }
          }

          // table-cell: 행 내 공간을 균등 분배 (table-row 부모 또는 anonymous table box)
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
    // 단, min-width/min-height가 명시된 요소는 FIXED 유지 (HUG로 전환하면 명시적 크기 손실)
    if (!isRoot && frame.layoutMode !== 'NONE' &&
        styles.overflow !== 'hidden' && styles.overflow !== 'clip' &&
        styles.overflow !== 'scroll' && styles.overflow !== 'auto') {
      const hasExplicitMinSize = frame.layoutMode === 'HORIZONTAL'
        ? styles.minWidth > 0
        : styles.minHeight > 0;
      if (!hasExplicitMinSize) {
        frame.primaryAxisSizingMode = 'AUTO';
      }
    }
  }

  // ── Auto Layout 형상 검증 + boundingRect fallback ──
  // Auto Layout 적용 후 자식 노드의 실제 배치가 원본 boundingRect와 일치하는지 검증.
  // 허용 오차(3px) 초과 시 Auto Layout 해제 → boundingRect 기반 절대 배치로 fallback.
  // 단, boundingRect가 실측값이 아닌 손-HTML(rect=0)에서는 (0,0,0,0) 기준 검증이
  // 무조건 실패해 정상 Auto Layout까지 절대배치로 되돌려버리므로, 유효한 추출
  // 데이터일 때만 검증한다. 손-HTML은 Auto Layout 결과를 그대로 신뢰한다.
  if (frame.layoutMode !== 'NONE' && children.length > 0 && hasValidBoundingRect(children)) {
    const parentRect = node.boundingRect;
    const childEntries: Array<{ figmaNode: SceneNode; originalRect: { x: number; y: number; width: number; height: number } }> = [];

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!child.boundingRect) continue;

      // 부모의 boundingRect 기준 상대 좌표로 변환
      const relX = child.boundingRect.x - parentRect.x;
      const relY = child.boundingRect.y - parentRect.y;

      // Figma 프레임의 자식 중 대응하는 노드 찾기
      // 텍스트 콘텐츠가 있으면 자식 인덱스가 1만큼 밀림 (부모 텍스트 노드가 먼저 추가됨)
      const figmaIdx = textContent ? i + 1 : i;
      if (figmaIdx < frame.children.length) {
        childEntries.push({
          figmaNode: frame.children[figmaIdx],
          originalRect: { x: relX, y: relY, width: child.boundingRect.width, height: child.boundingRect.height },
        });
      }
    }

    if (childEntries.length > 0 && !validateLayoutFidelity(childEntries)) {
      fallbackToAbsoluteLayout(frame, childEntries);
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
 * Auto Layout 적용 후 형상 검증
 * 각 자식의 Figma 배치가 원본 boundingRect와 허용 오차(3px) 이내인지 확인
 */
function validateLayoutFidelity(
  entries: Array<{ figmaNode: SceneNode; originalRect: { x: number; y: number; width: number; height: number } }>
): boolean {
  var TOLERANCE = 3;

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var fn = entry.figmaNode;
    var rect = entry.originalRect;

    if (
      Math.abs(fn.x - rect.x) > TOLERANCE ||
      Math.abs(fn.y - rect.y) > TOLERANCE ||
      Math.abs(fn.width - rect.width) > TOLERANCE ||
      Math.abs(fn.height - rect.height) > TOLERANCE
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Auto Layout 해제 + boundingRect 기반 절대 배치로 fallback
 */
function fallbackToAbsoluteLayout(
  frame: FrameNode,
  entries: Array<{ figmaNode: SceneNode; originalRect: { x: number; y: number; width: number; height: number } }>
): void {
  frame.layoutMode = 'NONE';
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var fn = entry.figmaNode;
    var rect = entry.originalRect;
    fn.x = rect.x;
    fn.y = rect.y;
    resizeAbsoluteChild(fn, rect);
  }
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
 * 자식들의 boundingRect가 "실측된 추출 데이터"인지 판정.
 * Sigma 익스텐션 추출 데이터는 getBoundingClientRect() 실측값을 담지만,
 * 손으로 작성한 인라인 스타일 HTML은 대부분 boundingRect가 0이다.
 * 하나라도 0보다 큰 width/height가 있으면 유효한 추출 데이터로 간주한다.
 * 이 판정으로 boundingRect 의존 분기(형상검증·stretch 비교)를 게이팅하여,
 * 익스텐션 경로는 기존대로 동작시키고 손-HTML만 CSS 의미론에 위임한다.
 */
function hasValidBoundingRect(children: ExtractedNode[]): boolean {
  return children.some(function(child) {
    if (!child.boundingRect) return false;
    return child.boundingRect.width > 0 || child.boundingRect.height > 0;
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

  // min-width가 설정된 요소는 프레임으로 처리 (TextNode는 고정 너비 표현 불가)
  if (styles.minWidth > 0) return false;

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

  // 텍스트 자동 리사이즈 모드 설정
  if (styles.textWraps && typeof styles.width === 'number' && styles.width > 0) {
    // 원본에서 여러 줄로 래핑되던 텍스트: 고정폭 + HEIGHT auto-resize 로
    // Figma에서도 동일하게 줄바꿈시켜 박스 밖으로 삐져나가지 않게 한다.
    textNode.textAutoResize = 'HEIGHT';
    textNode.resize(styles.width, textNode.height);
  } else if (styles.textOverflow === 'ellipsis') {
    textNode.textTruncation = 'ENDING';
    textNode.textAutoResize = 'HEIGHT';
  } else {
    textNode.textAutoResize = 'WIDTH_AND_HEIGHT';
  }

  return textNode;
}
