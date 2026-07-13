# AeroTravel UI 交互重设计计划（前端）

> 状态：**规划归档 / 部分已落地，剩余项 backlog**  
> 日期：2026-07-13（归档注记 2026-07-13 收尾）  
> 工作分支：原计划 `feature/ui-interaction-redesign`；本轮交付/过境/环线等改动在工作区合并演进  
> 依据：`critique.json`（score 3.4）、用户偏好（透气多层 / 可拖拽 / 只改前端）、现有 `static/index.html` + wizard 壳  
> 视觉系统：Claude / Anthropic（parchment + terracotta）— 已注入，本计划**收敛用法**而非换肤  
>
> **收尾说明**：本文档保留为产品设计参考。已落地部分包括：专属页侧栏模块卡、每日时间轴卡片、导出菜单分组、按天导出、路线形态控件等。未完成的 Step3 浏览/编辑/洞察三层信息架构仍作后续 backlog，不阻塞本轮合并。  

---

## 1. 意图摘要

把「能用的三步向导工作台」升级为**层次清晰、默认一条主路径、交互可预期**的规划产品：

1. **信息分层**：Step 1–2 保持简洁；**Step 3 结果页拆成浏览 / 编辑 / 洞察三层**，默认只露浏览主路径。  
2. **交互统一**：表单、城市序列拖拽、结果节点拖拽、地图抽屉、导出交付，各自有明确入口与状态。  
3. **视觉克制**：accent 预算回到「每屏最多 2 次 terracotta」；elevation 统一 ring / whisper。  
4. **硬约束**：只改前端（`static/*` + 必要前端测试）；不改后端 API / Python。  

**Done means**：critique 五轴 ≥ 4；结果页默认滚动面只呈现一条主路径；禁用假控件；导出菜单分组；城市与编辑节点拖拽可用且有明确反馈。

---

## 2. 用户与任务

| 角色 | 主任务 | 关键时刻 |
|------|--------|----------|
| 个人规划者 | 定路线 → 设偏好 → 看日程 → 微调 | 生成后 10 秒内知道「今天去哪」 |
| 行程顾问 | 快速改点 / 导出客户稿 | 导出菜单不迷路；编辑态可拖拽重排 |

---

## 3. 现状问题（来自 critique + 代码结构）

| 问题 | 位置 | 影响 |
|------|------|------|
| Step 3 单滚动面堆叠过多模块 | `#stepResults` | 认知过载，违背「透气 / 多层」 |
| 多条工具条权重接近 | toolbar / plan-mode / day-tabs / filter-tabs / draft-action-bar | 焦点稀释 |
| accent 超预算 | day-tab active、主 CTA、timeline 节点、拖拽高亮 | 品牌偏工具感 |
| `#fff` hover + 重 drop-shadow | `.day-tab:hover` 等 | 偏离 parchment / ring elev |
| 导出 8 项扁平列表 + 移动端重复 | topbar export / mobile-more | 交付路径不清 |
| 禁用天数 range 假交互 | `#daysRange[disabled]` | 语义模糊 |
| 编辑拖拽目标未充分验证 | editor / draft 区 | 用户目标「这个可以拖拽」未闭环 |

---

## 4. 信息架构（多层次，非单页堆叠）

保持 **单文件应用壳**（`static/index.html`），用 **面板分层 + 模式切换** 实现 multi-level，不强制拆路由（避免后端/构建改动）。

```
App Shell
├── Topbar（品牌 · 摘要 · 交付）
├── Wizard Rail（步骤 1/2/3 + 实时摘要）
└── Wizard Main
    ├── Step 1 路线（表单主路径）
    ├── Step 2 偏好（表单主路径 + 生成 CTA）
    └── Step 3 行程（默认 Browse）
        ├── L0 摘要条（指标 + 主工具：地图 / 刷新 / 重生成）
        ├── L1 Browse：日标签 → 筛选 → 时间线  ← 默认可见
        │     └── 城际交通区：默认折叠；filter=transport 时强制展开并强化视觉
        ├── L2 Edit：编辑台 + 草稿操作条 +（优化成功后）diff 面板默认展开
        ├── L3 Insights：费用 / 贴士 / 质量      ← 默认折叠
        └── Overlay：地图抽屉 · 约束 dialog · 加地点 dialog
```

### 4.1 默认主路径（Step 3 Browse）

用户生成成功后只应看到：

1. 标题 + 一句摘要  
2. 紧凑指标（天数 / 城市 / 节点）  
3. 工具：看地图 · 刷新班次 · 重新生成 · **编辑行程**（进入 L2）  
4. Day tabs + 类型筛选 + 时间线  
5. 「城际交通」折叠入口（**默认收起**；见 4.4）  
6. 「费用与贴士」折叠入口（默认收起）  

