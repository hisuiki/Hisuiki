# Cloud Run image for the blog frontend and API. Built from the repository root, because the two
# packages share one image and the workspace lockfile pins both.
#
# Cloud Run hands the port to listen on in $PORT and terminates TLS itself, so the app binds plain
# HTTP on that port (see src/index.ts). The same release image also contains PgBouncer for the API
# sidecar; keeping both executables together prevents their deployment versions drifting apart.
FROM node:24-bookworm-slim AS pgbouncer-build

ARG PGBOUNCER_VERSION=1.25.2
ARG PGBOUNCER_TAG=pgbouncer_1_25_2
ARG PGBOUNCER_SHA256=924ad35113fd0a71c8e2dbe85b5d03445532e2b7b37a9f8a48983beea238b332

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      curl \
      libevent-dev \
      libssl-dev \
      pkg-config \
    && curl -fsSLo /tmp/pgbouncer.tar.gz \
      "https://github.com/pgbouncer/pgbouncer/releases/download/${PGBOUNCER_TAG}/pgbouncer-${PGBOUNCER_VERSION}.tar.gz" \
    && echo "${PGBOUNCER_SHA256}  /tmp/pgbouncer.tar.gz" | sha256sum --check --strict \
    && mkdir /tmp/pgbouncer \
    && tar -xzf /tmp/pgbouncer.tar.gz --strip-components=1 -C /tmp/pgbouncer \
    && cd /tmp/pgbouncer \
    && ./configure --prefix=/usr/local \
    && make -j"$(nproc)" pgbouncer \
    && install -m 755 pgbouncer /usr/local/bin/pgbouncer

FROM node:24-bookworm-slim AS build
WORKDIR /repo

# Installed directly rather than through `corepack enable`: corepack is deprecated in current Node,
# and it aborts outright under QEMU when this image is cross-built for linux/amd64 from an arm64
# host. Keep the version in step with "packageManager" in the root package.json.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@11.18.0

# Manifests first, so a dependency install is only re-run when the dependencies themselves change
# rather than on every source edit.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY server/package.json server/package.json
RUN pnpm install --frozen-lockfile

COPY index.html tsconfig.json vite.config.ts ./
COPY public/ public/
COPY src/ src/
COPY server/ server/

ARG VITE_API_BASE_URL="https://api.hisuiki.com"
ARG VITE_ASSET_BASE_URL="https://cdn.hisuiki.com/static"
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_ASSET_BASE_URL=$VITE_ASSET_BASE_URL

RUN pnpm build
# The API's build runs `prisma generate` first: the generated client is gitignored, so it is not in
# the build context and has to be produced here. Generating needs no database connection.
RUN pnpm --filter hisuiki-server build

# Fail the image build if either compiler ever starts publishing source maps again.
RUN ! find dist server/dist -type f -name '*.map' -print -quit | grep -q .

# Resolves the workspace package into a self-contained directory with production dependencies only
# — no pnpm symlinks pointing outside it, and none of the frontend's build tooling.
#
# --legacy because pnpm 10+ otherwise refuses to deploy from a workspace that hasn't opted into
# injected dependencies. Injecting them would only matter if this package depended on another
# workspace package; it doesn't, so the legacy (node_modules-copying) behaviour is exactly right.
RUN pnpm deploy --legacy --filter hisuiki-server --prod /app

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# PgBouncer is compiled from the checksummed upstream release in its own build stage. Only its
# runtime libraries and binary are copied into the release image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libevent-2.1-7 libssl3 openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=pgbouncer-build /usr/local/bin/pgbouncer /usr/local/bin/pgbouncer
COPY --chown=node:node docker/PgBouncerEntrypoint.sh /usr/local/bin/PgBouncerEntrypoint.sh
RUN chmod 755 /usr/local/bin/PgBouncerEntrypoint.sh

# Drop root: nothing here writes to disk at runtime, so the process has no reason to own its files.
COPY --from=build --chown=node:node /app ./
COPY --from=build --chown=node:node /repo/dist ./web/
# The schema, its migrations and the Prisma config, so `prisma migrate deploy` can run at startup.
COPY --from=build --chown=node:node /repo/server/prisma ./prisma/
COPY --from=build --chown=node:node /repo/server/prisma.config.ts ./prisma.config.ts

# `pnpm exec` needs pnpm present in the runtime image, not just the build stage.
RUN npm install -g pnpm@11.18.0
USER node

ENV PORT=8080
ENV WEB_ROOT=/app/web
EXPOSE 8080

CMD ["node", "dist/index.js"]
