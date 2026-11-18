FROM node:24-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:24-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# DejaVu fonts ensure crisp chart text rendering via @resvg/resvg-js
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000

RUN chown -R node:node /app
USER node

CMD ["node", "dist/app.js"]
