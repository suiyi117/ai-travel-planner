# AeroTravel 分步向导页面重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用「左侧摘要轨 + 三步向导 + 主区可滚动 + 地图按需抽屉」替换当前 `100vh` 三栏闷罐布局，在不改 API/持久化/无构建栈的前提下改善桌面优先体验。

**Architecture:** 纯函数步骤机放在 `static/wizard.js`（可 Node 单测）；`state` 增加 `wizardStep` / `mapDrawerOpen` / `mapFocusItemId`；`index.html` 重排为顶栏 + 左轨 + 三步主区 + 抽屉；`app.js` 负责接线、生成后跳步、抽屉与 Leaflet `invalidateSize`；后端零改动。

**Tech Stack:** vanilla HTML/CSS/JS、Leaflet、Node `node:test`、PowerShell `scripts/check.ps1`、FastAPI（不改）。

**Spec:** `docs/superpowers/specs/2026-07-11-page-redesign-wizard-design.md`

---

## 执行前提

- 每个任务从失败测试或可验证中间态开始；只提交该任务列出的文件。
- 不引入 React/Vue、打包器、数据库、登录。
- 不改 `/api/*` 契约与 `aerotravel:trips` schema。
- 保留：`applyPlan()` 水合路径、boot fallback、`fetchJson` 端口回退、per-city days、POI `escapeHtml`、导出能力。
- 与 `2026-07-10-editable-itinerary-self-drive` 计划并行存在时：本计划只改页面壳；地图改为抽屉后，未来编辑模式在主区展开。

## 文件结构

### 新建

| 文件 | 职责 |
|------|------|
| `static/wizard.js` | 步骤解锁、Step1 校验、摘要派生、下一步目标（纯函数，挂 `window.AeroTravelWizard`） |
| `tests/frontend/wizard.test.js` | Node 单测，无 DOM |

### 修改

| 文件 | 范围 |
|------|------|
| `static/state.js` | `createInitialState` 增加 UI 字段 |
| `static/index.html` | DOM：摘要轨、三步面板、地图抽屉；去掉 workspace tabs / mobile-nav；脚本引入 `wizard.js`；移除顶栏「生成规划」 |
| `static/styles.css` | 解锁滚动；rail + main；step 显隐；drawer；窄屏步骤条；废弃三栏 workspace 规则 |
| `static/app.js` | 步骤切换、校验、生成跳转、摘要渲染、抽屉、事件；替换 `switchMobileView` |
| `static/map.js` | 可选：导出 `invalidateMap(map)` 小工具（若不想动 map.js，可在 app.js 内联） |
| `scripts/check.ps1` | `node --test tests/frontend/*.test.js`（若目录存在） |
| `docs/smoke-checklist.md` | 向导与地图抽屉验收项 |
| `IMPLEMENTATION.md` | 一行记录本改造（若文件存在且项目惯例要求） |

### 不修改

- `server.py`、`routers/*`、`planner/*`、`services/*`、`schemas/*`
- `static/api.js`、`static/storage.js`、`static/export-ics.js`（除非选择器因 DOM 移动需微调 id——保持 id 稳定则不改）

---

## Task 1: 向导纯函数与单测

**Files:**
- Create: `static/wizard.js`
- Create: `tests/frontend/wizard.test.js`
- Modify: `scripts/check.ps1`（在 JS syntax check 之后增加 frontend tests）

- [ ] **Step 1: 写失败测试**

```javascript
// tests/frontend/wizard.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../../static/wizard.js');

const W = window.AeroTravelWizard;

test('validateStep1 rejects empty cities', () => {
  const result = W.validateStep1({ cities: [] });
  assert.equal(result.ok, false);
  assert.match(result.message, /城市/);
});

test('validateStep1 accepts one city with days 1-7', () => {
  const result = W.validateStep1({
    cities: [{ name: '北京', days: 2, transport: 'auto' }]
  });
  assert.equal(result.ok, true);
});

test('validateStep1 rejects days out of range', () => {
  const result = W.validateStep1({
    cities: [{ name: '北京', days: 0, transport: 'auto' }]
  });
  assert.equal(result.ok, false);
});

test('canEnterStep: step1 always', () => {
  assert.equal(W.canEnterStep(1, { step1Done: false, hasPlan: false }), true);
});

test('canEnterStep: step2 only after step1Done', () => {
  assert.equal(W.canEnterStep(2, { step1Done: false, hasPlan: false }), false);
  assert.equal(W.canEnterStep(2, { step1Done: true, hasPlan: false }), true);
});

test('canEnterStep: step3 only when hasPlan', () => {
  assert.equal(W.canEnterStep(3, { step1Done: true, hasPlan: false }), false);
  assert.equal(W.canEnterStep(3, { step1Done: true, hasPlan: true }), true);
});

test('buildSummary lines from state', () => {
  const summary = W.buildSummary({
    cities: [
      { name: '北京', days: 2, transport: 'auto' },
      { name: '西安', days: 1, transport: 'train' }
    ],
    pace: '适中均衡',
    budget: '舒适型',
    globalTransport: 'auto'
  });
  assert.equal(summary.route, '北京 → 西安');
  assert.equal(summary.totalDays, 3);
  assert.match(summary.meta, /舒适型/);
});
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
node --test tests/frontend/wizard.test.js
```

