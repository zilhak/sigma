/**
 * Team Library — 라이브러리 조회, 컴포넌트/스타일 임포트
 */

export interface GetLibrariesResult {
  variableCollections: Array<{ key: string; name: string; libraryName: string }>;
}

export async function getAvailableLibraries(): Promise<GetLibrariesResult> {
  try {
    const collections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    return {
      variableCollections: collections.map(c => ({
        key: c.key,
        name: c.name,
        libraryName: c.libraryName,
      })),
    };
  } catch (error) {
    throw new Error('Team Library API를 사용할 수 없습니다: ' + (error instanceof Error ? error.message : 'Unknown'));
  }
}

export interface GetLibraryComponentsResult {
  components: Array<{ key: string; name: string; description: string }>;
  count: number;
}

export async function getLibraryComponents(libraryKey: string): Promise<GetLibraryComponentsResult> {
  if (!libraryKey) throw new Error('libraryKey가 필요합니다');
  try {
    const components = await figma.teamLibrary.getComponentsInLibraryAsync(libraryKey);
    return {
      components: components.map(c => ({ key: c.key, name: c.name, description: c.description })),
      count: components.length,
    };
  } catch (error) {
    throw new Error('라이브러리 컴포넌트를 가져올 수 없습니다: ' + (error instanceof Error ? error.message : 'Unknown'));
  }
}

export interface GetLibraryVariablesResult {
  variables: Array<{ name: string; resolvedType: string; key: string }>;
  count: number;
}

export async function getLibraryVariables(collectionKey: string): Promise<GetLibraryVariablesResult> {
  if (!collectionKey) throw new Error('collectionKey가 필요합니다');
  try {
    const variables = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(collectionKey);
    return {
      variables: variables.map(v => ({ name: v.name, resolvedType: v.resolvedType, key: v.key })),
      count: variables.length,
    };
  } catch (error) {
    throw new Error('라이브러리 변수를 가져올 수 없습니다: ' + (error instanceof Error ? error.message : 'Unknown'));
  }
}

export interface ImportLibraryComponentResult {
  nodeId: string;
  key: string;
  name: string;
  description: string;
}

export async function importLibraryComponent(key: string): Promise<ImportLibraryComponentResult> {
  if (!key) throw new Error('컴포넌트 key가 필요합니다');
  const component = await figma.importComponentByKeyAsync(key);
  return { nodeId: component.id, key: component.key, name: component.name, description: component.description };
}

export interface ImportLibraryStyleResult {
  styleId: string;
  key: string;
  name: string;
  type: string;
}

export async function importLibraryStyle(key: string): Promise<ImportLibraryStyleResult> {
  if (!key) throw new Error('스타일 key가 필요합니다');
  const style = await figma.importStyleByKeyAsync(key);
  return { styleId: style.id, key: style.key, name: style.name, type: style.type };
}
