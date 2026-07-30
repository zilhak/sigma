import type { ComponentParam, ComponentSpecStamp } from '@sigma/shared';
import { parseHTML } from '../converter/html-parser';
import { createFigmaNode } from '../converter/node-creator';
import { getOrCreateFileId } from './page';

/**
 * 컴포넌트 스펙 시스템 — 스펙(HTML)으로 컴포넌트 빌드 + alias 기반 인스턴스 생성
 *
 * 계약:
 * - 빌드된 ComponentNode에는 pluginData('sigma-spec')로 스탬프가 심어진다
 *   (alias, params, propertyIds). 스탬프는 .fig 파일과 함께 이동하는 파일 내장 진실.
 * - 사용(use) 시 스탬프를 검증하고, 어긋나면 조용히 진행하지 않고 명시적 에러를 낸다.
 * - overwrite 재등록은 **기존 ComponentNode를 in-place 갱신**한다 —
 *   nodeId가 유지되므로 기존 인스턴스들이 자동으로 새 형상을 따라간다.
 */

const SPEC_STAMP_KEY = 'sigma-spec';
const SLOT_MARK_KEY = 'sigma-slot';

async function loadDefaultFonts(): Promise<void> {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
}

export interface BuildComponentFromSpecOptions {
  html: string;
  alias: string;
  /** 서버(검증기)가 추출한 파라미터 목록 */
  params: ComponentParam[];
  position?: { x: number; y: number };
  pageId?: string;
  /**
   * overwrite 시 기존 컴포넌트 nodeId — 존재하면 in-place 갱신 (인스턴스 전파),
   * 소실/limbo면 신규 빌드로 폴백.
   */
  existingNodeId?: string;
}

export interface BuildComponentFromSpecResult {
  nodeId: string;
  key: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageName: string;
  /** param 이름 → Figma component property id */
  propertyIds: Record<string, string>;
  /** 기존 컴포넌트를 in-place 갱신했는지 (true면 기존 인스턴스에 전파됨) */
  updated: boolean;
  /** 이 파일의 Sigma 파일 ID (레지스트리 파일 스코프용) */
  fileId: string;
  fileName: string;
}

/**
 * slot 마커가 심어진 TextNode들을 찾아 TEXT 컴포넌트 속성과 연결한다.
 * 기존 속성은 이름으로 매칭해 재사용(기본값 갱신)하고, 스펙에서 사라진 속성은 삭제 —
 * in-place 갱신 시 인스턴스의 기존 오버라이드가 유지되도록 하기 위함.
 */
