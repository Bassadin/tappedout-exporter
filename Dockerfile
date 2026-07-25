FROM denoland/deno:alpine-2.8.1

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
