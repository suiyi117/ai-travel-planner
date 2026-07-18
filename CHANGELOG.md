# Changelog

本项目的所有重要变更记录，遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵从 `MAJOR.MINOR.PATCH`。

---

## [Unreleased]

### Added 新增
- 分段单选器支持方向键、Home/End 与 roving tabindex；三步向导补充完成态、`aria-current` 和换步焦点管理。
- 编辑区“移动到其他日期”改为统一对话框流程，不再依赖文本 prompt；地图抽屉补充焦点约束与恢复。
- 新增确定性的门到门排程层：按真实/参考城际交通、站前站后缓冲、景点开放时间、游玩时长、午餐和景点间移动重排每日时间线，容量不足的地点明确降为备选。
- 专属行程页新增单日工作台：顶部行程摘要与城市日期带、左侧当天时间线、右侧共享地图、地点详情和固定行动条，不再一次铺开整份长报告。

### Changed 变更
- 前端静态资源按 `static/css`、`static/js/core`、`static/js/planning`、`static/js/delivery` 分层，所有入口、测试、发布打包与递归 JavaScript 语法检查同步迁移，并新增静态资源说明和仓库导览。
- 三步向导底部决策栏改为桌面、平板和手机均可达的 sticky 操作区；手机摘要拆分路线、元信息和操作层，平板窄桌面断点使用紧凑两行摘要。
- PDF 备份改为全册 A4 纵向的正式旅行手册：封面、地图总览、每日双栏时间线和费用/交通/提示末页使用独立打印结构并继续读取同一份 trip package。
- 竖向总览图固定为 3:4 的 1080×1440 交付尺寸，地图优先，每日摘要限制为两个核心地点，预算、提示和二维码重新分区。
- 专属行程页新增平板/手机专用布局：平板保留时间线与地图双栏，手机改为地图优先单列并将导出动作收进「更多」。
- 前端设计令牌、工作台覆盖样式和 DOM 展示交互分别迁至 `tokens.css`、`workspace.css`、`ui-interactions.js`，`index.html` 只保留结构和资源顺序。
- 表单、按钮与分段选择器统一组件高度；桌面步骤条与表单卡片使用同一内容宽度，移动端统一 44px 触控目标和安全区留白。
- 顶栏菜单补充首项聚焦、方向键、Home/End、Escape 与 Tab 关闭行为。
- 工作台在原有暖色纸张感与陶土色品牌基调上统一排版、间距、圆角、阴影和交互状态，路线编辑、偏好配置与行程结果使用更克制的一体化视觉层级。
- 主工作台和专属分享页的交互地图改为主题化 OpenFreeMap / MapLibre 矢量底图优先；高德后端接口、GCJ-02 栅格回退与无浏览器密钥策略保持不变。
- 每日长图、总览 PNG、PDF 与专属分享页统一客户交付视觉；静态导出的地图继续使用高分辨率高德静态图，不依赖 WebGL 画布捕获。
- 城际班次默认按门到门占用窗口展示；自驾段在城市中心可用时读取高德道路距离、时长和过路费参考。
- 路线、偏好和结果三步按参考图重排为统一桌面网格；城市表格、表单列、日期分组、时间轴和底部摘要条使用同一对齐基线与字号层级。
- 专属页与主工作台共用 OpenFreeMap / MapLibre 矢量地图；手机端高德、小红书和大众点评操作优先唤起对应 App，并保留网页版兜底。

