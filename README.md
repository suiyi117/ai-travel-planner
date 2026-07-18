<div align="center">

# AeroTravel

### 从路线草图，到一份真正能出发的中国多城市行程

<p>
  路线、节奏、真实地点、城际交通、每日排程与客户交付，<br>
  在一个安静、可编辑、可带走的旅行工作台里完成。
</p>

<p>
  <img alt="Python 3.10+" src="https://img.shields.io/badge/Python-3.10%2B-1C1B18?style=flat-square&labelColor=1C1B18&color=B34B2E">
  <img alt="FastAPI" src="https://img.shields.io/badge/Backend-FastAPI-1C1B18?style=flat-square&labelColor=1C1B18&color=E9E2D6">
  <img alt="Vanilla JavaScript" src="https://img.shields.io/badge/Frontend-Vanilla_JS-1C1B18?style=flat-square&labelColor=1C1B18&color=E9E2D6">
  <img alt="CI" src="https://github.com/suiyi117/ai-travel-planner/actions/workflows/ci.yml/badge.svg">
  <img alt="MIT" src="https://img.shields.io/badge/License-MIT-1C1B18?style=flat-square">
</p>

<p>
  <a href="#quick-start">快速启动</a> ·
  <a href="#product-experience">产品体验</a> ·
  <a href="#architecture">系统架构</a> ·
  <a href="#repository-guide">仓库导览</a>
</p>

</div>

<p align="center">
  <img src="docs/assets/aerotravel-overview.png" alt="AeroTravel 多城市行程工作台与地图" width="100%">
  <br>
  <sub>按天浏览的结构化行程，地图只在需要时出现。</sub>
</p>

---

<div align="center">

**Plan with intent. Verify with data. Deliver with confidence.**

</div>

| 路线不是输入框 | AI 不是最终答案 | 地图不是背景图 | 导出不是截图 |
|---|---|---|---|
| 每城天数、过境角色、环线与段级交通都有明确结构 | LLM 负责组织，规则引擎负责校验、补时和排序 | POI、路线、坐标与当前日程保持同一焦点 | 专属页、总览图、每日图、PDF 与日历共享同一份行程数据 |

<a id="product-experience"></a>

## Product experience

### 一条完整但克制的三步流程

| 01 · 路线 | 02 · 偏好 | 03 · 行程 |
|---|---|---|
| 设置城市顺序、游玩/过境角色、每城天数、日期与交通方式。 | 选择节奏、预算、兴趣与自驾策略，不要求用户理解规划术语。 | 按天检查时间线、地图和交通；需要时进入编辑，再生成客户交付物。 |

前端保持可滚动向导，而不是锁死在三栏工作台里。桌面使用摘要侧栏与常驻决策区；手机端把路线、元信息和编辑操作分层，地图以抽屉方式按需打开。

<table>
  <tr>
    <td width="50%">
      <img src="docs/assets/aerotravel-itinerary.png" alt="AeroTravel 按天行程时间线">
      <br><sub>按天时间线：交通、景点、美食与住宿使用同一排序规则。</sub>
    </td>
    <td width="50%">
      <img src="docs/assets/aerotravel-map-drawer.png" alt="AeroTravel 行程地图抽屉">
      <br><sub>按需地图：选中卡片、标记和地点详情保持同步。</sub>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <img src="docs/assets/aerotravel-editor.png" alt="AeroTravel 可编辑行程">
      <br><sub>可编辑草稿：必去、固定日期、固定时段、固定顺序与自驾路线都能被明确表达。</sub>
    </td>
  </tr>
</table>

## What makes the plan executable

| Layer | AeroTravel 的处理方式 |
|---|---|
| 地点与天气 | 由后端代理高德 Web 服务；坐标、评分、地址和开放时间作为不可信外部数据清洗后进入行程。 |
| AI 编排 | Prompt 独立存放并可审查，兼容 OpenAI-style Chat Completions，供应商可以替换。 |
| 城际交通 | 稳定生成 “A → B” 分段，再用 12306、航班参考和自驾道路数据增强，避免方向与段数漂移。 |
| 确定性排程 | 交通扩展为门到门窗口，再结合游玩时长、开放时间、午餐和移动时间落到每日时间线。 |
| 编辑约束 | 行程可转为草稿；硬约束不会在拖拽、删除、跨日移动或重新优化时静默丢失。 |
| 本地边界 | 快照仅保存在当前浏览器 localStorage；没有数据库、账号和云端同步。 |

<a id="quick-start"></a>

## Quick start

### Windows 一键启动

1. 安装 Python 3.10 或更高版本。
2. 复制 .env.example 为 .env，并填入需要的 Key。
3. 双击仓库根目录的 [start.bat](start.bat)。

