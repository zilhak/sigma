# Sigma

웹 컴포넌트를 추출하여 Figma로 가져오는 모듈형 Design-to-Code Bridge

## 개요

```
Web Page → Chrome Extension → Local Server → Figma Plugin → Figma
                                   ↑
                              AI Agent (MCP)
```

**핵심 철학:** 서로 연동하면 최고의 효율, 따로따로도 사용 가능

## 모듈 구성

| 모듈 | 역할 |
|------|------|
| **Chrome Extension** | 웹페이지에서 컴포넌트 선택 및 추출 |
| **Local Server** | 중앙 허브, MCP 서버, HTTP/WebSocket API |
| **Figma Plugin** | JSON 데이터를 Figma 프레임으로 변환 |

## 기술 스택

- **Runtime:** Bun
- **Language:** TypeScript
- **Server Framework:** Hono
- **MCP:** @modelcontextprotocol/sdk
- **Package Manager:** Bun workspace

## 빠른 시작

### 개발 환경

```bash
# 의존성 설치
bun install

# 개발 모드 (watch)
bun dev

# 서버만 실행
bun run --filter @sigma/server start
```

### 프로덕션 환경 (Docker)

```bash
# 서버 시작 (백그라운드, 자동 재시작)
docker compose up -d

# 로그 확인
docker compose logs -f sigma

# 서버 중지
docker compose down
```

> Docker Desktop의 "Start on login" 옵션과 함께 사용하면 컴퓨터 부팅 시 자동으로 서버가 시작됩니다.

## 사용 방법

### 수동 (서버 없이)
1. Extension으로 컴포넌트 추출 → 클립보드 복사
2. Figma Plugin에서 JSON 붙여넣기 → 프레임 생성

### AI Agent 자동화

**MCP 서버 등록 (Claude Code):**
```bash
claude mcp add --transport http sigma http://localhost:19832/api/mcp
```

**사용 예시:**
```
User: "Storybook에서 Badge 컴포넌트를 Figma에 가져와줘"

AI Agent:
1. [Playwright] 페이지 이동
2. [Sigma MCP] figma_create_frame()
```

**MCP 도구 목록:**
| 도구 | 설명 |
|------|------|
| `figma_status` | Figma 연결 상태 확인 |
| `figma_create_frame` | JSON 데이터로 Figma 프레임 생성 |
| `figma_get_frames` | Figma 현재 페이지의 프레임 목록 조회 |
| `figma_import_file` | 저장된 컴포넌트를 Figma로 가져오기 |
| `list_saved` | 저장된 컴포넌트 목록 |
| `save_extracted` | 컴포넌트 저장 |

## 문서

상세 구현 계획 및 아키텍처는 [CLAUDE.md](./CLAUDE.md) 참조

## 포트

| 서비스 | 포트 |
|--------|------|
| HTTP Server | 19832 |
| WebSocket Server | 19831 |

## 제약 사항

- **Figma Plugin:** Desktop App 전용 (Web 버전 미지원)
- **서버:** localhost만 리스닝 (보안)

## License

MIT
