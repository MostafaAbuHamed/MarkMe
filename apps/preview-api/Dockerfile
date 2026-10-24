FROM node:24-slim AS builder

WORKDIR /repo

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
COPY packages/domain/package.json packages/domain/
COPY apps/preview-api/package.json apps/preview-api/

RUN pnpm install --frozen-lockfile --filter @markme/preview-api...

COPY packages/ packages/
COPY apps/preview-api/ apps/preview-api/

RUN pnpm --filter @markme/preview-api build

FROM node:24-slim

WORKDIR /app

COPY --from=builder /repo/apps/preview-api/dist/server.mjs ./

ENV NODE_ENV=production

USER node

EXPOSE 8080

HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "server.mjs"]
