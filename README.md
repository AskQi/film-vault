# film-vault · 胶片管理

个人胶片（胶卷）管理网站。单用户、移动优先、部署在自有服务器。

## 文档

| 文档 | 内容 |
|---|---|
| [需求说明](docs/01-需求说明.md) | 使用场景、编号体系、功能清单、已确认约定 |
| [技术方案](docs/02-技术方案.md) | 架构、选型、数据模型、接口、部署 |
| [任务规划](docs/03-任务规划.md) | 里程碑拆解与验收标准 |
| [部署说明](docs/04-部署说明.md) | 首次部署、备份恢复、三端实测清单、故障排查 |

## 一句话概括

用有语义的编号（如 `KG2T001`）管理胶卷，扫码建档、批量录入，拍完快速记一笔「拍到第几张」，随手查。

## 技术栈

- 前端：Vue 3 + TypeScript + Vite + Pinia + Tailwind + PWA
- 后端：Node 22 + Fastify + Zod + Drizzle ORM
- 数据库：SQLite（WAL）
- 部署：Docker Compose + 宿主机 nginx（certbot 证书）

## 快速开始

```bash
# 1. 装依赖（需要 pnpm 10+）
pnpm install

# 2. 建库并写入码表与型号库（139 条）
pnpm db:seed

# 3. 同时启动前后端
pnpm dev
# 前端 http://localhost:5173   后端 http://localhost:3300
```

PIN 与会话密钥写在仓库根目录的 `.env`（参照 `.env.example`，该文件不进版本库）。未配置时 PIN 回退为 `1234`，生产环境禁止使用默认值。

### 手机经域名调试

开发期 nginx 把 `https://film.ddns.sharepeople.cn:8443` 转发到本机 `5173`。手机必须走 HTTPS 才能用扫码和定位：

```bash
pnpm --filter @film-vault/server dev          # 后端
pnpm --filter @film-vault/web dev:domain      # 前端，HMR 指向域名
```

nginx 需要透传 WebSocket（`Upgrade` / `Connection` 头），否则改代码后手机端不会自动刷新，控制台报 HMR 连接失败。这不影响正常使用。

### 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 前后端并行启动（Vite 把 `/api` 代理到 Fastify） |
| `pnpm build` | 构建前端与服务端 |
| `pnpm test` | 跑编号解析单测 |
| `pnpm typecheck` | 三个包的类型检查 |
| `pnpm db:seed` | 应用迁移 + 码表 + 型号库（幂等） |

### 独立运行服务端（生产形态）

```bash
pnpm --filter @film-vault/web build     # 前端产物在 web/dist
pnpm --filter @film-vault/server build  # 服务端产物在 server/dist
node server/dist/index.js               # 单进程同时提供 API 与页面
```

## 部署

生产地址：**https://film.ddns.sharepeople.cn**（宿主机 nginx 反代到 app 容器）

```bash
cp .env.example .env    # 填 PIN、SESSION_SECRET、AMAP_KEY
docker compose up -d --build
```

nginx 配置与证书申请见 [部署说明](docs/04-部署说明.md)。HTTPS 是硬约束：没有它，手机浏览器不允许调用摄像头和定位。

## 目录结构

```
docs/      需求、方案、规划
data/      型号库 seed 数据（film-stocks.tsv，139 条，进版本库）
shared/    Zod schema、码表常量、编号解析（前后端共用）
server/    Fastify 服务端 + Drizzle + 迁移
web/       Vue 3 PWA
scripts/   打包、标签模板
storage/   运行时数据（SQLite、附件）——不进版本库
```

## 编号速记

```
K G 2 T 001     → Kodak · Gold · ISO200 · 135 · 第 1 卷   （恒 7 字符）
│ │ │ │ └─ 序号：001-999 → A00-Z99 → a00-z99，000 保留
│ │ │ └─── 画幅：T=135 M=120 D=220 S=页片 P=110 X=其他
│ │ └───── ISO 码：v=ISO/100，1-9 数字，10-35 用 A-Z
│ │         例外（小写）：a=25 b=50 c=64 d=160 e=320 f=125 g=80 h=250
│ └─────── 系列（品牌内唯一）
└───────── 品牌
```

**不能全局转大小写**：`KPdT`（ISO 160）≠ `KPDT`（ISO 1300），`A07`（seq 1007）≠ `a07`（seq 3607）。

## 状态

M0–M5 代码侧已完成：编号体系与单测、型号库（列表/占用表/新建/批量导入/待认领）、
建档与标签打印、记一笔抽屉、详情页时间线与单张注解、冲洗记录、检索、统计、备份、PWA。

**尚未验证**：Docker 镜像未在真实环境构建；三端（iOS / 安卓 / 鸿蒙 / 折叠屏）未实测。
