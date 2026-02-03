# Sigma Server Dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock* bunfig.toml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
RUN bun install --no-save

# Production runner
FROM base AS runner

# Copy dependencies (Bun hoists to root node_modules)
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
COPY package.json ./

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
CMD ["bun", "run", "packages/server/src/index.ts"]
