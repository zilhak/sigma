import type { ComputedStyles, ExtractedNode } from '@sigma/shared';

// Grid 관련 함수/타입은 grid.ts에서 re-export
export { parseGridTemplate, parseGridPlacement, assignChildrenToGrid, createGridLayout } from './grid';
export type { GridTrack, GridCell } from './grid';

/**
 * Auto Layout 크기 모드 설정
 * CSS의 width/height 값에 따라 FIXED, HUG, 또는 FILL 모드 적용
 */
export function applySizingMode(frame: FrameNode, styles: ComputedStyles, isRoot: boolean) {
  const { width, height } = styles;

  // 루트 프레임은 항상 FIXED (전체 크기 유지)
  if (isRoot) {
    frame.primaryAxisSizingMode = 'FIXED';
    frame.counterAxisSizingMode = 'FIXED';
    return;
  }

  // 가로(primary/counter) 설정
  // width: auto → HUG (콘텐츠에 맞춤)
  // width: 100% → FILL (부모에 맞춤) - Figma에서는 layoutGrow로 처리
  // width: number → FIXED
  if (width === 'auto') {
    // HORIZONTAL 레이아웃이면 primaryAxis가 width
    if (frame.layoutMode === 'HORIZONTAL') {
      frame.primaryAxisSizingMode = 'AUTO'; // HUG
    } else {
      frame.counterAxisSizingMode = 'AUTO'; // HUG
    }
  } else {
    if (frame.layoutMode === 'HORIZONTAL') {
      frame.primaryAxisSizingMode = 'FIXED';
    } else {
      frame.counterAxisSizingMode = 'FIXED';
    }
  }

  // height 설정
  if (height === 'auto') {
    if (frame.layoutMode === 'VERTICAL') {
      frame.primaryAxisSizingMode = 'AUTO'; // HUG
    } else {
      frame.counterAxisSizingMode = 'AUTO'; // HUG
    }
  } else {
    if (frame.layoutMode === 'VERTICAL') {
      frame.primaryAxisSizingMode = 'FIXED';
    } else {
      frame.counterAxisSizingMode = 'FIXED';
    }
  }
}

/**
 * 레이아웃 모드 적용
 * @param frame - Figma 프레임
 * @param styles - 부모 스타일
 * @param children - 자식 노드 배열 (선택, inline-block 자식 감지용)
 */
export function applyLayoutMode(frame: FrameNode, styles: ComputedStyles, children?: ExtractedNode[]) {
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
  } else if (display === 'table-cell') {
    // 테이블 셀: 인라인 자식(inline, inline-block, inline-flex)이 있으면 가로 배치
    const hasInlineChildren = children && children.length > 0 && children.some(
      child => child.styles && (
        child.styles.display === 'inline-block' ||
        child.styles.display === 'inline' ||
        child.styles.display === 'inline-flex'
      )
    );
    frame.layoutMode = hasInlineChildren ? 'HORIZONTAL' : 'VERTICAL';
  } else if (display === 'inline' || display === 'inline-block') {
    frame.layoutMode = 'HORIZONTAL';
  } else {
    // block 등 기본값 → VERTICAL
    // table-cell 자식 감지: CSS anonymous table box 모방 (가로 배치)
    const hasTableCellChildren = children && children.length > 0 && children.some(
      child => child.styles && child.styles.display === 'table-cell'
    );

    if (hasTableCellChildren) {
      frame.layoutMode = 'HORIZONTAL';
    } else {
      // inline 자식만 있으면 HORIZONTAL (CSS 인라인 흐름 모방)
      // block 자식이 섞여 있으면 VERTICAL 유지 (CSS anonymous block box)
      const hasInlineChildren = children && children.length > 0 && children.some(
        child => child.styles && (child.styles.display === 'inline-block' || child.styles.display === 'inline' || child.styles.display === 'inline-flex')
      );
      const hasBlockChildren = children && children.length > 0 && children.some(
        child => child.styles && (
          child.styles.display === 'block' || child.styles.display === 'flex' ||
          child.styles.display === 'grid' || child.styles.display === 'table' ||
          child.styles.display === 'list-item'
        )
      );

      if (hasInlineChildren && !hasBlockChildren) {
        frame.layoutMode = 'HORIZONTAL';
      } else {
        frame.layoutMode = 'VERTICAL';
      }
    }
  }

  // flexWrap 설정 (Auto Layout이 활성화된 경우에만)
  if (frame.layoutMode !== 'NONE' && styles.flexWrap === 'wrap') {
    frame.layoutWrap = 'WRAP';
  }

  // 갭 설정 - rowGap/columnGap이 있으면 우선 사용, 없으면 gap 사용
  if (frame.layoutMode !== 'NONE') {
    // Figma에서 itemSpacing은 주축 방향 간격
    // counterAxisSpacing은 교차축 방향 간격 (wrap 모드에서만 유효)
    const mainAxisGap = frame.layoutMode === 'HORIZONTAL'
      ? (styles.columnGap > 0 ? styles.columnGap : styles.gap)
      : (styles.rowGap > 0 ? styles.rowGap : styles.gap);

    const crossAxisGap = frame.layoutMode === 'HORIZONTAL'
      ? (styles.rowGap > 0 ? styles.rowGap : styles.gap)
      : (styles.columnGap > 0 ? styles.columnGap : styles.gap);

    if (mainAxisGap > 0) {
      frame.itemSpacing = mainAxisGap;
    }

    // counterAxisSpacing은 wrap 모드에서만 적용
    if (frame.layoutWrap === 'WRAP' && crossAxisGap > 0) {
      frame.counterAxisSpacing = crossAxisGap;
    }

    // border-spacing → itemSpacing (테이블 전용 fallback)
    if (frame.itemSpacing === 0 || frame.itemSpacing === undefined) {
      const isTableVertical = display === 'table' || display === 'table-row-group'
        || display === 'table-header-group' || display === 'table-footer-group';
      const isTableHorizontal = display === 'table-row';

      if (isTableVertical && styles.borderSpacingY > 0) {
        frame.itemSpacing = styles.borderSpacingY;
      } else if (isTableHorizontal && styles.borderSpacingX > 0) {
        frame.itemSpacing = styles.borderSpacingX;
      }
    }
  }
}

