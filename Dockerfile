FROM node:20-slim AS base
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# PORT (cổng public mà Mini Shield bind) — Render sẽ ghi đè biến này lúc chạy.
# LAUNA_PORT (cổng nội bộ của LauNa, sau Mini Shield) — không cần expose ra ngoài.
ENV PORT=5000 LAUNA_PORT=5050 NODE_ENV=production
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||5000)+'/healthz', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["sh", "-c", "node utils/data/init-db.js || true; node index.js"]
