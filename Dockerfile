# ── Stage 1: build frontend ──────────────────────────────────────────────────
FROM node:20-slim AS build-web

WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ .
RUN npm run build

# ── Stage 2: build API ────────────────────────────────────────────────────────
FROM node:20-slim AS build-api

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app/api
COPY api/package*.json ./
RUN npm ci
COPY api/ .
RUN npx prisma generate
RUN npm run build

# ── Stage 3: imagem de produção ───────────────────────────────────────────────
FROM node:20-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

# API compilada
COPY --from=build-api /app/api/node_modules ./api/node_modules
COPY --from=build-api /app/api/dist         ./api/dist
COPY --from=build-api /app/api/prisma       ./api/prisma
COPY api/package*.json                      ./api/

# Frontend buildado
COPY --from=build-web /app/web/dist         ./web/dist

EXPOSE 3001

# Aplica migrations e sobe o servidor
CMD ["sh", "-c", "cd api && npx prisma migrate deploy && node dist/index.js"]
