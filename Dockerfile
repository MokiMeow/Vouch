# Exact release tags are configurable for security updates without source edits.
ARG NODE_IMAGE=node:24.19.0-bookworm-slim
FROM ${NODE_IMAGE} AS build
ARG PNPM_VERSION=11.25.0
WORKDIR /app
RUN npm install --global pnpm@${PNPM_VERSION}
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.server.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
RUN pnpm build
RUN pnpm prune --prod

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000 VOUCH_ARTIFACT_DIR=/var/lib/vouch/artifacts
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir -p /var/lib/vouch/artifacts && chown node:node /var/lib/vouch/artifacts
USER node
EXPOSE 4000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "dist/server/apps/api/src/operations/health.js", "api-health"]
CMD ["node", "dist/server/apps/api/src/server.js"]
