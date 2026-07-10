# 설치 및 배포

## 사전 요구사항

- [Bun](https://bun.sh/) v1.0+
- [Figma Desktop App](https://www.figma.com/downloads/) (Web 버전 미지원)
- Chrome (Extension 사용 시)

## 소스 빌드

```bash
# 1. 저장소 클론
git clone https://github.com/zilhak/sigma.git
cd sigma

# 2. 의존성 설치
bun install

# 3. 전체 빌드 (서버 + 임베드 스크립트 + Figma Plugin + Extension)
bun run build

# 4. 서버 실행
bun run --filter @sigma/server start
```

## 개발 모드

```bash
# 전체 개발 모드 (server + figma-plugin + chrome-extension 병렬 watch)
bun dev

# 개별 패키지 개발 모드
bun run --filter @sigma/server dev
bun run --filter @sigma/figma-plugin dev
bun run --filter @sigma/chrome-extension dev
```

## Figma Plugin 설치

1. Figma **Desktop App** 실행
2. Plugins → Development → **Import plugin from manifest**
3. `packages/figma-plugin/dist/manifest.json` 선택

> Figma Web 버전은 브라우저 샌드박스에서 localhost 접근이 불가하여 지원하지 않습니다.

## Chrome Extension 설치 (선택)

1. `chrome://extensions` → 개발자 모드 ON
2. **압축해제된 확장 프로그램을 로드합니다** 클릭
3. `packages/chrome-extension/dist` 폴더 선택

## MCP 서버 등록

AI Agent (Claude Code 등)에서 사용하려면 MCP 서버를 등록합니다.

```bash
# Streamable HTTP 방식
claude mcp add --transport http sigma http://localhost:19832/api/mcp
```

---

## Docker 배포

서버만 Docker로 실행할 수 있습니다. Figma Plugin과 Extension은 로컬 설치가 필요합니다.

### 실행

```bash
# 서버 시작 (백그라운드)
docker compose up -d

# 로그 확인
docker compose logs -f sigma

# 서버 중지
docker compose down

# 코드 변경 후 재빌드
docker compose up -d --build
```

### 구성

- **베이스 이미지:** `oven/bun:1`
- **포트:** `19831`(WS), `19832`(HTTP+MCP)
- **데이터:** `~/.sigma` → 컨테이너 `/root/.sigma` (bind mount)
- **재시작:** `restart: always` (Docker Desktop 시작 시 자동)
- **헬스체크:** `GET /api/health`, 30초 간격

### 제약

Docker 모드에서는 다음 기능이 제한됩니다:

| 기능 | Docker | 로컬 |
|------|--------|------|
| HTTP API | O | O |
| WebSocket (Plugin 연결) | O | O |
| MCP (Streamable HTTP) | O | O |
| MCP (stdio) | X | O |
| 임베드 스크립트 inject | X (경로 변환 필요) | O |

> AI Agent 자동화를 사용하려면 **로컬 실행**을 권장합니다.

---

## 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `SIGMA_SCRIPTS_DIR` | `packages/shared/dist/` | 임베드 스크립트 디렉토리 경로 |
| `SIGMA_HOST_DATA_DIR` | — | Docker: 컨테이너→호스트 경로 변환 |
| `SIGMA_DATA_DIR` | `~/.sigma` | 데이터 저장 경로 override |

## 임베드 스크립트 설치 (.env)

서버가 임베드 스크립트 경로를 알아야 `sigma_get_playwright_scripts` 도구가 동작합니다.

```bash
# 자동 설정 (shared 빌드 + .env에 경로 등록)
bun run install:scripts
```

이 명령은 `@sigma/shared`를 빌드하고 `.env` 파일에 `SIGMA_SCRIPTS_DIR` 경로를 기록합니다.

## 포트 충돌 확인

```bash
# 19831, 19832 포트 사용 여부 확인
lsof -i :19831
lsof -i :19832
```

## 제약 사항

- **Figma Plugin:** Desktop App 전용 (Web 버전 미지원)
- **서버:** localhost만 리스닝 (보안 목적, 외부 접근 불가)
- **MCP 서버 재시작 금지:** Claude Code에서 MCP 서버를 종료하면 재연결 방법이 없음
