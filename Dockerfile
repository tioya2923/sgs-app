# SGS — imagem de produção: a API serve também o frontend (mesma origem, sem CORS).
# Construir a partir da raiz do repositório:  docker build -t sgs .

# 1) Frontend (base '/', porque é servido na raiz do domínio)
FROM node:22-slim AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig*.json vite.config.ts ./
COPY public ./public
COPY src ./src
# VITE_API_URL vazio = mesma origem
ENV VITE_BASE=/ VITE_API_URL=
RUN npm run build

# 2) API
FROM node:22-slim AS api
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# 3) Imagem final
FROM node:22-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3300 FRONTEND_DIR=/app/public
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=api /app/node_modules ./node_modules
COPY --from=api /app/dist ./dist
COPY --from=api /app/prisma ./prisma
COPY --from=api /app/prisma.config.ts /app/package.json ./
COPY --from=web /web/dist ./public
USER node
EXPOSE 3300
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Aplica as migrações pendentes e arranca (cria também armazéns/modelos base e a primeira conta de Direção, se configurada).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
