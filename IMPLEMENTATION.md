# IMPLEMENTATION — 可编辑行程与自驾规划实施记录

> 实施日期：2026-07-11
> 分支：`codex/editable-itinerary-self-drive`
> 方法：TDD + 里程碑交付
> 状态：**里程碑 A/B/C 主闭环已完成；自动化质量门 + 浏览器冒烟已通过（2026-07-11）**

## 实施范围

本轮将 AeroTravel 从"AI 行程生成器"升级为"约束驱动的可编辑规划工作台"：

- 三阶段状态模型（AppliedPlan → WorkingDraft → CandidatePlan）
- 想去清单 + 每日编辑器 + 约束面板（增/删/移/锁定）
- 确定性局部优化（最近邻+2-opt）+ human-readable diff
- 自驾规划模式（环线/单程、三种策略、真实道路数据）
- 高德驾车距离矩阵 + 反向地理编码
- 撤销/重做 + 快照 v2 兼容 v1

## 文件变更统计

| 类型 | 文件数 | 说明 |
|---|---|---|
| 新建前端 | 6 | draft.js, draft-ops.js, history.js, editor.js, candidate.js, self-drive.js |
| 新建后端 | 7 | schemas/draft.py, schemas/location.py, planner/constraints.py, planner/draft_optimizer.py, planner/route_optimizer.py, services/driving_route_service.py |
| 新建测试 | 6 | tests/frontend/*.test.js (4), tests/planner/*.py (2) |
| 修改文件 | 10 | app.js, storage.js, state.js, api.js, index.html, styles.css, map.js, routers, check.ps1, docs |

## 质量门

- `.\scripts\check.ps1`（2026-07-11 本 worktree 重跑）：**通过**
  - Python compile + Ruff + Mypy（30 source files）
  - **68** Python tests OK，coverage **56%**（门槛 50%）
  - 全部 static JS syntax check
  - **53** frontend unit tests pass / 0 fail
- 无数据库、无登录系统、无前端框架、无构建步骤
- `/api/plan` 保持兼容

## 浏览器 + API 冒烟（2026-07-11，commit `e7ee902`）

环境：本 worktree `python server.py` → `http://localhost:8000`；`.env` 从主仓复制。

| 检查 | 结果 |
|---|---|
| P0 health/config/city_center/POI/weather | 通过 |
| `/api/reverse_geocode` | 200（杭州翠苑） |
| `/api/plan/optimize` | 200，重排 + diff |
| `/api/transport/driving-route` | 200，`source=amap` |
| 编辑模式 / 想去清单 / 仅保存 / 智能优化候选 | 浏览器通过，无 console error |
| 自驾模式切换 + 重算道路 | 面板可用；`driving-route` 200 |

### 已知非阻塞观察

1. 自驾从城市行程转换时，城市锚点可能显示「待定位」，道路摘要可为「部分路段不可用」（graceful degrade）。
2. 自驾节点列表会展开多日同名景点，略吵但可预期。
3. 启动前需确认 8000 端口为本分支进程，否则旧 worktree 会 404 新路由。
4. 本分支领先 master **18 commits**，尚未合入；与 `codex/editable-itinerary-self-drive` tip 对齐。

详见 [CHANGELOG.md](./CHANGELOG.md) 和 [ADR-002](./docs/decisions/ADR-002-constraint-driven-editable-planning.md)。

---
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

---

# 工程化整改执行计划

> 制定日期：2026-07-09
> 执行策略：小步落地，先补可重复验证和测试基线，再拆分模块；不在同一批改动中做大规模重构。

## 目标

把项目从“可运行 Demo”提升到“可持续维护的单人/小团队项目”。当前技术栈仍保留 FastAPI + vanilla HTML/CSS/JS，不立即切换到前端框架或引入数据库，优先降低维护风险和回归风险。

## P0：本批执行

1. 增加本地一键检查脚本：
   - Python 语法检查：`python -m compileall server.py services`
   - 后端回归测试：`python -m unittest discover -s tests -v`
   - 前端语法检查：`node --check static/app.js`（检测到 Node.js 时执行）
2. 补充不联网、可稳定运行的回归测试：
   - 航班内置 fallback 方向不反转；
   - 服务端生成交通分段时保持 `A → B` 稳定契约；
   - per-segment 交通方式优先于 global transport；
   - 明显反向的交通选项会被过滤；
   - 景点最近邻排序把无坐标项保留在末尾。
3. 在 README 中暴露检查命令，让后续修改有统一入口。

## P1：下一批建议

1. 拆分 `server.py`：
   - `routers/`：API 路由；
   - `schemas/`：Pydantic 请求/响应模型；
   - `clients/`：高德、AI、外部交通 API 客户端；
   - `planner/`：AI 行程生成、交通增强、质量检查、价格估算等纯业务逻辑。
2. 拆分 `static/app.js`：
   - `state.js`：单一状态对象与派生计算；
   - `api.js`：`fetchJson()`、POI、城市中心、交通刷新；
   - `render.js`：时间线、预算、交通、详情面板渲染；
   - `map.js`：Leaflet 初始化、marker、路线；
   - `storage.js`：本地快照；
   - `export-ics.js`：日历导出。
3. 把 AI prompt 模板从 `server.py` 移到独立文件或独立模块，便于审查差异。
4. 为 AI 输出增加 Pydantic 结构校验，减少“JSON 能解析但语义错误”的风险。

## P2：上线前建议

1. 收紧 CORS，不再使用 `allow_origins=["*"]` 作为生产默认。
2. 限制或移除 `/api/config` 中对前端无必要的 key 暴露。
3. 增加输入长度限制和更明确的 4xx 错误。
4. 用 `logging` 替代 `print()`，输出外部 API 耗时、fallback 使用次数和错误来源。
5. 加 CI：至少运行本地检查脚本等价命令。

## 暂不执行

- 不引入数据库；
- 不引入 React/Vue/Next；
- 不增加必需第三方 API key；
- 不做大规模重写式重构。

## P0 执行结果：产品化基础设施切片

本批继续向“完全产品化”推进，完成以下基础设施能力：

1. 规格与任务：
   - 新增 `tasks/productization-spec.md`，明确产品化成功标准、边界和验收方式；
   - 新增 `tasks/todo.md`，作为后续拆分、上线和验收 backlog。
2. 运行时安全默认值：
   - `ALLOWED_ORIGINS` 替代 wildcard CORS 默认值；
   - `APP_ENV=production` 时拒绝 `ALLOWED_ORIGINS=*`；
   - `/api/config` 默认不再暴露 `AMAP_KEY` / `AMAP_SECURITY_KEY`，需要 `EXPOSE_CLIENT_CONFIG=true` 才开启兼容行为；
   - 响应增加 `x-request-id`、`x-content-type-options`、`x-frame-options`、`referrer-policy`、`permissions-policy`，生产环境额外启用 HSTS。
3. 可观测性基础：
   - 每个请求输出结构化 JSON 日志；
   - 日志包含 `event`、`request_id`、`method`、`path`、`status_code`、`duration_ms`；
   - 天气查询异常改为结构化 warning 事件，不输出原始异常文本给用户。
4. 自动化质量门禁：
   - 新增 `.github/workflows/ci.yml`；
   - CI 执行 Python 依赖安装、`compileall`、`unittest`、`node --check static/app.js`。
5. 回归测试：
   - 新增运行时配置与安全头测试；
   - 测试数从 7 个增加到 12 个；
   - `.\scripts\check.ps1` 已通过。

仍未完成“完全产品化”：后续还需要拆分 `server.py` / `static/app.js`、增加上线 checklist、部署目标配置、浏览器运行时验证、发布/回滚流程和最终验收。

## P1 执行结果：后端配置与可观测性模块化

本批完成产品化 backlog 中的「Extract backend configuration and telemetry helpers」：

1. 新增 `core/settings.py`：
   - 集中管理 `APP_ENV`、`ALLOWED_ORIGINS`、`EXPOSE_CLIENT_CONFIG`、AI/高德/聚合数据配置；
   - 暴露 `load_settings()`、`parse_bool_env()`、`resolve_allowed_origins()`；
   - 保持生产环境拒绝 wildcard CORS 的安全默认值。
2. 新增 `core/observability.py`：
   - 集中配置结构化日志；
   - 提供 `install_operability_middleware()` 安装 request id、安全响应头、请求完成/失败日志。
3. `server.py` 改为从 `core` 模块加载设置和安装中间件：
   - 保留原有全局配置变量名，减少对既有代码影响；
   - `/api/health` 的 `juhe_key_configured` 改为从统一 settings 读取。
4. 测试同步：
   - 配置解析测试改为直接覆盖 `core.settings`；
   - FastAPI 响应头和 `/api/config` 安全行为测试保持不变。

验证：`.\scripts\check.ps1` 通过，12 个测试全部通过。

## P1 执行结果：交通规划逻辑模块化

本批继续缩小 `server.py` 的职责，完成 transport 相关业务逻辑抽离：

1. 新增 `planner/transport.py`：
   - `build_segments_from_destinations()`：服务端权威生成跨城交通段；
   - `enrich_one_segment()` / `enrich_transport_guide()`：真实 12306 / 航班参考数据增强；
   - `build_quality_checks()`：交通数据来源、方向一致性、候选班次质量检查；
   - `resolve_train_type_pref()`、`estimate_train_price()`、`estimate_flight_price()` 等价格和偏好辅助逻辑；
   - `nearest_neighbor_order()` / `haversine_km()`：同日景点几何排序。
2. `server.py` 改为导入 transport 模块函数：
   - 路由层仍保持原调用点，行为不变；
   - 删除原先内联在 `server.py` 中的大段交通/几何函数；
   - `server.py` 更接近应用入口、API 路由和 AI 行程编排层。
3. 测试同步：
   - 交通分段、方向过滤、预算映射、景点排序测试改为直接覆盖 `planner.transport`；
   - 交通增强 fallback 测试改为直接覆盖 `enrich_one_segment()`。
4. 仓库卫生：
   - `.gitignore` 增加 `*.baiduyun.uploading.cfg`，避免百度同步临时文件污染状态。

验证：`.\scripts\check.ps1` 通过，12 个测试全部通过。

仍待完成：AI prompt 组装、行程 hydration、天气查询客户端、API 路由拆分和前端模块化仍在 `server.py` / `static/app.js` 中，完整产品化尚未完成。

## P1 执行结果：AI 响应解析与行程 Hydration 模块化

本批继续拆 `server.py` 中的 AI 行程生成职责，完成一个低风险业务切片：

1. 新增 `planner/itinerary.py`：
   - `strip_markdown_code_block()`：清理 AI 返回中的 markdown fence；
   - `repair_truncated_json()`：修复被 token 截断的 JSON；
   - `parse_ai_itinerary_content()`：统一解析 AI JSON 响应；
   - `merge_poi_metadata()` / `order_daily_pois()`：合并 POI 元数据并按坐标排序；
   - `hydrate_itinerary()`：附加城市中心、天气、POI 示例、稳定交通段和质量检查。
2. `server.py` 简化：
   - AI 响应解析改为调用 `parse_ai_itinerary_content()`；
   - POI 合并、中心点/天气附加、交通分段和初始质量检查改为调用 `hydrate_itinerary()`；
   - 删除原内联 `_repair_truncated_json()`。
3. 新增 `tests/test_itinerary_planner.py`：
   - 覆盖 markdown fence 清理；
   - 覆盖 AI 响应外层杂文本提取；
   - 覆盖截断 JSON 修复；
   - 覆盖 hydration 后 POI 元数据、城市中心、天气、交通段和质量检查。

验证：`.\scripts\check.ps1` 通过，测试数从 12 个增加到 16 个。

仍待完成：AI prompt 模板仍在 `server.py` 中，天气/高德客户端仍未独立，API 路由仍未拆分，前端 `static/app.js` 仍是单文件。

## P1 执行结果：Prompt 模板外置与安全渲染

本批完成 prompt 可审查化和组装逻辑抽离：

1. 新增 `prompts/itinerary.md`：
   - 从 `server.py` 机械抽取原 itinerary prompt 模板；
   - 后续 prompt 修改可以独立 review，不再埋在后端编排代码中。
2. 新增 `planner/prompting.py`：
   - `load_itinerary_prompt_template()`：加载外置模板；
   - `build_destination_detail()`、`build_poi_list_text()`、`build_weather_text()`、`build_transport_rules()`：拆分 prompt 上下文构造；
   - `build_itinerary_prompt()`：统一返回最终 prompt 与扁平 POI 列表；
   - `SYSTEM_PROMPT`：集中管理系统提示词。
3. 安全改进：
   - `render_prompt()` 改为基于模板的一次性占位符渲染；
   - 用户输入或外部 API 数据中出现 `[DAYS]`、`[POI_LIST]` 等文本时，不会被后续递归替换，降低 prompt 注入/模板污染风险。
4. `server.py` 简化：
   - 删除内联长 prompt 和多段 replace 链；
   - `generate_itinerary()` 只保留天气查询、prompt 构建、AI 请求、解析和后处理编排。
5. 新增 `tests/test_prompting.py`：
   - 覆盖模板加载；
   - 覆盖一次性占位符渲染；
   - 覆盖目的地说明、交通约束、POI 上下文和用户输入 `[DAYS]` 不被二次替换。

验证：`.\scripts\check.ps1` 通过，测试数从 16 个增加到 21 个。

仍待完成：天气/高德客户端仍在 `server.py` 中，API 路由仍未拆分，前端 `static/app.js` 仍是单文件，仍需浏览器运行时验收和部署/回滚清单。

## P1 执行结果：高德客户端模块化

本批完成外部服务边界拆分，将高德 Web 服务调用从 `server.py` 移出：

1. 新增 `clients/amap.py`：
   - `pick_primary_district()`：保留“city > province > district > street”的同名行政区择优规则；
   - `parse_amap_pois()`：集中解析高德 POI 字段、坐标和 `biz_ext`；
   - `search_pois()`：封装 `v3/place/text`；
   - `get_city_center()`：封装 `v3/config/district`，无 key 或失败时返回稳定 fallback；
   - `query_weather()`：封装 district→adcode→weatherInfo 的天气查询链路，并保留 30 分钟缓存。
2. `server.py` 简化：
   - `/api/search_pois`、`/api/city_center`、`/api/weather` 改为调用 Amap client；
   - AI 行程生成中的城市天气查询改为调用 `amap_query_weather()`；
   - 删除内联 `_pick_primary_district()` 与 `_query_amap_weather()`。
3. 新增 `tests/test_amap_client.py`：
   - 覆盖西安同名 district 择优；
   - 覆盖无 key 城市中心 fallback；
   - 覆盖 POI 坐标、评分、营业时间解析；
   - 覆盖异常 location / 非 dict `biz_ext` 的防御性解析。

验证：`.\scripts\check.ps1` 通过，测试数从 21 个增加到 25 个。

仍待完成：API 路由仍在 `server.py` 中，AI 请求客户端仍未抽离，前端 `static/app.js` 仍是单文件，仍需浏览器运行时验收和部署/回滚清单。

## P1 执行结果：AI Client 模块化

本批完成 OpenAI-compatible Chat Completions 调用边界抽离：

1. 新增 `clients/ai.py`：
   - `calculate_max_tokens()`：集中 token 预算规则；
   - `build_chat_payload()`：集中 Chat Completions payload 构造；
   - `extract_chat_content()`：集中解析 `choices[0].message.content`；
   - `request_chat_completion()`：封装 HTTP 请求、鉴权头、endpoint 拼接和非 200 错误映射；
   - `AiClientError`：统一 AI client 错误类型。
2. `server.py` 简化：
   - `generate_itinerary()` 不再直接构造 AI HTTP headers/payload；
   - 非 200 / 响应结构异常由 `AiClientError` 映射到 API 500；
   - 编排层只保留天气查询、prompt 构造、AI content 获取、解析和后处理。
3. 新增 `tests/test_ai_client.py`：
   - 覆盖 token 上限；
   - 覆盖 payload 中 system/user prompt 与 temperature；
   - 覆盖响应 content strip；
   - 覆盖异常响应结构；
   - 使用 `httpx.MockTransport` 无网络验证 endpoint、Authorization header 和非 200 错误。

验证：`.\scripts\check.ps1` 通过，测试数从 25 个增加到 31 个。

仍待完成：API 路由仍在 `server.py` 中，前端 `static/app.js` 仍是单文件，仍需浏览器运行时验收和部署/回滚清单。

## P1 执行结果：Transport API Router 模块化

本批完成第一组 FastAPI 路由拆分，保持外部接口不变：

1. 新增 `routers/transport.py`：
   - `GET /api/transport/trains`
   - `GET /api/transport/flights`
   - `GET /api/transport/search`
   - `GET /api/transport/stations`
2. `server.py` 简化：
   - 注册 `app.include_router(transport_router)`；
   - 删除原内联 `/api/transport/*` 路由函数；
   - 保留 URL、query 参数、响应字段和错误行为。
3. 新增 `tests/test_transport_routes.py`：
   - 使用 `TestClient` 验证迁移后的路由仍可访问；
   - 用 patch 隔离外部 12306/航班依赖；
   - 覆盖 trains 价格/余票描述增强、flights 空结果 source、车次号搜索、stations 站点与机场响应。

验证：`.\scripts\check.ps1` 通过，测试数从 31 个增加到 35 个。

仍待完成：plan/config/Amap/health 路由仍在 `server.py` 中，前端 `static/app.js` 仍是单文件，仍需浏览器运行时验收和部署/回滚清单。

## P1 执行结果：Planning / Location / System Router 模块化

本批完成剩余后端路由和规划编排职责抽取，继续保持公开 API 不变：

1. 新增 `schemas/travel.py`：
   - 集中定义 `CityInfo` 与 `PlanRequest`；
   - `server.py` 继续导出这两个名称，兼容既有测试和外部引用。
2. 新增 `planner/generator.py`：
   - 迁出 `generate_itinerary()` 的 AI 行程生成编排；
   - 保留天气并发查询、prompt 构造、AI client 调用、JSON 解析、hydration、真实交通增强和 quality checks；
   - 新增 `ItineraryGenerationError`，由路由层统一映射为原有 HTTP 错误语义。
3. 新增非 transport 路由模块：
   - `routers/planning.py`：`POST /api/plan`；
   - `routers/location.py`：`GET /api/search_pois`、`GET /api/city_center`、`GET /api/weather`；
   - `routers/system.py`：`GET /api/config`、`GET /api/health`。
4. `server.py` 简化为应用装配层：
   - 加载 settings；
   - 安装 CORS 与可观测性中间件；
   - 注册各 router；
   - 挂载静态文件；
   - 启动时初始化 12306 站点数据。
5. 新增 `tests/test_non_transport_routes.py`：
   - 覆盖 Amap 代理响应形状；
   - 覆盖 weather 异常降级；
   - 覆盖 config 默认隐藏 key 与 health 字段；
   - 覆盖 `/api/plan` 的 city_data 校验和生成委派。

验证：新增路由测试通过，运行时硬化测试通过，`python -m compileall server.py clients core planner routers schemas services` 通过；`.\scripts\check.ps1` 通过，40 个测试全部通过；本地启动 uvicorn 后 `GET /api/health` 返回 `status: ok`。

仍待完成：前端 `static/app.js` 仍是单文件，仍需浏览器运行时验收、上线 checklist、部署/回滚清单和持久化/auth 范围决策。

## P2 执行结果：上线、回滚与人工冒烟清单

本批补齐产品化上线前的操作文档，让部署不再依赖口头记忆：

1. 新增 `docs/deployment-checklist.md`：
   - 明确生产环境变量：`APP_ENV`、`ALLOWED_ORIGINS`、`AMAP_KEY`、`AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`、`EXPOSE_CLIENT_CONFIG`、`LOG_LEVEL`、`JUHE_FLIGHT_API_KEY`；
   - 记录上线前检查项：密钥不入库、生产 CORS 不使用 `*`、默认不暴露 client config、CI/本地门禁通过；
   - 记录部署后 10 分钟观察项；
   - 记录回滚触发条件和回滚步骤；
   - 标注当前架构无数据库迁移、本地快照在浏览器 localStorage、12306 缓存可重建。
2. 新增 `docs/smoke-checklist.md`：
   - 覆盖 `/api/health`、`/api/config`、城市中心、POI、天气；
   - 覆盖浏览器首屏、行程生成、地图渲染、POI 详情、控制台错误；
   - 覆盖交通刷新、预算档位、自驾段、方向一致性；
   - 覆盖“我的行程”和 `.ics` 导出；
   - 覆盖桌面/移动响应式、brief header 折叠、键盘可达性和文本溢出。
3. 更新 `README.md`：
   - 增加上线前检查入口；
   - 更新当前模块化后的项目结构；
   - 保留生产配置要点和本地质量门禁命令。
4. 更新 `tasks/todo.md`：
   - 标记“生产环境变量与部署 checklist”和“人工 live smoke checklist”完成。

验证：文档已完成交叉检查；行为代码未变更，最终仍以 `.\scripts\check.ps1` 作为本批质量门禁。

仍待完成：前端 `static/app.js` 仍是单文件；持久化/auth 范围决策在下一节 ADR 中记录。

## ADR 执行结果：持久化与 Auth 范围决策

本批补齐一个关键产品化边界：当前版本继续保持本地-only 快照持久化，暂不引入登录系统、用户账号、服务端数据库或云端同步。

1. 新增 `docs/decisions/ADR-001-local-only-persistence.md`：
   - 记录当前约束：无数据库、无构建步骤、无登录系统；
   - 明确 `localStorage` 快照继续作为当前持久化方案；
   - 比较 shareable snapshot links、authenticated cloud persistence、local file export only 三个替代方案；
   - 记录后续重新评估触发条件：跨设备同步、分享链接、多人协作、长期保存、公开大规模发布。
2. 更新 `README.md`：
   - 在上线前检查入口中增加 ADR 链接。
3. 更新 `tasks/todo.md`：
   - 标记“Decide persistence/auth scope”完成。

验证：ADR 已按 `documentation-and-adrs` 要求记录 context、decision、alternatives 和 consequences。

仍待完成：前端无构建模块化在下一节完成；后续深拆属于持续优化，不再阻塞当前产品化验收。

## P2 执行结果：前端无构建模块化模式

本批完成前端模块化的低风险起步切片，不引入 npm、不改构建方式、不改变现有 UI 行为：

1. 新增 `static/app-utils.js`：
   - 暴露 `window.AeroTravelUtils`；
   - 抽出日期计算、类型标签、POI 元数据清洗、HTML 转义、交通时间解析、价格解析、segment key 标准化和方向匹配等纯工具函数；
   - 使用 IIFE + `Object.freeze()`，保持无构建、普通 `<script>` 加载模式。
2. 更新 `static/app.js`：
   - 从 `window.AeroTravelUtils` 解构使用工具函数；
   - 删除重复的内联工具函数；
   - 保留 state、渲染、地图、API、localStorage、导出等现有逻辑在原文件中，避免一次性大拆。
3. 更新 `static/index.html`：
   - 在 `app.js` 前加载 `app-utils.js`；
   - 更新 cache-busting query。
4. 更新 `scripts/check.ps1`：
   - JavaScript 语法检查从单个 `static/app.js` 扩展为所有 `static/*.js`。
5. 更新 `README.md` 与 `tasks/todo.md`：
   - 记录当前无构建模块化模式；
   - 标记前端模块化 backlog 完成。

验证：
- `node --check static/app-utils.js` 通过；
- `node --check static/app.js` 通过；
- `.\scripts\check.ps1` 通过，40 个测试全部通过；
- 本地 uvicorn + Chrome headless 打开 `/static/index.html`：`window.AeroTravelUtils` 存在，首屏示例行程渲染，3 个 day tab、4 个 timeline item、Leaflet 地图存在，控制台无 error/warning。

当前产品化 backlog 已全部打勾。后续若继续优化，可进一步把 `app.js` 拆成 `api/render/map/storage/export` 等更细模块，但这已经不再是当前验收阻塞项。



## 进度对齐补丁（2026-07-11）

在原 1.2.0 实施基础上补齐自驾闭环缺口：

- 修复 `static/map.js` 点选导出与道路 polyline 辅助函数
- 落地 `/api/transport/driving-route` 与 `create_driving_router`
- 将 `optimize_draft` 升级为 async，并接入 self-drive 成本矩阵/道路回填
- 重写 `planner/route_optimizer.py` 为 plan 约定的稳定接口
- 补齐自驾前端控件、重算请求、候选优化与地图预览接线
- 修复 `app.js` 中“仅保存 / 智能优化”事件绑定嵌套错误
- 补充 driving / route optimizer 测试，并更新 smoke checklist

