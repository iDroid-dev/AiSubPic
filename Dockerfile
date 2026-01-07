FROM node:22-alpine

WORKDIR /app

# Устанавливаем зависимости
COPY package*.json ./
RUN npm install

# Копируем исходный код
COPY . .

# Открываем порт
EXPOSE 3333

# Запуск в режиме разработки (для продакшена команда будет другой)
CMD ["npm", "run", "dev"]