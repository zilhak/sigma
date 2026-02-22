/**
 * 컴포넌트 시스템: 목록 조회, 인스턴스 생성, 오버라이드
 * cursor-talk-to-figma의 get_local_components, create_component_instance,
 * get_instance_overrides, set_instance_overrides 참고
 */

export interface ComponentInfo {
  nodeId: string;
  name: string;
  key: string;
  description: string;
  width: number;
  height: number;
  parentName: string | null;
}

export function getLocalComponents(): ComponentInfo[] {
  const components = figma.root.findAllWithCriteria({ types: ['COMPONENT'] });
  return components.map(comp => ({
    nodeId: comp.id,
    name: comp.name,
    key: comp.key,
    description: comp.description,
    width: comp.width,
    height: comp.height,
    parentName: comp.parent ? comp.parent.name : null,
  }));
}

export interface CreateInstanceResult {
  nodeId: string;
  name: string;
  componentName: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function createComponentInstance(
  componentKey: string,
  x: number,
  y: number,
  parentId?: string
): Promise<CreateInstanceResult> {
  let component: ComponentNode | null = null;

  // 먼저 로컬 컴포넌트에서 key 또는 nodeId로 검색
  const locals = figma.root.findAllWithCriteria({ types: ['COMPONENT'] });
  component = locals.find(c => c.key === componentKey || c.id === componentKey) as ComponentNode | undefined || null;

  // 로컬에 없으면 퍼블리시된 라이브러리에서 import 시도
  if (!component) {
    try {
      component = await figma.importComponentByKeyAsync(componentKey);
    } catch (e) {
      throw new Error(`컴포넌트를 찾을 수 없습니다: ${componentKey}`);
    }
  }

  const instance = component.createInstance();
  instance.x = x;
  instance.y = y;

  if (parentId) {
    const parent = figma.getNodeById(parentId);
    if (parent && 'appendChild' in parent) {
      (parent as ChildrenMixin).appendChild(instance);
    }
  }

  return {
    nodeId: instance.id,
    name: instance.name,
    componentName: component.name,
    x: instance.x,
    y: instance.y,
    width: instance.width,
    height: instance.height,
  };
}

export interface InstanceOverrides {
  nodeId: string;
  name: string;
  componentName: string;
  properties: Record<string, { type: string; value: unknown }>;
}

export function getInstanceOverrides(nodeId?: string): InstanceOverrides {
  let node: BaseNode | null;

  if (nodeId) {
    node = figma.getNodeById(nodeId);
  } else {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) throw new Error('노드를 선택하거나 nodeId를 지정하세요');
    node = selection[0];
  }

  if (!node) throw new Error('노드를 찾을 수 없습니다');
  if (node.type !== 'INSTANCE') throw new Error(`INSTANCE 타입이 아닙니다: ${node.type}`);

  const instance = node as InstanceNode;
  const properties: Record<string, { type: string; value: unknown }> = {};

  const compProps = instance.componentProperties;
  for (const key of Object.keys(compProps)) {
    const prop = compProps[key];
    properties[key] = {
      type: prop.type,
      value: prop.value,
    };
  }

  return {
    nodeId: instance.id,
    name: instance.name,
    componentName: instance.mainComponent ? instance.mainComponent.name : 'unknown',
    properties,
  };
}

export interface SetOverridesResult {
  nodeId: string;
  name: string;
  appliedCount: number;
}

export function setInstanceOverrides(
  nodeId: string,
  overrides: Record<string, unknown>
): SetOverridesResult {
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);
  if (node.type !== 'INSTANCE') throw new Error(`INSTANCE 타입이 아닙니다: ${node.type}`);

  const instance = node as InstanceNode;
  instance.setProperties(overrides as Record<string, string | boolean>);

  return {
    nodeId: instance.id,
    name: instance.name,
    appliedCount: Object.keys(overrides).length,
  };
}