Expected: FAIL（找不到模块或 `AeroTravelWizard` 未定义）

- [ ] **Step 3: 实现 `static/wizard.js`**

```javascript
(function (global) {
  'use strict';

  function validateStep1(input) {
    const cities = Array.isArray(input?.cities) ? input.cities : [];
    if (!cities.length) {
      return { ok: false, message: '请至少添加一个目的地城市。' };
    }
    for (const city of cities) {
      const name = String(city?.name || '').trim();
      const days = Number(city?.days);
      if (!name) {
        return { ok: false, message: '城市名称不能为空。' };
      }
      if (!Number.isFinite(days) || days < 1 || days > 7) {
        return { ok: false, message: `「${name}」的停留天数需在 1–7 天之间。` };
      }
    }
    return { ok: true, message: '' };
  }

  function canEnterStep(step, flags) {
    const n = Number(step);
    if (n === 1) return true;
    if (n === 2) return Boolean(flags?.step1Done);
    if (n === 3) return Boolean(flags?.hasPlan);
    return false;
  }

  function buildSummary(stateLike) {
    const cities = Array.isArray(stateLike?.cities) ? stateLike.cities : [];
    const names = cities.map(c => String(c?.name || '').trim()).filter(Boolean);
    const totalDays = cities.reduce((sum, c) => sum + (Number(c?.days) || 0), 0);
    const budget = String(stateLike?.budget || '').trim();
    const pace = String(stateLike?.pace || '').trim();
    const transport = String(stateLike?.globalTransport || 'auto');
    const transportLabel = transport === 'train' ? '高铁'
      : transport === 'plane' ? '飞机'
      : transport === 'driving' ? '自驾'
      : '智能交通';
    const metaParts = [
      totalDays ? `${totalDays} 天` : '',
      budget,
      pace,
      transportLabel
    ].filter(Boolean);
    return {
      route: names.length ? names.join(' → ') : '未设置路线',
      totalDays,
      meta: metaParts.join(' · ')
    };
  }

  global.AeroTravelWizard = Object.freeze({
    validateStep1,
    canEnterStep,
    buildSummary
  });
})(typeof window !== 'undefined' ? window : global);
```

- [ ] **Step 4: 再跑测试**

```powershell
node --test tests/frontend/wizard.test.js
```

Expected: 全部 PASS

- [ ] **Step 5: 更新 `scripts/check.ps1`**

在现有 `node --check static/*.js` 块之后增加：

```powershell
if (Get-Command node -ErrorAction SilentlyContinue) {
    $frontendTests = Get-ChildItem -Path (Join-Path $PSScriptRoot "..\tests\frontend") -Filter *.test.js -ErrorAction SilentlyContinue
    if ($frontendTests) {
        Write-Host ""
        Write-Host "== Frontend unit tests =="
        Invoke-Checked node --test ($frontendTests | ForEach-Object { $_.FullName })
    }
}
```

注意：`$PSScriptRoot` 在 `scripts/` 下时，测试目录为 `Join-Path $PSScriptRoot "..\tests\frontend"`。若仓库 `check.ps1` 已从 repo root 运行且无 `$PSScriptRoot` 依赖，改为：

```powershell
$frontendTests = Get-ChildItem tests/frontend -Filter *.test.js -ErrorAction SilentlyContinue
if ($frontendTests) {
    Write-Host ""
    Write-Host "== Frontend unit tests =="
    Invoke-Checked node --test @($frontendTests.FullName)
}
```

- [ ] **Step 6: Commit**

```powershell
git add static/wizard.js tests/frontend/wizard.test.js scripts/check.ps1
git commit -m "feat: add wizard step helpers and frontend unit tests"
```

---

## Task 2: state 字段 + 脚本加载顺序

**Files:**
- Modify: `static/state.js`
- Modify: `static/index.html`（仅 script 标签，DOM 大改在 Task 3）