function bindSlots(component: ComponentNode, params: ComponentParam[]): Record<string, string> {
  // 기존 TEXT 속성: baseName → full key ("text#12:3")
  const defs = component.componentPropertyDefinitions;
  const existingTextProps: Record<string, string> = {};
  for (const key of Object.keys(defs)) {
    if (defs[key].type !== 'TEXT') continue;
    const hashIdx = key.lastIndexOf('#');
    const base = hashIdx === -1 ? key : key.slice(0, hashIdx);
    existingTextProps[base] = key;
  }

  const slotTextNodes = component.findAll(
    (n) => n.type === 'TEXT' && n.getPluginData(SLOT_MARK_KEY) !== ''
  ) as TextNode[];

  const propertyIds: Record<string, string> = {};

  for (const param of params) {
    const textNode = slotTextNodes.find((t) => t.getPluginData(SLOT_MARK_KEY) === param.name);
    if (!textNode) {
      throw new Error(
        `slot "${param.name}"에 해당하는 텍스트 노드를 찾지 못했습니다 — 변환기가 slot 요소를 TextNode로 만들지 않았습니다 (스펙 검증기와 변환기의 불일치, 버그 신고 필요)`
      );
    }

    let propKey = existingTextProps[param.name];
    if (propKey) {
      // 재사용: 기본값만 갱신 (인스턴스 오버라이드 유지)
      propKey = component.editComponentProperty(propKey, { defaultValue: param.defaultValue });
      delete existingTextProps[param.name];
    } else {
      propKey = component.addComponentProperty(param.name, 'TEXT', param.defaultValue);
    }
    textNode.componentPropertyReferences = { characters: propKey };
    propertyIds[param.name] = propKey;

    // ellipsis slot: 고정폭 부모를 FILL로 채우고 넘치면 …처리 (단일 행)
    if (param.truncates) {
      try {
        textNode.layoutSizingHorizontal = 'FILL';
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`ellipsis slot "${param.name}"의 FILL 설정 실패 (부모가 Auto Layout 고정폭이어야 함): ${msg}`);
      }
      textNode.textTruncation = 'ENDING';
      textNode.maxLines = 1;
    }

    // wrap slot: 고정폭 부모를 FILL로 채우고 넘치면 줄바꿈 (다중 행, 주석/본문용)
    if (param.wraps) {
      try {
        textNode.layoutSizingHorizontal = 'FILL';
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`wrap slot "${param.name}"의 FILL 설정 실패 (부모가 Auto Layout 고정폭이어야 함): ${msg}`);
      }
      textNode.textAutoResize = 'HEIGHT';
    }
  }

  // 스펙에서 사라진 TEXT 속성 정리
  for (const base of Object.keys(existingTextProps)) {
    component.deleteComponentProperty(existingTextProps[base]);
  }

  return propertyIds;
}

/** fresh 빌드된 루트 프레임의 레이아웃/시각 속성을 기존 컴포넌트 루트로 복사 */
function copyRootFrameProps(target: ComponentNode, source: FrameNode): void {
  target.layoutMode = source.layoutMode;
  if (source.layoutMode !== 'NONE') {
    target.primaryAxisSizingMode = source.primaryAxisSizingMode;
    target.counterAxisSizingMode = source.counterAxisSizingMode;
    target.primaryAxisAlignItems = source.primaryAxisAlignItems;
    target.counterAxisAlignItems = source.counterAxisAlignItems;
    target.itemSpacing = source.itemSpacing;
    target.layoutWrap = source.layoutWrap;
    if (source.layoutWrap === 'WRAP') {
      target.counterAxisSpacing = source.counterAxisSpacing;
    }
  }
  target.paddingTop = source.paddingTop;
  target.paddingRight = source.paddingRight;
  target.paddingBottom = source.paddingBottom;
  target.paddingLeft = source.paddingLeft;
  target.clipsContent = source.clipsContent;
  target.fills = source.fills;
  target.strokes = source.strokes;
  target.strokeAlign = source.strokeAlign;
  target.strokeTopWeight = source.strokeTopWeight;
  target.strokeRightWeight = source.strokeRightWeight;
  target.strokeBottomWeight = source.strokeBottomWeight;
  target.strokeLeftWeight = source.strokeLeftWeight;
  target.topLeftRadius = source.topLeftRadius;
  target.topRightRadius = source.topRightRadius;
  target.bottomRightRadius = source.bottomRightRadius;
  target.bottomLeftRadius = source.bottomLeftRadius;
  target.effects = source.effects;
  target.opacity = source.opacity;
  if (target.layoutMode !== 'NONE' && target.strokes.length > 0) {
    target.strokesIncludedInLayout = source.strokesIncludedInLayout;
  }
}

/** 스펙 루트에 배경이 없으면 투명 유지 (변환기의 루트 흰 배경 대체를 되돌림) */
function restoreTransparentRoot(component: ComponentNode, html: string): void {
  const extracted = parseHTML(html);
  const rootBg = extracted && extracted.styles ? extracted.styles.backgroundColor : null;
  if (!rootBg || rootBg.a <= 0) {
    component.fills = [];
  }
}

function stampComponent(
  component: ComponentNode,
  alias: string,
  params: ComponentParam[],
  propertyIds: Record<string, string>
): void {
  const stamp: ComponentSpecStamp = { alias, params, propertyIds };
  component.setPluginData(SPEC_STAMP_KEY, JSON.stringify(stamp));
}

