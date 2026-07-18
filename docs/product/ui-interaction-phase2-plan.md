# AeroTravel UI Phase 2：交互与效率（C）

> 版本：v1 · 2026-07-15
> 分支：`feature/ui-phase2-interaction-efficiency`
> 状态：**S 代码已落地**（`.\scripts\check.ps1` 通过；待浏览器冒烟）
> 前置：Phase 1 IA（Step 3 工作区、地图按需、设置 diff）已合入 `master`（PR #22）

本 Phase 在 **稳定信息架构** 上做「少点击、编辑更顺、地图与行程双向联动」。
不做全站视觉（A）、移动专项（D）、交付物（E）。

---

## 1. 目标

| 用户目标 | 产品含义 |
|---|---|
| 扫行程时能快速对上地图 | 列表 ↔ 地图 **双向同步**；默认仍不抢阅读 |
| 想看位置时一步到位 | 卡片上 **显式「看位置」**，不靠误触整卡弹图 |
| 地图开着时改天/点选不割裂 | 切天 / 点 marker / stop rail / 列表 **同一 active 状态** |
| 进入编辑少迷路 | Browse/Edit 切换路径清晰；从当前日进入编辑不丢上下文 |

**成功标准（可验收）**

1. 地图关闭：点卡片只高亮/聚焦列表，**不**自动开抽屉。
2. 地图打开：点卡片 → 地图 flyTo + marker/详情同步；点 marker 或 stop chip → 列表高亮且 **滚动到可见**。
3. 卡片有明确「看位置」（有坐标时）；一点开图并定位。
4. 切 Day 时：列表、弱提示、地图（若开）同一天；active 落到该天首个可映射点（若有）。
5. 浏览 → 编辑：保留 `currentDay`；退出编辑回到浏览仍在同一天。
6. `.\scripts\check.ps1` 通过；浏览器冒烟见第 6 节。

---

## 2. 非目标

- 局部智能重算 / 后端 API 变更
- 锁死双栏地图工作台、默认常驻地图
- 自驾编辑器大重构、拖拽跨天自由排程
- 视觉体系重做、移动手势大改、客户长图
- 引入框架 / bundler

---

## 3. 问题诊断（相对当前代码）

| 痛点 | 现状 | Phase 2 方向 |
|---|---|---|
| 列表 → 地图 | 仅地图已开时 `focusItem(..., true)`；关则无显式「看位置」 | 卡片操作条 + 开图定位 |
| 地图 → 列表 | marker/`data-map-item` 会 `focusItem`，但 **不 scrollIntoView** 列表卡 | `focusItem` 内滚动激活卡片 |
| 编辑态 marker | 自驾/草稿节点 marker **可能未绑 click** 与列表同步 | 编辑态同样 click → focus 节点/日 |
| 上下文 | 进编辑可能重置心智到「另一套 UI」 | 保证 day 保留 + 状态文案 |
| 点击成本 | 开图 → 找点 → 对照列表需多次扫视 | stop rail + 列表双向高亮已有，补滚动与显式入口 |

---

## 4. 实施切片（推荐顺序）

### Slice 0 — 纯逻辑 / 可测辅助

文件：`static/js/core/app-utils.js` 或 `static/js/planning/wizard.js`（优先 **app-utils**，与向导无关的 DOM/列表辅助也可放 app 内纯函数测）。

建议纯函数（便于 `tests/frontend`）：

- `pickFocusItemForDay(day, preferredId)` — 切天时选中项：保留同 id，否则首个有坐标，否则首项
- `shouldOpenMapOnCardActivate(mapOpen, explicitMapAction)` — 明确开图策略（防回归）

### Slice 1 — focus 双向联动

`focusItem(itemId, updateMap)` 增强：

1. 设置 `activeItemId` / 必要时 `mapFocusItemId`
2. `renderPlan` 后：`[data-item="id"]` **scrollIntoView**（`block: 'nearest'`，尊重 reduced motion）
3. 地图开且 `updateMap`：flyTo + popup + `syncMarkerFocus` + `renderPlaceDetail`（已有则收敛调用）
4. stop rail / marker click 统一走 `focusItem`

编辑态：`renderMap` 里 draft markers 补 `marker.on('click', ...)`，与 browse 一致（节点 id 与列表/editor 对齐处用现有 draft 结构）。

### Slice 2 — 卡片「看位置」

时间线卡片增加次要操作（不破坏整卡选中）：

- 有坐标：`看位置` → `openMapDrawer(itemId)`
- 无坐标：不显示或 disabled + title「无地图坐标」
- 整卡 click：仍只 `focusItem(id, mapOpen)`，**不**开抽屉

可选：工具栏「看地图」在已有 active 时打开并定位（已基本具备，核对即可）。

### Slice 3 — 切天与地图一致

切 Day tab / 地图内若有日切换时：

- 使用 `pickFocusItemForDay`
- 地图开：`renderMap` + invalidateSize（已有则保留）
- 弱提示 `dayMapHint` 跟随当前日（Phase 1 已有，回归即可）

### Slice 4 — 编辑进出效率（小步）

1. Browse ↔ Edit 切换后 **`currentDay` 不变**（测一下现状，缺则修）。
2. 进入编辑时 status/toast 一句：「正在编辑第 N 天」类轻反馈（不吵）。
3. 若 edit 工具条与日 tabs 脱节：保证 draft day tabs 与 `currentDay` 同步（已有则只补边角）。
4. **不做** 编辑器功能膨胀（不加新约束类型、不大改 wishlist）。

### Slice 5 — 样式 / a11y / 冒烟

- 「看位置」按钮：次要、可触达 44px 高（移动可接受即可，D 不专项）
- `aria-label`：如「在地图查看某某」
- check + 手测清单

---

## 5. 工程约束

- 栈不变；路由契约不变
- 主改：`static/js/app.js`、`static/index.html`（若卡片 DOM）、`static/css/styles.css`、`static/js/core/app-utils.js`（若抽纯函数）、`tests/frontend/*`
- 保持：行程主舞台、地图按需抽屉、POI 转义、`state` + `applyPlan`
- 合入前：`.\scripts\check.ps1`

---

## 6. 浏览器冒烟

1. 生成进 Step 3；点卡片不高亮以外不开图。
2. 点「看位置」→ 抽屉开且定位正确。
3. 地图开着点另一卡片 → 地图与详情切换；列表高亮在视口内。
4. 点 marker / stop chip → 列表滚到对应卡。
5. 切 Day → 列表与（开着的）地图同天。
6. 进编辑 → 仍在当天；退回浏览 → 仍在当天。
7. 关地图后再点卡片 → 仍不自动开图。

---

## 7. 范围选项（请选一）

| 选项 | 包含 | 说明 |
|---|---|---|
| **S（推荐）** | Slice 0–3 + 5；Slice 4 仅「保留 currentDay + 轻反馈」 | 最快体现「联动更顺」 |
| **M** | S + Slice 4 更完整（编辑日 tabs 对齐、编辑态地图全联动打磨） | 稍长 |
| **L** | M + 更多效率项（快捷键、批量操作、预取） | 本轮不建议 |

---

## 8. 确认

确认后按 S/M 实施。

**回复示例：**「按 S 实施」或「按 M，并加上 …」。