/**
 * 자식 요소의 CSS margin을 부모 Auto Layout의 itemSpacing/padding으로 변환
 * CSS margin collapsing: 인접 마진 중 큰 값 사용
 */
export function applyChildMargins(frame: FrameNode, children: ExtractedNode[]) {
  if (frame.layoutMode === 'NONE' || children.length === 0) return;

  const isVertical = frame.layoutMode === 'VERTICAL';
  const leadingProp = isVertical ? 'marginTop' : 'marginLeft';
  const trailingProp = isVertical ? 'marginBottom' : 'marginRight';

  // 첫 자식의 leading margin → 부모 padding 시작 방향에 추가
  const firstStyles = children[0].styles;
  if (firstStyles) {
    const firstLeading = (firstStyles as any)[leadingProp] || 0;
    if (firstLeading > 0) {
      if (isVertical) {
        frame.paddingTop = (frame.paddingTop || 0) + firstLeading;
      } else {
        frame.paddingLeft = (frame.paddingLeft || 0) + firstLeading;
      }
    }
  }

  // 마지막 자식의 trailing margin → 부모 padding 끝 방향에 추가
  const lastStyles = children[children.length - 1].styles;
  if (lastStyles) {
    const lastTrailing = (lastStyles as any)[trailingProp] || 0;
    if (lastTrailing > 0) {
      if (isVertical) {
        frame.paddingBottom = (frame.paddingBottom || 0) + lastTrailing;
      } else {
        frame.paddingRight = (frame.paddingRight || 0) + lastTrailing;
      }
    }
  }

  // 인접 자식 간 margin → itemSpacing (gap이 이미 설정되지 않은 경우만)
  if (children.length > 1 && (frame.itemSpacing === 0 || frame.itemSpacing === undefined)) {
    let maxSpacing = 0;
    for (let i = 0; i < children.length - 1; i++) {
      const currentStyles = children[i].styles;
      const nextStyles = children[i + 1].styles;
      const currentTrailing = currentStyles ? ((currentStyles as any)[trailingProp] || 0) : 0;
      const nextLeading = nextStyles ? ((nextStyles as any)[leadingProp] || 0) : 0;
      // CSS margin collapsing: 인접 마진 중 큰 값
      const collapsed = Math.max(currentTrailing, nextLeading);
      if (collapsed > maxSpacing) {
        maxSpacing = collapsed;
      }
    }
    if (maxSpacing > 0) {
      frame.itemSpacing = maxSpacing;
    }
  }
}

/**
 * 정렬 적용
 * @param frame - Figma 프레임
 * @param styles - 계산된 스타일
 * @param children - 자식 노드 배열 (선택, space-between 보정용)
 */
export function applyAlignment(frame: FrameNode, styles: ComputedStyles, children?: ExtractedNode[]) {
  const { justifyContent, alignItems } = styles;
  const childCount = children ? children.length : 0;

  // table-cell: justifyContent/alignItems 대신 textAlign/verticalAlign 사용
  // layoutMode에 따라 올바른 축에 매핑해야 함
  // HORIZONTAL: primaryAxis=X(가로), counterAxis=Y(세로)
  // VERTICAL: primaryAxis=Y(세로), counterAxis=X(가로)
  if (styles.display === 'table-cell') {
    // textAlign → 가로(X축) 정렬값
    let hAlign: 'MIN' | 'CENTER' | 'MAX' = 'MIN';
    switch (styles.textAlign) {
      case 'center': hAlign = 'CENTER'; break;
      case 'right':
      case 'end': hAlign = 'MAX'; break;
    }
    // verticalAlign → 세로(Y축) 정렬값
    let vAlign: 'MIN' | 'CENTER' | 'MAX' = 'MIN';
    switch (styles.verticalAlign) {
      case 'middle': vAlign = 'CENTER'; break;
      case 'bottom': vAlign = 'MAX'; break;
    }

    if (frame.layoutMode === 'VERTICAL') {
      frame.primaryAxisAlignItems = vAlign;
      frame.counterAxisAlignItems = hAlign;
    } else {
      frame.primaryAxisAlignItems = hAlign;
      frame.counterAxisAlignItems = vAlign;
    }
    return;
  }

  // 주축 정렬
  // NOTE: Figma와 CSS의 space-between 동작 차이 보정
  // - CSS: space-between + 1자식 = 자식이 시작점(왼쪽)에 위치
  // - Figma: SPACE_BETWEEN + 1자식 = 자식이 중앙에 위치 (버그 아님, 의도된 동작)
  // 따라서 자식이 1개일 때는 MIN(시작점)으로 변환
  switch (justifyContent) {
    case 'center':
      frame.primaryAxisAlignItems = 'CENTER';
      break;
    case 'flex-end':
    case 'end':
      frame.primaryAxisAlignItems = 'MAX';
      break;
    case 'space-between':
      // CSS와 Figma의 동작 차이 보정: 1자식일 때는 MIN으로
      frame.primaryAxisAlignItems = childCount <= 1 ? 'MIN' : 'SPACE_BETWEEN';
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