脚本会优先使用项目 .conda 环境，在后端未运行时启动服务，并打开 [http://localhost:8000](http://localhost:8000)。

### 手动启动

~~~powershell
pip install -r requirements.txt
Copy-Item .env.example .env
python server.py
~~~

没有真实 API 时，前端仍会加载可交互示例；真实 POI、天气与 AI 生成需要相应配置。

> 请使用 http://localhost:8000。直接双击 static/index.html 会以 file:// 打开，浏览器的 Origin: null 不在默认 CORS 白名单内。

### Minimal environment

~~~dotenv
AMAP_KEY=你的高德 Web 服务 Key
AI_API_KEY=你的模型供应商 Key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-5.5
~~~

可选变量与生产安全默认值见 [.env.example](.env.example) 和 [部署清单](docs/deployment-checklist.md)。

<a id="architecture"></a>

## Architecture

~~~mermaid
flowchart LR
  U["路线与偏好"] --> UI["三步向导<br/>Vanilla JS"]
  UI --> LOC["地点 / 天气 API"]
  LOC --> AMAP["高德 Web 服务"]
  UI --> PLAN["POST /api/plan"]
  PLAN --> GEN["AI 行程编排"]
  GEN --> LLM["OpenAI-compatible LLM"]
  GEN --> SCHED["确定性排程与校验"]
  SCHED --> TRANSIT["12306 / 航班 / 自驾"]
  SCHED --> RESULT["结构化可编辑行程"]
  RESULT --> UI
  UI --> DELIVERY["地图 · 专属页 · 长图 · PDF · ICS"]
~~~

| Boundary | Technology |
|---|---|
| Backend | Python 3.10+、FastAPI、httpx、python-dotenv |
| Frontend | HTML、CSS、Vanilla JavaScript；无构建步骤 |
| Maps | Leaflet + MapLibre vector basemap；高德栅格回退 |
| AI | OpenAI-compatible Chat Completions；Prompt 模板外置 |
| Transport | 12306 公开接口、可选航班 API、高德自驾道路参考 |
| Persistence | 浏览器 localStorage |
| Quality | Ruff、Mypy、Coverage、Node test、secret scan、dependency audit |

<a id="repository-guide"></a>

## Repository guide

~~~text
ai-travel-planner/
├── server.py              # FastAPI composition root
├── clients/               # Amap and model-provider clients
├── core/                  # Settings, logging and security defaults
├── planner/               # Prompting, hydration, scheduling and optimization
├── prompts/               # Reviewable itinerary prompt
├── routers/               # HTTP route handlers
├── schemas/               # Pydantic contracts
├── services/              # Train, flight and driving integrations
├── static/
│   ├── css/               # Tokens, components, workspace and delivery styles
│   └── js/
│       ├── core/          # State, API, storage and pure utilities
│       ├── planning/      # Wizard, map, draft and editor
│       └── delivery/      # Preview, publish and export
├── tests/                 # Mirrored backend tests + browser-module unit tests
├── docs/                  # Product, ADR, engineering and launch documentation
├── scripts/               # Quality and security gates
└── tasks/                 # Product backlog and QA inbox
~~~

Start with the [repository map](docs/engineering/repository-map.md). Frontend load order and module ownership are documented in [static/README.md](static/README.md).

## Quality gates

~~~powershell
# Full syntax, lint, typing and regression suite
.\scripts\check.ps1

# Tracked-secret scan and Python dependency audit
.\scripts\security.ps1

# Focused API smoke checks
curl http://localhost:8000/api/health
curl "http://localhost:8000/api/city_center?city=北京"
curl "http://localhost:8000/api/search_pois?city=北京&keywords=景点&count=5"
curl "http://localhost:8000/api/weather?city=北京"
~~~

Browser-facing changes should also pass the [manual smoke checklist](docs/smoke-checklist.md): Step 1 load, Step 2 preferences, generation to Step 3, day switching, map open/close, editor entry and dedicated-page preview.

## Product and engineering docs

| Topic | Document |
|---|---|
| Product direction and MVP boundary | [产品总纲](docs/product/产品总纲.md) |
| Priorities and PRD state | [统一需求池](docs/product/需求池.md) |
| QA findings and small improvements | [问题收件箱](tasks/inbox/inbox.md) |
| Repository ownership | [Repository map](docs/engineering/repository-map.md) |
| Deployment and rollback | [部署清单](docs/deployment-checklist.md) |
| Runtime smoke checks | [人工冒烟清单](docs/smoke-checklist.md) |
| Change governance | [变更管理](docs/engineering/change-management.md) |
| Release process | [发布流程](docs/engineering/release-process.md) |
| Local persistence boundary | [ADR-001](docs/decisions/ADR-001-local-only-persistence.md) |
| Editable planning model | [ADR-002](docs/decisions/ADR-002-constraint-driven-editable-planning.md) |
| Vector basemap strategy | [ADR-003](docs/decisions/ADR-003-vector-basemap.md) |
| Version history | [CHANGELOG](CHANGELOG.md) |

## Scope

AeroTravel is intentionally single-user and local-first. Do not add a database, login system, frontend framework or required paid API without an explicit product decision and ADR.

---

<div align="center">
  <sub>Built for trips where the details matter.</sub>
  <br>
  MIT License
</div>
