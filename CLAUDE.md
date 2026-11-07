# film-vault — 项目说明

个人胶片管理网站。单用户、移动优先、部署在自有服务器。

## 先读文档

动手前必须先读这三份文档，它们是本项目的完整上下文：

1. `docs/01-需求说明.md` — 用户诉求、编号体系、功能清单、已确认的默认约定
2. `docs/02-技术方案.md` — 架构、选型、数据模型、接口设计、部署方案
3. `docs/03-任务规划.md` — 里程碑拆解与验收标准

## 核心约束（不可随意更改）

1. **单用户**，不做权限体系、不做分享链接（需要分享时用户自己截图）。
2. **不做逐张记录**。核心是「拍到第几张」的进度快照；单张注解是可选辅助，所有字段可空。
3. **不做离线同步引擎**。用户接受断网、事后补录。
4. **必须 HTTPS**。浏览器扫码要求安全上下文，`http://IP` 无法调用摄像头。
5. **编号是地基**。前 4 位（品牌+系列+ISO码+画幅）= 型号唯一键。任何改动必须同步更新文档与单测。
6. **移动优先**。主力设备是安卓/鸿蒙/iOS/折叠屏手机，电脑是次要设备。
7. **编码长度固定 7 字符**：4 位前缀 + 3 位序号。序号永不升位，前缀永不加长。
8. **不做外部条码查询**。条码由用户扫包装后本地绑定。

## 编号规则速记

```
K G 2 T 001     → Kodak · Gold · ISO200 · 135 · 第1卷   （恒 7 字符）
│ │ │ │ └─ 序号：固定 3 位，001–999，000 保留不用
│ │ │ └─── 画幅：T=135 M=120 D=220 S=页片 P=110 X=其他
│ │ └───── ISO码：v=ISO/100，1-9数字，10-35用A-Z
│ │        非整百用小写例外：a=25 b=50 c=64 d=160 e=320 f=125 g=80 h=250
│ └─────── 系列（品牌内唯一，1 字母）
└───────── 品牌：K=Kodak F=Fujifilm I=Ilford A=Agfa L=Lomography C=CineStill H=Harman R=Rollei O=ORWO B=Bergger S=Silberra W=Washi Q=Foma Y=Lucky Z=Shanghai V=Svema
```

**关键陷阱**：不能对编码做全局 `toUpperCase()`。ISO 位的小写字母是语义的一部分，`KPdT`（Portra 160）与 `KPDT` 是不同结果。必须逐位校验。

**溢出策略**：单前缀用满 999 后，给同一型号分配新的 4 位前缀（`stock_prefix` 支持一型号多前缀），不升位、不改长度。

## 术语分层

| 层级 | 中文名 | 表 | 粒度 |
|---|---|---|---|
| 型号 | **胶卷型号库**（型录） | `film_stock` + `stock_prefix` | Kodak Gold 200 135 |
| 批次 | 盒 | `box` | 一次采购的一盒 |
| 个体 | **胶卷库** | `roll` | `KG2T001` 这一卷 |

## 技术栈

- 前端：Vue 3 + TypeScript + Vite + Pinia + Tailwind + PWA
- 后端：Node 22 + Fastify + Zod + Drizzle ORM
- 数据库：SQLite（WAL）
- 扫码：`BarcodeDetector` + `barcode-detector` WASM polyfill（无原生依赖）
- 条码生成：`bwip-js`（Code 128）
- 部署：Docker Compose + Caddy

## 目录结构

```
docs/      需求、方案、规划
data/      型号库 seed 数据（film-stocks.tsv，139 条）
server/    Fastify 服务端
web/       Vue 3 PWA
shared/    Zod schema、类型、码表常量
scripts/   打包、标签模板
```

## 开发约定

- 所有对话与文档使用**中文**。
- 修改代码时注意与已有代码/注释的一致性。
- 完成修改后总结并提交 commit（不 push，用户自行检视）。
