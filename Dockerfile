FROM node:22-alpine AS base

# 1. Установка зависимостей
FROM base AS deps
WORKDIR /app
ADD package.json package-lock.json ./
RUN npm ci

# 2. Зависимости только для продакшена
FROM base AS production-deps
WORKDIR /app
ADD package.json package-lock.json ./
RUN npm ci --omit=dev

# 3. Сборка (Build)
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules /app/node_modules
ADD . .
RUN node ace build --ignore-ts-errors

# 4. Финальный образ (Production)
FROM base
ENV NODE_ENV=production
WORKDIR /app
# Копируем только то, что нужно для работы
COPY --from=production-deps /app/node_modules /app/node_modules
COPY --from=build /app/build .
# Копируем .env если он нужен внутри (но лучше через docker-compose)
# EXPOSE должен совпадать с портом Adonis (3333)

RUN mv public public_source

EXPOSE 3333
 