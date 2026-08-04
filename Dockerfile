FROM denoland/deno:alpine-2.8.1@sha256:a40c899f6aca244a3f0a116c05f6dec0a29f9898d2f004d60ec57c1514f87349

WORKDIR /app

COPY deno.json ./
COPY src ./src

RUN deno cache src/main.ts

ENV OUTPUT_DIR=/data \
    CRON_SCHEDULE="0 3 * * *" \
    TZ=UTC \
    RUN_ON_START=true

VOLUME ["/data"]

USER deno

CMD ["deno", "task", "start"]
