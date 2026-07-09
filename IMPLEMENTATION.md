# IMPLEMENTATION — 差异化优化实施记录

> 实施日期：2026-07-09
> 分支：`feature/collapsible-brief-panels`（基于 commit `998bb08`）
> 方法：多智能体 workflow —— Sonnet 负责分析/实施/审查，Fable 负责路线图仲裁与最终验收
> 状态：**全部 7 项实施完成，三路审查 + Fable 终审通过，真实环境端到端冒烟验证通过**

## 产品定位

本轮优化围绕一个差异化故事展开：**真实数据驱动的可信行程 + 能带出门用的工具**。
相比同类 AI 旅行规划产品（通常只有 AI 生成的"看起来合理"的行程），本产品：

- 跨城交通来自真实 12306 数据（并发查询、来源透明）；
- 预算档位真实影响推荐车次类型（经济型放行 K/T/Z 慢车）；
- 同日景点按真实坐标做地理最近邻排序，减少走回头路；
- 行程与真实天气预报绑定（雨天优先室内、自动雨具贴士）；
- 生成结果可本地持久化、可导出 .ics 日历带出门。

全程遵守的硬性约束：无数据库、无构建步骤、vanilla JS；不新增必需 API key（天气复用现有 `AMAP_KEY`）；不新增 npm/pip 依赖；保持 CLAUDE.md 全部既有不变量（escapeHtml 转义、per-city days、brief-panel 折叠、boot() 离线演示行程、AI 失败 fallback）。

## 一、路线图 7 项（Fable 仲裁，按依赖排序实施）

### 1. 真实交通数据管线加固（后端）

**文件**：`server.py`、`services/train_service.py`

- 新增 `_build_segments_from_destinations()`：跨城分段由服务端权威构造（不再依赖 AI 文本解析），无论是否传 `start_date` 都执行；segment 字符串固定为 `'A → B'` 格式，为前端联动（第 5 项）提供稳定契约。tool 解析优先级：per-segment `transport` > `global_transport` > AI 建议（仅 train/plane）> 默认 train。
- enrich 循环体抽取为 `_enrich_one_segment()`，`enrich_transport_guide()` 改为 `asyncio.gather` 并发——多段查询总耗时≈最慢一段（mock 实测 3×0.5s 段并发 elapsed≈0.505s）。自驾段直接标 `ai_fallback` + `自驾（AI 预估）`，跳过票务查询。
- `train_service.py`：删除重复定义的 `_get_station_name_by_code`；`_get_station_map()` 加 60 秒进程内内存缓存并同步构建 `_code_to_name` 反查表（电报码查站名 O(1)）；`_rate_limit()` 加 `asyncio.Lock`，并发下 12306 请求起始点仍按 0.4s 错开（3 并发实测 elapsed≈0.82s ≈ 2×间隔）。

### 2. 预算真实传导 + AI 输出健壮性（全栈）

**文件**：`server.py`、`static/index.html`、`static/app.js`

- 前端新增「预算档位」segmented 控件（经济型/舒适型[默认]/高端型），`state.budget` 随请求发送（原先硬编码 `'舒适型'`，后端预算逻辑是死代码）；费用估算卡片徽章实时反映当前档位。
- 后端新增 `_resolve_train_type_pref()`：含"经济/预算/穷游"→ `GDCKTZ`（放行慢车），否则 `GDC`；经 `_enrich_one_segment` 透传给 `search_trains(prefer_train_type=...)`。
- `/api/health` 死逻辑修复：`juhe_key_configured`（真实布尔）与 `transport_flight_available: True`（内置兜底恒真）拆分。
- `max_tokens` 改为按天数/城市数动态计算 `min(8000, 2000 + days*350 + cities*200)`；新增 `_repair_truncated_json()`（字符扫描 + 字符串/转义状态跟踪 + 括号栈回退补闭合，最多 20 次），AI 输出被截断时自动修复而非直接 500。

### 3. 同日景点地理最近邻排序（后端）

**文件**：`server.py`

- 新增纯函数 `_haversine_km()` 与 `_nearest_neighbor_order()`（贪心最近邻；lat/lng 缺失或为 0 的项保持原相对顺序追加末尾；不足 2 个坐标点原样返回）。
- 在 POI 坐标合并之后对每天 `morning`/`afternoon` 列表重排。只改顺序不改字段结构，前端零改动生效；前端 fallback 行程不受影响。