/**
 * 스펙 HTML로 Figma 컴포넌트를 빌드한다.
 * existingNodeId가 유효하면 in-place 갱신(인스턴스 전파), 아니면 신규 빌드.
 */
export async function buildComponentFromSpec(
  options: BuildComponentFromSpecOptions,
  getTargetPage?: (pageId?: string) => PageNode
): Promise<BuildComponentFromSpecResult> {
  const targetPage = getTargetPage ? getTargetPage(options.pageId) : figma.currentPage;

  // ── in-place 갱신 경로 ──
  // fresh 빌드와 동일한 결과를 보장하기 위해, 스펙을 신규 프레임으로 완전 변환한 뒤
  // 루트 속성을 복사하고 자식을 통째로 이주한다 (자식의 FILL/STRETCH 설정 보존).
  // 간이 재구성(updateExistingFrame)은 루트 자식의 stretch 후처리를 재현하지 못해
  // fresh 빌드와 형상이 달라지는 문제가 있었다.
  if (options.existingNodeId) {
    const existing = figma.getNodeById(options.existingNodeId);
    // 안전 가드: nodeId는 파일마다 독립이라 다른 파일의 레코드가 가리키는 id가
    // 이 파일의 무관한 노드와 우연히 일치할 수 있다. 기존 노드의 스탬프 alias가
    // 일치할 때만 in-place 갱신하고, 아니면 신규 빌드로 폴백해 오염을 막는다.
    let stampMatches = false;
    if (existing && existing.type === 'COMPONENT') {
      try {
        const raw = (existing as ComponentNode).getPluginData(SPEC_STAMP_KEY);
        stampMatches = raw !== '' && (JSON.parse(raw) as ComponentSpecStamp).alias === options.alias;
      } catch (e) {
        stampMatches = false;
      }
    }
    if (existing && existing.type === 'COMPONENT' && existing.parent && stampMatches) {
      const component = existing as ComponentNode;

      await loadDefaultFonts();
      const parsed = parseHTML(options.html);
      if (!parsed) {
        throw new Error('스펙 HTML 파싱 실패');
      }
      const fresh = await createFigmaNode(parsed, true, false);
      if (!fresh || fresh.type !== 'FRAME') {
        if (fresh) fresh.remove();
        throw new Error('스펙 HTML → 프레임 변환 실패');
      }

      // 자식 이주 전에 크기·사이징 모드를 캡처 (이주 후 fresh는 hug가 붕괴됨)
      const freshWidth = fresh.width;
      const freshHeight = fresh.height;
      const freshPrimarySizing = fresh.layoutMode !== 'NONE' ? fresh.primaryAxisSizingMode : null;
      const freshCounterSizing = fresh.layoutMode !== 'NONE' ? fresh.counterAxisSizingMode : null;

      // 1) 루트 레이아웃/시각 속성 복사 (자식 이주 전에 — FILL 자식이 유효하도록)
      copyRootFrameProps(component, fresh);
      // 2) 기존 자식 제거
      for (let i = component.children.length - 1; i >= 0; i--) {
        component.children[i].remove();
      }
      // 3) 크기 동기화 후 사이징 모드 복원
      //    (resize()는 Figma UI와 동일하게 hug 축을 FIXED로 뒤집으므로 되돌려야 한다)
      component.resize(freshWidth, freshHeight);
      if (component.layoutMode !== 'NONE' && freshPrimarySizing && freshCounterSizing) {
        component.primaryAxisSizingMode = freshPrimarySizing;
        component.counterAxisSizingMode = freshCounterSizing;
      }
      // 4) 새 자식 이주 (fresh 빌드에서 적용된 모든 자식 설정 보존)
      const freshChildren = [...fresh.children];
      for (const child of freshChildren) {
        component.appendChild(child);
      }
      fresh.remove();

      restoreTransparentRoot(component, options.html);
      component.name = options.alias;

      const propertyIds = bindSlots(component, options.params);
      stampComponent(component, options.alias, options.params, propertyIds);

      const pageName = component.parent && component.parent.type === 'PAGE'
        ? (component.parent as PageNode).name
        : targetPage.name;

      return {
        nodeId: component.id,
        key: component.key,
        name: component.name,
        x: component.x,
        y: component.y,
        width: component.width,
        height: component.height,
        pageName,
        propertyIds,
        updated: true,
        fileId: getOrCreateFileId(),
        fileName: figma.root.name,
      };
    }
    // 기존 노드 소실/limbo → 신규 빌드로 폴백
  }

  // ── 신규 빌드 경로 ──
  await loadDefaultFonts();

  const extracted = parseHTML(options.html);
  if (!extracted) {
    throw new Error('스펙 HTML 파싱 실패');
  }

  const frame = await createFigmaNode(extracted, true, false);
  if (!frame) {
    throw new Error('스펙 HTML → 프레임 변환 실패');
  }
  if (frame.type !== 'FRAME') {
    frame.remove();
    throw new Error(`스펙 루트는 프레임으로 변환되어야 합니다 (현재: ${frame.type})`);
  }

  targetPage.appendChild(frame);

  // createComponentFromNode: Auto Layout 등 모든 속성을 보존한 채 컴포넌트로 승격.
  // (기존 convertToComponent는 fills/strokes/children만 복사해 레이아웃이 유실됨)
  if (typeof figma.createComponentFromNode !== 'function') {
    frame.remove();
    throw new Error('figma.createComponentFromNode API를 사용할 수 없습니다 (Figma 버전 확인 필요)');
  }
  const component = figma.createComponentFromNode(frame);
  component.name = options.alias;

  // 변환기는 페이지 임포트 가독성을 위해 루트의 투명 배경을 흰색으로 대체하지만,
  // 컴포넌트는 임의 배경 위에 놓이므로 스펙에 배경이 없으면 투명을 유지해야 한다.
  const rootBg = extracted.styles && extracted.styles.backgroundColor;
  if (!rootBg || rootBg.a <= 0) {
    component.fills = [];
  }

  if (options.position) {
    component.x = options.position.x;
    component.y = options.position.y;
  } else {
    const autoPos = getAutoPositionOnPage(targetPage, component);
    component.x = autoPos.x;
    component.y = autoPos.y;
  }

  const propertyIds = bindSlots(component, options.params);
  stampComponent(component, options.alias, options.params, propertyIds);

  return {
    nodeId: component.id,
    key: component.key,
    name: component.name,
    x: component.x,
    y: component.y,
    width: component.width,
    height: component.height,
    pageName: targetPage.name,
    propertyIds,
    updated: false,
    fileId: getOrCreateFileId(),
    fileName: figma.root.name,
  };
}

