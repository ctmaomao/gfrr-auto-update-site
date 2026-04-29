# gfrr-realtime-worker（脚手架 + v28.0B-1 preview 管道）

这是未来 **v28** 将 realtime 数据层迁到 **Cloudflare Workers + KV** 时的 Worker 脚手架；当前已包含 **v28.0B-1 preview 管道**（仅从 GitHub 镜像拉取生产 realtime，写入 KV 预览键），并采用 **free-tier safe** 写入策略。

## 当前状态（重要）

- **不参与生产**：站点仍以 GitHub Actions 与 `realtime-data` 为实时数据来源；**前端仍不请求本 Worker**。
- **不替代 GitHub Actions**：未移植 `run-realtime.mjs` 等生成逻辑；定时任务只是 **拉取** 已存在的 `realtime-data` 分支上的 `realtime/market.json`，**不是**独立数据生成。
- **不写 `market:latest`**：`/market.json` 仍只读 `market:latest`；本阶段 **不会** 由 Worker 写入该键（尚未启用生产 market 写入）。
- **Preview 管道（v28.0B-1，free-tier safe）**：
  - Cron 仍为每 **3** 分钟，但 `scheduled()` 每轮最多 **1** 次 KV 写入。
  - 成功时：只写 KV **`market:latest-preview`**（负载上追加 `workerPreview` 元数据，不改动 `values`、`brentValidation` 等原有字段）。
  - 失败时：只写 KV **`market:worker-heartbeat`** / status payload，记录 `previewFetchStatus`、`previewError` 与 `writePolicy`；不会同时写 preview。
  - `GET /market.preview.json`：从 KV 读取 **`market:latest-preview`**（用于验证 Worker API + KV 读写链路）。
- **已提供的 HTTP 能力**：
  - `GET /health`：存活与模式探测。
  - `GET /market.json`：从 KV 读取 `market:latest`（若尚未由后续版本写入，则返回 404 JSON）。
  - `GET /market.preview.json`：从 KV 读取 `market:latest-preview`（preview 管道失败或未跑过 cron 时可能 404）。

## 这**不是**什么

- 不是独立于 GitHub 的 market 生成器；只是 Cloudflare **KV/API 管道预演**。
- **不**影响 GitHub Pages 前端读取路径。
- **不**改变或取代 GitHub Actions 对 `realtime-data` 的更新。

后续 **v28.0B-2** 可再评估 Worker 侧独立生成 market preview；**生产切换**与前端优先读 Worker 仍需后续版本明确约定。

## 部署前准备

1. Cloudflare 账号，并开通 Workers（与 KV）。
2. 本机登录 Wrangler：`npx wrangler login`
3. 创建 KV namespace：`npx wrangler kv namespace create GFRR_MARKET_KV`，记下返回的 **id**。
4. 复制本目录下的 `wrangler.toml.example` 为 `wrangler.toml`（勿提交含真实 id 的 `wrangler.toml` 若你采用私有策略）。
5. 在 `wrangler.toml` 中将 `REPLACE_WITH_KV_NAMESPACE_ID` 替换为上述 id。
6. 部署：

```bash
npx wrangler deploy --config workers/gfrr-realtime-worker/wrangler.toml
```

## 部署后自检

- 访问 `.../health`，应得到 `ok: true`；`mode` 仍为 `scaffold`（preview 管道见 cron / `market.preview.json`，不改变 health 契约字段）。
- 访问 `.../market.json`，在尚未写入 `market:latest` 时应得到 404 与 `market:latest not found`。
- 等待至少一次 Cron 后访问 `.../market.preview.json`，在 GitHub `realtime-data` 可得且校验通过时应返回 JSON（含 `workerPreview`）；否则可能 404。
- 成功路径不再每轮写 `market:worker-heartbeat`；观察成功刷新应优先查看 `/market.preview.json` 中的 `workerPreview.fetchedAt`。
- `market:worker-heartbeat` 只代表失败 / 状态记录，内容含 `scheduledAt`、`previewFetchStatus`、`previewError` 与 `writePolicy`，不再代表每轮成功心跳。
- 可使用本地脚本做 6–24 小时观察；脚本不使用 Wrangler、不读取 heartbeat、不写 Cloudflare KV，只请求 `/market.preview.json` 并写本机 CSV：

```bash
node tools/observe-worker-preview.mjs --samples=24 --interval-minutes=15
```
