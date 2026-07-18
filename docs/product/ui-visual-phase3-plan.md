# AeroTravel UI Phase 3：视觉体系（A）

> 版本：v1 · 2026-07-15
> 分支：`feature/ui-phase3-visual-polish`
> 状态：**已实现**（`feature/ui-phase3-visual-polish`）
> 前置：Phase 1 IA（PR #22）+ Phase 2 交互联动（PR #23）已合入
> 权威设计：`docs/superpowers/specs/2026-07-15-ui-visual-polish-design.md`（羊皮纸象牙面 + 赤陶高信号；若本文旧表述与设计冲突，以设计为准）

本 Phase 在 **已稳定的 IA 与交互** 上做视觉收敛：羊皮纸 / 赤陶体系、时间线构图、折叠控件、次要控件与主系统对齐。
**不**重做流程，**不**改 API，**不**做移动专项（D）与交付长图（E）。

与 `docs/product/ui-interaction-redesign-plan.md`（v3）的关系：

- v3 的视觉方向（Claude / Anthropic 羊皮纸、赤陶、文学沙龙感）**继承**。
- v3「只改 index.html」约束 **作废**（当前实现已跨 `styles.css` / `app.js`；本 Phase 允许必要的 markup + CSS + 极少量 JS 适配）。
- v3 中与 Phase 1/2 冲突的「结果页交互大改」**不在本 Phase 重做**；只取视觉切片。

---

## 1. 目标

| 用户感知 | 产品含义 |
|---|---|
| 更像成品，而不是控件拼盘 | token 一致、折叠/按钮/卡片同一语言 |
| 扫行程更快 | 时间在时间线节点侧独立可读；元信息收束 |
| 主次清楚 | 行程主舞台仍第一；赤陶只做高信号，不铺满 |

**成功标准**

1. 折叠入口（城际交通 / 费用贴士）无浏览器默认按钮感，hover/focus/expanded 完整。
2. 时间线：时间在节点旁/下可读，不挤在卡片标题堆里。
3. 行程卡：主体 + 轻量元信息区（只用现有字段），无明显「大片空右下」感。
4. Phase 1/2 行为不回归：工作区状态条、看位置、地图联动、设置 diff。
5. `.\scripts\check.ps1` 通过；浏览器冒烟见第 6 节。

---

## 2. 非目标

- 换品牌色盘 / 暗色主题 / 设计开关面板
- 移动端大改版（D）、交付物视觉（E）
- 后端 / 数据结构 / 虚构指标（评分提升、省钱等）
- 锁死双栏地图、恢复 100vh 三栏
- 动效大升级（仅允许 150–220ms 级、且尊重 reduced-motion）

---

## 3. 现状（已具备）

- `index.html` 已定义羊皮纸 token：`--bg #f5f4ed`、`--accent #c96442`、display/serif 字体等。
- `styles.css` 已有 topbar、wizard、timeline 基础样式。
- 交互：`看位置`、workspace 状态条、day map hint 已存在，但部分控件（fold、card-map、时间布局）仍偏「功能先上」。

---

## 4. 实施切片（推荐顺序）

### Slice 0 — 视觉基线核对（文档 + 冒烟对照）

- 记录 token 表（可写在本文件附录）。
- 确认主按钮、ghost、badge 已用 token；列出例外。

### Slice 1 — 折叠入口视觉（高 ROI）

目标：`.fold-section` / `.fold-trigger` / transport & insights。

- Ivory / Warm Sand 表面 + 暖 ring 边，不用默认 button chrome。
- 整行可点 ≥44px；chevron 随 `aria-expanded` 旋转（reduced-motion 时瞬时）。
- 展开内容区间距与卡片一致。
- **不改** 折叠 JS 逻辑与筛选强制展开行为。

### Slice 2 — 时间线构图（核心）

桌面结构：

```text
[ 节点 · 时间 ]  [ 卡片主体：类型/标题/描述/看位置 ]  [ 元信息轨：城市·时长·… ]
```

实现要点：

- 时间移出 `.itinerary-card` 主标题区，落到 timeline rail 侧（markup 可在 `app.js` 的 `renderPlan` 调整）。
- 元信息从 badge 堆改为右侧/底部 compact meta（桌面靠右，窄屏回单列标签行）。
- 保留：`data-item` 点击、`data-open-map-item`、active/conflict、地图联动。
- 无坐标则不显示「看位置」（已有）。

### Slice 3 — 次要控件与工作区对齐

- `.card-map-btn`、`.day-map-hint-btn`、workspace 状态条按钮：字重/边/hover 与 ghost/secondary 体系统一。
- Step 3 pane-kicker「我的行程」、metric cards：与 surface 层级一致，避免抢标题。
- 地图抽屉工具条：仅做 token 对齐，不改交互。

### Slice 4 — 空状态 / 选中 / focus 扫尾

- empty-state、toast、active card ring 统一 focus ring（`--focus-ring` 若已有则复用）。
- 不新增大面积装饰插画。

### Slice 5 — 回归

- `node --check` / frontend tests / `.\scripts\check.ps1`
- 浏览器：Step1→生成→Step3 阅读、折叠、看位置、编辑模式外观可接受。

---

## 5. 工程约束

| 允许 | 禁止 |
|---|---|
| `static/css/styles.css`、`static/index.html`（token/内联样式）、`static/js/app.js`（timeline markup） | 后端、API、框架 |
| 极少量 class 调整 | 破坏 Phase 1/2 选择器/行为 |
| 测试若涉及 DOM 字符串断言则更新 | 虚构数据字段 |

---

## 6. 浏览器冒烟

1. Step 1/2 表单观感正常，主按钮赤陶。
2. Step 3：时间线可扫读；折叠入口非默认按钮。
3. 卡片 active / 看位置 / 地图开闭行为与 Phase 2 一致。
4. 工作区状态条、摘要展开仍可用。
5. 窄屏：卡片不横向溢出；时间/元信息不重叠（不做 D 级抛光）。

---

## 7. 范围选项

| 选项 | 包含 | 说明 |
|---|---|---|
| **S（推荐）** | Slice 1 + 2 + 5；Slice 3 只做 card-map / fold 相关对齐 | 视觉收益最大、可控 |
| **M** | S + Slice 3 全量 + Slice 4 | 更完整 |
| **L** | M + Step1/2 面板大改 + 新插画/动效 | 本轮不建议 |

---

## 8. 确认

确认后按所选范围实施。

**回复示例：**「按 S 实施」或「按 M，时间线先不做」。
