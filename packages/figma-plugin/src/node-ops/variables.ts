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
      variableIds: Array.from(c.variableIds),
    })),
    variables: variables.map(v => {
      const safeValues: Record<string, unknown> = {};
      for (const [modeId, val] of Object.entries(v.valuesByMode)) {
        // VariableAlias인지 확인
        if (val && typeof val === 'object' && 'type' in val && (val as any).type === 'VARIABLE_ALIAS') {
          safeValues[modeId] = { type: 'VARIABLE_ALIAS', id: (val as any).id };
        } else if (val && typeof val === 'object') {
          // RGB/RGBA 등 객체를 plain object로 변환
          safeValues[modeId] = { ...(val as unknown as Record<string, unknown>) };
        } else {
          safeValues[modeId] = val;
        }
      }
      return {
        variableId: v.id,
        name: v.name,
        resolvedType: v.resolvedType,
        collectionId: v.variableCollectionId,
        valuesByMode: safeValues,
      };
    }),
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

/**
 * COLOR 값 정규화: hex 문자열("#rrggbb"/"#rgb"/"#rrggbbaa") 또는 {r,g,b,a?} 객체를 받아
 * Figma RGBA(0~1)로 변환한다. 채널이 0~255 범위로 들어오면 자동으로 0~1 로 정규화한다.
 */
function toRGBA(value: unknown): RGBA {
  if (typeof value === 'string') {
    const hex = value.replace('#', '').trim();
    if (hex.length !== 3 && hex.length !== 6 && hex.length !== 8) {
      throw new Error(`COLOR hex 형식이 올바르지 않습니다: "${value}"`);
    }
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;
    const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
    if (![r, g, b, a].every(Number.isFinite)) throw new Error(`COLOR hex 파싱 실패: "${value}"`);
    return { r, g, b, a };
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (!('r' in o && 'g' in o && 'b' in o)) {
      throw new Error('COLOR 값은 {r,g,b,a} 객체 또는 hex 문자열이어야 합니다');
    }
    let r = Number(o.r), g = Number(o.g), b = Number(o.b);
    let a = o.a === undefined || o.a === null ? 1 : Number(o.a);
    if (![r, g, b, a].every(Number.isFinite)) throw new Error('COLOR 채널 값은 숫자여야 합니다');
    // 0~255 입력 자동 정규화
    if (r > 1 || g > 1 || b > 1) { r /= 255; g /= 255; b /= 255; }
    if (a > 1) a /= 255;
    return { r, g, b, a };
  }
  throw new Error('COLOR 값은 {r,g,b,a} 객체 또는 hex 문자열이어야 합니다');
}

/**
 * 변수의 resolvedType 에 맞춰 입력 값을 정규화한다.
 * MCP value 파라미터는 inputSchema 에 타입이 없어 문자열("8", "true", '{"r":..}')로
 * 도착할 수 있으므로, STRING 이 아닌 타입에 대해서는 먼저 JSON 파싱을 시도한다.
 */
function coerceVariableValue(resolvedType: VariableResolvedDataType, raw: unknown): VariableValue {
  let value = raw;
  if (typeof value === 'string' && resolvedType !== 'STRING') {
    try { value = JSON.parse(value.trim()); } catch { /* hex/숫자 문자열 등은 아래에서 처리 */ }
  }

  switch (resolvedType) {
    case 'FLOAT': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) {
        throw new Error(`FLOAT 변수에는 숫자 값이 필요합니다 (받은 값: ${JSON.stringify(raw)})`);
      }
      return n;
    }
    case 'BOOLEAN': {
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 1) return true;
      if (value === 'false' || value === 0) return false;
      return Boolean(value);
    }
    case 'STRING':
      return typeof value === 'string' ? value : String(value);
    case 'COLOR':
      return toRGBA(value);
    default:
      return value as VariableValue;
  }
}

