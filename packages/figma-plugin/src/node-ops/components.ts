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

// ===== 9개의 새로운 컴포넌트 함수 =====

export interface CreateComponentOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  parentId?: string;
}

export interface CreateComponentResult {
  nodeId: string;
  name: string;
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createComponent(options: CreateComponentOptions): CreateComponentResult {
  const component = figma.createComponent();
  component.x = options.x;
  component.y = options.y;
  component.resize(options.width, options.height);

  if (options.name) {
    component.name = options.name;
  }

  if (options.parentId) {
    const parent = figma.getNodeById(options.parentId);
    if (parent && 'appendChild' in parent) {
      (parent as ChildrenMixin).appendChild(component);
    }
  }

  return {
    nodeId: component.id,
    name: component.name,
    key: component.key,
    x: component.x,
    y: component.y,
    width: component.width,
    height: component.height,
  };
}

export interface ConvertToComponentResult {
  nodeId: string;
  name: string;
  key: string;
  originalNodeId: string;
}

export function convertToComponent(nodeId: string): ConvertToComponentResult {
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error('노드를 찾을 수 없습니다: ' + nodeId);
  if (!('width' in node) || !('height' in node)) {
    throw new Error(`크기를 가진 노드가 아닙니다: ${node.type}`);
  }

  const originalParent = node.parent;
  const originalIndex = originalParent && 'children' in originalParent
    ? (originalParent as ChildrenMixin).children.indexOf(node as SceneNode)
    : -1;

  const component = figma.createComponent();
  component.name = node.name;
  component.x = 'x' in node ? (node.x as number) : 0;
  component.y = 'y' in node ? (node.y as number) : 0;
  component.resize(node.width, node.height);

  // fills, strokes 복사
  if ('fills' in node && 'fills' in component) {
    component.fills = node.fills;
  }
  if ('strokes' in node && 'strokes' in component) {
    component.strokes = node.strokes;
  }

  // children 복사
  if ('children' in node && 'appendChild' in component) {
    const children = [...(node as ChildrenMixin).children];
    children.forEach(child => {
      (component as ChildrenMixin).appendChild(child);
    });
  }

  // 원본 위치에 삽입
  if (originalParent && 'insertChild' in originalParent && originalIndex >= 0) {
    (originalParent as ChildrenMixin).insertChild(originalIndex, component);
  }

  node.remove();

  return {
    nodeId: component.id,
    name: component.name,
    key: component.key,
    originalNodeId: nodeId,
  };
}

export interface CreateComponentSetResult {
  nodeId: string;
  name: string;
  componentCount: number;
}

export function createComponentSet(componentIds: string[], name?: string): CreateComponentSetResult {
  if (componentIds.length < 2) {
    throw new Error('ComponentSet을 만들려면 최소 2개의 컴포넌트가 필요합니다');
  }

  const components: ComponentNode[] = [];
  for (const id of componentIds) {
    const node = figma.getNodeById(id);
    if (!node) throw new Error('노드를 찾을 수 없습니다: ' + id);
    if (node.type !== 'COMPONENT') {
      throw new Error(`COMPONENT 타입이 아닙니다: ${node.type} (${id})`);
    }
    components.push(node as ComponentNode);
  }

  const componentSet = figma.combineAsVariants(components, figma.currentPage);

  if (name) {
    componentSet.name = name;
  }

  return {
    nodeId: componentSet.id,
    name: componentSet.name,
    componentCount: components.length,
  };
}

export interface AddComponentPropertyResult {
  nodeId: string;
  propertyName: string;
  type: string;
}

export function addComponentProperty(
  nodeId: string,
  propertyName: string,
  type: 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP' | 'VARIANT',
  defaultValue: boolean | string
): AddComponentPropertyResult {
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error('노드를 찾을 수 없습니다: ' + nodeId);

  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
    throw new Error(`COMPONENT 또는 COMPONENT_SET 타입이 아닙니다: ${node.type}`);
  }

  const component = node as ComponentNode | ComponentSetNode;
  component.addComponentProperty(propertyName, type, defaultValue);

  return {
    nodeId: component.id,
    propertyName,
    type,
  };
}

export interface EditComponentPropertyResult {
  nodeId: string;
  propertyName: string;
  updated: boolean;
}

