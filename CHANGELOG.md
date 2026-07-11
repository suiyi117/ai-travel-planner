# Changelog

本项目的所有重要变更记录，遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵从 `MAJOR.MINOR.PATCH`。

---

## [Unreleased]

### Added 新增
- 页面信息架构重设计：三步向导（路线 → 偏好 → 行程）、桌面摘要轨、主区页面级滚动，以及按需打开的地图抽屉。
- 新增 `static/wizard.js` 纯步骤辅助函数，并用 `tests/frontend/wizard.test.js` + `scripts/check.ps1` 接入前端单测。
- 小团队工程化治理：新增 `requirements-dev.txt`、`pyproject.toml`、pre-commit、PR/Issue 模板、Dependabot、CI 质量门禁和安全扫描 workflow。
- 新增 `scripts/security.ps1`，对 Git 跟踪文件做 secret scan，并用 `pip-audit` 审计 Python 依赖。
- 新增 `docs/engineering/change-management.md` 和 `docs/engineering/release-process.md`，记录变更、ADR、浏览器 smoke 和发布流程。
- 前端无构建模块继续拆分为 `state/api/map/storage/export-ics/render` 边界模块，`app.js` 保留为启动和编排入口。
- 12306 解析与站点缓存拆分到 `services/train_parser.py` 和 `services/train_station_cache.py`，并增加离线回归测试。
- 测试目录按 `clients/core/planner/routers/services` 镜像源码组织。

### Changed 变更
- 前端壳层从固定 `100vh` 三栏工作台改为可滚动向导；顶栏移除主「生成规划」按钮，生成 CTA 放在偏好步骤；地图默认不占主视觉。
- 本地与 CI 质量门禁统一为 `scripts/check.ps1`，覆盖 Ruff、Mypy、coverage、Python 测试和全部 `static/*.js` 语法检查。
- Python 运行时依赖升级：FastAPI `0.139.0`，python-dotenv `1.2.2`，以消除 Starlette/python-dotenv 已知漏洞。
- Coverage 基线门槛设为当前覆盖率向下取整后的 50%，后续只应上调。

### Security 安全
- 安全门禁当前通过：未发现跟踪文件疑似密钥，`pip-audit` 未发现已知漏洞。


## [1.2.0] - 2026-07-11

### Added 新增
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

## [1.1.0] - 2026-07-09

### Added 新增
- 产品化质量门禁：新增 `scripts/check.ps1` 和 GitHub Actions CI，统一执行 Python 编译、后端测试和前端 JS 语法检查。
- 运行时安全与可观测性：新增环境化 CORS、默认隐藏 `/api/config` 密钥、请求 ID、安全响应头和结构化请求日志。
- 后端模块化：新增 `core/`、`clients/`、`planner/`、`routers/`、`schemas/`、`prompts/`，将配置、Amap、AI、prompt、itinerary hydration、transport enrichment 和 API routes 从 `server.py` 拆出。
- 前端无构建模块化：新增 `static/app-utils.js`，抽出日期、HTML 转义、POI 元数据、交通时间解析等工具函数。
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

