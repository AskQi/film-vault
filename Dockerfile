# 多阶段构建：先构建前端与服务端，再放进最小运行镜像
# 说明：better-sqlite3 是原生模块，需要在与运行镜像一致的 Node 版本与 libc 下编译，
#       因此这里直接使用完整镜像而非 alpine（alpine 需要额外装 python/make/g++）。

FROM node:22-bookworm-slim AS build

# better-sqlite3 是原生模块，slim 镜像不带编译器，需要自己装。
# 这些工具只在构建阶段用，运行镜像仍然是干净的 slim。
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

# 先只拷依赖清单，利用层缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @film-vault/web build \
 && pnpm --filter @film-vault/server build

# 注意：这里不能执行 pnpm prune --prod。
# 在无 TTY 的构建环境里，prune 会把顶层 node_modules 的符号链接全部删掉，
# 依赖只剩在 .pnpm store 里，运行时 import 'better-sqlite3' 会 ERR_MODULE_NOT_FOUND。
# 个人使用场景下多带一些 dev 依赖换来「构建一次就能跑」是划算的。

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    DATA_DIR=/app/storage \
    HOST=0.0.0.0 \
    PORT=3300

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/drizzle ./server/drizzle
COPY --from=build /app/web/dist ./web/dist
COPY --from=build /app/shared ./shared
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/package.json ./package.json
COPY data ./data

RUN mkdir -p /app/storage
VOLUME ["/app/storage"]

USER node
EXPOSE 3300

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3300/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
