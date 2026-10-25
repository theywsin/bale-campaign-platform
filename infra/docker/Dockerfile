# syntax=docker/dockerfile:1.7
# One multi-stage Dockerfile for every service of the monorepo.
# Build a service with: docker build -f infra/docker/Dockerfile --target <api|worker|scheduler|web|migrator> .
# Behind a TLS-intercepting proxy, pass its CA as a build secret and the proxy as build args:
#   docker build --secret id=extra_ca,src=/path/ca.crt --build-arg HTTPS_PROXY=... --network host ...

ARG NODE_IMAGE=node:22.22.0-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    npm_config_update_notifier=false
WORKDIR /app

# ---- dependency manifests only, for layer caching ---------------------------
FROM base AS manifests
COPY package.json package-lock.json .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/scheduler/package.json apps/scheduler/
COPY apps/web/package.json apps/web/

# ---- full install + build ----------------------------------------------------
FROM manifests AS build
# Baked into the Next.js rewrite table at build time (used when no reverse proxy fronts the web app).
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
RUN --mount=type=cache,target=/root/.npm --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm ci
COPY . .
RUN npm run build

# ---- production-only node_modules -------------------------------------------
FROM manifests AS prod-deps
RUN --mount=type=cache,target=/root/.npm --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm ci --omit=dev --workspace=@bcp/api --workspace=@bcp/worker --workspace=@bcp/scheduler --include-workspace-root=false \
 && mkdir -p apps/api/node_modules apps/worker/node_modules apps/scheduler/node_modules

# ---- shared runtime for the Node services ------------------------------------
FROM base AS node-runtime
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/packages/config/package.json /app/packages/config/
COPY --from=build --chown=node:node /app/packages/config/dist /app/packages/config/dist
COPY --from=build --chown=node:node /app/packages/shared/package.json /app/packages/shared/
COPY --from=build --chown=node:node /app/packages/shared/dist /app/packages/shared/dist
COPY --from=build --chown=node:node /app/packages/database/package.json /app/packages/database/
COPY --from=build --chown=node:node /app/packages/database/dist /app/packages/database/dist
USER node

FROM node-runtime AS api
COPY --from=build --chown=node:node /app/apps/api/package.json /app/apps/api/
COPY --from=build --chown=node:node /app/apps/api/dist /app/apps/api/dist
# Workspace-local packages that npm could not hoist (version conflicts).
COPY --from=prod-deps --chown=node:node /app/apps/api/node_modules /app/apps/api/node_modules
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

FROM node-runtime AS worker
COPY --from=build --chown=node:node /app/apps/worker/package.json /app/apps/worker/
COPY --from=build --chown=node:node /app/apps/worker/dist /app/apps/worker/dist
# Workspace-local packages that npm could not hoist (version conflicts).
COPY --from=prod-deps --chown=node:node /app/apps/worker/node_modules /app/apps/worker/node_modules
WORKDIR /app/apps/worker
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.WORKER_HEALTH_PORT||4100)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

FROM node-runtime AS scheduler
COPY --from=build --chown=node:node /app/apps/scheduler/package.json /app/apps/scheduler/
COPY --from=build --chown=node:node /app/apps/scheduler/dist /app/apps/scheduler/dist
# Workspace-local packages that npm could not hoist (version conflicts).
COPY --from=prod-deps --chown=node:node /app/apps/scheduler/node_modules /app/apps/scheduler/node_modules
WORKDIR /app/apps/scheduler
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.SCHEDULER_HEALTH_PORT||4200)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

# ---- one-shot database migrations ---------------------------------------------
FROM build AS migrator
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- Next.js standalone server --------------------------------------------------
FROM base AS web
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