- [ ] **Step 1: 扩展 `createInitialState`**

在 `static/state.js` 的返回对象中增加：

```javascript
wizardStep: 1,
step1Done: false,
mapDrawerOpen: false,
mapFocusItemId: null,
```

说明：
- `wizardStep`: `1 | 2 | 3`
- `step1Done`: 用户成功点过「下一步：偏好」后为 `true`（恢复快照时也可置 true）
- `mapDrawerOpen` / `mapFocusItemId`: 抽屉状态

- [ ] **Step 2: 在 `index.html` 中于 `app-utils.js` 之后、`state.js` 之后加载 `wizard.js`**

```html
<script src="app-utils.js?v=productization-20260709"></script>
<script src="wizard.js?v=page-redesign-20260711"></script>
<script src="state.js?v=page-redesign-20260711"></script>
```

（其余脚本 cache-bust 版本可一并改为 `page-redesign-20260711`，避免旧缓存。）

- [ ] **Step 3: syntax check**

```powershell
node --check static/wizard.js
node --check static/state.js
node --test tests/frontend/wizard.test.js
```

Expected: PASS

- [ ] **Step 4: Commit**

```powershell
git add static/state.js static/index.html
git commit -m "feat: add wizard UI fields to frontend state"
```

---

## Task 3: HTML 结构骨架（静态可切换）

**Files:**
- Modify: `static/index.html`

- [ ] **Step 1: 重排 `main` 为 wizard shell**

目标 DOM 骨架（保留现有控件 **id**，避免 JS 大面积失联）：

```html
<body data-wizard-step="1">
  <div class="app">
    <header class="topbar">...</header>
    <!-- 顶栏：保留 brand、routeMeta、savedTrips、copy、exportLongImage、exportIcs、mobileMore -->
    <!-- 移除 id="generateBtnTop" 按钮 -->

    <div class="wizard-shell">
      <aside class="wizard-rail" id="wizardRail" aria-label="行程向导">
        <nav class="wizard-steps" id="wizardSteps">
          <button type="button" class="wizard-step is-active" data-step="1">
            <span class="wizard-step-index">1</span>
            <span class="wizard-step-text">
              <strong>路线</strong>
              <small>城市 · 天数 · 日期</small>
            </span>
          </button>
          <button type="button" class="wizard-step" data-step="2">
            <span class="wizard-step-index">2</span>
            <span class="wizard-step-text">
              <strong>偏好</strong>
              <small>节奏 · 交通 · 预算</small>
            </span>
          </button>
          <button type="button" class="wizard-step" data-step="3">
            <span class="wizard-step-index">3</span>
            <span class="wizard-step-text">
              <strong>行程</strong>
              <small>日程 · 交通 · 贴士</small>
            </span>
          </button>
        </nav>
        <div class="wizard-summary" id="wizardSummary">
          <div class="wizard-summary-label">当前摘要</div>
          <div class="wizard-summary-route" id="wizardSummaryRoute">北京 → 西安</div>
          <div class="wizard-summary-meta" id="wizardSummaryMeta">3 天 · 舒适型</div>
        </div>
      </aside>

      <div class="wizard-main" id="wizardMain">
        <!-- 窄屏水平步骤条可与 rail 共用 #wizardSteps，CSS 负责形态；或复制一份 #wizardStepsMobile -->
        <div class="wizard-mobile-bar" id="wizardMobileBar" hidden>
          <!-- 实现时：JS 同步 active；或 CSS 把 rail 变成顶栏 -->
        </div>
        <p class="wizard-compact-summary" id="wizardCompactSummary"></p>

        <section class="wizard-panel" data-step-panel="1" id="stepRoute">
          <!-- 原 planner 中：cityInput、addCityBtn、cityList、departureDate、daysRange/daysValue -->
          <!-- 段级交通仍在 cityList 卡片内 -->
          <div class="wizard-panel-actions">
            <button class="btn btn-primary" id="wizardNextBtn" type="button">下一步：偏好 →</button>
          </div>
          <div class="status-note" id="stepRouteNote" hidden></div>
        </section>

        <section class="wizard-panel" data-step-panel="2" id="stepPrefs" hidden>
          <!-- paceGroup、transportGroup、budgetGroup、interestsInput -->
          <!-- generateBtn 主 CTA -->
          <div class="wizard-panel-actions">
            <button class="btn btn-ghost" id="wizardBackBtn" type="button">← 上一步</button>
            <button class="btn btn-primary" id="generateBtn" type="button">生成 AI 旅行规划</button>
          </div>
          <div class="status-note" id="statusNote">...</div>
        </section>

        <section class="wizard-panel" data-step-panel="3" id="stepResults" hidden>
          <!-- 原 results-pane 全部：planTitle、planSummary、metrics、quality、dayTabs、filterTabs、timeline、transport、budget、tips -->
          <div class="wizard-panel-toolbar">
            <button class="btn btn-ghost" id="openMapDrawerBtn" type="button">看地图</button>
            <button class="btn btn-ghost" id="refreshTransportBtn" type="button">刷新班次</button>
            <button class="btn btn-primary" id="regenerateBtn" type="button">重新生成</button>
          </div>
          ...
          <div class="wizard-panel-actions">
            <button class="btn btn-ghost" id="wizardEditPrefsBtn" type="button">← 修改偏好并重生成</button>
          </div>
        </section>
      </div>
    </div>

    <!-- 地图抽屉：从原 map-pane 搬迁 -->
    <div class="map-drawer" id="mapDrawer" hidden aria-hidden="true">
      <div class="map-drawer-backdrop" id="mapDrawerBackdrop"></div>
      <div class="map-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="mapTitle">
        <div class="map-toolbar">
          <div>
            <div class="pane-kicker">地图</div>
            <strong id="mapTitle">Day 1 · 北京</strong>
          </div>
          <div class="map-drawer-actions">
            <button class="btn btn-ghost" id="fitMapBtn" type="button">适配路线</button>
            <button class="btn btn-ghost" id="closeMapDrawerBtn" type="button" aria-label="关闭地图">关闭</button>
          </div>
        </div>
        <div class="map-shell">
          <div id="map"></div>
          <div class="map-empty" id="mapEmpty">...</div>
        </div>
        <aside class="place-detail" id="placeDetail">...</aside>
      </div>
    </div>
  </div>
  <!-- 删除 .mobile-nav 与 .workspace-tabs -->
</body>
```

