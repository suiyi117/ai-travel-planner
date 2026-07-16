# AeroTravel UI 视觉精修设计（羊皮纸 + 构图）

日期：2026-07-15
状态：已批准（头脑风暴分段确认）
分支：`feature/ui-phase3-visual-polish`
方案：方案 1 — Phase 3 构图优先，再扫表单

相关文档：

- `docs/product/ui-visual-phase3-plan.md`（实施切片参考）
- `docs/product/ui-ia-phase1-plan.md` / `ui-interaction-phase2-plan.md`（行为不回归）
- `docs/superpowers/specs/2026-07-11-page-redesign-wizard-design.md`（向导壳）

---

## 1. 背景与意图

用户反馈当前界面整体像半成品：视觉语言在「白底 SaaS」与「羊皮纸文学」之间摇摆，表单偏后台，行程卡与折叠控件仍有功能优先、观感不足的问题。

**产品一句话**：把 AeroTravel 从「控件能用但像拼盘」收成 **暖色羊皮纸旅行工作台**——扫行程有节奏，填表单不后台，主次靠层级而不是堆按钮。

**气质锁定**：羊皮纸文学沙龙（暖奶油底 + 赤陶高信号 + 衬线展示字），不是 Linear 冷白、不是深色科技、不是杂志级超大留白。

**改动深度**：视觉 + 构图（token、时间线、卡片元信息、Step 1/2 表单疏密与层级），不只换皮。

---

## 2. 目标

| 用户感知 | 产品含义 |
|---|---|
| 更像成品 | 全站一种语言：羊皮纸底、象牙卡面、赤陶高信号、衬线标题 |
| 表单不后台 | Step 1/2 分组清晰、城市卡与主 CTA 有产品密度 |
| 行程可扫读 | 时间在时间线节点侧；卡片 = 主体 + 轻量元信息底栏 |
| 控件统一 | 折叠 / 看位置 / 状态条与 ghost·secondary 体系统一 |

**成功标准**

1. 扫一眼能感到暖羊皮纸成品，而非白底控件拼盘。
2. Step 1/2 主次按钮一眼可辨；城市卡不再像 admin 密表。
3. Step 3：时间可纵向扫读；卡片无「徽章墙」；折叠入口无浏览器默认按钮感。
4. Phase 1/2 行为不回归：工作区状态、看位置、地图双向联动、设置 diff / 重生成。
5. `.\scripts\check.ps1` 通过；主路径浏览器无 console 报错。

---

## 3. 非目标

- 不改后端、API 契约、数据结构
- 不引入前端框架、bundler、数据库、登录
- 不重做信息架构或流程（仍为三步向导 + 地图按需抽屉）
- 不做移动端专项大改版、不做客户交付长图视觉大改
- 不换暗色主题 / 设计开关面板
- 不虚构评分、省钱、效率等指标填卡片
- 不锁死双栏地图、不恢复 100vh 三栏闷罐

---

## 4. 设计 Token

### 4.1 色板（纠正混用）

| Token | 目标值 | 说明 |
|---|---|---|
| `--bg` | `#f5f4ed` | 羊皮纸页底；禁止纯白页面背景 |
| `--surface` | `#fffcf5` | 暖象牙卡面（非 `#ffffff`） |
| `--surface-warm` | `#f0ebe3` | 次级条、汇总、hover 底 |
| `--fg` | `#1a1916` | 暖墨正文 |
| `--fg-2` | `#2e2d2a` | 次级强调（保持现状阶，略暖即可） |
| `--muted` | `#6b6862` | 说明文字 |
| `--meta` | `#8a8680` | 更弱元信息 |
| `--border` | `#e5e1d6` | 软暖边 |
| `--border-soft` | 更浅暖边 | 大卡片轻分隔 |
| `--accent` | `#c96442` | 赤陶；仅主 CTA / kicker / 少量高信号 |
| `--accent-on` | `#ffffff` | 赤陶上的字 |

语义色（success / warn / danger）保持可读，色相可略暖但不改语义角色。

### 4.2 字体

| 角色 | 字体 |
|---|---|
| Display | `"Noto Serif SC"`, Songti, Georgia, serif |
| Body | `"Noto Sans SC"`, PingFang, Microsoft YaHei, system-ui |
| Mono | `"JetBrains Mono"`, ui-monospace — **时间节点** |

字号阶梯沿用现有 scale（xs→4xl）。步骤大标题、行程总标题用 display；表单与按钮用 body。

### 4.3 圆角 · 阴影 · 焦点 · 动效

- 圆角：sm 10 / md 14 / lg 18 / pill
- 阴影：暖 ring + 极轻抬升；无玻璃拟态、无装饰光晕 blob
- Focus：`--focus-ring` 双环，外环半透明赤陶
- 选中：列表/时间线用 **墨色** ring 或边线；赤陶不铺满选中态
- 动效：150–200ms，`prefers-reduced-motion` 下瞬时或关闭

### 4.4 规则

1. 页面背景永远 `--bg`，不用纯白。
2. 赤陶只做高信号（主按钮、kicker、少量 badge）。
3. 禁止暴露浏览器默认 button chrome（尤其折叠入口）。
4. 不新增虚构数据字段。

---

## 5. Step 1 / 2 表单构图

**不改**：字段集合、校验规则、步骤解锁、生成 API。

### 5.1 页面头（两步共用）

- Kicker：小号字距 + 赤陶（如 `STEP 01 · 路线`）
- 标题：衬线 display，一句话任务
- 副标题：一行暖灰帮助，max-width ~46ch

### 5.2 Step 1 路线

