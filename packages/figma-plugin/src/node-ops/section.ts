import { getPageById } from './page';

/**
 * Section 생성 옵션
 */
export interface CreateSectionOptions {
  name?: string;
  pageId?: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  children?: string[];
  fills?: Paint[];
}

/**
 * Section 생성 결과
 */
export interface CreateSectionResult {
  nodeId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  childCount: number;
}

/**
 * Section 생성
 */
export function createSection(options: CreateSectionOptions): CreateSectionResult {
  const sectionName = options.name || 'Section';
  const section = figma.createSection();
  section.name = sectionName;

  if (options.position) {
    section.x = options.position.x;
    section.y = options.position.y;
  }

  if (options.size) {
    section.resizeWithoutConstraints(
      Math.max(options.size.width, 1),
      Math.max(options.size.height, 1)
    );
  }

  if (options.fills) {
    section.fills = options.fills;
  }

  // 특정 페이지에 생성해야 하는 경우
  if (options.pageId) {
    const targetPage = getPageById(options.pageId);
    if (targetPage && targetPage.id !== figma.currentPage.id) {
      targetPage.appendChild(section);
    }
  }

  // 자식 노드 이동
  if (options.children && options.children.length > 0) {
    for (const childId of options.children) {
      const child = figma.getNodeById(childId);
      if (child && child.type !== 'DOCUMENT' && child.type !== 'PAGE') {
        section.appendChild(child as SceneNode);
      }
    }
  }

  return {
    nodeId: section.id,
    name: section.name,
    x: section.x,
    y: section.y,
    width: section.width,
    height: section.height,
    childCount: section.children.length,
  };
}
