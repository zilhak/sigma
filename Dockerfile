# Sigma Server Dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# Copy everything needed for install + run
COPY package.json bun.lock* bunfig.toml ./
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server

# Install after source copy so workspace symlinks are created correctly
RUN bun install --no-save

# Create data directory
RUN mkdir -p /root/.sigma/extracted

# Expose ports
# 19831: WebSocket (Figma Plugin communication)
# 19832: HTTP API + MCP
EXPOSE 19831 19832

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD bun --eval "fetch('http://localhost:19832/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run the server
# 시작 시 임베드 스크립트를 볼륨(~/.sigma/scripts)으로 복사 — 호스트 Playwright가 최신 스크립트에 접근 가능
CMD ["sh", "-c", "mkdir -p /root/.sigma/scripts && cp /app/packages/shared/dist/*.js /root/.sigma/scripts/ && exec bun run packages/server/src/index.ts"]