关键约束：
- **保留** 所有现有 `getElementById` 用到的 id（见 `app.js` 顶部 `el = {...}`）。
- 删除 `generateBtnTop` 后，Task 4 同步改 `app.js` 的 `el.generateBtnTop` 与 `setLoading`。
- 删除 `data-mobile-view` 依赖前，Task 4 用 `data-wizard-step` 替代。

- [ ] **Step 2: 浏览器静态打开检查**

```powershell
python server.py
# 打开 http://localhost:8000
```

Expected: 页面能加载；控件 id 在 DOM 中；可能 JS 报错（旧选择器）——Task 4 修复。若 Task 3 单独提交，可临时保留空 `div` 占位旧 class 以减少破损，但优先一次切干净并紧跟 Task 4。

- [ ] **Step 3: Commit**

```powershell
git add static/index.html
git commit -m "feat: restructure page DOM into wizard shell and map drawer"
```

---

## Task 4: CSS — 解锁滚动 + 摘要轨 + 步骤 + 抽屉

**Files:**
- Modify: `static/styles.css`

- [ ] **Step 1: 替换 shell 规则**

删除/覆盖这些闷罐规则：

```css
/* REMOVE or replace */
body { height: 100vh; overflow: hidden; }
.workspace { height: calc(100vh - 84px); overflow: hidden; }
```

替换为：

