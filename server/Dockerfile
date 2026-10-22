# API do SGS — imagem de produção (multi-stage).
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts /app/package.json ./
USER node
EXPOSE 3300
ENV HOST=0.0.0.0 PORT=3300
# Aplica as migrações pendentes e arranca a API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
