/**
 * 전체 파일 lint 결과를 사람이 읽기 좋은 markdown 리포트 파일로 떨군다.
 * 스크린샷과 동일하게 ~/.sigma/lint-reports/ 에 저장하고 호스트 경로(toHostPath)를 반환한다.
 * MCP 응답에는 거대한 violations 배열 대신 요약 + 이 리포트 경로만 싣는다.
 */
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import type { Violation } from '@sigma/shared';
import { toHostPath, REPORTS_DIR } from '../storage/index.js';
import type { ConfigSource, ConfigMode } from './resolve-config.js';

export interface PageLintResult {
  pageId: string;
  pageName: string;
  configSource: ConfigSource;
  configError?: string;
  violations: Violation[];
  /** 노드 lint-ignore 로 억제된 위반 수 (있을 때만) */
  suppressedCount?: number;
}

export interface ReportMeta {
  fileName: string;
  scope: string;          // 'file' | 'page'
  configMode: ConfigMode;
  baseConfigLabel: string; // 'inline' | configPath | 'document-stored' | 'none'
  timestamp: number;       // Date.now()
}

function isoOf(ts: number): string {
  // 스크립트 제약(Workflow)과 무관한 서버 컨텍스트라 Date 사용 가능
  return new Date(ts).toISOString();
}

/** 룰별 위반 수 집계 */
function ruleTally(violations: Violation[]): Array<{ rule: string; count: number }> {
  const m = new Map<string, number>();
  for (const v of violations) m.set(v.rule, (m.get(v.rule) || 0) + 1);
  return [...m.entries()].map(([rule, count]) => ({ rule, count })).sort((a, b) => b.count - a.count);
}

const SOURCE_LABEL: Record<ConfigSource, string> = {
  'base': 'base(명시)',
  'page-stored': '페이지 저장',
  'merged': '병합(base+페이지)',
  'skipped': '건너뜀',
};

export function renderReportMarkdown(pages: PageLintResult[], meta: ReportMeta): string {
  const total = pages.reduce((s, p) => s + p.violations.length, 0);
  const totalSuppressed = pages.reduce((s, p) => s + (p.suppressedCount || 0), 0);
  const checked = pages.filter(p => p.configSource !== 'skipped');
  const skipped = pages.filter(p => p.configSource === 'skipped');
  const dirty = checked.filter(p => p.violations.length > 0);

  const lines: string[] = [];
  lines.push(`# sigma lint 리포트 — ${meta.fileName}`);
  lines.push('');
  lines.push(`- 생성: ${isoOf(meta.timestamp)}`);
  lines.push(`- 범위: \`${meta.scope}\` · config 모드: \`${meta.configMode}\` · base: \`${meta.baseConfigLabel}\``);
  lines.push(`- 검사 페이지: ${checked.length}개 (건너뜀 ${skipped.length}개) · **총 위반 ${total}건**${totalSuppressed ? ` · 억제됨 ${totalSuppressed}건(노드 lint-ignore)` : ''}`);
  lines.push('');

  // 요약 판정
  if (total === 0) {
    lines.push(checked.length === 0
      ? '> ⚠️ 검사된 페이지가 없습니다(모두 건너뜀 — per-page 모드에서 저장 config·base 부재).'
      : '> ✅ 검사된 모든 페이지가 clean 합니다.');
    lines.push('');
  }

  // 페이지별 요약 표
  lines.push('## 페이지별 요약');
  lines.push('');
  lines.push('| 페이지 | config 출처 | 위반 | 비고 |');
  lines.push('|---|---|--:|---|');
  for (const p of pages) {
    const notes: string[] = [];
    if (p.configError) notes.push(`⚠️ ${p.configError}`);
    else if (p.configSource === 'skipped') notes.push('config 없음');
    if (p.suppressedCount) notes.push(`억제 ${p.suppressedCount}`);
    const cnt = p.configSource === 'skipped' ? '—' : String(p.violations.length);
    lines.push(`| ${p.pageName} | ${SOURCE_LABEL[p.configSource]} | ${cnt} | ${notes.join(' · ')} |`);
  }
  lines.push('');

  // 위반 상세 (위반 있는 페이지만)
  if (dirty.length > 0) {
    lines.push('## 위반 상세');
    lines.push('');
    for (const p of dirty) {
      lines.push(`### ${p.pageName}  \`${p.pageId}\``);
      lines.push('');
      const tally = ruleTally(p.violations);
      lines.push('룰별 집계: ' + tally.map(t => `\`${t.rule}\` ${t.count}`).join(' · '));
      lines.push('');
      lines.push('| # | 룰 | 메시지 | 노드 |');
      lines.push('|--:|---|---|---|');
      p.violations.forEach((v, i) => {
        const nodes = v.nodes.join(', ');
        const msg = v.message.replace(/\|/g, '\\|').replace(/\n/g, ' ');
        const ruleCell = v.error ? `${v.rule} ⚠️` : v.rule;
        lines.push(`| ${i + 1} | \`${ruleCell}\` | ${msg} | \`${nodes}\` |`);
      });
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * 리포트 md 를 파일로 쓰고 호스트 경로를 반환.
 */
export async function writeLintReport(pages: PageLintResult[], meta: ReportMeta): Promise<string> {
  await mkdir(REPORTS_DIR, { recursive: true });
  const md = renderReportMarkdown(pages, meta);
  const stamp = isoOf(meta.timestamp).replace(/[:.]/g, '-');
  const filename = `lint-${stamp}.md`;
  const filepath = join(REPORTS_DIR, filename);
  await writeFile(filepath, md, 'utf-8');
  return toHostPath(filepath);
}