```css
body {
  margin: 0;
  min-height: 100vh;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-body);
  font-size: var(--text-base);
  line-height: var(--leading-body);
}

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.wizard-shell {
  flex: 1;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: var(--space-5);
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-5) var(--space-6) var(--space-12);
  align-items: start;
}

.wizard-rail {
  position: sticky;
  top: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--elev-ring);
}

.wizard-step {
  display: flex;
  gap: var(--space-3);
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--muted);
  padding: var(--space-2);
  border-radius: var(--radius-md);
}

.wizard-step.is-active {
  color: var(--accent);
  background: color-mix(in oklab, var(--accent), transparent 92%);
}

.wizard-step.is-locked {
  opacity: 0.45;
  cursor: not-allowed;
}

.wizard-step-index {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-weight: 700;
  border: 1.5px solid var(--border-soft);
  flex-shrink: 0;
}

.wizard-step.is-active .wizard-step-index {
  background: var(--accent);
  color: var(--accent-on);
  border-color: var(--accent);
}

.wizard-summary-label {
  font-size: var(--text-xs);
  color: var(--meta);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: var(--space-2);
}

.wizard-summary-route {
  font-weight: 700;
  color: var(--fg);
  margin-bottom: var(--space-1);
}

.wizard-summary-meta {
  font-size: var(--text-sm);
  color: var(--muted);
  line-height: 1.5;
}

.wizard-main {
  min-width: 0;
  max-width: 720px;
}

.wizard-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: var(--elev-ring);
}

.wizard-panel[hidden] {
  display: none !important;
}

.wizard-panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: var(--space-6);
  flex-wrap: wrap;
}

.wizard-panel-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

/* Map drawer */
.map-drawer[hidden] {
  display: none !important;
}

.map-drawer:not([hidden]) {
  position: fixed;
  inset: 0;
  z-index: 80;
}

.map-drawer-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(20, 20, 19, 0.28);
}

.map-drawer-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(48vw, 560px);
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: var(--elev-raised);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  padding: var(--space-4);
  gap: var(--space-3);
}

.map-drawer-panel #map {
  min-height: 280px;
  height: 100%;
  border-radius: var(--radius-md);
}

.wizard-compact-summary {
  display: none;
  font-size: var(--text-sm);
  color: var(--muted);
  margin: 0 0 var(--space-3);
}

@media (max-width: 900px) {
  .wizard-shell {
    grid-template-columns: 1fr;
    padding: var(--space-4);
  }

  .wizard-rail {
    position: static;
    padding: var(--space-3);
  }

  .wizard-steps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
  }

  .wizard-step-text small {
    display: none;
  }

  .wizard-summary {
    display: none;
  }

  .wizard-compact-summary {
    display: block;
  }

  .wizard-main {
    max-width: none;
  }

  .map-drawer-panel {
    width: 100%;
  }

  .topbar-actions .btn-ghost:not(.mobile-more-btn) {
    display: none;
  }

  .mobile-more {
    display: block;
  }
}
```

同时：
- 删除或停用 `.workspace`、`.workspace-tabs`、`.mobile-nav`、三栏 pane 的 `height:100%` 规则（可留注释 `/* legacy workbench removed */`）。
- 保留组件样式：`.city-list`、`.timeline`、`.segmented`、`.metric-card` 等。
- brief-collapse（`syncPaneBriefState`）依赖 `.pane-body` 内滚——向导主区改为页面滚后，**可停用 brief collapse**（在 app.js 去掉 scroll 监听即可，Task 5）。

- [ ] **Step 2: 视觉检查**

打开页面确认：左轨 + 主卡片、可滚动、无横向溢出。

- [ ] **Step 3: Commit**

```powershell
git add static/styles.css
git commit -m "feat: restyle app shell for scrollable wizard layout"
```

---

## Task 5: app.js 步骤状态机与摘要

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: 扩展 `el` 映射**

```javascript
wizardSteps: document.getElementById('wizardSteps'),
wizardSummaryRoute: document.getElementById('wizardSummaryRoute'),
wizardSummaryMeta: document.getElementById('wizardSummaryMeta'),
wizardCompactSummary: document.getElementById('wizardCompactSummary'),
wizardNextBtn: document.getElementById('wizardNextBtn'),
wizardBackBtn: document.getElementById('wizardBackBtn'),
wizardEditPrefsBtn: document.getElementById('wizardEditPrefsBtn'),
stepRouteNote: document.getElementById('stepRouteNote'),
openMapDrawerBtn: document.getElementById('openMapDrawerBtn'),
closeMapDrawerBtn: document.getElementById('closeMapDrawerBtn'),
mapDrawer: document.getElementById('mapDrawer'),
mapDrawerBackdrop: document.getElementById('mapDrawerBackdrop'),
regenerateBtn: document.getElementById('regenerateBtn'),
// 删除 generateBtnTop、workspaceTabs、plannerBody/resultsBody 若 DOM 已无
```

- [ ] **Step 2: 实现步骤 UI API**

