/**
 * 한글 유니코드 이스케이프 감지 (요청 원문 기준).
 *
 * ⚠️ 왜 필요한가: 목업 주석 오타가 **10섹션 연속** 재발했고 원인은 예외 없이 하나였다 —
 * 한글을 `\uXXXX` 로 손조립하다 음절을 틀린 것(`뜼다`·`바뀜다`·`고랐을`·`옥긴`·`컴럼` …).
 * 결과물에서 오타를 찾는 lint 규칙(`broken-hangul`)은 **자모가 깨진 음절과 이미 본 형태만**
 * 잡을 수 있어 원리상 뒤쫓기만 한다. 이건 오타가 생기는 **유일한 경로**를 짚는다.
 *
 * JSON 파서를 통과한 뒤에는 이스케이프였는지 알 수 없으므로 **파싱 전 원문**을 봐야 한다.
 * 요청 하나를 처리하는 동안만 플래그를 들고 있다가, 텍스트를 만드는 도구의 응답에 경고를 싣는다.
 */

/**
 * 한글 음절(U+AC00–U+D7A3) 또는 자모(U+1100–U+11FF, U+3130–U+318F) 이스케이프 후보.
 * ⚠️ 음절 범위는 첫 자리가 a·b·c·d 넷 다 나온다(`직` = 직). 처음 `[aAdD]` 로 썼다가
 * b·c 로 시작하는 음절을 통째로 놓쳤다 — 실측에서 "직접 입력"이 안 걸려 발견.
 * 정확한 범위 판정은 아래 isHangulCodePoint 가 한 번 더 한다.
 */
const HANGUL_ESCAPE = /\\u(?:[a-dA-D][0-9a-fA-F]{3}|11[0-9a-fA-F]{2}|31[3-8][0-9a-fA-F])/g;

function isHangulCodePoint(hex: string): boolean {
  const cp = parseInt(hex, 16);
  return (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3130 && cp <= 0x318f);
}

/**
 * 요청 원문에 한글 이스케이프가 있으면 그 표기들을 돌려준다(최대 5개).
 *
 * ⚠️ **클라이언트가 non-ASCII 를 전부 이스케이프해 직렬화하면 판정하지 않는다**(원문에 ASCII 밖
 * 문자가 하나도 없는 경우). Python `json.dumps` 는 기본이 `ensure_ascii=True` 라 한글을 그대로
 * 입력해도 전송 원문은 `\uXXXX` 가 되고, 그러면 이 경고가 **상시** 뜬다. 상시 오탐이면 경고를
 * 습관적으로 무시하게 되고 장치가 죽는다 — 신호가 없을 때는 아무 말도 하지 않는 편이 낫다.
 * 원문에 한글이 그대로 섞여 있는데도 일부를 이스케이프했다면 그건 손조립이므로 그대로 잡는다.
 */
export function findHangulEscapes(rawBody: string): string[] {
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(rawBody)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  HANGUL_ESCAPE.lastIndex = 0;
  while ((m = HANGUL_ESCAPE.exec(rawBody)) !== null) {
    const hex = m[0].slice(2);
    if (!isHangulCodePoint(hex)) continue;
    if (seen.has(m[0])) continue;
    seen.add(m[0]);
    out.push(`${m[0]} (${String.fromCodePoint(parseInt(hex, 16))})`);
    if (out.length >= 5) break;
  }
  return out;
}

/** 요청 하나를 처리하는 동안만 유효한 플래그. 라우터가 세팅하고 도구 핸들러가 읽는다. */
let current: string[] | null = null;

export function setHangulEscapeFlag(escapes: string[] | null): void {
  current = escapes && escapes.length > 0 ? escapes : null;
}

export function getHangulEscapeFlag(): string[] | null {
  return current;
}

/** 한글 텍스트를 만들 수 있는 도구 — 이 도구들의 응답에만 경고를 싣는다. */
export const TEXT_WRITING_TOOLS = new Set([
  'sigma_create_text',
  'sigma_modify_node',
  'sigma_batch_modify',
  'sigma_set_multiple_text_contents',
  'sigma_create_component_spec_instance',
  'sigma_set_component_spec_instance_props',
  'sigma_set_instance_overrides',
  'sigma_create_sticky',
  'sigma_set_annotation',
  'sigma_set_multiple_annotations',
]);

export const HANGUL_ESCAPE_WARNING =
  '한글을 \\uXXXX 이스케이프로 넘겼습니다. 그렇게 손으로 조립하다 음절을 틀린 오타가 반복해서 나왔으니(뜼다·바뀜다·컴럼 …) 한글은 그대로 입력하세요.';
