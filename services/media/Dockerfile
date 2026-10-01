# Stage 1 – builder: compile sharp native bindings against libvips
#
# libvips build dependencies are installed here. They are NOT copied into the
# final runtime image, keeping it lean.
FROM node:20-alpine AS builder

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# Full libvips build-time dependencies required to compile sharp from source.
# These are heavy; they stay in the builder stage only.
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    vips-dev \
    fftw-dev \
    libjpeg-turbo-dev \
    libpng-dev \
    libwebp-dev \
    tiff-dev \
    librsvg-dev

RUN corepack enable

WORKDIR /app

# All workspace manifests are copied so the frozen lockfile check passes;
# only the media service and its workspace deps get actually installed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mobile/package.json apps/mobile/
COPY apps/web/package.json apps/web/
COPY packages/codegen/package.json packages/codegen/
COPY packages/contracts/package.json packages/contracts/
COPY packages/sdk/package.json packages/sdk/
COPY packages/types/package.json packages/types/
COPY services/analytics-oracle/package.json services/analytics-oracle/
COPY services/dm-relay/package.json services/dm-relay/
COPY services/indexer/package.json services/indexer/
COPY services/media/package.json services/media/

# sharp will compile its native bindings against the libvips headers installed above.
RUN pnpm install --frozen-lockfile --filter "@linkora/media..."

COPY packages/types ./packages/types
COPY services/media ./services/media

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 – runtime: libvips runtime libraries only, no build tools
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV NODE_ENV=production

# Runtime-only libvips libraries — significantly smaller than the build set.
# sharp's prebuilt binaries are already compiled in the builder stage; these
# shared libraries are needed at runtime for the .node addon to load.
RUN apk add --no-cache \
    curl \
    vips \
    fftw \
    libjpeg-turbo \
    libpng \
    libwebp \
    tiff \
    librsvg

RUN corepack enable

WORKDIR /app

# Copy the compiled node_modules (including sharp's native .node file),
# workspace type sources, and the service source tree from the builder.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types ./packages/types
COPY --from=builder /app/services/media ./services/media
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    chown -R appuser:appgroup /app

USER appuser
WORKDIR /app/services/media

EXPOSE 3003

HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=30s \
  CMD curl -f http://localhost:3003/health || exit 1

CMD ["node_modules/.bin/tsx", "src/index.ts"]