**隐藏或降权**：wishlist/editor 双栏、draft-action-bar、quality 长列表。

### 4.2 编辑模式（L2）

- 入口：Browse 工具条「编辑行程」或 plan-mode `编辑`。  
- 布局：左「城市顺序 + 想去清单」/ 右「日 Tab + 节点列表」。  
- **拖拽**：城市顺序、节点跨日/同日排序均支持 grab 态与 drop 反馈（与 city-card 一致）。  
- 底栏：撤销 / 重做 / 仅保存 / **智能优化**（唯一 terracotta CTA）。  
- **智能优化成功后**：`#candidateDiffPanel` **默认展开**，展示前后对比与接受/拒绝路径；用户可手动收起。  
- 退出：回到 Browse，保留未应用提示。

### 4.3 洞察层（L3）

- 费用估算、出行贴士、质量面板 → 折叠面板（默认收起）。  

### 4.4 城际交通区（Browse 条件展开）— 已锁定

| 状态 | 行为 |
|------|------|
| 默认 / 筛选 ≠ transport | 「城际交通」折叠为单行摘要（段数 · 主要方式），点击可手动展开 |
| 筛选 = `transport` | **强制展开**，并成为主视觉焦点 |
| 筛选切回其他 | 可保持用户手动展开状态，或回到折叠（实现优先：离开 transport 筛选后恢复折叠，避免主路径再次变挤） |

**视觉（做得更好看，仍守 accent 预算）**：

- 折叠条：Ivory 表面 + ring，左侧小图标/线型徽章，右侧 chevron  
- 展开后：每段为 **行程段卡片**（起点 → 终点、方式徽章、时长/班次 meta），卡片间用轻分隔；非 terracotta 铺满  
- 空态：温和文案「暂无跨城段」  
- 与时间线 filter=transport 联动：筛选交通时时间线与交通区同时强调，避免两套列表抢戏（时间线可只显示交通类节点，交通区显示城际段明细）

### 4.5 移动端 Wizard Rail — 已锁定

- **窄屏隐藏** `#wizardSummary`（当前摘要卡片）  
- **只保留**水平步骤点 / 步骤标签（1 路线 · 2 偏好 · 3 行程）  
- 摘要信息改由 topbar meta + `#wizardCompactSummary` 承担，避免双份占用

---

## 5. 屏幕与模块清单

| 模块 | 职责 | 关键状态 | 响应式 |
|------|------|----------|--------|
| Topbar | 品牌、路线 meta、我的行程、导出 | 菜单开/关、空行程 | 窄屏：⋯ 合并菜单 |
| Wizard Rail | 步骤导航 + 摘要 | active / locked / done | 窄屏：仅步骤点；**隐藏 summary 卡** |
| Step 1 路线 | 城市序列、模式、形态、日期、天数摘要 | 空城市、拖拽中、校验失败 | 单列 stack |
| Step 2 偏好 | 节奏/交通/预算/补充 | 生成中 / 失败 | 单列 |
| Step 3 Browse | 时间线主路径 + 条件城际交通 | 空结果、筛选 transport 强制展开 | 时间线全宽 |
| Step 3 Edit | 双栏编辑 + 拖拽 + diff 默认展开 | 脏草稿、优化成功/中 | 窄屏上下叠 |
| Map Drawer | 地图 + 地点详情 | open / empty / loading | 桌面右侧抽屉，窄屏全屏 |
| Export Menu | 客户交付 / 备份 / 检查 | 分组列表 | 与 mobile-more 同源数据 |
| Dialogs | 约束、加地点 | 打开焦点陷阱 | 居中 modal |

---

## 6. 关键交互规则（全项目 UI 交互统一）

### 6.1 表单（Step 1–2）— 用户优先模块

- **城市序列**：输入 + 添加；列表可 **拖拽排序**；每城天数步进；段交通选择。  
- **天数**：总天数 = 各城天数之和；**去掉禁用 range**，改为只读摘要条：`合计 N 天（由各城市天数自动汇总）`。  
- Segmented 控件：ring 选中，**不用** terracotta 铺满。  
- 校验：无城市 / 无日期 → 阻断下一步，status-note 说明原因。  
- 主 CTA：Step1「下一步」；Step2「生成 AI 旅行规划」— 每步仅 **一个** primary。

### 6.2 结果浏览