### 4. 天气感知行程（全栈，复用 AMAP_KEY）

**文件**：`server.py`、`static/app.js`、`static/styles.css`

- 后端新增 `_query_amap_weather()`（district 接口取 adcode → `v3/weather/weatherInfo` extensions=all；30 分钟 TTL 缓存；无 key/失败一律返回 `[]` 绝不抛错）与 `GET /api/weather` 路由（永不 500）。
- `generate_itinerary()` 并发查询各目的地天气，拼入 prompt 新节「各城市天气预报」（`[WEATHER_INFO]` 占位符在 replace 链**首位**替换，防用户输入注入）；响应新增 `city_weather` 字段。
- 前端：`state.cityWeather`、`addDays()`（本地时区手工拼 YYYY-MM-DD，规避 `toISOString()` 在 UTC+8 下错位一天的 bug）、`weatherForDay()` 精确按日期匹配；Day 标签显示「天气 + 温度区间」（escapeHtml）；命中雨/雪的天自动 unshift「携带雨具」贴士（按天去重）。
- 离线/无 key 行为与原来完全一致（空对象静默降级，boot 不发天气请求）。

### 5. 交通选择 ↔ 时间线/预算实时联动 + 刷新修复（前端）

**文件**：`static/app.js`、`static/styles.css`

- 新增工具函数 `parseTimeRange()`（支持跨夜车次，如 `15:42 - 04:59` → 终点 +1440min）、`parsePriceValue()`、`normalizeSegKey()`、`findSegment()`、`selectedOption()`。
- 时间线联动：转场卡片实时显示当前选中班次的真实时刻与「已选 G651」徽章（渲染时动态读 state，不固化进 mapPlanToItems，保持单一 state 源）；详情面板同步。
- `refreshTransport()` 重写：自驾段跳过网络请求；其余段 `Promise.allSettled` 并行；每段独立错误徽章（不再整体吞错）；状态栏按成功/失败段数汇报。
- 冲突校验 `checkDayConflicts()`：景点时间与已选车次时间重叠时两张卡片标「时间冲突」徽章。
- 选择即定价 `computeSelectedTransportTotal()`：预算区新增「已选班次交通合计 约 ¥N（M 段待确认）」，切换班次实时变化。
- 顺带补齐 `renderTransport()` 既有的未转义输出点（segment/advice/source_label/option 各字段全部 escapeHtml）。

### 6. 本地行程持久化 +「我的行程」（前端，零后端改动）

**文件**：`static/app.js`、`static/index.html`、`static/styles.css`

- localStorage 键 `aerotravel:trips`，自动保存最近 **8** 次 AI 生成结果（保存映射前的原始 plan + 城市/偏好/预算/班次选择快照）；fallback 演示行程不入快照。
- 顶栏「我的行程」下拉面板：一键恢复（还原表单控件 + `applyPlan`，全程无网络请求）、删除、空态提示；按钮计数「我的行程（N）」随保存/删除实时刷新。
- 全部读写 try/catch，隐私模式/禁用存储静默降级，不影响主流程；boot() 首屏仍是离线演示行程（不变量保持）。

### 7. 行程日历导出 .ics（前端）

**文件**：`static/app.js`、`static/index.html`

- `buildIcsCalendar()`：每天一个全天概览事件（VALUE=DATE）+ 每个跨城交通段一个定时事件（本地浮动时间，SUMMARY 含所选班次号；跨夜车 DTEND 正确滚到次日；时刻不可解析时退化为全天事件，绝不抛错）；`icsEscape()` 按 RFC 5545 转义。
- 顶栏「导出日历」按钮 → Blob 下载 `行程标题.ics`，可导入 Google/Apple/手机日历；无行程时仅 toast。

## 二、质量流程与裁决结果

