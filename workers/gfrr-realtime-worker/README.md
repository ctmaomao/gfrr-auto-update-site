# gfrr-realtime-worker（脚手架）

这是未来 **v28** 将 realtime 数据层迁到 **Cloudflare Workers + KV** 时的 Worker 脚手架（v28.0A）。

## 当前状态（重要）

- **不参与生产**：站点仍以 GitHub Actions 与 `realtime-data` 为实时数据来源。
- **不替代 GitHub Actions**：未移植 `run-realtime.mjs` 等生成逻辑。
- **不写 `market:latest`**：脚手架的定时任务只写入 `market:worker-heartbeat`，避免误以为已替代生产 market。
- **已提供的 HTTP 能力**：
  - `GET /health`：存活与模式探测。
  - `GET /market.json`：从 KV 读取 `market:latest`（若尚未由后续版本写入，则返回 404 JSON）。
- **定时任务**：Cron 每 3 分钟向 KV 写入一次 `market:worker-heartbeat`（脚手架心跳）。

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

- 访问 `.../health`，应得到 `ok: true`、`mode: "scaffold"`。
- 访问 `.../market.json`，在尚未写入 `market:latest` 时应得到 404 与 `market:latest not found`。
- 在 Cloudflare 控制台或 `wrangler kv key get` 中确认存在 `market:worker-heartbeat` 且内容含 `scheduledAt`。

后续 **v28.0B** 起再接入真实 market 生成并写入 `market:latest`；**v28.0C** 再由前端优先请求本 Worker。