```javascript
const Wizard = window.AeroTravelWizard;

function wizardFlags() {
  return {
    step1Done: Boolean(state.step1Done),
    hasPlan: Boolean(state.itinerary && (state.itinerary.days || []).length)
  };
}

function renderWizardChrome() {
  const flags = wizardFlags();
  document.body.dataset.wizardStep = String(state.wizardStep);

  document.querySelectorAll('[data-step-panel]').forEach(panel => {
    const step = Number(panel.getAttribute('data-step-panel'));
    panel.hidden = step !== state.wizardStep;
  });

  document.querySelectorAll('.wizard-step').forEach(btn => {
    const step = Number(btn.dataset.step);
    const allowed = Wizard.canEnterStep(step, flags);
    btn.classList.toggle('is-active', step === state.wizardStep);
    btn.classList.toggle('is-locked', !allowed);
    btn.disabled = !allowed;
  });

  const summary = Wizard.buildSummary(state);
  if (el.wizardSummaryRoute) el.wizardSummaryRoute.textContent = summary.route;
  if (el.wizardSummaryMeta) el.wizardSummaryMeta.textContent = summary.meta;
  if (el.wizardCompactSummary) {
    el.wizardCompactSummary.textContent = `${summary.route} · ${summary.meta}`;
  }
  updateHeaderMeta();
}

function setWizardStep(step) {
  const target = Number(step);
  if (!Wizard.canEnterStep(target, wizardFlags())) {
    showToast('请先完成前面的步骤。', 'error');
    return;
  }
  state.wizardStep = target;
  renderWizardChrome();
  if (target === 3 && map && state.mapDrawerOpen) {
    setTimeout(() => map.invalidateSize(), 50);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goNextFromStep1() {
  const result = Wizard.validateStep1({ cities: state.cities });
  if (!result.ok) {
    if (el.stepRouteNote) {
      el.stepRouteNote.hidden = false;
      el.stepRouteNote.textContent = result.message;
      el.stepRouteNote.dataset.tone = 'error';
    }
    showToast(result.message, 'error');
    return;
  }
  if (el.stepRouteNote) el.stepRouteNote.hidden = true;
  state.step1Done = true;
  setWizardStep(2);
}
```

- [ ] **Step 3: 在 `renderAll` / `renderCities` / 偏好变更后调用 `renderWizardChrome`**

```javascript
function renderAll() {
  renderCities();
  renderPlan();
  renderWizardChrome();
  if (state.mapDrawerOpen) renderMap();
}
```

城市天数变更、segmented 点击、`updateHeaderMeta` 路径都要刷新摘要。

- [ ] **Step 4: 替换 `switchMobileView`**

```javascript
function switchMobileView(view) {
  // 兼容旧调用：results -> step 3, planner -> step 1, map -> open drawer
  if (view === 'results') {
    if (Wizard.canEnterStep(3, wizardFlags())) setWizardStep(3);
    return;
  }
  if (view === 'planner') {
    setWizardStep(1);
    return;
  }
  if (view === 'map') {
    openMapDrawer();
  }
}
```

`applyPlan` 末尾现有 `switchMobileView('results')` 会进入 Step 3——符合生成后跳转。**boot 特例见 Task 7**。

- [ ] **Step 5: 绑定步骤按钮**

```javascript
el.wizardNextBtn?.addEventListener('click', goNextFromStep1);
el.wizardBackBtn?.addEventListener('click', () => setWizardStep(1));
el.wizardEditPrefsBtn?.addEventListener('click', () => setWizardStep(2));
el.wizardSteps?.addEventListener('click', event => {
  const btn = event.target.closest('[data-step]');
  if (!btn) return;
  setWizardStep(Number(btn.dataset.step));
});
el.regenerateBtn?.addEventListener('click', generatePlan);
// generateBtn 仍绑定 generatePlan；删除 generateBtnTop 绑定
```

- [ ] **Step 6: `setLoading` 只操作仍存在的按钮**

```javascript
function setLoading(isLoading) {
  [el.generateBtn, el.regenerateBtn].filter(Boolean).forEach(button => {
    button.disabled = isLoading;
    if (button === el.generateBtn) {
      button.textContent = isLoading ? '生成中...' : '生成 AI 旅行规划';
    } else if (button === el.regenerateBtn) {
      button.textContent = isLoading ? '生成中...' : '重新生成';
    }
  });
}
```

- [ ] **Step 7: 手动验证步骤**

1. 默认 Step 1  
2. 空城市拦截  
3. 下一步进入 Step 2  
4. 未生成时 Step 3 锁定  

- [ ] **Step 8: Commit**

```powershell
git add static/app.js
git commit -m "feat: wire wizard step navigation and live summary rail"
```

---

## Task 6: 地图抽屉

**Files:**
- Modify: `static/app.js`
- Modify: `static/styles.css`（若抽屉细节不够）

- [ ] **Step 1: 实现开关**

```javascript
function openMapDrawer(itemId) {
  state.mapDrawerOpen = true;
  if (itemId) state.mapFocusItemId = itemId;
  if (el.mapDrawer) {
    el.mapDrawer.hidden = false;
    el.mapDrawer.setAttribute('aria-hidden', 'false');
  }
  document.body.classList.add('map-drawer-open');
  renderMap();
  setTimeout(() => {
    if (map) map.invalidateSize();
    // 若有 active item，沿用现有 focus marker 逻辑
  }, 60);
}

function closeMapDrawer() {
  state.mapDrawerOpen = false;
  state.mapFocusItemId = null;
  if (el.mapDrawer) {
    el.mapDrawer.hidden = true;
    el.mapDrawer.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('map-drawer-open');
}
```

