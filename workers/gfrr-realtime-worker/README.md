# gfrr-realtime-worker（脚手架 + v28.0B preview 管道）

这是未来 **v28** 将 realtime 数据层迁到 **Cloudflare Workers + KV** 时的 Worker 脚手架；当前已包含 **v28.0B-1 GitHub mirror preview** 与 **v28.0B-2A Worker independent generated preview MVP**，并采用 **free-tier safe** 写入策略。

## 当前状态（重要）

- **不参与生产**：站点仍以 GitHub Actions 与 `realtime-data` 为实时数据来源；**前端仍不请求本 Worker**。
- **不替代 GitHub Actions**：未移植 `run-realtime.mjs` 等生成逻辑；定时任务只是 **拉取** 已存在的 `realtime-data` 分支上的 `realtime/market.json`，**不是**独立数据生成。
- **不写 `market:latest`**：`/market.json` 仍只读 `market:latest`；本阶段 **不会** 由 Worker 写入该键（尚未启用生产 market 写入）。
- **Preview 管道（v28.0B，free-tier safe）**：
  - Cron 仍为每 **3** 分钟，但 `scheduled()` 每轮最多 **1** 次 KV 写入。
  - v28.0B-1 GitHub mirror preview：写 KV **`market:latest-preview`**，`GET /market.preview.json` 读取该 key。
  - v28.0B-2A Worker generated preview MVP：写 KV **`market:worker-generated-preview`**，`GET /market.worker-preview.json` 读取该 key。
  - 为保持 free-tier safe，两类 preview **交替写入**，因此每个 preview key 通常约 **6** 分钟更新一次。
  - 失败时：只写 KV **`market:worker-heartbeat`** / status payload，记录 `previewFetchStatus`、`previewError` 与 `writePolicy`；不会同时写两个 preview。
  - v28.0B-2A.1 增加数据源可达性诊断与 fetch hardening：FRED 顺序抓取并 retry，Yahoo / Stooq / Google Finance / Trading Economics / Gold 均记录 HTTP status、content type、body length、duration 与错误原因。
  - Google Finance 与 Trading Economics 仅作为 **diagnostic-only** experimental Brent 候选源；不参与 consensus，不覆盖 `values.brent`，也不能让 `canPromoteToPrimary` 变为 `true`。
  - v28.0B-2B 增加本地只读对比脚本 `tools/compare-worker-vs-mirror.mjs`，用于比较 `/market.worker-preview.json` 与 `/market.preview.json` 的字段差异；脚本不使用 Wrangler、不读取 KV、不写 Cloudflare KV、不接前端。
  - v28.0D-1 曾尝试在 Worker generated preview payload 内加入核心指标第二数据源诊断；部署后影响 Worker generated preview freshness，线上 Worker 已手动 rollback 到稳定版本 `679fb678-fe1d-4ff3-b9b9-53829d4d31f7`。
  - v28.0D-2-lite 将第二源诊断从主 Worker preview 彻底隔离：`/market.worker-preview.json` 不包含 `secondarySources` / `secondaryDiagnostics`，不执行第二源外部请求；新增 `GET /market.secondary-preview.json` 只读 KV 键 `market:secondary-preview`。默认 scheduled 路径不写该 key；不存在时返回小型 unavailable payload。
  - v28.0D-3 只在独立 secondary preview 链路接入 **VIX via Cboe**。主 preview KV 写入成功后，scheduled 才会低频尝试更新 `market:secondary-preview`；若该 key 30 分钟内已更新则跳过。Cboe 请求使用短超时，失败只写 secondary unavailable payload 或被捕获，不影响 `market:worker-generated-preview`。
  - v28.0D-5 增加 Brent freshness-gated promotion：FRED `DCOILBRENTEU` 仍是 anchor；只有当 FRED stale、Yahoo `BZ=F` fresh、Trading Economics Brent 与 Yahoo 接近且 Google Finance 0 / Stooq 失败被排除时，才允许用 Yahoo / Trading Economics 平均值修正 `values.brent`。
  - v28.0D-6 增加 Brent extreme-move confirmation guard：相对上一轮 accepted Brent 的 2%–3% 跳动进入 watch 但允许；超过 3% 时若 Yahoo + Trading Economics 高度一致则标记 confirmed extreme move 并允许，否则 hold 到上一轮 accepted Brent / FRED。
  - v28.0D-8 增加 Brent source hygiene：Google Finance 明确为 `html-experimental` diagnostic，Stooq `brn.f` CSV close 缺失时输出 `csv-no-numeric-close` / `symbol-download-unavailable`，并新增 `stooq:brn.c` alternate diagnostic probe。Google Finance 与 Stooq candidate 均不参与 Brent promotion。
- **已提供的 HTTP 能力**：
  - `GET /health`：存活与模式探测。
  - `GET /market.json`：从 KV 读取 `market:latest`（若尚未由后续版本写入，则返回 404 JSON）。
  - `GET /market.preview.json`：从 KV 读取 `market:latest-preview`（preview 管道失败或未跑过 cron 时可能 404）。
  - `GET /market.worker-preview.json`：从 KV 读取 `market:worker-generated-preview`（Worker 独立生成 preview MVP，未部署或未跑到对应轮次时可能 404）。
  - `GET /market.secondary-preview.json`：从 KV 读取 `market:secondary-preview`（独立第二源诊断 preview；当前只包含 VIX via Cboe；不存在时返回 unavailable JSON，不影响主 preview）。

## 这**不是**什么

- 不是生产 market 生成器；Worker generated preview 只是独立生成链路的 **MVP 观察产物**。
- **不**影响 GitHub Pages 前端读取路径。
- **不**改变或取代 GitHub Actions 对 `realtime-data` 的更新。
- 如果 FRED / Yahoo / Stooq 在 Cloudflare Worker 环境返回 520 / 429 / 522，payload 会保留 `worker-generated-unavailable` / `unavailable: true` 并写入 diagnostics，仍不会进入生产。

**生产切换**与前端优先读 Worker 仍需后续版本明确约定；当前仍不写 `market:latest`，仍不接入前端，仍不替代 GitHub Actions。

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
- 等待跑到 Worker generated preview 轮次后访问 `.../market.worker-preview.json`，应返回含 `workerGeneratedPreview` 的独立生成 preview；否则可能 404。
- 成功路径不再每轮写 `market:worker-heartbeat`；观察成功刷新应优先查看 `/market.preview.json` 中的 `workerPreview.fetchedAt`。
- `market:worker-heartbeat` 只代表失败 / 状态记录，内容含 `scheduledAt`、`previewFetchStatus`、`previewError` 与 `writePolicy`，不再代表每轮成功心跳。
- 可使用本地脚本做 6–24 小时观察；脚本不使用 Wrangler、不读取 heartbeat、不写 Cloudflare KV，只请求 `/market.preview.json` 并写本机 CSV：

```bash
node tools/observe-worker-preview.mjs --samples=24 --interval-minutes=15
```

观察 Worker generated preview：

```bash
node tools/observe-worker-preview.mjs --samples=24 --interval-minutes=15 --path=/market.worker-preview.json
```

对比 Worker generated preview 与 GitHub mirror preview：

```bash
node tools/compare-worker-vs-mirror.mjs --samples=24 --interval-minutes=15
```
