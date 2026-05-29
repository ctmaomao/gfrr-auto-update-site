# China Macro & V2X Source Review (Stage 6, 调研型)

> **Stage 6 = source-resolution only**(只调研、不实施)。为路线图 5 张 pending 卡(China PMI / China CPI·PPI / China 10Y / CFETS RMB / V2X)逐源实证公开数据源,目标每数据点 ≥2 个优质源,产出接入建议。沿用 `BRENT_PUBLIC_PROXY_SOURCE_REVIEW.md` 模板。
> **使用姿态(owner 确认)**:私人非商业用途。ChinaMoney / ChinaBond / NBS 的法律/ToS 风险对本用途**非阻断**;其 JSON 端点可作为自动抓取候选,但须**低频 + 按日期缓存 + 不广扫站点路径**。
> **本文不批准 live fetch、不写生产数据、不改 scoring**;接入须各自另开实施 stage 并走完整复核流程。接入后这些字段一律 **display-only**,不进 scoring/decision/execution/position/displayInputsBaseline/effectiveDisplayInputs/cross-validation。

调研日期:2026-05-29。Claude 设计 + Codex 实证搜寻 + Claude 交叉核对端点(✅ = 本次实测 200 + 返回真实数据)。

> **⚠️ 实施后勘误(Stage 6A/6C/V2X 实证 · 2026-05-29)**:本调研下表标「✅」的部分源,在实施阶段实拉证实已陈旧/死,**实际生产接入与下表不同**:
> - **China CPI/PPI**:FRED OECD(`CHNCPIALLMINMEI` 停 2025-04 / `CHNPIEATI01GYM` 停 2022-12)已陈旧 → 实际接入 **NBS 官方发布正文**(Stage 6C `cd42b75`),TradingEconomics 公开 HTML fallback。
> - **V2X**:STOXX `h_vstoxx.txt`(2016 冻结)、Yahoo `V2TX.DE`(2016 死)均不可用 → 实际接入 **boerse-frankfurt quote_box JSON**(Stage V2X `a92ee96`),STOXX 官页 HTML fallback(详见 §5)。
> - **China 10Y / CFETS RMB**:按下表 ChinaBond / ChinaMoney JSON 实际接入(Stage 6A `9fe8b1b`),与调研一致。

---

## 汇总:每数据点 ≥2 源

| 卡 | 源 1(primary) | 源 2 | 形态 | 频率 | 精确/代理 |
|---|---|---|---|---|---|
| China CPI | FRED `CHNCPIALLMINMEI` | OECD via FRED | API/CSV | 月 | 精确(OECD 镜像)|
| China PPI | NBS 官方 XLSX | FRED OECD `CHNPIEATI01GYM` ✅ | XLSX / API | 月 | NBS 精确 / OECD 代理 |
| China PMI | NBS 官方(HTML+XLS) | S&P Global/RatingDog(私营 PMI)| HTML+XLS / PDF | 月 | NBS 精确 / 私营另一口径 |
| China 10Y | ChinaBond `historyQuery` JSON ✅ | ChinaMoney `ClsYldCurvHis` JSON | JSON | 交易日 | 精确 ×2 |
| CFETS RMB | ChinaMoney `RmbIdxHis` JSON ✅(含 BIS/SDR)| FRED `RBCNBIS` + BIS data.bis.org(代理)| JSON / API | 周(精确)/ 日·月(代理)| 精确 + 代理 |
| V2X | STOXX 官方 `h_vstoxx.txt` ✅ | Yahoo `V2TX.DE` | CSV / JSON | 日 | 精确 ×2 |

---

## 1. China Manufacturing PMI

- **Primary — NBS 官方 PMI**:文章页 `https://www.stats.gov.cn/sj/zxfb/...t<date>_...html` + XLS 下载。月频,**精确官方 PMI**。稳定性高,但 **URL 按月/版本生成 → 实施需 release discovery**。`stats.gov.cn/robots.txt` = 404,无 ACLED 式明文禁抓。
- **Secondary — S&P Global / RatingDog China General Manufacturing PMI**(原 Caixin 口径,私营):release 列表 `pmi.spglobal.com/Public/Release/PressReleases` + release-id PDF。月频,**精确但另一口径(私营,非 NBS)**。PDF 解析脆;S&P terms 较严 → 私用非商业 cross-check only。
- **建议**:NBS 为主,S&P/RatingDog 作私营口径交叉,不互相替代。

## 2. China PPI

- **Primary — NBS 月度 PPI**:HTML release + XLSX 下载。月频,**精确官方 PPI**。稳定性高。
- **Secondary — FRED OECD `CHNPIEATI01GYM`** ✅(http=200):FRED 页 + CSV/API。月频,OECD 工业生产者价格,**标准化镜像/代理**;FRED 页快照偏旧 → fallback。
- 另:NBS English SDDS 时间序列页(官方结构化 HTML 月度表)。
- **建议**:NBS XLSX 为主,FRED OECD 作干净 API fallback / NBS English SDDS 作交叉。

## 3. China 10Y Government Bond Yield

- **Primary — ChinaBond / MOF 国债收益率曲线** ✅:
  - JSON:`https://yield.chinabond.com.cn/cbweb-czb-web/czb/historyQuery?startDate=...&endDate=...&gjqx=10&locale=cn_ZH&qxmc=1`(实测返回 `heList[].tenYear`)。
  - 交易日/日频,**精确 10Y**。端点未正式文档化但干净简单。`robots.txt` = 404。