- 城市卡：象牙 surface + 暖 ring；左侧细轨表顺序
- 卡内：城市名为主；天数 / 段交通为次级行（避免多控件横挤无层次）
- 天数汇总：Warm Sand 条
- 出发日期：独立 field 组，用间距分隔，不套厚盒子
- 拖拽手柄：默认淡、hover 卡时显现（行为保持）

### 5.3 Step 2 偏好

- 节奏 / 交通 / 预算：统一芯片或 select 语言（选中墨边或淡暖底）
- 偏好文本：与上方同一 field 语言
- 生成中：主 CTA 锁定 + loading 文案；错误用 status-note

### 5.4 按钮层级

| 层级 | 样式 | 用途 |
|---|---|---|
| 主 | 赤陶实心 | 下一步、生成 AI 规划 |
| 次 | 象牙 + 暖边 | 添加城市、上一步 |
| 弱 | ghost / 文字 | 删除城市 |

主 CTA 在步骤底；不与顶栏交付按钮抢戏。

---

## 6. Step 3 时间线与行程卡

### 6.1 桌面结构（锁定）

```text
[ 节点 · 时间 mono ]  [ 卡片：类型 / 标题 / 描述 / 看位置 ]
                      [ 底栏 meta：城市 · 时长 · 已有字段 ]
```

- 时间在 `.timeline-marker`，不回到卡片标题堆
- 竖轨：marker 列细线连接
- Active：墨点 + 时间加重 + 卡片墨 ring

实现上可在现有 `renderPlan` 网格骨架上强化视觉与 meta 底栏；若需从 badge 墙改为 compact meta，允许微调 markup class 结构，**保留** `data-item`、`data-open-map-item`、active/conflict。

### 6.2 卡片内容层级

1. 类型 kicker / badge（交通可用淡赤陶变体）
2. 标题：展示感字重
3. 描述：约 3 行 clamp
4. 「看位置」：右上 secondary，仅有坐标时出现
5. Meta 底栏：分隔点/轻文字，替代徽章墙；字段仅用已有 duration / city / rating / transport extra

### 6.3 工作区其它表面

- 标题：衬线总标题 + 赤陶 kicker；metric 卡降噪
- Day tab / 类型筛选：墨色选中 pill
- 折叠（城际交通 / 费用贴士）：象牙 + 暖 ring + chevron；整行 ≥44px；**不改**折叠 JS / ARIA / 强制展开逻辑
- 地图抽屉工具条：token 对齐，交互不动

### 6.4 窄屏

- 时间列可收窄或时间改到卡顶一行，避免溢出
- 本轮不做移动专项动效/手势

### 6.5 行为硬约束（Phase 1/2）

- 点卡片选中；键盘可操作
- 看位置开图并定位；无坐标不显示
- 地图开时列表 ↔ 地图双向联动与 `scrollIntoView`
- 工作区设置 diff：无变更安静返回；有变更确认后整单重生成
- 折叠逻辑与筛选强制展开行为不变

---

## 7. 统一交互状态

| 状态 | 表现 |
|---|---|
| Hover | 表面略暖 / 边略深，无跳动缩放 |
| Focus-visible | 统一暖 focus ring |
| Active / selected | 墨色 ring 或边线 |
| Disabled / loading | 降透明 + 不可点；CTA 文案切换 |
| Empty | 短句 + 轻表面，不大插画 |
| Toast / status-note | 现有容器 + token 色边 |
| Reduced motion | chevron/入场瞬时或关闭 |

---

## 8. 实施顺序

1. **Token 基线** — `static/index.html` `:root`
2. **全局控件** — btn / field / badge / segmented / topbar
3. **Step 1/2 表单** — 头区、城市卡、汇总、CTA
4. **Step 3 时间线** — marker 时间、标题气质、meta 底栏（必要时 `app.js` `renderPlan`）
5. **折叠与次要控件** — fold、card-map、day-map-hint、workspace 状态条
6. **扫尾** — empty/focus、窄屏、去掉纯白与默认 chrome 残留
7. **回归** — `.\scripts\check.ps1` + 浏览器冒烟

### 文件边界

| 允许 | 禁止 |
|---|---|
| `static/index.html`（token / 局部样式） | 后端、API |
| `static/styles.css` | 框架 / bundler |
| `static/app.js`（timeline markup 仅） | 交付长图大改、移动专项 |
| 必要时更新 frontend 测试 DOM 断言 | IA 流程重做 |

---

## 9. 浏览器冒烟清单

1. Step 1 加载 → 加城 / 改天数 → 下一步
2. Step 2 设偏好 → 生成 → 进入 Step 3
3. 扫时间线、点卡片、看位置开地图、关地图
4. 折叠城际交通 / 费用贴士
5. 工作区改设置：无变更安静返回；有变更可走重生成
6. 窄窗：无横向溢出、时间与卡不重叠失控
7. Console 无 error / warning（与本改动相关）

---

## 10. 测试与工程

- 运行 `.\scripts\check.ps1`（compileall、ruff/mypy 若已装、unittest、`node --check`、frontend tests）
- 若 `renderPlan` HTML 结构变化导致 `tests/frontend/*.test.js` 断言失败，更新断言以匹配新 markup，不弱化行为覆盖
- 不手改 artifact JSON；不提交 `.env` / cache

---

## 11. 决策摘要

| 决策 | 结论 |
|---|---|
| 气质 | 羊皮纸文学沙龙 |
| 深度 | 视觉 + 构图（方案 1） |
| 色板 | 暖象牙 surface，非纯白；赤陶 `#c96442` |
| 选中态 | 墨色，非赤陶铺满 |
| 时间线 | 时间在 marker；meta 底栏替代徽章墙 |
| 表单 | 分组与城市卡产品化，不改字段逻辑 |
| 范围外 | API、框架、移动专项、交付长图、暗色主题 |