### Fixed 修复
- 修复高德不可用时未知城市统一回退到 `116,30` 的问题；已知城市改用行政后缀归一化后的 GCJ-02 城市中心，西安专属页导航重新落在本地。
- 修复“上午”等中文宽泛时段被排到晚间住宿之后、又与 09:30 产生误冲突徽章的问题；工作台、历史恢复和交付包统一稳定排序，只有明确钟点参与精确重叠判断。
- 修复行程卡片形成嵌套按钮、结果层内部横向溢出、手机摘要拥挤和短标题触控区仅 24px 等语义与细节问题。
- 修复 1024px 平板底部摘要元信息被挤入窄列而逐字换行、操作栏膨胀到 275px 的问题；修复 FastAPI `on_event` 启动弃用警告并保持车站数据单次初始化。
- 修复 PDF 首个超高总览块被避分页规则整体推后而产生空白首页的问题；移除打印根部冗余地图节点并以正式封面稳定占据第一页。
- 修复手机专属页旧规则隐藏 AeroTravel 品牌文字、地图地点卡覆盖版权信息，以及顶部交付按钮横向拥挤的问题。
- 修复向导动画期间退出面板仍可被辅助技术访问、按钮焦点留在隐藏面板的问题。
- 修复工作台卡片 `overflow` 使 Step 1 与编辑操作条 sticky 行为失效的问题。
- 修复高德栅格回退仍套用 WGS84 显示转换，导致标记、路线和地图中心发生偏移的问题；覆盖矢量/栅格切换后的叠加层重绘。
- 修复“从地图选点”在懒加载地图尚未创建时不可用，以及关闭抽屉后残留点选监听的问题。
- 修复 PDF 旧打印规则覆盖新版两列布局、额外内边距和长日程分页的问题；最终打印层固定置于样式文件末尾。
- 修复总览 PNG 使用方形静态图造成路线端点裁切的问题，改为与 540px 交付画框匹配的 1024×704 高德静态图。
- 修复手机地图归属信息被地点卡遮挡、分享页触控目标不足 44px 和小字号元数据对比度偏低的问题。
- 修复多城交通按进入出发城之前的累计天数查票而导致日期提前的问题；零天过境保持同日衔接，环线与终点过境保持在最后一个游玩日。
- 修复真实班次覆盖 AI 候选后景点时间不再重排、只检查车上/机上时段而遗漏进站安检和落地接驳的问题。
- 修复专属页快速切换日期后，旧地图的 WebGL 回调仍访问已销毁 Leaflet 实例并在控制台报错的问题。
- 修复手机端 App 深链失败后通过延迟弹窗打开网页、可能被浏览器拦截的问题，改为当前页可靠兜底。
- 修复多城方案尚未发生跨城转场时，AI 住宿文案提前写到下一座城市的问题；保留原建议供内部复核并自动回落到当日城市。

### Technical Notes 技术说明
- 外置 Chrome 完成 1440×900 桌面、1024×1366 平板、390×844 手机主流程及专属页回归：时间顺序、地图开关、触控尺寸、底栏高度、导航坐标和非地图横向溢出均符合预期，两类页面控制台 error/warning 为 0。
- 外置 Chrome 新增 1024×1366 平板与 390×844 手机验收：横向溢出为 0，手机地图早于时间线，更多菜单动作完整，控制台无新增 error/warning。
- `scripts/check.ps1` 通过：112 个 Python 测试、264 个前端测试、Ruff、Mypy 与全部 JavaScript 语法检查全绿；安全门禁未发现疑似密钥或已知依赖漏洞。
- 外置 Chrome 完成 1536×1024、1616×974 与 390×844 运行时验收；未使用应用内置浏览器。
- 真实生成并逐日检查北京 → 西安 2 天高铁、上海 → 成都 3 天飞机、杭州 → 黄山 → 景德镇 4 天自驾环线，未发现通行、午餐或景点时段重叠。
- `scripts/check.ps1` 通过：110 个 Python 测试、235 个前端测试、Ruff、Mypy 与全部前端语法检查全绿；安全扫描未发现疑似密钥或已知依赖漏洞。

## [1.3.0] - 2026-07-13

### Added 新增
- 起点过境：首城可设为仅出发（`plan_stay=false` / `days=0`），不排当地游玩日；向导校验与草稿/优化 schema 对齐。
- 路线形态「单程 / 环线」常显于 Step 1；环线生成会补回程交通段，并在末日时间线展示「环线回程」。
- 客户导出改为「导出每日行程图」（按天 PNG），避免整段长图难读；仍保留总览图与 PDF 备份。
- 专属行程页：总览右侧模块卡片（费用/提示/天气/扫码）、每日卡片化时间轴、打印/PDF 日页结构对齐。
- 总览静态图：跨日均衡锚点、景点摘要优先、路径抽稀与更高分辨率预渲染。
- 新增 `planner/optimization.py`，集中处理草稿优化校验、已知错误映射、warning 与响应组装。
- 新增 `static/js/delivery/delivery.js` 和 `static/css/delivery.css`，隔离客户版文字、长图 HTML 与固定导出样式。
- 新增前端壳层、交付内容转义和优化接口错误脱敏回归测试。
- Windows 一键启动：`start.bat` / `scripts/start.ps1`。

