# Build from the repo root:  docker build -f apps/proxy/Dockerfile -t roadtrip-proxy .
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/proxy/package.json apps/proxy/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace @roadtrip/proxy --omit=dev --no-audit --no-fund

COPY packages/core/src packages/core/src
COPY apps/proxy/src apps/proxy/src
COPY apps/proxy/tsconfig.json apps/proxy/
COPY tsconfig.base.json ./

USER node
# Cloud Run sets PORT; GOOGLE_MAPS_API_KEY and PROXY_SHARED_SECRET come from Secret Manager.
CMD ["node", "--import", "tsx", "apps/proxy/src/main.ts"]
