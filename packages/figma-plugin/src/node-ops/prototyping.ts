/**
 * 프로토타이핑(Interaction/Reaction) 관련 기능
 * cursor-talk-to-figma의 get_reactions 참고
 */

export interface ReactionInfo {
  trigger: {
    type: string;
    [key: string]: unknown;
  };
  actions: Array<{
    type: string;
    [key: string]: unknown;
  }>;
}

export interface GetReactionsResult {
  nodeId: string;
  name: string;
  reactions: ReactionInfo[];
}

export interface AddReactionParams {
  nodeId: string;
  trigger: string; // ON_CLICK, ON_HOVER, ON_PRESS, ON_DRAG, MOUSE_ENTER, MOUSE_LEAVE, AFTER_TIMEOUT
  action: string;  // NAVIGATE, OVERLAY, BACK, CLOSE, OPEN_URL, SCROLL_TO, SWAP
  destinationId?: string; // NAVIGATE, OVERLAY, SCROLL_TO, SWAP에 필요
  url?: string;           // OPEN_URL에 필요
  transition?: {
    type: string;   // DISSOLVE, SMART_ANIMATE, MOVE_IN, MOVE_OUT, PUSH, SLIDE_IN, SLIDE_OUT
    duration?: number;
    direction?: string; // LEFT, RIGHT, TOP, BOTTOM
  };
  preserveScrollPosition?: boolean;
}

export interface AddReactionResult {
  nodeId: string;
  name: string;
  reactionCount: number;
  added: {
    trigger: string;
    action: string;
    destinationId?: string;
    url?: string;
  };
}

export function addReaction(params: AddReactionParams): AddReactionResult {
  const node = figma.getNodeById(params.nodeId);
  if (!node) throw new Error(`노드를 찾을 수 없습니다: ${params.nodeId}`);
  if (!('reactions' in node)) throw new Error(`이 노드 타입은 리액션을 지원하지 않습니다: ${node.type}`);

  const reactionsNode = node as SceneNode & { reactions: ReadonlyArray<Reaction> };

  // Action 구성 (plain object로 빌드 후 캐스팅)
  const actionProps: Record<string, unknown> = {};

  switch (params.action) {
    case 'NAVIGATE':
    case 'OVERLAY':
    case 'SCROLL_TO':
    case 'SWAP': {
      if (!params.destinationId) throw new Error(`${params.action} 액션에는 destinationId가 필요합니다`);
      const destNode = figma.getNodeById(params.destinationId);
      if (!destNode) throw new Error(`대상 노드를 찾을 수 없습니다: ${params.destinationId}`);
      actionProps.type = 'NODE';
      actionProps.destinationId = params.destinationId;
      actionProps.navigation = params.action;
      break;
    }
    case 'BACK':
      actionProps.type = 'BACK';
      break;
    case 'CLOSE':
      actionProps.type = 'CLOSE';
      break;
    case 'OPEN_URL': {
      if (!params.url) throw new Error('OPEN_URL 액션에는 url이 필요합니다');
      actionProps.type = 'URL';
      actionProps.url = params.url;
      break;
    }
    default:
      throw new Error(`지원하지 않는 액션: ${params.action}`);
  }

  // Transition 구성
  if (params.transition) {
    const t = params.transition;
    const tType = (t.type || 'DISSOLVE') as string;
    const directionalTypes = ['MOVE_IN', 'MOVE_OUT', 'PUSH', 'SLIDE_IN', 'SLIDE_OUT'];

    if (directionalTypes.includes(tType)) {
      actionProps.transition = {
        type: tType,
        direction: (t.direction || 'LEFT'),
        matchLayers: false,
        duration: t.duration !== undefined ? t.duration : 0.3,
        easing: { type: 'EASE_IN_AND_OUT' },
      };
    } else {
      actionProps.transition = {
        type: tType,
        duration: t.duration !== undefined ? t.duration : 0.3,
        easing: { type: 'EASE_IN_AND_OUT' },
      };
    }
  }

  if (params.preserveScrollPosition !== undefined) {
    actionProps.preserveScrollPosition = params.preserveScrollPosition;
  }

  const actionObj = actionProps as unknown as Action;

  // Trigger 구성
  const trigger = { type: params.trigger } as unknown as Trigger;

  // 기존 리액션에 추가
  const newReaction: Reaction = { trigger, actions: [actionObj] };
  const existingReactions = [...reactionsNode.reactions];
  existingReactions.push(newReaction);
  reactionsNode.reactions = existingReactions;

  return {
    nodeId: node.id,
    name: node.name,
    reactionCount: existingReactions.length,
    added: {
      trigger: params.trigger,
      action: params.action,
      ...(params.destinationId ? { destinationId: params.destinationId } : {}),
      ...(params.url ? { url: params.url } : {}),
    },
  };
}

export interface RemoveReactionsResult {
  nodeId: string;
  name: string;
  removedCount: number;
  remainingCount: number;
}

export function removeReactions(nodeId: string, triggerType?: string): RemoveReactionsResult {
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);
  if (!('reactions' in node)) throw new Error(`이 노드 타입은 리액션을 지원하지 않습니다: ${node.type}`);

  const reactionsNode = node as SceneNode & { reactions: ReadonlyArray<Reaction> };
  const before = reactionsNode.reactions.length;

  if (triggerType) {
    // 특정 트리거 타입만 제거
    const filtered = reactionsNode.reactions.filter(r => r.trigger && r.trigger.type !== triggerType);
    reactionsNode.reactions = filtered;
  } else {
    // 전부 제거
    reactionsNode.reactions = [];
  }

  const after = (reactionsNode as any).reactions.length;
  return {
    nodeId: node.id,
    name: node.name,
    removedCount: before - after,
    remainingCount: after,
  };
}

export function getReactions(nodeId: string): GetReactionsResult {
  // nodeId 필수 — 예전에는 미지정 시 "현재 선택"으로 폴백했으나, 도구 결과가
  // 사용자의 캔버스 선택 상태에 따라 달라져 재현이 불가능했다(뷰 상태 의존).
  if (!nodeId) throw new Error('nodeId가 필요합니다');
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`);

  const reactions: ReactionInfo[] = [];
  if ('reactions' in node) {
    const nodeReactions = (node as any).reactions;
    if (Array.isArray(nodeReactions)) {
      for (const reaction of nodeReactions) {
        const trigger = reaction.trigger
          ? { type: reaction.trigger.type || 'UNKNOWN' }
          : { type: 'UNKNOWN' };

        const actions: ReactionInfo['actions'] = [];
        if (Array.isArray(reaction.actions)) {
          for (const action of reaction.actions) {
            actions.push({
              type: action.type || 'UNKNOWN',
              ...(action.destinationId ? { destinationId: action.destinationId } : {}),
              ...(action.navigation ? { navigation: action.navigation } : {}),
              ...(action.transition ? { transition: action.transition } : {}),
            });
          }
        }

        reactions.push({ trigger, actions });
      }
    }
  }

  return {
    nodeId: node.id,
    name: node.name,
    reactions,
  };
}
