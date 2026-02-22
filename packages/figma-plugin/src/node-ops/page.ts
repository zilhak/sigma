// Plugin Data Key
export const PLUGIN_DATA_KEY = 'sigma-file-key';

// 저장된 fileKey 가져오기
export function getStoredFileKey(): string | null {
  const stored = figma.root.getPluginData(PLUGIN_DATA_KEY);
  return stored || null;
}

// fileKey 저장하기
export function saveFileKey(fileKey: string) {
  figma.root.setPluginData(PLUGIN_DATA_KEY, fileKey);
}

// 유효한 fileKey 가져오기 (Figma API > 저장된 값)
export function getEffectiveFileKey(): { fileKey: string | null; source: 'api' | 'stored' | 'none' } {
  if (figma.fileKey) {
    return { fileKey: figma.fileKey, source: 'api' };
  }
  const stored = getStoredFileKey();
  if (stored) {
    return { fileKey: stored, source: 'stored' };
  }
  return { fileKey: null, source: 'none' };
}

// 모든 페이지 목록 가져오기
export function getAllPages(): Array<{ id: string; name: string }> {
  return figma.root.children.map((page) => ({
    id: page.id,
    name: page.name,
  }));
}

// 페이지 ID로 페이지 찾기
export function getPageById(pageId: string): PageNode | null {
  // 현재 페이지 먼저 체크 (빠른 경로)
  if (figma.currentPage.id === pageId) {
    return figma.currentPage;
  }
  // 전체 페이지에서 검색
  for (const page of figma.root.children) {
    if (page.id === pageId) {
      return page;
    }
  }
  return null;
}

// 대상 페이지 결정 (pageId가 없으면 현재 페이지)
export function getTargetPage(pageId?: string): PageNode {
  if (pageId) {
    const page = getPageById(pageId);
    if (page) {
      return page;
    }
    // pageId가 있지만 찾을 수 없으면 현재 페이지 사용
    console.warn(`Page not found: ${pageId}, using current page`);
  }
  return figma.currentPage;
}

// === 페이지 관리 ===

export interface CreatePageResult {
  pageId: string;
  name: string;
  index: number;
}

export interface RenamePageResult {
  pageId: string;
  oldName: string;
  newName: string;
}

export interface SwitchPageResult {
  pageId: string;
  name: string;
}

export interface DeletePageResult {
  deleted: boolean;
  name: string;
}

export function createPage(name?: string): CreatePageResult {
  const page = figma.createPage();
  if (name) page.name = name;
  return {
    pageId: page.id,
    name: page.name,
    index: figma.root.children.indexOf(page),
  };
}

export function renamePage(pageId: string, name: string): RenamePageResult {
  const page = figma.root.children.find(p => p.id === pageId);
  if (!page) throw new Error(`페이지를 찾을 수 없습니다: ${pageId}`);
  const oldName = page.name;
  page.name = name;
  return { pageId: page.id, oldName, newName: name };
}

export function switchPage(pageId: string): SwitchPageResult {
  const page = figma.root.children.find(p => p.id === pageId);
  if (!page) throw new Error(`페이지를 찾을 수 없습니다: ${pageId}`);
  figma.currentPage = page;
  return { pageId: page.id, name: page.name };
}

export function deletePage(pageId: string): DeletePageResult {
  if (figma.root.children.length <= 1) {
    throw new Error('마지막 페이지는 삭제할 수 없습니다');
  }
  const page = figma.root.children.find(p => p.id === pageId);
  if (!page) throw new Error(`페이지를 찾을 수 없습니다: ${pageId}`);
  const pageName = page.name;

  // 현재 페이지를 삭제하는 경우, 다른 페이지로 먼저 전환
  if (figma.currentPage.id === pageId) {
    const otherPage = figma.root.children.find(p => p.id !== pageId);
    if (otherPage) figma.currentPage = otherPage;
  }

  page.remove();
  return { deleted: true, name: pageName };
}

// 파일 정보 전달 (전체 페이지 목록 포함)
export function sendFileInfo() {
  const { fileKey, source } = getEffectiveFileKey();
  const pages = getAllPages();

  figma.ui.postMessage({
    type: 'file-info',
    fileKey,
    fileKeySource: source,
    storedFileKey: getStoredFileKey(),
    fileName: figma.root.name,
    pageId: figma.currentPage.id,
    pageName: figma.currentPage.name,
    pages,  // 전체 페이지 목록 추가
  });
}