- Day tab 选中：`surface + ring`，**禁止** terracotta 实心底。  
- Filter tab：同 day-tab 规则，active 用 fg + ring。  
- 时间线卡片：hover ring；选中可轻 accent 边（算 1 次 accent 预算）。  
- 点击卡片 → 可选中 + 打开地图抽屉对应点。  
- **筛选 transport**：强制展开城际交通区（§4.4），卡片段式布局，不用 terracotta 铺满。  

### 6.2.1 智能优化 diff（Edit）

- 优化请求成功且存在 candidate → **自动展开** `#candidateDiffPanel`。  
- 面板需可读：变更摘要 + 逐项 diff + 应用 / 放弃。  
- 用户可折叠；再次优化成功再次默认展开。

### 6.3 拖拽（用户目标）

| 对象 | 行为 | 视觉 |
|------|------|------|
| 城市卡 | 同列表重排 | `grab` / `is-dragging` 半透明 / `is-drag-over` 边框 |
| 编辑节点 | 同日重排、跨日（若已有逻辑则保留） | 与城市卡同一套 class 语义 |
| 地图选点 | 非拖拽；点选落点 | drawer 内卡片高亮 |

TODO：实现前在 `static/draft-ops.js` / `editor.js` 核对现有 DnD 覆盖面，缺口补前端逻辑。

### 6.4 地图

- 默认关闭；「看地图」打开。  
- 打开时 `body.map-drawer-open` 锁滚动。  
- 空态：map-empty 文案，不挡行程卡片。

### 6.5 导出 / 交付

菜单分组（桌面与移动端同一结构，避免双份文案漂移）：

```
客户交付
  · 复制客户行程
  · 发布专属行程
  · 预览专属页
  · 导出每日行程图
  · 导出总览图
备份
  · 导出 PDF 备份
  · 导出日历
检查
  · 参考链接检查
```

### 6.6 动效

- 保持 `--motion-fast/base` 克制。  
- 可选增强（P2）：步骤切换 fade/slide 短过渡；生成成功进入 Step3 一次入场。  
- 禁止装饰性无限动画。

---

## 7. 视觉系统收敛（Claude tokens）

| 规则 | 做法 |
|------|------|
| Accent 预算 | 每屏：主 CTA 1 次 + 可选 1 次高信号（如时间线 active 点）；kicker 改 `--meta` 或 `--muted`，weight 500–600 |
| Elevation | 按钮/卡片：`var(--elev-ring)` 或 `0 0 0 1px var(--border)`；抬升用 `var(--elev-raised)`；去掉彩色大阴影 |
| 禁止 | raw `#fff` hover → `var(--surface)`；day-tab active terracotta fill → ring 选中 |
| 字体 | brand h1 降为 `text-xl` 或保持但 pane-title 用 `text-2xl` 且页面主焦点在 panel；serif 标题 weight 500 |
| 背景 | 保持 parchment `--bg`，不引入冷灰 |

---

## 8. 实施分期（仅前端）

### Phase A — 结构分层（P0，优先）

- [x] Step 3 DOM：Browse 默认；Edit / Insights 用 `hidden` 或 `data-mode` 切换  
- [x] plan-mode 与工具条合并，避免双轨  
- [x] 费用/贴士/质量默认折叠  
- [x] 城际交通：默认折叠；`filter=transport` **强制展开**  
- [x] 天数 range → 只读摘要  
- [x] 导出菜单分组 + mobile 同源  
- [x] 窄屏隐藏 `#wizardSummary`，仅保留步骤点  

**触及文件（预期）**：`static/index.html`、`static/styles.css`、`static/app.js`、`static/wizard.js`（必要时 `delivery.js` 菜单渲染）

### Phase B — 视觉与焦点（P0）

- [x] day/filter tab 去 terracotta fill  
- [x] 去掉 `#fff`、收敛 drop-shadow  
- [x] kicker / brand 字重与字号  
- [x] primary 按钮每步唯一  
- [x] 城际交通折叠条 + 段卡片视觉（好看、克制）  

**触及文件**：`static/styles.css`（主）

### Phase C — 拖拽与编辑闭环（P1）

- [x] 城市拖拽反馈统一  
- [x] 编辑节点拖拽可达与可达提示  
- [x] draft-action-bar 仅 Edit 模式显示  
- [x] 脏状态与「未应用修改」文案  
- [x] 智能优化成功 → **diff 面板默认展开**  

**触及文件**：`static/draft*.js`、`static/editor.js`、`static/candidate.js`、`static/styles.css`、`static/app.js`

### Phase D — 动效与 polish（P2）

- [ ] 步骤切换轻过渡  
- [ ] 生成中骨架/禁用态  
- [ ] 窄屏步骤条与编辑上下叠微调  
- [ ] 城际交通展开/折叠过渡  

---

## 9. 数据 / 内容模型（前端视角，不改 API）