export interface UseComponentSpecOptions {
  componentNodeId: string;
  alias: string;
  props?: Record<string, string>;
  position?: { x: number; y: number };
  /** 생성 직후 인스턴스 크기 지정 — hug 축은 FIXED로 전환됨 (placeholder 용도) */
  width?: number;
  height?: number;
  parentId?: string;
  pageId?: string;
  /** 레지스트리에 기록된 파일 ID — 현재 파일과 불일치하면 거부 */
  expectedFileId?: string;
  /** 레지스트리에 기록된 파일 이름 (에러 안내용) */
  specFileName?: string;
}

export interface UseComponentSpecResult {
  nodeId: string;
  name: string;
  alias: string;
  x: number;
  y: number;
  width: number;
  height: number;
  appliedProps: string[];
  pageName: string;
  /** 텍스트 넘침 등 품질 경고 (없으면 생략) */
  warnings?: string[];
}

/**
 * 등록된 스펙 컴포넌트의 인스턴스를 생성하고 props(TEXT 속성)를 적용한다.
 * 스탬프/파일 검증에 실패하면 명시적 에러 — 조용히 이상한 결과를 만들지 않는다.
 */
export async function useComponentSpec(
  options: UseComponentSpecOptions,
  getTargetPage?: (pageId?: string) => PageNode
): Promise<UseComponentSpecResult> {
  const targetPage = getTargetPage ? getTargetPage(options.pageId) : figma.currentPage;

  // 파일 스코프 검증: 다른 파일에서 등록된 컴포넌트는 이 파일에서 못 쓴다
  if (options.expectedFileId) {
    const currentFileId = getOrCreateFileId();
    if (currentFileId !== options.expectedFileId) {
      const origin = options.specFileName ? `"${options.specFileName}" 파일` : '다른 파일';
      throw new Error(
        `컴포넌트 "${options.alias}"는 ${origin}에서 등록되었습니다 — 현재 파일(${figma.root.name})에서는 사용할 수 없습니다. 이 파일에서 다시 등록하세요`
      );
    }
  }

  const node = figma.getNodeById(options.componentNodeId);
  if (!node) {
    throw new Error(
      `계약 위반: 컴포넌트 노드(${options.componentNodeId})가 존재하지 않습니다. Figma에서 삭제된 것으로 보입니다 — sigma_create_component_spec으로 다시 등록하세요`
    );
  }
  if (node.type !== 'COMPONENT') {
    throw new Error(`계약 위반: 노드가 COMPONENT가 아닙니다 (현재: ${node.type}) — 다시 등록하세요`);
  }
  const component = node as ComponentNode;

  // Figma는 메인 컴포넌트를 삭제해도 기존 인스턴스 보호를 위해 limbo 상태로
  // 유지한다 (getNodeById로 여전히 조회됨, parent만 null). 삭제된 컴포넌트로
  // 조용히 인스턴스를 만들지 않고 명시적으로 실패한다.
  if (!component.parent) {
    throw new Error(
      `계약 위반: 컴포넌트 "${options.alias}"의 노드(${options.componentNodeId})가 Figma에서 삭제되었습니다 — sigma_create_component_spec으로 다시 등록하세요`
    );
  }

  const stampRaw = component.getPluginData(SPEC_STAMP_KEY);
  if (!stampRaw) {
    throw new Error('계약 위반: 컴포넌트에 sigma-spec 스탬프가 없습니다 — MCP로 등록된 컴포넌트가 아니거나 스탬프가 유실되었습니다. 다시 등록하세요');
  }
  let stamp: ComponentSpecStamp;
  try {
    stamp = JSON.parse(stampRaw) as ComponentSpecStamp;
  } catch (e) {
    throw new Error('계약 위반: sigma-spec 스탬프가 손상되었습니다 — 다시 등록하세요');
  }
  if (stamp.alias !== options.alias) {
    throw new Error(
      `계약 위반: alias 불일치 (노드 스탬프: "${stamp.alias}", 요청: "${options.alias}") — 레지스트리와 Figma가 어긋났습니다. 다시 등록하세요`
    );
  }

  // props 검증: 알 수 없는 파라미터는 명시적으로 거부
  const props = options.props ? options.props : {};
  const propKeys = Object.keys(props);
  for (const key of propKeys) {
    if (!stamp.propertyIds[key]) {
      const available = Object.keys(stamp.propertyIds);
      throw new Error(
        `알 수 없는 파라미터: "${key}" (사용 가능: ${available.length > 0 ? available.join(', ') : '없음'})`
      );
    }
  }

  const instance = component.createInstance();

  // 부모 결정: parentId > 대상 페이지
  if (options.parentId) {
    const parent = figma.getNodeById(options.parentId);
    if (!parent) {
      instance.remove();
      throw new Error(`부모 노드를 찾을 수 없습니다: ${options.parentId}`);
    }
    if (!('appendChild' in parent)) {
      instance.remove();
      throw new Error(`자식을 가질 수 없는 노드입니다: ${parent.type}`);
    }
    (parent as ChildrenMixin).appendChild(instance);
  } else {
    targetPage.appendChild(instance);
  }

  if (options.position) {
    instance.x = options.position.x;
    instance.y = options.position.y;
  } else if (!options.parentId) {
    const autoPos = getAutoPositionOnPage(targetPage, instance);
    instance.x = autoPos.x;
    instance.y = autoPos.y;
  }

  // 크기 지정 (미지정 축은 현재 크기 유지)
  if (typeof options.width === 'number' || typeof options.height === 'number') {
    instance.resize(
      typeof options.width === 'number' ? options.width : instance.width,
      typeof options.height === 'number' ? options.height : instance.height
    );
  }

  // TEXT 속성 적용 (텍스트 변경이므로 인스턴스 내 폰트 선로드)
  if (propKeys.length > 0) {
    const textNodes = instance.findAll((n) => n.type === 'TEXT') as TextNode[];
    for (const t of textNodes) {
      if (t.fontName !== figma.mixed) {
        await figma.loadFontAsync(t.fontName as FontName);
      }
    }
    const propertyValues: Record<string, string> = {};
    for (const key of propKeys) {
      propertyValues[stamp.propertyIds[key]] = props[key];
    }
    instance.setProperties(propertyValues);
  }

  const warnings = await collectTextOverflowWarnings(instance);

  const result: UseComponentSpecResult = {
    nodeId: instance.id,
    name: instance.name,
    alias: options.alias,
    x: instance.x,
    y: instance.y,
    width: instance.width,
    height: instance.height,
    appliedProps: propKeys,
    pageName: targetPage.name,
  };
  if (warnings.length > 0) {
    result.warnings = warnings;
  }
  return result;
}