- **Secondary — ChinaMoney / CFETS 收盘收益率曲线**:
  - JSON:`https://www.chinamoney.com.cn/ags/ms/cm-u-bk-currency/ClsYldCurvHis?...termId=10&...`;另有 real-time 端点 `RtimeYldCurv`。收盘 17:15 发布。精确。
- **建议**:ChinaBond 为主,ChinaMoney 交叉。私用可自动抓(低频+缓存)。

## 4. CFETS RMB Index(精确篮子)

- **Primary — ChinaMoney / CFETS RMB Index** ✅:
  - 历史 JSON:`https://www.chinamoney.com.cn/ags/ms/cm-u-bk-fx/RmbIdxHis?lang=cn&startDate=...&endDate=...`(实测返回 `records[].{cfetsIndexRate, bisIndexRate, sdrIndexRate}`,如 2026-05-22 CFETS=100.47/BIS=108.34/SDR=95.82)。
  - Excel 导出 `RmbIdxHisExcel`;方法论 v1.7 PDF。**周频,精确 CFETS 篮子(同记录含 BIS/SDR 篮子)**。
- **Secondary(仅代理 / sanity-check,不得标成精确 CFETS)**:FRED `RBCNBIS`(BIS 广义实际 EER,月)+ BIS data.bis.org(BIS 篮子日频 nominal)。
- **未找到第 2 个干净的「精确 CFETS」公开源**:新华/CNFIN(文章内周度片段,非数据源)、globalexchangerates(注册/未确认精确)、民间 mirror(banban.cn,源/许可/稳定性不足)均拒绝。
- **建议**:ChinaMoney 为精确 CFETS 主源(私用可低频自动抓);BIS/FRED 仅作代理/校验,**永不标成精确 CFETS**。

## 5. V2X(VSTOXX,欧元区波动率)

- **Primary — boerse-frankfurt quote_box JSON**:`https://api.boerse-frankfurt.de/v1/data/quote_box/single?isin=DE000A0C3QF1&mic=XFRA`。`DE000A0C3QF1` 是 V2TX 主指数;`DE000A0G87B2` 是 VSTOXX 1M,口径不同,不得用于本卡。实测无需 token/signature,UA=`GFRRBot/1.0` 可取 `lastPrice` + `timestampLastPrice`。
- **Fallback — STOXX 官页 HTML**:`https://stoxx.com/index/V2TX/`。解析 `#overview-last-value` 与末尾图表点 `[timestampMs,value]`;UAT 子域 Cloudflare 403,不用。
- **Dead / stale sources**:STOXX `h_vstoxx.txt` 仍可 200 但尾行冻结在 `2016-02-12`;Yahoo `V2TX.DE` 返回 200 但 `regularMarketTime` 为 2016,`^V2TX` 404。二者不得作为新鲜源。
- **建议**:boerse-frankfurt quote_box 为主源,STOXX 官页为 fallback;按 Europe/Berlin `refDate` freshness `<=5` 自然日 fail-closed。

## 6. China CPI(已早先确认,补全留档)

- **Primary — FRED `CHNCPIALLMINMEI`**(OECD,月,官方 API,ToS 干净)。**Secondary** — OECD via FRED 同族。China CPI 是 6 个里最干净的(纯 FRED API,无抓取)。

---

## 实施级抓取指引(接入时遵守)

- ChinaMoney CFETS:**周频抓取**,周五发布窗口后。
- ChinaBond / ChinaMoney 10Y 收盘:每日中国时间 17:30 后;ChinaBond 成功则可跳 ChinaMoney。
- **一律按日期缓存;绝不广扫站点路径;只用从官方页发现的显式端点 URL。**
- **Fail closed**:空 records / schema 变化 / 非 200 / 解析失败 → `source_unavailable` / `parse_error`;**不得伪造缺失值**。
- 沿用 ISM/Redbook 抓取纪律:`User-Agent: GFRRBot/1.0`,不绕 SSO/captcha,只取所需 headline,不存全 HTML。
- **保留 source 标签**:`ChinaBond / MOF`、`ChinaMoney / CFETS`、`NBS`、`S&P Global / RatingDog`、`STOXX`、`BIS`、`FRED:OECD`。
- 接入字段全 **display-only**(同 C1/C5/C6/C2 / Stage 5 派生字段),不进 scoring/decision/execution/position/baseline/cross-validation。

## 推荐实施分层(未来 stage,优先级 owner 定)

- **Stage 6A — 最干净(API/CSV/单端点)**:China CPI(FRED)、China PPI(FRED OECD + NBS XLSX)、V2X(STOXX txt)。类 C1/C5 直接实施。
- **Stage 6B — 干净 JSON 端点(中国官方)**:China 10Y(ChinaBond/ChinaMoney JSON)、CFETS RMB(ChinaMoney RmbIdxHis JSON,周频)。私用姿态下可自动抓 + 低频缓存。
- **Stage 6C — release-discovery / 脆弱**:China PMI(NBS 月版本 URL 发现逻辑 + S&P PDF)。最复杂,放最后。
- **跨类提醒**:CFETS RMB 卡跨 C2(line 301)+ C6(line 352),6B 实施时两处一起接。

---

## 结论

5 张难源卡 + China CPI 共 6 个数据点,**全部找到 ≥2 个可行公开源**,且大多是干净 JSON/CSV/API(ChinaMoney/ChinaBond JSON、STOXX txt、FRED API),仅 China PMI 需 release-discovery。难源调研收口:**均可接**,按 6A→6B→6C 复杂度递增分批实施(各自另开 stage 走完整复核)。CFETS「精确 vs BIS 代理」已澄清:ChinaMoney JSON 提供精确 CFETS,BIS/FRED 仅代理。
