# AeroTravel 动效精修计划（emilkowalski-motion）

## 意图摘要

在 **不改产品信息架构、不引重库** 的前提下，为 `static/index.html` 工作台补「状态确认型」动效，让步骤切换、主内容入场与城市卡插入更清晰、更高级，同时保持羊皮纸/赤陶的克制气质。

- **目标文件**：`static/css/styles.css` + `static/js/app.js`（`static/index.html` 尽量不动）
- **硬约束**：只改前端；优先 `transform` / `opacity`；必须 `prefers-reduced-motion` 兜底
- **审美目标**：冷静、短促、功能向（非 landing 英雄编排）；时长 140–220ms 控件级，步骤切换 ≤280ms
- **范围已锁定（用户确认 2026-07-14）**：
  - **A + B 一起上**（面板切换 + 主内容/compact-summary 入场）
  - **步骤指示器 active 圆点**：适度 scale（约 150ms，`scale(1→1.06)` 量级，非夸张弹跳）
  - **城市列表插入**：本轮 **做**（单卡 enter，无列表 stagger 拖慢）

---

## 现状诊断

| 区域 | 现状 | 问题 |
|------|------|------|
| 按钮 / segmented / city-card | 已有 `transition` + active `translateY` | 够用，不扩 |
| toast / map-drawer | 已有 `is-visible` + translateY | 够用，不扩 |
| progressive-field | 已有 `progressive-in` 160ms + reduced-motion | 可复用模式 |
| **wizard 步骤切换** | `panel.hidden = true/false` 硬切 | 主路径无过场，感觉「跳页」而非产品 |
| **wizard-panel 首次可见** | 无入场 | 主内容块显得静态、不精致 |
| 城市卡拖拽 | `is-dragging` / `is-drag-over` | 保留；**新增插入入场**（用户确认） |
| 城市卡新插入 | 硬插入 DOM | 无反馈，添加城市时略「生硬」 |

**结论（已锁定 3 条线）：**

1. **动效 A** — Wizard 面板切换过场（P0）
2. **动效 B** — 主面板 / compact-summary 轻量入场（P1，与 A 共用语言）
3. **动效 C** — 城市卡插入入场（P1，单卡；拖拽态仍用现有 class）
4. **从属 A** — 步骤指示器 active 圆点适度 scale（不算独立大动效）

明确不做：滚动 reveal 长列表、Lottie/Rive、GSAP、全页/多卡 stagger、装饰循环、重写 drawer/toast。

---

## 选定动效（已锁定）

### 动效 A — Wizard 步骤面板切换（P0）✅ 必做

**触发**：`setWizardStep` / `renderWizardChrome` 切换 `data-step-panel` 可见性时。

**观感**：当前面板淡出并略下沉 → 目标面板自 6–8px 上移淡入。
**目的**：把「步骤切换」做成空间确认，而不是 DOM 闪切。

| 项 | 规格 |
|----|------|
| 属性 | 仅 `opacity` + `transform: translateY()` |
| 时长 | 进入 200–220ms；离开 140–160ms |
| 曲线 | `var(--ease-standard)` = `cubic-bezier(0.2, 0, 0, 1)` |
| 位移 | 进入 `translateY(8px) → 0`；离开 `0 → translateY(4px)`（离开更克制） |
| 实现偏好 | CSS class 驱动 + 极短 JS 时序；**避免**动画 `height` / 布局 |

**实现草图（Design 阶段）：**

1. `.wizard-panel` 增加基态：`opacity` / `transform` transition（或独立 motion class）。
2. 切换时：
   - outgoing：加 `is-exiting` → 动画结束再 `hidden`
   - incoming：去掉 `hidden`，加 `is-entering` → rAF 后加 `is-visible` / 去掉 entering
3. 若 `prefers-reduced-motion: reduce`：跳过时序，直接 `hidden` 切换（与现逻辑一致）。
4. 连点保护：`panelMotionToken` 递增，过期回调丢弃。

**触点代码：** `static/js/app.js` → `renderWizardChrome` / `setWizardStep`；`static/css/styles.css` → panel motion classes。

---

### 动效 A′ — 步骤指示器 active 圆点（从属 A）✅ 适度

**触发**：`.wizard-step` 获得 / 失去 `is-active`。

| 项 | 规格 |
|----|------|
| 目标 | `.wizard-step-index`（或 active 态圆点） |
| 属性 | `transform: scale()` + 可选 `box-shadow` ring 过渡 |
| 时长 | **150ms** |
| 幅度 | **适度**：`scale(1) → scale(1.06)` 量级；禁止 spring 弹跳 / 超 1.12 |
| 颜色 | 仅用现有 active 色（可含 terracotta），**不加第二 accent** |
| reduce | `transform: none`，仅保留静态 active 样式 |

---

### 动效 B — 主内容块入场（P1）✅ 与 A 一起上

**触发**：

- 步骤面板进入可见时（与 A 的 incoming 可合并为同一 enter class）；
- 移动端 `#wizardCompactSummary` 从 `hidden` → 显示时。

**观感**：单块 `opacity 0→1` + `translateY(6px→0)`，**无子元素 stagger**。

| 项 | 规格 |
|----|------|
| 时长 | 180–200ms |
| 属性 | `opacity` + `transform` only |
| 范围 | 面板壳层 / compact-summary 壳层各 1 次，不动画内部每一行 |

