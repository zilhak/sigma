import type { ComponentParam, ComponentSpecStamp } from '@sigma/shared';
import { parseHTML } from '../converter/html-parser';
import { createFigmaNode } from '../converter/node-creator';

/**
 * 컴포넌트 스펙 시스템 — 스펙(HTML)으로 컴포넌트 빌드 + alias 기반 인스턴스 생성
 *
 * 계약:
 * - 빌드된 ComponentNode에는 pluginData('sigma-spec')로 스탬프가 심어진다
 *   (alias, params, propertyIds). 스탬프는 .fig 파일과 함께 이동하는 파일 내장 진실.
 * - 사용(use) 시 스탬프를 검증하고, 어긋나면 조용히 진행하지 않고 명시적 에러를 낸다.
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
}

/**
 * 스펙 HTML로 Figma 컴포넌트를 빌드한다.
 * HTML → 프레임 변환(기존 변환기) → 컴포넌트 승격 → slot을 TEXT 속성으로 연결 → 스탬프.
 */
export async function buildComponentFromSpec(
  options: BuildComponentFromSpecOptions,
  getTargetPage?: (pageId?: string) => PageNode
): Promise<BuildComponentFromSpecResult> {
  const targetPage = getTargetPage ? getTargetPage(options.pageId) : figma.currentPage;

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

  if (options.position) {
    component.x = options.position.x;
    component.y = options.position.y;
  } else {
    const autoPos = getAutoPositionOnPage(targetPage, component);
    component.x = autoPos.x;
    component.y = autoPos.y;
  }

  // slot 마커(pluginData 'sigma-slot')가 심어진 TextNode를 찾아 TEXT 속성으로 연결
  const propertyIds: Record<string, string> = {};
  const slotTextNodes = component.findAll(
    (n) => n.type === 'TEXT' && n.getPluginData(SLOT_MARK_KEY) !== ''
  ) as TextNode[];

  for (const param of options.params) {
    const textNode = slotTextNodes.find((t) => t.getPluginData(SLOT_MARK_KEY) === param.name);
    if (!textNode) {
      component.remove();
      throw new Error(
        `slot "${param.name}"에 해당하는 텍스트 노드를 찾지 못했습니다 — 변환기가 slot 요소를 TextNode로 만들지 않았습니다 (스펙 검증기와 변환기의 불일치, 버그 신고 필요)`
      );
    }
    const propertyName = component.addComponentProperty(param.name, 'TEXT', param.defaultValue);
    textNode.componentPropertyReferences = { characters: propertyName };
    propertyIds[param.name] = propertyName;
  }

  // 파일 내장 계약 스탬프
  const stamp: ComponentSpecStamp = {
    alias: options.alias,
    params: options.params,
    propertyIds,
  };
  component.setPluginData(SPEC_STAMP_KEY, JSON.stringify(stamp));

  if (targetPage.id === figma.currentPage.id) {
    figma.currentPage.selection = [component];
    figma.viewport.scrollAndZoomIntoView([component]);
  }

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
  };
}

export interface UseComponentSpecOptions {
  componentNodeId: string;
  alias: string;
  props?: Record<string, string>;
  position?: { x: number; y: number };
  parentId?: string;
  pageId?: string;
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
}

/**
 * 등록된 스펙 컴포넌트의 인스턴스를 생성하고 props(TEXT 속성)를 적용한다.
 * 스탬프 검증에 실패하면 명시적 에러 — 조용히 이상한 결과를 만들지 않는다.
 */
export async function useComponentSpec(
  options: UseComponentSpecOptions,
  getTargetPage?: (pageId?: string) => PageNode
): Promise<UseComponentSpecResult> {
  const targetPage = getTargetPage ? getTargetPage(options.pageId) : figma.currentPage;

  const node = figma.getNodeById(options.componentNodeId);
  if (!node) {
    throw new Error(
      `계약 위반: 컴포넌트 노드(${options.componentNodeId})가 존재하지 않습니다. Figma에서 삭제된 것으로 보입니다 — sigma_define_component로 다시 등록하세요`
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
      `계약 위반: 컴포넌트 "${options.alias}"의 노드(${options.componentNodeId})가 Figma에서 삭제되었습니다 — sigma_define_component로 다시 등록하세요`
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

  return {
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
