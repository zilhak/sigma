/**
 * 레이아웃 스타일 적용 (sizing, layout mode, alignment, padding)
 */
import type { ComputedStyles } from '@sigma/shared';

/**
 * Auto Layout 크기 모드 설정
 */
export function applySizingMode(frame: FrameNode, styles: ComputedStyles, isRoot: boolean): void {
  const { width, height } = styles;

  // 루트 프레임은 항상 FIXED (전체 크기 유지)
  if (isRoot) {
    frame.primaryAxisSizingMode = 'FIXED';
    frame.counterAxisSizingMode = 'FIXED';
    return;
  }

  // 가로(primary/counter) 설정
  // width: auto 또는 fit-content → HUG (콘텐츠에 맞춤)
  // width: 100% → FILL (부모에 맞춤) - Figma에서는 layoutGrow로 처리
  // width: number → FIXED
  if (width === 'auto' || width === 'fit-content') {
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
  if (height === 'auto' || height === 'fit-content') {
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
 * 레이아웃 모드 적용 (flex, grid, block 등)
 */
export function applyLayoutMode(frame: FrameNode, styles: ComputedStyles): void {
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
 * 정렬 적용 (justify-content, align-items)
 */
export function applyAlignment(frame: FrameNode, styles: ComputedStyles): void {
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
export function applyPadding(frame: FrameNode, styles: ComputedStyles): void {
  frame.paddingTop = styles.paddingTop || 0;
  frame.paddingRight = styles.paddingRight || 0;
  frame.paddingBottom = styles.paddingBottom || 0;
  frame.paddingLeft = styles.paddingLeft || 0;
}