/**
 * 텍스트 넘침 감지: **고정(fixed) 축에서만** 텍스트가 인스턴스 영역을 벗어나면 경고.
 * hug 축은 인스턴스가 함께 늘어나므로 검사하지 않는다 (재계산 과도기의 오탐 방지).
 * ellipsis/wrap slot은 각각 …처리/줄바꿈되어 안 넘친다.
 * setProperties 직후에는 Auto Layout 재계산이 끝나지 않아 bounds가 낡으므로
 * 잠시 양보해 레이아웃을 플러시한 뒤 측정한다.
 */
async function collectTextOverflowWarnings(instance: InstanceNode): Promise<string[]> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
  const warnings: string[] = [];
  const horizontalFixed = instance.layoutMode === 'NONE' || instance.layoutSizingHorizontal !== 'HUG';
  const verticalFixed = instance.layoutMode === 'NONE' || instance.layoutSizingVertical !== 'HUG';
  const instBounds = instance.absoluteBoundingBox;
  if (instBounds && (horizontalFixed || verticalFixed)) {
    const texts = instance.findAll((n) => n.type === 'TEXT') as TextNode[];
    for (const t of texts) {
      const b = t.absoluteBoundingBox;
      if (!b) continue;
      const overX = horizontalFixed
        ? Math.round(b.x + b.width - (instBounds.x + instBounds.width))
        : 0;
      const overY = verticalFixed
        ? Math.round(b.y + b.height - (instBounds.y + instBounds.height))
        : 0;
      if (overX > 1 || overY > 1) {
        const slot = t.getPluginData(SLOT_MARK_KEY);
        const which = slot ? `param "${slot}"의 텍스트` : `텍스트 "${t.characters.slice(0, 20)}"`;
        const dir = overX > 1 ? `가로 ${overX}px` : `세로 ${overY}px`;
        warnings.push(
          `${which}가 컴포넌트 영역을 ${dir} 넘칩니다 — 더 짧은 값을 쓰거나, 스펙의 해당 slot에 text-overflow: ellipsis 또는 white-space: normal(wrap)을 고려하세요`
        );
      }
    }
  }
  return warnings;
}

