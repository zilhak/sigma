/**
 * Variables (Design Tokens) — 변수 컬렉션/변수 생성, 조회, 값 설정, 바인딩
 */

// === Create Variable Collection ===

export interface CreateVariableCollectionResult {
  collectionId: string;
  name: string;
  modes: Array<{ modeId: string; name: string }>;
}

export function createVariableCollection(name: string): CreateVariableCollectionResult {
  const collection = figma.variables.createVariableCollection(name);
  return {
    collectionId: collection.id,
    name: collection.name,
    modes: collection.modes.map(m => ({ modeId: m.modeId, name: m.name })),
  };
}

// === Create Variable ===

export interface CreateVariableOptions {
  name: string;
  collectionId: string;
  resolvedType: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
}

export interface CreateVariableResult {
  variableId: string;
  name: string;
  resolvedType: string;
  collectionId: string;
}

export function createVariable(options: CreateVariableOptions): CreateVariableResult {
  const collection = figma.variables.getVariableCollectionById(options.collectionId);
  if (!collection) throw new Error(`컬렉션을 찾을 수 없습니다: ${options.collectionId}`);
  const variable = figma.variables.createVariable(options.name, collection, options.resolvedType);
  return {
    variableId: variable.id,
    name: variable.name,
    resolvedType: variable.resolvedType,
    collectionId: collection.id,
  };
}

// === Get Variables ===

export interface GetVariablesResult {
  collections: Array<{
    collectionId: string;
    name: string;
    modes: Array<{ modeId: string; name: string }>;
    variableIds: string[];
  }>;
  variables: Array<{
    variableId: string;
    name: string;
    resolvedType: string;
    collectionId: string;
    valuesByMode: Record<string, unknown>;
  }>;
}

export function getVariables(type?: string): GetVariablesResult {
  const collections = figma.variables.getLocalVariableCollections();
  const resolvedType = type as VariableResolvedDataType | undefined;
  const variables = figma.variables.getLocalVariables(resolvedType);

  return {
    collections: collections.map(c => ({
      collectionId: c.id,
      name: c.name,
      modes: c.modes.map(m => ({ modeId: m.modeId, name: m.name })),
      variableIds: c.variableIds,
    })),
    variables: variables.map(v => ({
      variableId: v.id,
      name: v.name,
      resolvedType: v.resolvedType,
      collectionId: v.variableCollectionId,
      valuesByMode: Object.fromEntries(
        Object.entries(v.valuesByMode).map(([modeId, val]) => {
          // VariableAlias인지 확인
          if (val && typeof val === 'object' && 'type' in val && (val as any).type === 'VARIABLE_ALIAS') {
            return [modeId, { type: 'VARIABLE_ALIAS', id: (val as any).id }];
          }
          return [modeId, val];
        })
      ),
    })),
  };
}

// === Set Variable Value ===

export interface SetVariableValueOptions {
  variableId: string;
  modeId: string;
  value: unknown;  // COLOR: {r,g,b,a}, FLOAT: number, STRING: string, BOOLEAN: boolean
}

export interface SetVariableValueResult {
  variableId: string;
  modeId: string;
  set: boolean;
}

export function setVariableValue(options: SetVariableValueOptions): SetVariableValueResult {
  const variable = figma.variables.getVariableById(options.variableId);
  if (!variable) throw new Error(`변수를 찾을 수 없습니다: ${options.variableId}`);

  const collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
  if (!collection) throw new Error(`컬렉션을 찾을 수 없습니다: ${variable.variableCollectionId}`);

  variable.setValueForMode(options.modeId, options.value as VariableValue);
  return { variableId: variable.id, modeId: options.modeId, set: true };
}

// === Bind Variable ===

export interface BindVariableOptions {
  nodeId: string;
  field: string;  // 'fills', 'strokes', 'opacity', 'width', 'height', etc.
  variableId: string;
}

export interface BindVariableResult {
  nodeId: string;
  field: string;
  variableId: string;
  bound: boolean;
}

export async function bindVariable(options: BindVariableOptions): Promise<BindVariableResult> {
  const node = figma.getNodeById(options.nodeId);
  if (!node) throw new Error(`노드를 찾을 수 없습니다: ${options.nodeId}`);
  if (!('setBoundVariable' in node)) throw new Error(`${node.type} 노드는 변수 바인딩을 지원하지 않습니다`);

  const variable = figma.variables.getVariableById(options.variableId);
  if (!variable) throw new Error(`변수를 찾을 수 없습니다: ${options.variableId}`);

  (node as SceneNode).setBoundVariable(options.field as VariableBindableNodeField, variable);
  return { nodeId: options.nodeId, field: options.field, variableId: options.variableId, bound: true };
}

// === Add Variable Mode ===

export interface AddVariableModeResult {
  collectionId: string;
  modeId: string;
  name: string;
  allModes: Array<{ modeId: string; name: string }>;
}

export function addVariableMode(collectionId: string, name: string): AddVariableModeResult {
  const collection = figma.variables.getVariableCollectionById(collectionId);
  if (!collection) throw new Error(`컬렉션을 찾을 수 없습니다: ${collectionId}`);

  const modeId = collection.addMode(name);
  return {
    collectionId: collection.id,
    modeId,
    name,
    allModes: collection.modes.map(m => ({ modeId: m.modeId, name: m.name })),
  };
}
