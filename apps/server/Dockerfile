# 런타임 의존성이 없어서(bun:sqlite 내장) 설치 단계가 없다. arm64·amd64 둘 다 된다.
FROM oven/bun:1.2.19-alpine
WORKDIR /app
COPY src ./src
RUN mkdir /data && chown bun:bun /data
USER bun
ENV PORT=8023 DB_PATH=/data/bbs.db
EXPOSE 8023
CMD ["bun", "src/index.ts"]
