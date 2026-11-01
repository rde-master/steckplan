# syntax=docker/dockerfile:1
# Build-Kontext ist das Repository-Root:
#   docker build -f apps/docker/Dockerfile -t steckplan .

# --- Build-Stufe: läuft immer auf der Plattform des Build-Rechners (schnell auch für arm64) ---
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /src
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/ui/package.json packages/ui/
COPY apps/desktop/package.json apps/desktop/
RUN pnpm install --frozen-lockfile --filter @steckplan/server... --filter @steckplan/ui...

COPY tsconfig.base.json ./
COPY packages ./packages
RUN pnpm --filter @steckplan/ui build && pnpm --filter @steckplan/server build

# --- Laufzeit-Stufe: nur Node + gebündelter Server + statische UI, kein node_modules ---
FROM node:24-alpine
ARG VERSION=dev
LABEL org.opencontainers.image.title="Steckplan" \
      org.opencontainers.image.description="Planung von Licht-, Ton- und Netzwerktechnik für Veranstaltungen" \
      org.opencontainers.image.source="https://github.com/rde-master/steckplan" \
      org.opencontainers.image.licenses="GPL-3.0-only" \
      org.opencontainers.image.version="${VERSION}"

ENV NODE_ENV=production \
    PORT=8080 \
    STECKPLAN_DATA_DIR=/data \
    STECKPLAN_UI_DIR=/app/ui

WORKDIR /app
COPY --from=build /src/packages/server/dist/standalone.cjs ./server.cjs
COPY --from=build /src/packages/ui/dist ./ui
RUN mkdir -p /data && chown node:node /data

USER node
VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

CMD ["node", "server.cjs"]
