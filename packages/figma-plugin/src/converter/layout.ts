import type { ComputedStyles, ExtractedNode } from '@sigma/shared';

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

// ============================================================
// CSS Grid → Figma Auto Layout 변환
// ============================================================

export interface GridTrack {
  type: 'fr' | 'auto' | 'fixed';
  value: number;
}

export interface GridCell {
  column: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  child: ExtractedNode;
}

/**
 * CSS grid-template-columns/rows 값을 파싱
 * getComputedStyle은 resolved px 값("156.469px 73.0312px")을 반환하므로
 * 원본 fr/auto 정보는 유실됨. 두 형식 모두 처리.
 */
export function parseGridTemplate(template: string): GridTrack[] {
  if (!template || template === 'none') return [];

  const tracks: GridTrack[] = [];
  const parts = template.split(/\s+/).filter(function(p) { return p.length > 0; });

  for (const part of parts) {
    if (part.endsWith('fr')) {
      const val = parseFloat(part);
      tracks.push({ type: 'fr', value: isNaN(val) ? 1 : val });
    } else if (part === 'auto' || part === 'min-content' || part === 'max-content') {
      tracks.push({ type: 'auto', value: 0 });
    } else if (part.endsWith('px') || part.endsWith('%') || !isNaN(parseFloat(part))) {
      tracks.push({ type: 'fixed', value: parseFloat(part) || 0 });
    }
  }

  return tracks;
}

/**
 * CSS grid-column-start/end, grid-row-start/end 값을 파싱
 * "auto" → start=-1, "span 2" → span=2, "2" → start=2
 */
export function parseGridPlacement(startStr: string, endStr: string): { start: number; span: number } {
  const startNum = parseInt(startStr, 10);
  const start = isNaN(startNum) ? -1 : startNum; // -1 means auto

  if (endStr && endStr.startsWith('span')) {
    const spanVal = parseInt(endStr.replace('span', '').trim(), 10);
    return { start: start, span: isNaN(spanVal) ? 1 : spanVal };
  }

  const endNum = parseInt(endStr, 10);
  if (!isNaN(endNum) && start > 0) {
    return { start: start, span: Math.max(1, endNum - start) };
  }

  return { start: start, span: 1 };
}

/**
 * 자식 노드들을 그리드 셀에 배치
 * CSS Grid auto-placement 알고리즘의 간소화 버전
 */
export function assignChildrenToGrid(children: ExtractedNode[], colCount: number): GridCell[] {
  const cells: GridCell[] = [];
  const occupied = new Set<string>();

  // CSS Grid spec: 명시적 배치 아이템을 먼저 배치, 그 후 auto 아이템 배치
  // Phase 1: 명시적 배치 (gridColumnStart가 auto가 아닌 아이템)
  const explicitChildren: Array<{ index: number; child: ExtractedNode }> = [];
  const autoChildren: Array<{ index: number; child: ExtractedNode }> = [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const styles = child.styles;
    const colStart = styles ? styles.gridColumnStart : 'auto';
    const rowStart = styles ? styles.gridRowStart : 'auto';

    if (colStart !== 'auto' && rowStart !== 'auto') {
      explicitChildren.push({ index: i, child: child });
    } else {
      autoChildren.push({ index: i, child: child });
    }
  }

  // 명시적 배치 아이템 먼저 처리
  for (const item of explicitChildren) {
    const styles = item.child.styles;
    const colPlacement = parseGridPlacement(
      styles ? styles.gridColumnStart : 'auto',
      styles ? styles.gridColumnEnd : 'auto'
    );
    const rowPlacement = parseGridPlacement(
      styles ? styles.gridRowStart : 'auto',
      styles ? styles.gridRowEnd : 'auto'
    );

    const col = colPlacement.start > 0 ? colPlacement.start - 1 : 0;
    const row = rowPlacement.start > 0 ? rowPlacement.start - 1 : 0;
    const colSpan = colPlacement.span;
    const rowSpan = rowPlacement.span;

    for (let c = col; c < col + colSpan; c++) {
      for (let r = row; r < row + rowSpan; r++) {
        occupied.add(c + ',' + r);
      }
    }

    cells.push({ column: col, row: row, colSpan: colSpan, rowSpan: rowSpan, child: item.child });
  }

  // Phase 2: Auto 배치 아이템
  let autoCol = 0;
  let autoRow = 0;

  for (const item of autoChildren) {
    const styles = item.child.styles;
    const colPlacement = parseGridPlacement(
      styles ? styles.gridColumnStart : 'auto',
      styles ? styles.gridColumnEnd : 'auto'
    );
    const rowPlacement = parseGridPlacement(
      styles ? styles.gridRowStart : 'auto',
      styles ? styles.gridRowEnd : 'auto'
    );

    const colSpan = colPlacement.span;
    const rowSpan = rowPlacement.span;

    // 빈 셀 찾기
    while (true) {
      if (autoCol >= colCount) {
        autoCol = 0;
        autoRow++;
      }
      const key = autoCol + ',' + autoRow;
      if (!occupied.has(key)) break;
      autoCol++;
    }

    const col = autoCol;
    const row = autoRow;

    for (let c = col; c < col + colSpan; c++) {
      for (let r = row; r < row + rowSpan; r++) {
        occupied.add(c + ',' + r);
      }
    }

    cells.push({ column: col, row: row, colSpan: colSpan, rowSpan: rowSpan, child: item.child });

    autoCol = col + colSpan;
    if (autoCol >= colCount) {
      autoCol = 0;
      autoRow++;
    }
  }

  return cells;
}