export interface SetComponentSpecInstancePropsOptions {
  nodeId: string;
  props: Record<string, string>;
}

export interface SetComponentSpecInstancePropsResult {
  nodeId: string;
  alias: string;
  appliedProps: string[];
  width: number;
  height: number;
  warnings?: string[];
}

/**
 * 기존 스펙 인스턴스의 파라미터(TEXT 속성)를 재설정한다.
 * 인스턴스의 메인 컴포넌트 스탬프에서 param 이름 → property id를 해소하므로
 * 에이전트는 param 이름만 알면 된다.
 */
export async function setComponentSpecInstanceProps(
  options: SetComponentSpecInstancePropsOptions
): Promise<SetComponentSpecInstancePropsResult> {
  const node = figma.getNodeById(options.nodeId);
  if (!node) {
    throw new Error(`노드를 찾을 수 없습니다: ${options.nodeId}`);
  }
  if (node.type !== 'INSTANCE') {
    throw new Error(`INSTANCE가 아닙니다 (현재: ${node.type}) — 스펙 인스턴스의 nodeId를 지정하세요`);
  }
  const instance = node as InstanceNode;

  const main = instance.mainComponent;
  if (!main) {
    throw new Error('인스턴스의 메인 컴포넌트를 찾을 수 없습니다');
  }
  const stampRaw = main.getPluginData(SPEC_STAMP_KEY);
  if (!stampRaw) {
    throw new Error('스펙 컴포넌트의 인스턴스가 아닙니다 (sigma-spec 스탬프 없음) — sigma_set_instance_overrides를 사용하세요');
  }
  let stamp: ComponentSpecStamp;
  try {
    stamp = JSON.parse(stampRaw) as ComponentSpecStamp;
  } catch (e) {
    throw new Error('계약 위반: sigma-spec 스탬프가 손상되었습니다 — 컴포넌트를 다시 등록하세요');
  }

  const propKeys = Object.keys(options.props);
  if (propKeys.length === 0) {
    throw new Error('변경할 props가 없습니다');
  }
  for (const key of propKeys) {
    if (!stamp.propertyIds[key]) {
      const available = Object.keys(stamp.propertyIds);
      throw new Error(
        `알 수 없는 파라미터: "${key}" (사용 가능: ${available.length > 0 ? available.join(', ') : '없음'})`
      );
    }
  }

  // 텍스트 변경이므로 인스턴스 내 폰트 선로드
  const textNodes = instance.findAll((n) => n.type === 'TEXT') as TextNode[];
  for (const t of textNodes) {
    if (t.fontName !== figma.mixed) {
      await figma.loadFontAsync(t.fontName as FontName);
    }
  }
  const propertyValues: Record<string, string> = {};
  for (const key of propKeys) {
    propertyValues[stamp.propertyIds[key]] = options.props[key];
  }
  instance.setProperties(propertyValues);

  const warnings = await collectTextOverflowWarnings(instance);

  const result: SetComponentSpecInstancePropsResult = {
    nodeId: instance.id,
    alias: stamp.alias,
    appliedProps: propKeys,
    width: instance.width,
    height: instance.height,
  };
  if (warnings.length > 0) {
    result.warnings = warnings;
  }
  return result;
}

/**
 * 페이지 위 자동 배치: 기존 콘텐츠 오른쪽에 간격을 두고 배치
 */
function getAutoPositionOnPage(page: PageNode, exclude: SceneNode): { x: number; y: number } {
  let maxX = -Infinity;
  let minY = Infinity;
  for (const child of page.children) {
    if (child.id === exclude.id) continue;
    const right = child.x + ('width' in child ? child.width : 0);
    if (right > maxX) maxX = right;
    if (child.y < minY) minY = child.y;
  }
  if (maxX === -Infinity) {
    return { x: 0, y: 0 };
  }
  return { x: maxX + 100, y: minY === Infinity ? 0 : minY };
}