**与 A 的关系**：同一套 token（duration / ease / y-offset），避免两套 motion 语言。compact-summary 显示时加 `is-entering` → 结束后清理。

---

### 动效 C — 城市卡插入入场（P1）✅ 本轮做

**触发**：用户添加城市后，`renderCities`（或等价路径）把新卡插入列表时。

**观感**：仅**新插入的那一张** `opacity 0→1` + `translateY(6px→0)`；已有卡不动。
**不做**：整表 re-render 全员 stagger、拖拽过程额外动画（`is-dragging` / `is-drag-over` 保持现状）。

| 项 | 规格 |
|----|------|
| 属性 | 仅 `opacity` + `transform` |
| 时长 | 160–180ms |
| 标记 | 新卡加 `is-city-enter`（或 `data-just-added`），动画结束 `transitionend` / timeout 移除 |
| 实现注意 | 若整表 `innerHTML` 重建，需用「上一帧 city id 集合 diff」识别新增项，只给新增卡打 enter class |
| reduce | 无位移动画，卡直接出现 |

**触点代码：**

- `static/js/app.js` → `renderCities` / 添加城市 handler
- `static/css/styles.css` → `.city-card.is-city-enter`（类名以现有 city 根类为准）
- `static/js/planning/editor.js` 若生成 city 卡片 HTML，只加 class 钩子、不改交互逻辑

---

## 技术约束

### 允许

- CSS `@keyframes` 或 transition + class
- 小段原生 JS（`requestAnimationFrame`、`transitionend`、一次性 timeout ≤300ms）
- 复用已有 `--motion-fast` / `--motion-base` / `--ease-standard`

### 禁止

- 新 CDN 动画库（GSAP / Motion / Lottie / Rive）
- 动画 `width` / `height` / `top` / `left` / grid 轨道
- >500ms 的非跨页动画
- 无 `prefers-reduced-motion` 的 transform 动效
- 改后端、改 trip-share 独立页、改 map 逻辑

### reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  .wizard-panel.is-entering,
  .wizard-panel.is-exiting,
  .wizard-compact-summary.is-entering,
  .city-card.is-city-enter,
  .wizard-step-index {
    animation: none !important;
    transition: none !important;
    opacity: 1;
    transform: none;
  }
}
```

JS：`matchMedia('(prefers-reduced-motion: reduce)').matches` 时走即时切换 / 即时插入分支。

---

## 文件改动范围（Design 阶段）

| 文件 | 改动 |
|------|------|
| `static/css/styles.css` | panel / compact-summary / step-index / city-enter + reduced-motion |
| `static/js/app.js` | `renderWizardChrome` 切换时序；compact-summary enter；`renderCities` 新增卡 enter + token 防抖 |
| `static/index.html` | 尽量 0 |
| `static/js/planning/editor.js` | 仅当 city 卡 HTML 在此生成时加 enter class 钩子 |
| `tests/frontend/*` | wizard 切步 + reduce 仍可用；可选：添加城市后卡存在 |

**不在范围：** `trip-share.*`、`delivery.*`、后端、token 体系大改、拖拽算法重写。

---

## 接受标准

- [ ] Step 1→2→3 切换有可感知但非拖沓的淡入/位移（约 200ms）
- [ ] compact-summary 显示时有一次轻入场（移动端）
- [ ] 添加城市时**仅新卡**轻入场，已有卡不闪
- [ ] active 步骤圆点 150ms 适度 scale（约 1.06），无弹跳感
- [ ] 快速连点步骤不产生叠动画鬼影（`panelMotionToken`）
- [ ] `prefers-reduced-motion: reduce` 下无位移动画，功能完整
- [ ] 仅 `transform`/`opacity`，无 layout thrash
- [ ] terracotta 不因动效增加第二 accent
- [ ] 桌面 + ≤900px 移动端各测：切步、加城市、拖拽仍可用
- [ ] 不回归：map drawer、toast、edit mode 显隐

---

## 实现顺序（Design 模式执行清单）

1. `styles.css`：统一 motion token 类 — panel enter/exit、compact-summary enter、step-index scale、city-enter + reduced-motion 块
2. `app.js`：`swapWizardPanel` / 改 `renderWizardChrome`（token 防连点；reduce 即时）
3. `app.js`：compact-summary `hidden`→显示时 enter class
4. `app.js`：`renderCities` diff 新增 city → 只给新卡 `is-city-enter`，结束后清理
5. 步骤指示器：确认现有 active 样式上叠 150ms scale（适度 1.06）
6. 手动走查 + 更新 `critique.json` 的 `motion` 轴目标 ≥4.5

---

## 决策记录（已关闭）

| 问题 | 决定 | 日期 |
|------|------|------|
| A only vs A+B | **A+B 一起上** | 2026-07-14 |
| 步骤指示器 scale | **适度**（150ms，~1.06） | 2026-07-14 |
| 城市列表插入动效 | **做**（单卡 enter，无全表 stagger） | 2026-07-14 |

无未决开放问题。若 Design 落地时 city 卡根选择器名与文档不一致，以 `static` 现有 class 为准，不改交互语义。

---

## Next step

1. 计划已按你的三项选择锁定；可再扫一眼本文件。
2. 切换到 **Design 模式**，严格按「实现顺序」改 `static/*`，**不要**全站动效扫荡。
3. 完成定义：A 切步 + B 入场 + C 新城市卡 + A′ 步骤圆点；reduce 用户零位移干扰。