沿用现有 state：

- 路线：`cities[]`、天数、出发日、planningMode、routeShape  
- 偏好：pace、transport、budget、interests  
- 结果：`itinerary days[]`、transport 段、budget、tips、quality  
- 草稿：draft history / optimize candidate  

UI 只改变**呈现与交互**，不改变请求体字段名。

---

## 10. 验收标准

### 10.1 Critique 目标

| 轴 | 当前 | 目标 |
|----|------|------|
| clarity | 3 | ≥ 4 |
| hierarchy | 3 | ≥ 4 |
| typography | 4 | ≥ 4 |
| motion | 4 | ≥ 4 |
| brand | 3 | ≥ 4 |
| **总分** | **3.4** | **≥ 4.0** |

### 10.2 产品验收清单

- [ ] Step 3 首屏无需滚动即可识别「今天行程」入口（day tabs + 首卡）  
- [ ] 默认不出现编辑双栏与草稿底栏  
- [ ] 默认城际交通折叠；点「交通」筛选后强制展开且段卡片可读  
- [ ] 智能优化成功后 diff 面板默认展开  
- [ ] 窄屏不显示 wizard-summary 卡片，仅步骤点  
- [ ] 页面上同时可见的 terracotta 实心控件 ≤ 1  
- [ ] 无禁用但仍可见的 range 假控件  
- [ ] 导出菜单有 ≥ 2 个分组标题  
- [ ] 城市列表可拖拽排序且有 dragging 态  
- [ ] 编辑模式节点可拖拽（或明确「暂不支持」文案 — 优先实现）  
- [ ] 窄屏 360–430：无横向溢出；地图全屏可关  
- [ ] 前端测试：`tests/frontend/*` 相关用例通过（wizard / draft / delivery）  
- [ ] **无后端文件 diff**

### 10.3 反模式（禁止回归）

- 把所有模块再次 flatten 进同一 stack  
- 用 viewport 选择器 / 设计元数据冒充产品 UI  
- 引入新框架或构建步骤  

---

## 11. 风险与已锁定决策

| 项 | 说明 | 决策 |
|----|------|------|
| 编辑拖拽完整度 | 现有 DnD 可能仅部分支持跨日 | Phase C 先同日，跨日标 TODO |
| 洞察折叠 vs 二级 tab | 折叠更省空间 | **默认折叠** |
| 是否拆多 HTML 文件 | metadata 倾向 screen-file-first，但产品是单 SPA | **保持单 index 壳**，分层用模式而非多文件 |
| 品牌 kicker 是否完全去 accent | 设计系统允许 eyebrow accent | **kicker 改 muted**，把 accent 留给 CTA |
| 优化 diff 默认展开 | 成功后是否自动打开对比 | **是 — 默认展开** |
| 城际交通折叠策略 | 永远折叠 vs 条件展开 | **筛选 transport 时强制展开**；默认折叠；UI 段卡片化 |
| 移动端 wizard-summary | 是否隐藏摘要卡 | **是 — 仅保留步骤点** |

### 已关闭的 Open questions

- [x] 编辑模式「智能优化」成功后的 diff 面板：**默认展开**  
- [x] 城际交通：**默认折叠**；筛选 `transport` **强制展开**，并做更好看的段卡片 UI  
- [x] 移动端：**隐藏** wizard-summary 卡片，**只保留**步骤点  

### 剩余可选微调（非阻塞）

- [ ] TODO：离开 transport 筛选后是否始终恢复折叠（计划默认：是）  
- [ ] TODO：跨日拖拽 Phase C 是否一并交付，或二期  

---

## 12. Design 模式交付物建议

计划已锁定，Design 模式按 Phase A→B 优先改：

1. `static/index.html` — Step 3 结构分层、天数摘要、导出分组、交通折叠壳、diff 容器  
2. `static/styles.css` — tab/elev/accent/kicker、城际交通段卡片、窄屏隐藏 summary  
3. `static/app.js`（+ wizard / candidate / delivery）— mode 切换、filter→交通强制展开、优化成功展开 diff、菜单渲染、去掉 daysRange 假交互  
4. 更新 `critique.json` 复评至 ≥ 4  

不产出独立营销落地页；交付物即**可运行产品前端**。

---

## Next step

三项 Open questions 已写入计划。可直接：

1. 再扫一眼本文件：`docs/product/ui-interaction-redesign-plan.md`  
2. 回复 **「按计划生成」** 或切到 **Design 模式**，从 **Phase A + B** 开改前端（含：diff 默认展开、transport 强制展开 UI、移动端隐藏 summary）。  

未再改业务代码前，本文件即为唯一源。
