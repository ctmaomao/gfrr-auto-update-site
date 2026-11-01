# OFR主读数契约迁移 · 本地视觉验收

本 PR 申请变更 DESIGN.md 的 §5.3 / §5.5 节；依据ADR-0080和讨论#490。

这些是受控本地浏览器截图，不是线上首次刷新，也不是准确率或市场改善证据。

| 视口 | 旧代码重建 | 新主位投影 | 原值趋势 | 退役附录 |
|---|---|---|---|---|
| 1440 | [before](before-867043e5-1440.png) | [after](consumers-r3-1440.png) | [trend](consumers-trend-r3-1440.png) | [retirement](consumers-retirement-r3-1440.png) |
| 390 | [before](before-867043e5-390.png) | [after](consumers-r3-390.png) | [trend](consumers-trend-r3-390.png) | [retirement](consumers-retirement-r3-390.png) |

- before用Git `867043e5`的真实静态网站代码/JSON在本次时钟重建，不冒称在历史当时截取；旧主位68/100。
- after读取同一雷达原数据快照（2026-11-01T01:20:15.050Z），通过真实新适配器及退役投影生成候选组件，浏览器route注入，不写`data/`。OFR原CSV只取2026-11-01T05:21:30.179Z取得的既有官方字节，SHA256 `a1a5eb96c3f93cc6d956b5310de9e52df4fca1c9155feca6610ef82e392af372`；观察日2026-10-28、原值-1.829、约周差+0.146（10-21→10-28）、十年百分位56.1。后者非概率，旧68与新原值不可直接比较。
- 两视口均13项导航、scrollWidth=clientWidth、pageerror为空；暖纸色`rgb(251,247,240)`与serif/mono栈保留。远程字体在本地验收中被阻止，使用系统回退，不能据此确认远程字体加载。
- 趋势为独立原值纵轴，含0参考、原观察日期，不拼接旧评分；手机SVG以容器实际宽度布局，11px刻度可读。执行附录展开后仅退役说明，旧仓位/动作模板仍保留兼容DOM但hidden/inert且CSS强制隐藏；当前入口不调用旧执行renderer。
- 旧AI稿停止作为新模型正文；独立能源/运输/世界秩序仍显示，数据滞后不当作无风险。未修改Bubble Watch评分或生产数据。

原始收据、投影校验、浏览器facts和图片哈希在主root ignored `manual-artifacts/main-score-audit/pressure-model/ofr-contract-migration-2026-11-01/`。最终完整检查/独立审阅/生产授权由对应实际回执决定，不由截图授予。