- [ ] **Step 2: 事件**

```javascript
el.openMapDrawerBtn?.addEventListener('click', () => openMapDrawer(state.activeItemId));
el.closeMapDrawerBtn?.addEventListener('click', closeMapDrawer);
el.mapDrawerBackdrop?.addEventListener('click', closeMapDrawer);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.mapDrawerOpen) closeMapDrawer();
});
```

- [ ] **Step 3: 时间线点击打开抽屉**

找到 `el.timelineList.addEventListener('click', ...)`：在设置 `activeItemId` / 渲染详情后调用 `openMapDrawer(item.id)`（仅对有 lat/lng 或 experience 类节点；若现有逻辑已 `renderMap`+高亮，改为打开抽屉）。

- [ ] **Step 4: `renderMap` 在抽屉关闭时的行为**

- 抽屉关闭时仍可初始化 map 实例（boot `initMap`），但不强制显示。
- 抽屉打开时再 `invalidateSize` + fit bounds。
- 若 `#map` 在 `hidden` 容器内初始化失败，改为：首次 `openMapDrawer` 时 `initMap`（懒初始化）。

推荐懒初始化：

```javascript
function ensureMap() {
  if (map) return map;
  initMap();
  return map;
}

function openMapDrawer(itemId) {
  state.mapDrawerOpen = true;
  if (itemId) {
    state.activeItemId = itemId;
    state.mapFocusItemId = itemId;
  }
  el.mapDrawer.hidden = false;
  ensureMap();
  renderMap();
  setTimeout(() => map && map.invalidateSize(), 60);
}
```

boot 中若 `initMap` 在 hidden 节点失败，**改为不在 boot 调 initMap**，仅在首次打开抽屉时初始化。

- [ ] **Step 5: 验证**

- Step 3 点「看地图」打开抽屉  
- 点景点打开并定位  
- Esc / 关闭 / 遮罩关闭  
- 控制台无 Leaflet 尺寸警告（或可接受的一次性）

- [ ] **Step 6: Commit**

```powershell
git add static/app.js static/styles.css
git commit -m "feat: add on-demand map drawer with timeline focus"
```

---

## Task 7: boot、生成跳转、恢复快照

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: 调整 `applyPlan`**

```javascript
function applyPlan(plan, message, options = {}) {
  // ... existing hydration ...
  renderAll();

  const skipWizardJump = Boolean(options.skipWizardJump);
  if (!skipWizardJump) {
    // 生成 / 恢复快照：进入 Step 3
    state.step1Done = true;
    setWizardStep(3);
  } else {
    // boot 示例：有 plan 但停在 Step 1
    state.step1Done = false;
    state.wizardStep = 1;
    renderWizardChrome();
  }
}
```

- [ ] **Step 2: boot**

```javascript
function boot() {
  el.departureDate.value = todayPlus(1);
  renderCities();
  const fallback = buildFallbackItinerary(/* ...existing... */);
  applyPlan(fallback, '已载入可交互示例。修改路线后点击生成即可连接后端规划。', {
    skipWizardJump: true
  });
  bindEvents();
  updateSavedTripsBadge();
  renderWizardChrome();
}
```

注意：示例行程使 `hasPlan=true`，Step 3 **解锁**但默认停 Step 1（符合 spec）。

- [ ] **Step 3: `restoreTripSnapshot`**

恢复后应 `step1Done=true` 且进入 Step 3（默认 `applyPlan` 不传 `skipWizardJump` 即可）。同步把表单控件（pace/budget 等）恢复——沿用现有逻辑。

- [ ] **Step 4: `generatePlan` 成功/fallback 路径**

两端 `applyPlan(...)` 都不传 `skipWizardJump` → 进入 Step 3。

- [ ] **Step 5: 验证**

| 场景 | 期望 |
|------|------|
| 首次打开 | Step 1，摘要有示例路线，Step 3 可点 |
| 生成成功 | Step 3 |
| fallback 生成 | Step 3 + 提示 |
| 恢复我的行程 | Step 3 |
| 从 Step 3 回 Step 1 改城市再生成 | 新结果 |

- [ ] **Step 6: Commit**

```powershell
git add static/app.js
git commit -m "feat: control wizard step on boot, generate, and restore"
```

---

## Task 8: 清理旧导航与冒烟文档