export function setVariableValue(options: SetVariableValueOptions): SetVariableValueResult {
  const variable = figma.variables.getVariableById(options.variableId);
  if (!variable) throw new Error(`변수를 찾을 수 없습니다: ${options.variableId}`);

  const collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
  if (!collection) throw new Error(`컬렉션을 찾을 수 없습니다: ${variable.variableCollectionId}`);

  // modeId 검증 — 존재하지 않으면 컬렉션 기본 모드로 폴백 (잘못된 modeId 로 인한 타입 오류 방지)
  let modeId = options.modeId;
  if (!collection.modes.some(m => m.modeId === modeId)) {
    modeId = collection.defaultModeId;
  }

  // resolvedType 에 맞춰 값 정규화 (문자열/0-255/hex 등 허용)
  const value = coerceVariableValue(variable.resolvedType, options.value);

  variable.setValueForMode(modeId, value);
  return { variableId: variable.id, modeId, set: true };
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

// === Variable Scopes ===

export interface SetVariableScopesResult {
  variableId: string;
  scopes: string[];
}

export function setVariableScopes(variableId: string, scopes: string[]): SetVariableScopesResult {
  if (!variableId) throw new Error('variableId가 필요합니다');
  if (!scopes || !Array.isArray(scopes)) throw new Error('scopes 배열이 필요합니다');
  const variable = figma.variables.getVariableById(variableId);
  if (!variable) throw new Error('변수를 찾을 수 없습니다: ' + variableId);
  variable.scopes = scopes as VariableScope[];
  return { variableId, scopes: Array.from(variable.scopes) };
}

// === Variable Alias ===

export interface SetVariableAliasResult {
  variableId: string;
  modeId: string;
  aliasTargetId: string;
}

export function setVariableAlias(variableId: string, modeId: string, aliasTargetId: string): SetVariableAliasResult {
  if (!variableId) throw new Error('variableId가 필요합니다');
  if (!modeId) throw new Error('modeId가 필요합니다');
  if (!aliasTargetId) throw new Error('aliasTargetId가 필요합니다');
  const variable = figma.variables.getVariableById(variableId);
  if (!variable) throw new Error('변수를 찾을 수 없습니다: ' + variableId);
  const aliasTarget = figma.variables.getVariableById(aliasTargetId);
  if (!aliasTarget) throw new Error('별칭 대상 변수를 찾을 수 없습니다: ' + aliasTargetId);
  variable.setValueForMode(modeId, figma.variables.createVariableAlias(aliasTarget));
  return { variableId, modeId, aliasTargetId };
}

// === Variable Code Syntax ===

export interface SetVariableCodeSyntaxResult {
  variableId: string;
  platform: string;
  syntax: string;
}

export function setVariableCodeSyntax(variableId: string, platform: string, syntax: string): SetVariableCodeSyntaxResult {
  if (!variableId) throw new Error('variableId가 필요합니다');
  if (!platform) throw new Error('platform이 필요합니다');
  if (!syntax) throw new Error('syntax가 필요합니다');
  const variable = figma.variables.getVariableById(variableId);
  if (!variable) throw new Error('변수를 찾을 수 없습니다: ' + variableId);
  variable.setVariableCodeSyntax(platform as CodeSyntaxPlatform, syntax);
  return { variableId, platform, syntax };
}

// === Variable Rename ===

export interface RenameVariableResult {
  variableId: string;
  name: string;
}

export function renameVariable(variableId: string, name: string): RenameVariableResult {
  if (!variableId) throw new Error('variableId가 필요합니다');
  if (!name) throw new Error('name이 필요합니다');
  const variable = figma.variables.getVariableById(variableId);
  if (!variable) throw new Error('변수를 찾을 수 없습니다: ' + variableId);
  variable.name = name;
  return { variableId, name: variable.name };
}

// === Variable Delete ===

export interface DeleteVariableResult {
  variableId: string;
  name: string;
  deleted: boolean;
}

export function deleteVariable(variableId: string): DeleteVariableResult {
  if (!variableId) throw new Error('variableId가 필요합니다');
  const variable = figma.variables.getVariableById(variableId);
  if (!variable) throw new Error('변수를 찾을 수 없습니다: ' + variableId);
  const name = variable.name;
  variable.remove();
  return { variableId, name, deleted: true };
}
