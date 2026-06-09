FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm ci --workspace backend --omit=dev

COPY backend ./backend

WORKDIR /app/backend
EXPOSE 3001

CMD ["npm", "start"]
