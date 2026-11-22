# The API for a small always-on machine (a Raspberry Pi works: every base image has an arm64 build).
# Build:  docker build -t portfolio-api apps/api
FROM node:22-alpine AS base
# Prisma's engines need openssl; tini makes `docker stop` reach node as SIGTERM and reaps child processes.
RUN apk add --no-cache openssl tini
WORKDIR /app

# 1. Everything needed to compile TypeScript.
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# 2. Only what runs: production dependencies plus the generated Prisma client (and the prisma CLI, for `migrate deploy`).
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate && npm cache clean --force

# 3. The image that ships: no compiler, no tests, no source, not root.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