### Changed 变更
- 草稿 `CityStop` 允许 `days=0` 与可选 `plan_stay`，优化接口可接收过境城草稿。
- 发布下载文件统一为 `{token}.html`（路径 `/t/{token}.html`），与二维码建议 URL 对齐。
- 顶栏复制、长图和日历操作合并为可访问的导出菜单；移动端使用紧凑省略号入口，toast 移至右下角。
- 删除无调用的 `schemas/location.py`、`static/render.js` 和已完成的历史实施计划；`CLAUDE.md` 改为引用 `AGENTS.md` 的单一规则源。
- Dependabot 按 GitHub Actions 和 Python 两个生态分组，减少重复更新 PR。

### Fixed 修复
- 过境起点校验误报「停留 1–7 天」、保存草稿冲掉 `plan_stay`、环线回程在 draft 同步时丢失等问题。
- 专属页侧栏溢出、总览图模糊（展示高度与静态图分辨率）、按天导出文件名非法字符。
- 修复组件样式覆盖原生 `hidden` 后，隐藏的自驾设置、编辑器和草稿操作栏仍可能占据布局的问题。
- 修复优化候选面板依赖已删除旧布局挂载点的问题。
- 优化接口的未知异常改为通用 500 响应，避免把内部异常文本返回给浏览器。

### Technical Notes
- 质量门禁：`.\scripts\check.ps1` 与 GitHub CI quality 通过。
- 安全门禁：`.\scripts\security.ps1` 与 GitHub Security workflow 通过。
- 保持无数据库、无登录系统、无前端框架、无构建步骤；持久化仍为浏览器 localStorage。

## [1.2.0] - 2026-07-11

### Added 新增
- 页面信息架构重设计：三步向导（路线 → 偏好 → 行程）、桌面摘要轨、主区页面级滚动，以及按需打开的地图抽屉。
- 新增 `static/js/planning/wizard.js` 纯步骤辅助函数，并用 `tests/frontend/wizard.test.js` + `scripts/check.ps1` 接入前端单测。
- 小团队工程化治理：新增 `requirements-dev.txt`、`pyproject.toml`、pre-commit、PR/Issue 模板、Dependabot、CI 质量门禁和安全扫描 workflow。
- 新增 `scripts/security.ps1`，对 Git 跟踪文件做 secret scan，并用 `pip-audit` 审计 Python 依赖。
- 新增 `docs/engineering/change-management.md` 和 `docs/engineering/release-process.md`，记录变更、ADR、浏览器 smoke 和发布流程。
- 前端无构建模块拆分为 `state/api/map/storage/export-ics/wizard` 边界模块，`app.js` 保留为启动和编排入口。
- 12306 解析与站点缓存拆分到 `services/train_parser.py` 和 `services/train_station_cache.py`，并增加离线回归测试。
- 测试目录按 `clients/core/planner/routers/services` 镜像源码组织。
- 可编辑行程工作台：三阶段状态模型（AppliedPlan / WorkingDraft / CandidatePlan）
- 想去清单：支持手动添加、POI 搜索、地图点选三种入口
- 每日编辑器：拖拽排序、上移/下移、跨日移动、名称编辑
- 四种硬约束：必去、固定日期、固定时段、固定顺序
- 约束驱动优化：最近邻+2-opt 重排未锁定节点，变更以 human-readable diff 展示
- 智能优化 API (`/api/plan/optimize`)：带 revision 冲突检测的无状态优化
- 候选方案面板：差异分组、应用/放弃/撤销已应用优化
- 自驾规划模式：环线/单程、三种策略（少开车/均衡/多体验）
- 自驾路线优化：约束感知节点排序、按天拆分
- 高德驾车距离矩阵：真实道路距离、驾驶时间、过路费估算、降级回退
- 反向地理编码 (`/api/reverse_geocode`)：地图选点自动解析地点名称
- 仅保存模式：按编辑结果直接保存，不触发 AI 或路线重算
- 撤销/重做：有界历史记录（上限 50 步）
- 快照版本升级：schema v2，兼容 v1 只读恢复

