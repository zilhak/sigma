/**
 * predicate 커스텀 규칙(kind:"predicate") 실행기.
 *
 * Bun의 node:vm 은 공식 문서·커뮤니티 둘 다 "샌드박싱 용도로는 fragile"로 표시하는 반면
 * node:worker_threads(+Worker.terminate())는 안정 지원된다 — 실측(이 파일 작성 전 별도
 * 스크립트로 eval:true 워커 + 무한루프 terminate() 검증 완료, 프로세스가 안 멈춤을 확인).
 * 그래서 각 규칙을 별도 Worker에서 실행하고, 타임아웃 초과 시 terminate() 한다.
 *
 * 격리 범위: predicate는 라이브 Figma 객체가 아니라 이미 서버가 들고 있는 **직렬화된 노드
 * 데이터**(LintNode) 위에서만 동작한다 — 문서를 직접 변형할 수 없다(§1 read-only 결정).
 */
import { Worker } from 'node:worker_threads';
import type { LintNode, PredicateRule, Violation } from '@sigma/shared/lint';

const DEFAULT_TIMEOUT_MS = 2000;

/** 규칙 안의 관계 조회를 위해 함께 넘기는 트리 관계 맵(id 기반, 이미 shared/lint/tree-utils 로 만들어짐). */
export interface CtxRelations {
  byId: Record<string, LintNode>;
  siblings: Record<string, string[]>;
  ancestors: Record<string, string[]>;
  children: Record<string, string[]>;
}

export interface RunPredicateRuleInput {
  rule: PredicateRule;
  nodes: LintNode[];
  relations: CtxRelations;
}

/** predicate 규칙의 code 계약: "export default function(node, ctx) {...}" 형태만 허용. */
function toModuleExports(code: string): string {
  const trimmed = code.trim();
  if (!trimmed.startsWith('export default')) {
    throw new Error('predicate 규칙의 code 는 "export default function(node, ctx) { ... }" 형태여야 합니다');
  }
  return `module.exports = ${trimmed.slice('export default'.length)}`;
}

// eval:true 워커에 그대로 넘기는 스크립트 문자열. workerData로 컴파일된 코드 + 노드 데이터 + 관계 맵을 받는다.
const WORKER_SCRIPT = [
  "const { parentPort, workerData } = require('node:worker_threads');",
  'try {',
  '  const { compiledCode, nodes, ruleId, relations } = workerData;',
  '  const ctx = {',
  '    getSiblings: (id) => (relations.siblings[id] || []).map((sid) => relations.byId[sid]).filter(Boolean),',
  '    getAncestors: (id) => (relations.ancestors[id] || []).map((aid) => relations.byId[aid]).filter(Boolean),',
  '    getChildren: (id) => (relations.children[id] || []).map((cid) => relations.byId[cid]).filter(Boolean),',
  '  };',
  '  const mod = { exports: undefined };',
  "  const fn = new Function('module', compiledCode);",
  '  fn(mod);',
  "  const predicate = mod.exports;",
  "  if (typeof predicate !== 'function') throw new Error('code 가 함수를 export하지 않았습니다');",
  '  const violations = [];',
  '  for (const node of nodes) {',
  '    const result = predicate(node, ctx);',
  '    if (result) {',
  '      violations.push({',
  '        rule: ruleId,',
  "        source: 'custom',",
  "        message: result.message || (ruleId + ' 위반'),",
  '        nodes: result.nodes || [node.id],',
  '      });',
  '    }',
  '  }',
  '  parentPort.postMessage({ ok: true, violations });',
  '} catch (err) {',
  '  parentPort.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });',
  '}',
].join('\n');

export async function runPredicateRule(input: RunPredicateRuleInput): Promise<Violation[]> {
  const { rule } = input;
  const timeoutMs = rule.timeoutMs !== undefined ? rule.timeoutMs : DEFAULT_TIMEOUT_MS;

  let compiledCode: string;
  try {
    compiledCode = toModuleExports(rule.code);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return [{ rule: rule.id, source: 'custom', message: `규칙 정의 오류: ${msg}`, nodes: [], error: msg }];
  }

  return new Promise<Violation[]>((resolvePromise) => {
    let settled = false;
    const worker = new Worker(WORKER_SCRIPT, {
      eval: true,
      workerData: {
        compiledCode,
        nodes: input.nodes,
        ruleId: rule.id,
        relations: input.relations,
      },
    });

    const finish = (violations: Violation[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate(); // 결과를 기다리지 않는다 — Bun에서 terminate() 후속 이벤트가 불안정하게 관찰됨(실측)
      resolvePromise(violations);
    };

    const timer = setTimeout(() => {
      finish([{
        rule: rule.id, source: 'custom',
        message: `타임아웃(${timeoutMs}ms) 초과로 규칙 실행이 중단되었습니다`,
        nodes: [], error: 'timeout',
      }]);
    }, timeoutMs);

    worker.once('message', (msg: { ok: boolean; violations?: Violation[]; error?: string }) => {
      if (msg.ok) {
        finish(msg.violations || []);
      } else {
        finish([{ rule: rule.id, source: 'custom', message: `실행 에러: ${msg.error}`, nodes: [], error: msg.error }]);
      }
    });

    worker.once('error', (err: Error) => {
      finish([{ rule: rule.id, source: 'custom', message: `Worker 에러: ${err.message}`, nodes: [], error: err.message }]);
    });
  });
}
