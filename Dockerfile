FROM oven/bun:1 AS builder

WORKDIR /app

COPY build.ts ./
COPY dango ./dango

RUN bun build.ts

FROM nginx:1.27-alpine

COPY --from=builder /app/dist/index.html /usr/share/nginx/html/index.html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