**Files:**
- Modify: `static/app.js`（删除死代码：workspace tabs 监听、mobile-nav、brief scroll 若已无 pane-body）
- Modify: `static/index.html`（确认无残留）
- Modify: `static/styles.css`（清理无用规则）
- Modify: `docs/smoke-checklist.md`

- [ ] **Step 1: 删除对已移除 DOM 的引用**

搜索并移除：

- `workspaceTabs`
- `mobile-nav` / `switchMobileView` 内 query（保留兼容函数体即可）
- `generateBtnTop`
- `plannerBody` / `resultsBody` brief 监听

- [ ] **Step 2: 更新 `docs/smoke-checklist.md` P0 浏览器主流程**

在「P0 浏览器主流程」增加/替换：

```markdown
- [ ] 首页默认停在向导 Step 1（路线），主内容可滚动，非三栏闷罐。
- [ ] 左侧（或窄屏顶部）可见步骤与行程摘要。
- [ ] Step 1 校验通过后进入 Step 2；主 CTA 为生成规划。
- [ ] 生成成功后自动进入 Step 3，时间线/交通/预算可见。
- [ ] 地图默认不展示；「看地图」或点击景点后打开抽屉/全屏层，可关闭。
- [ ] 顶栏复制/长图/日历/我的行程可用；窄屏「更多」可访问导出。
- [ ] 顶栏不再放置主「生成规划」按钮（生成在 Step 2）。
```

将「面板内部滚动 brief 折叠」改为可选或删除（若已移除该交互）。

- [ ] **Step 3: 全量检查**

```powershell
.\scripts\check.ps1
```

Expected: compileall、tests、`node --check`、`node --test tests/frontend/*.test.js` 通过。

- [ ] **Step 4: Commit**

```powershell
git add static/app.js static/index.html static/styles.css docs/smoke-checklist.md
git commit -m "chore: remove legacy workbench nav and update smoke checklist"
```

---

## Task 9: 桌面 + 窄屏手工验收收尾

**Files:**
- Modify: 仅修复验收中发现的 bug 文件
- Optional: `IMPLEMENTATION.md` 追加一节

- [ ] **Step 1: 按 spec §7.2 / §7.3 跑手工清单**

桌面：
1. 滚动与步骤  
2. 生成闭环  
3. 摘要与 routeMeta  
4. 地图抽屉  
5. 回改再生成  
6. 导出  
7. 控制台干净  

窄屏（DevTools &lt;900px）：
1. 步骤条  
2. 摘要条  
3. 地图全屏层  
4. 更多菜单导出  

- [ ] **Step 2: 修复发现的问题并回归 `.\scripts\check.ps1`**

- [ ] **Step 3: 最终 commit（若有修复）**

```powershell
git add -A
git status   # 确认无无关文件
git commit -m "fix: polish wizard page redesign after smoke checks"
```

---

## Spec 覆盖自检

| Spec 要求 | Task |
|-----------|------|
| 取消 100vh 闷罐、主区可滚 | 4 |
| 左轨步骤 + 摘要 | 3, 4, 5 |
| 三步内容拆分 | 3, 5 |
| 生成在 Step 2，成功进 Step 3 | 5, 7 |
| 顶栏交付、无顶栏主生成 | 3, 5, 8 |
| 地图按需抽屉 + Esc | 6 |
| 时间线点景点开地图 | 6 |
| boot 默认 Step 1 且示例解锁 Step 3 | 7 |
| 窄屏步骤条/摘要/更多 | 4, 8, 9 |
| 不改 API/存储/框架 | 全程 |
| 纯函数测试 + check.ps1 | 1 |
| 冒烟文档 | 8–9 |

## 类型/命名一致性

- `state.wizardStep` / `state.step1Done` / `state.mapDrawerOpen` / `state.mapFocusItemId`
- `AeroTravelWizard.validateStep1` / `canEnterStep` / `buildSummary`
- `setWizardStep` / `openMapDrawer` / `closeMapDrawer` / `renderWizardChrome`
- `applyPlan(..., { skipWizardJump: true })` 仅 boot 使用

---

## 风险与注意

1. **Leaflet 在 hidden 容器初始化**：优先懒创建 map（Task 6）。  
2. **app.js 体积大**：本计划不强制拆文件，避免与向导无关的大重构；纯逻辑已进 `wizard.js`。  
3. **工作区若已有未提交的 index/css/app 改动**：执行前 `git status` / `git diff`，避免覆盖无关工作；本计划文件列表为准。  
4. **可编辑行程计划**未开始时，不要引入 draft 状态。