1. **分析仲裁**（Workflow 1，8 agents）：3 路 Sonnet 现状分析（前端/后端/产品竞争力）→ 4 视角 16 个提案 → Fable 仲裁合并为 7 项，并修正提案缺陷（gather 并发会破坏 12306 限速时间戳需加锁、预算映射在硬编码现状下是死代码需配套 UI、服务端分段必须无条件执行以支撑前端联动等）。
2. **实施**（Workflow 2，13 agents）：7 项按依赖串行实施，每项完成后 `python -m compileall server.py services` + `node --check static/app.js` 必须通过，纯函数验收点用一次性脚本离线自测。
3. **三路审查**：正确性 / 安全与不变量 / 运行时冒烟。发现 3 个 major 并修复：
   - 雨雪贴士插值外部天气字段未转义（XSS 风险）；
   - `parseTimeRange` 未处理跨夜车次（15:42-04:59 会被判为负区间，冲突校验与 .ics 全错）；
   - `.ics` 跨夜车 DTEND 未滚到次日。
4. **Fable 终审**：在 Node vm 中对修复逐一复测（跨夜区间 `[942,1739]`、DTEND `次日T045900`、`<img>` payload 被转义），全部不变量核验完好，**approved=true**。

## 三、冒烟验证中发现并修复的 3 个存量数据 bug

真实环境端到端测试（北京 2 天 → 西安 1 天 · 经济型 · 真实 AI/高德/12306）暴露三个直接削弱"真实数据"卖点的老问题，已一并修复：

| 问题 | 根因 | 修复 |
|---|---|---|
| 车次号显示为 `TJP`（站码而非车次号） | 12306 字段布局有两个版本，原代码固定取 `fields[4]`，在标准布局下那是始发站电报码 | `_parse_train_result()` 改为按车次号模式 `^[GDCKTZSLY]?\d{1,4}$` 在 `fields[3]/[4]` 间匹配，兼容两种布局 |
| 北京→西安全天只查到 1 个车次 | `_select_best_station()` 启发式选中北京东/西安东等方向站 | 优先主站电报码（站名=城市名，12306 按全市口径返回）；方向站按**末字**判定（避免 北京/西安 自带方位字被误判）。修复后同路线查到 44 个车次 |
| 西安地图中心落在吉林 (42.9, 125.1) | 高德 district 关键词同名多命中（辽源市西安区） | 新增 `_pick_primary_district()` 按行政级别择优（city > province > district），`/api/city_center` 与天气 adcode 查询共用 |

另按 Fable 遗留建议加固：「我的行程」面板 `entry.id` 渲染转义；计数徽章实时刷新。CLAUDE.md 的 12306 字段陷阱文档已同步更新。

## 四、最终验证结果

- `python -m compileall server.py services` ✅　`node --check static/app.js` ✅
- `/api/health` 返回 `juhe_key_configured` 真实布尔 ✅
- `GET /api/weather?city=北京` 返回 4 天真实预报 ✅
- `GET /api/city_center?city=西安` → `(34.343, 108.940) 西安市` ✅
- `POST /api/plan`（北京→西安，经济型，start_date 在预售期内）30 秒返回：3 天行程、双城 `city_weather`、segment 精确为 `'北京 → 西安'`、`data_source: real`、8 个真实车次（G651/G321/**K507 ¥237 慢车**…）、雨天贴士自动注入 ✅
- 12306 直查：44 个车次，车次号/时刻/历时/车站全部正确 ✅

## 五、已知限制（不阻塞验收）

- 生成行程后再修改出发日期，天气标签与 .ics 日期会相对原计划错位（重新生成即可）；恢复的历史快照沿用保存时的班次数据，建议恢复后点「刷新班次」。
- `.ics` 未实现 RFC 5545 的 75 字节折行（主流日历应用可容忍）。
- `_weather_cache` 按城市名无上限增长且空结果同样缓存 30 分钟（单用户场景影响可忽略）。
- 浏览器交互路径（预算切换、班次联动、快照恢复、.ics 导入日历应用）已由代码审查与纯函数测试覆盖，建议提交前人工点验一遍。

## 六、改动统计

```
CLAUDE.md                 |  28 ++-（含本轮前已有的未提交修改）
server.py                 | 333 +++++++++++++-
services/train_service.py | 107 ++++---
static/app.js             | 531 +++++++++++++++++++++-
static/index.html         |  14 +-
static/styles.css         |  96 ++++
6 files changed, ~994 insertions(+), ~115 deletions(-)
```

尚未 git commit，全部改动在工作区。