/**
 * CSS Grid 컨테이너를 Figma 중첩 Auto Layout으로 변환
 *
 * 전략: 각 컬럼을 VERTICAL Auto Layout 프레임으로 만들고,
 * 부모를 HORIZONTAL Auto Layout으로 설정하여 컬럼을 나란히 배치.
 *
 * 예시 (2컬럼 그리드):
 *   HORIZONTAL Frame (grid container)
 *   ├── VERTICAL Frame (grid-col-1)
 *   │   ├── child A (row 0)
 *   │   └── child B (row 1)
 *   └── VERTICAL Frame (grid-col-2)
 *       └── child C (row 0, spanning rows)
 */
export async function createGridLayout(
  frame: FrameNode,
  node: ExtractedNode,
  isRoot: boolean,
  createFigmaNodeFn: (node: ExtractedNode, isRoot: boolean) => Promise<FrameNode | TextNode | null>
): Promise<void> {
  const styles = node.styles;
  const children = node.children || [];

  if (children.length === 0) return;

  // 그리드 템플릿 파싱
  const columns = parseGridTemplate(styles.gridTemplateColumns);
  const colCount = columns.length > 0 ? columns.length : 1;

  // 1컬럼이면 단순 VERTICAL 레이아웃
  if (colCount <= 1) {
    frame.layoutMode = 'VERTICAL';

    const rowGap = styles.rowGap > 0 ? styles.rowGap : styles.gap;
    if (rowGap > 0) {
      frame.itemSpacing = rowGap;
    }

    for (const child of children) {
      const childNode = await createFigmaNodeFn(child, false);
      if (childNode) {
        frame.appendChild(childNode);
      }
    }
    return;
  }

  // 다중 컬럼: 컬럼 래퍼 프레임 생성
  frame.layoutMode = 'HORIZONTAL';

  // columnGap → 부모 itemSpacing
  const colGap = styles.columnGap > 0 ? styles.columnGap : styles.gap;
  if (colGap > 0) {
    frame.itemSpacing = colGap;
  }

  const rowGap = styles.rowGap > 0 ? styles.rowGap : styles.gap;

  // 자식을 그리드 셀에 배치
  const cells = assignChildrenToGrid(children, colCount);

  // 컬럼별 그룹화
  const columnGroups: Map<number, GridCell[]> = new Map();
  for (let i = 0; i < colCount; i++) {
    columnGroups.set(i, []);
  }
  for (const cell of cells) {
    const group = columnGroups.get(cell.column);
    if (group) {
      group.push(cell);
    }
  }

  // 컬럼 래퍼 프레임 생성
  for (let colIdx = 0; colIdx < colCount; colIdx++) {
    const colCells = columnGroups.get(colIdx) || [];
    const track = columns[colIdx];

    // 행 순서대로 정렬
    colCells.sort(function(a, b) { return a.row - b.row; });

    const colWrapper = figma.createFrame();
    colWrapper.name = 'grid-col-' + (colIdx + 1);
    colWrapper.layoutMode = 'VERTICAL';
    colWrapper.fills = [];
    colWrapper.clipsContent = false;

    // 행 간격
    if (rowGap > 0) {
      colWrapper.itemSpacing = rowGap;
    }

    // 자식 노드 추가
    for (const cell of colCells) {
      const childNode = await createFigmaNodeFn(cell.child, false);
      if (childNode) {
        colWrapper.appendChild(childNode);

        // 자식 정렬 적용
        if ('layoutAlign' in childNode) {
          const childFrame = childNode as FrameNode;
          const childStyles = cell.child.styles;

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
            }
          }
        }
      }
    }

    // 부모에 먼저 추가 (FILL/layoutGrow는 auto-layout 자식이어야 설정 가능)
    frame.appendChild(colWrapper);

    // 트랙 타입에 따른 컬럼 크기 설정
    if (track && track.type === 'fixed') {
      colWrapper.resize(Math.max(track.value, 1), Math.max(frame.height, 1));
      colWrapper.layoutSizingHorizontal = 'FIXED';
    } else if (track && track.type === 'fr') {
      colWrapper.layoutGrow = track.value;
      colWrapper.layoutSizingHorizontal = 'FILL';
    } else {
      // auto - 콘텐츠에 맞춤
      colWrapper.layoutSizingHorizontal = 'HUG';
    }
    colWrapper.layoutSizingVertical = 'FILL';
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
    // 단, 자식이 inline-block인 경우 HORIZONTAL로 변경 (CSS 인라인 흐름 모방)
    const hasInlineBlockChildren = children && children.length > 0 && children.some(
      child => child.styles && (child.styles.display === 'inline-block' || child.styles.display === 'inline' || child.styles.display === 'inline-flex')
    );
    // table-cell 자식 감지: CSS anonymous table box 모방 (가로 배치)
    const hasTableCellChildren = children && children.length > 0 && children.some(
      child => child.styles && child.styles.display === 'table-cell'
    );

    if (hasInlineBlockChildren || hasTableCellChildren) {
      frame.layoutMode = 'HORIZONTAL';
    } else {
      frame.layoutMode = 'VERTICAL';
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
 * 정렬 적용
 * @param frame - Figma 프레임
 * @param styles - 계산된 스타일
 * @param children - 자식 노드 배열 (선택, space-between 보정용)
 */
export function applyAlignment(frame: FrameNode, styles: ComputedStyles, children?: ExtractedNode[]) {
  const { justifyContent, alignItems } = styles;
  const childCount = children ? children.length : 0;

  // table-cell: justifyContent/alignItems 대신 textAlign/verticalAlign 사용
  if (styles.display === 'table-cell') {
    // 주축 정렬 (textAlign → primaryAxisAlignItems)
    switch (styles.textAlign) {
      case 'center':
        frame.primaryAxisAlignItems = 'CENTER';
        break;
      case 'right':
      case 'end':
        frame.primaryAxisAlignItems = 'MAX';
        break;
      default:
        frame.primaryAxisAlignItems = 'MIN';
    }
    // 교차축 정렬 (verticalAlign → counterAxisAlignItems)
    switch (styles.verticalAlign) {
      case 'middle':
        frame.counterAxisAlignItems = 'CENTER';
        break;
      case 'bottom':
        frame.counterAxisAlignItems = 'MAX';
        break;
      default:
        frame.counterAxisAlignItems = 'MIN';
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