### Changed 变更
- 前端壳层从固定 `100vh` 三栏工作台改为可滚动向导；生成 CTA 放在偏好步骤，地图默认不占主视觉。
- 本地与 CI 质量门禁统一为 `scripts/check.ps1`，覆盖 Ruff、Mypy、coverage、Python 测试和全部 `static/*.js` 语法检查。
- Python 运行时依赖升级：FastAPI `0.139.0`，python-dotenv `1.2.2`，以消除 Starlette/python-dotenv 已知漏洞。
- Coverage 基线门槛设为当前覆盖率向下取整后的 50%，后续只应上调。
- `state.js` 扩展：新增 draft、candidate、edit mode、self-drive settings、request controllers
- `storage.js` 升级：save/remove 返回显式结果，支持 v2 快照
- `app.js` 重构：新增 commitDraft / renderEditor / handleDraftListAction / openConstraintDialog
- `scripts/check.ps1` 扩展：新增前端单元测试（`node --test tests/frontend/*.test.js`）

### Technical Notes
- 29 Python 测试 + 51 前端单元测试通过
- Mypy 类型检查通过
- 全部 12 个 JS 文件语法检查通过
- 保持无数据库、无登录系统、无前端框架、无构建步骤
- 持久化仍为浏览器 localStorage

### Security 安全
- 安全门禁通过：未发现跟踪文件疑似密钥，`pip-audit` 未发现已知漏洞。

## [1.1.0] - 2026-07-09

### Added 新增
- 产品化质量门禁：新增 `scripts/check.ps1` 和 GitHub Actions CI，统一执行 Python 编译、后端测试和前端 JS 语法检查。
- 运行时安全与可观测性：新增环境化 CORS、默认隐藏 `/api/config` 密钥、请求 ID、安全响应头和结构化请求日志。
- 后端模块化：新增 `core/`、`clients/`、`planner/`、`routers/`、`schemas/`、`prompts/`，将配置、Amap、AI、prompt、itinerary hydration、transport enrichment 和 API routes 从 `server.py` 拆出。
- 前端无构建模块化：新增 `static/js/core/app-utils.js`，抽出日期、HTML 转义、POI 元数据、交通时间解析等工具函数。
- 上线文档：新增部署/回滚清单、人工冒烟清单、产品化 backlog/spec 和本地-only 持久化 ADR。
- README 展示升级：新增真实界面截图、能力矩阵、Mermaid 架构图和更新后的模型配置建议。

### Changed 变更
- 默认 AI 模型从 `gpt-4o-mini` 更新为 `gpt-5.5`，并同步 `.env.example`、README 和部署文档。
- README 的模型示例更新为较新的 OpenAI、通义千问和 DeepSeek 模型配置。
- “复制交付文案”调整为面向客户的“复制客户行程”，复制内容不再包含内部检查信息。
- 内部质量面板文案改为“内部检查”，明确不会复制到客户版行程。

### Fixed 修复
- 修复“我的行程”下拉面板设置 `hidden=true` 后仍显示的问题。
- 修复快照下拉打开/关闭状态与 `aria-expanded` 不一致的问题。
- 修复 12306 字段布局差异导致车次号可能显示为站码的问题。
- 修复北京/西安等城市主站选择被方向站误导的问题。
- 修复高德 district 同名区县导致西安中心点落到其他省份的问题。

### Technical Notes
- 本版本保持无数据库、无登录系统、无前端构建步骤。
- 当前持久化策略仍为浏览器 `localStorage` 本地快照；云端分享和账号系统不在 1.1.0 范围。
- 本地质量门禁通过：40 个后端测试 + Python 编译 + `static/*.js` 语法检查。

## [1.0.0] - 2026-07-08

### Added 新增
- 多城市行程规划：支持添加、删除、拖拽排序目的地城市
- AI 驱动的行程生成：支持 OpenAI / 通义千问 / DeepSeek / 智谱 GLM 等多家 LLM
- 12306 火车/高铁实时时刻表查询（`services/train_service.py`）
- 航班查询服务（聚合数据 API + 18 条热门城际航线回退数据，`services/flight_service.py`）
- 高德地图 POI 搜索与城市中心坐标查询
- Leaflet 交互式地图（高德瓦片、景点标记、路线折线、同步时间线）
- 时间线行程视图：按日标签页、类型筛选、费用明细、出行贴士
- 交通方式选择：支持全局偏好与分段独立指定（智能推荐/高铁/飞机/自驾）
- 响应式布局：桌面三列、平板双列、移动端单列
- 本地回退/演示模式：8 个主要中国城市的内置景点数据库
- `.env.example` 配置模板

### Technical Notes
- 后端：Python 3.10+ / FastAPI / Uvicorn
- 前端：纯 HTML/CSS/JS（无框架），Claude Design System 暖色主题
- 47+ 城市车站-电报码映射，55+ 城市机场 IATA 码映射