export function editComponentProperty(
  nodeId: string,
  propertyName: string,
  newValues: Partial<{
    defaultValue: boolean | string;
    variantOptions: string[];
    preferredValues: InstanceSwapPreferredValue[];
  }>
): EditComponentPropertyResult {
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error('노드를 찾을 수 없습니다: ' + nodeId);

  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
    throw new Error(`COMPONENT 또는 COMPONENT_SET 타입이 아닙니다: ${node.type}`);
  }

  const component = node as ComponentNode | ComponentSetNode;
  component.editComponentProperty(propertyName, newValues);

  return {
    nodeId: component.id,
    propertyName,
    updated: true,
  };
}

export interface DeleteComponentPropertyResult {
  nodeId: string;
  propertyName: string;
  deleted: boolean;
}

export function deleteComponentProperty(nodeId: string, propertyName: string): DeleteComponentPropertyResult {
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error('노드를 찾을 수 없습니다: ' + nodeId);

  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
    throw new Error(`COMPONENT 또는 COMPONENT_SET 타입이 아닙니다: ${node.type}`);
  }

  const component = node as ComponentNode | ComponentSetNode;
  component.deleteComponentProperty(propertyName);

  return {
    nodeId: component.id,
    propertyName,
    deleted: true,
  };
}

export interface ComponentPropertyDefinitions {
  nodeId: string;
  name: string;
  properties: Record<string, {
    type: string;
    defaultValue: boolean | string;
    variantOptions?: string[];
    preferredValues?: Array<{ type: string; key: string }>;
  }>;
}

export function getComponentPropertyDefinitions(nodeId: string): ComponentPropertyDefinitions {
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error('노드를 찾을 수 없습니다: ' + nodeId);

  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
    throw new Error(`COMPONENT 또는 COMPONENT_SET 타입이 아닙니다: ${node.type}`);
  }

  const component = node as ComponentNode | ComponentSetNode;
  const definitions = component.componentPropertyDefinitions;
  const properties: Record<string, {
    type: string;
    defaultValue: boolean | string;
    variantOptions?: string[];
    preferredValues?: Array<{ type: string; key: string }>;
  }> = {};

  for (const key of Object.keys(definitions)) {
    const def = definitions[key];
    properties[key] = {
      type: def.type,
      defaultValue: def.defaultValue,
    };

    if ('variantOptions' in def && def.variantOptions) {
      properties[key].variantOptions = def.variantOptions;
    }

    if ('preferredValues' in def && def.preferredValues) {
      properties[key].preferredValues = def.preferredValues.map(v => ({
        type: v.type,
        key: v.key,
      }));
    }
  }

  return {
    nodeId: component.id,
    name: component.name,
    properties,
  };
}

export interface DetachInstanceResult {
  nodeId: string;
  name: string;
  detached: boolean;
}

export function detachInstance(nodeId: string): DetachInstanceResult {
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error('노드를 찾을 수 없습니다: ' + nodeId);
  if (node.type !== 'INSTANCE') throw new Error(`INSTANCE 타입이 아닙니다: ${node.type}`);

  const instance = node as InstanceNode;
  const newNode = instance.detachInstance();

  return {
    nodeId: newNode.id,
    name: newNode.name,
    detached: true,
  };
}

export interface SwapComponentResult {
  nodeId: string;
  name: string;
  newComponentKey: string;
  newComponentName: string;
}

export async function swapComponent(nodeId: string, newComponentKey: string): Promise<SwapComponentResult> {
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error('노드를 찾을 수 없습니다: ' + nodeId);
  if (node.type !== 'INSTANCE') throw new Error(`INSTANCE 타입이 아닙니다: ${node.type}`);

  const instance = node as InstanceNode;
  let newComponent: ComponentNode | null = null;

  // 로컬 컴포넌트에서 검색
  const locals = figma.root.findAllWithCriteria({ types: ['COMPONENT'] });
  newComponent = locals.find(c => c.key === newComponentKey || c.id === newComponentKey) as ComponentNode | undefined || null;

  // 로컬에 없으면 라이브러리에서 import
  if (!newComponent) {
    try {
      newComponent = await figma.importComponentByKeyAsync(newComponentKey);
    } catch (e) {
      throw new Error(`컴포넌트를 찾을 수 없습니다: ${newComponentKey}`);
    }
  }

  instance.swapComponent(newComponent);

  return {
    nodeId: instance.id,
    name: instance.name,
    newComponentKey: newComponent.key,
    newComponentName: newComponent.name,
  };
}
