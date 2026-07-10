# AeroTravel 可编辑行程与自驾路线实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AeroTravel 从一次性 AI 行程生成器升级为支持想去清单、跨天编辑、硬约束、候选差异和真实自驾道路数据的可控规划工作台。

**Architecture:** 浏览器继续持有唯一可变状态和 `localStorage` 快照，并分离已应用行程、编辑草稿和优化候选。后端保持无状态：Pydantic 模型校验草稿，确定性优化器执行约束排序，高德客户端提供地点与道路数据，AI 仅提供初稿和软建议。

**Tech Stack:** Python 3.10+、FastAPI、Pydantic v2、httpx、vanilla JavaScript、Node.js 内置测试运行器、Leaflet、高德 Web Service、PowerShell 质量脚本。

---

## 执行前提

- 设计规格：`docs/superpowers/specs/2026-07-10-editable-itinerary-self-drive-design.md`
- 执行开始时先使用 `superpowers:using-git-worktrees` 创建隔离工作树。
- 每个任务从失败测试开始，只暂存该任务列出的文件，并使用任务给出的提交信息。
- 不安装前端框架、打包器、数据库或新的必需付费服务。
- 高德与 AI 的自动化测试全部使用 fixture/mock，不访问真实第三方网络。
- 三个里程碑必须逐个可运行：任务 1-6 是可编辑行程核心，任务 7-10 是局部优化，任务 11-15 是自驾规划。
- 信任边界包括用户表单、`localStorage`、LLM 输出和高德响应：入口做长度/数量/schema 校验，HTML 输出统一转义，外部错误统一为稳定错误码，日志不记录坐标、完整草稿、密钥或供应商原始响应。

## 文件结构

### 新建文件

| 文件 | 单一职责 |
|---|---|
| `static/draft.js` | `AppliedPlan` 与 `TripDraft` 转换、稳定 ID、schema 常量 |
| `static/draft-ops.js` | 不可变草稿操作、结构校验、revision 增长 |
| `static/history.js` | 有界撤销/重做历史 |
| `static/editor.js` | 想去清单、每日编辑器和约束控件的纯 HTML 渲染 |
| `static/candidate.js` | 候选差异分组和对话框渲染 |
| `static/self-drive.js` | 自驾模式状态转换、路线摘要和节点列表渲染 |
| `tests/frontend/*.test.js` | 无 DOM、无依赖的 Node 前端单元测试 |
| `schemas/draft.py` | 草稿、约束、优化和自驾道路请求/响应模型 |
| `schemas/location.py` | 反向地理编码的稳定输出契约 |
| `planner/constraints.py` | 硬约束和草稿结构校验 |
| `planner/draft_optimizer.py` | 普通行程候选生成和差异摘要 |
| `planner/route_optimizer.py` | 受约束路线排序、2-opt 和按天拆分 |
| `services/driving_route_service.py` | 道路成本矩阵、最终分段路线和估算降级 |
| `tests/planner/test_constraints.py` | 约束冲突回归测试 |
| `tests/planner/test_draft_optimizer.py` | 普通行程优化与 diff 测试 |
| `tests/planner/test_route_optimizer.py` | 环线、单程、锁定锚点和策略测试 |
| `tests/services/test_driving_route_service.py` | 高德道路服务与估算降级测试 |
| `docs/decisions/ADR-002-constraint-driven-editable-planning.md` | 记录三段式状态、确定性约束优化和道路数据边界的长期决策 |

### 修改文件

| 文件 | 修改范围 |
|---|---|
| `.gitignore` | 忽略 `.superpowers/` 本地原型 |
| `scripts/check.ps1` | 在语法检查后运行 `node --test tests/frontend/*.test.js` |
| `static/state.js` | 增加草稿、候选、编辑模式、自驾设置和请求控制器状态 |
| `static/storage.js` | version 2 快照、显式写入结果、version 1 兼容读取 |
| `static/api.js` | 支持 `AbortSignal`，保留现有 `/api` 基址行为 |
| `static/map.js` | 点选模式、草稿 marker 和道路 polyline 图层 |
| `static/index.html` | 编辑工作台、候选对话框、自驾控件和脚本加载顺序 |
| `static/styles.css` | 桌面双栏编辑、移动抽屉、差异和路线状态 |
| `static/app.js` | `applyPlan()` 扩展与模块协调，不新增纯业务算法 |
| `clients/amap.py` | 反向地理编码、驾车距离和驾车路线解析 |
| `routers/location.py` | `/api/reverse_geocode` |
| `routers/planning.py` | `/api/plan/optimize` |
| `routers/transport.py` | 注入 settings 的自驾道路子路由 |
| `server.py` | 注册自驾道路子路由 |
| `README.md`、`IMPLEMENTATION.md`、`tasks/todo.md` | 新能力、边界和实施记录 |
| `docs/smoke-checklist.md` | 编辑与自驾浏览器验收步骤 |

## 里程碑 A：可编辑行程核心

### Task 1: 建立前端草稿 schema、转换器和测试入口

**Files:**
- Create: `static/draft.js`
- Create: `tests/frontend/draft.test.js`
- Modify: `static/state.js:15-36`
- Modify: `static/index.html:291-299`
- Modify: `scripts/check.ps1:45-55`
- Modify: `.gitignore`

- [ ] **Step 1: 写转换器失败测试**

```javascript
// tests/frontend/draft.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../../static/draft.js');

const { itineraryToDraft, draftToItinerary, draftToCities, isTripDraft } = window.AeroTravelDraft;

const itinerary = {
  title: '杭州两日游',
  days: [{
    day: 1,
    city: '杭州',
    items: [
      { id: 'poi-1', type: 'experience', title: '西湖', city: '杭州', time: '09:00', lat: 30.25, lng: 120.15 },
      { id: 'hotel-1', type: 'hotel', title: '住宿区域', city: '杭州', time: '20:00', lat: 30.26, lng: 120.16 }
    ]
  }]
};

test('itineraryToDraft keeps order without inventing user locks', () => {
  const draft = itineraryToDraft(itinerary, [{ name: '杭州', days: 2, transport: 'auto' }], { seed: 'snapshot-1' });
  assert.equal(draft.schema_version, 2);
  assert.equal(draft.city_stops[0].days, 2);
  assert.deepEqual(draft.days[0].node_ids.length, 2);
  assert.equal(draft.nodes.find(node => node.name === '住宿区域').source, 'system');
  assert.equal(draft.nodes.find(node => node.name === '住宿区域').constraints.fixed_order, false);
});

test('draftToItinerary round-trips current item order', () => {
  const draft = itineraryToDraft(itinerary, [{ name: '杭州', days: 2 }], { seed: 'snapshot-1' });
  const result = draftToItinerary(draft, itinerary);
  assert.deepEqual(result.days[0].items.map(item => item.title), ['西湖', '住宿区域']);
  assert.deepEqual(draftToCities(draft), [{ name: '杭州', days: 2, transport: 'auto' }]);
});

test('isTripDraft rejects malformed or unbounded local snapshots', () => {
  const draft = itineraryToDraft(itinerary, [{ name: '杭州', days: 2 }], { seed: 'snapshot-1' });
  assert.equal(isTripDraft(draft), true);
  assert.equal(isTripDraft({ schema_version: 2, nodes: 'not-an-array' }), false);
  assert.equal(isTripDraft({ ...draft, nodes: Array.from({ length: 201 }, () => ({})) }), false);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/frontend/draft.test.js`
Expected: FAIL，错误包含 `Cannot find module '../../static/draft.js'`。

- [ ] **Step 3: 实现 canonical draft 转换器**

```javascript
// static/draft.js
(function (root) {
  const SCHEMA_VERSION = 2;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function hashText(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function stableNodeId(seed, day, index, item) {
    const identity = [seed, day, index, item.id || '', item.title || '', item.lat || '', item.lng || ''].join('|');
    return `node-${hashText(identity)}`;
  }

  function cityStopId(name) {
    return `city-${hashText(String(name).trim())}`;
  }

  function itemToNode(item, dayId, cityId, seed, day, index) {
    const isExperience = item.type === 'experience';
    return {
      id: stableNodeId(seed, day, index, item),
      source: isExperience ? 'ai' : 'system',
      provider_id: null,
      name: String(item.title || '').trim(),
      city_id: cityId,
      city: String(item.city || '').trim(),
      location: {
        lat: Number(item.lat) || 0,
        lng: Number(item.lng) || 0,
        status: Number(item.lat) && Number(item.lng) ? 'resolved' : 'unresolved'
      },
      status: 'scheduled',
      duration_minutes: 0,
      schedule: { day_id: dayId, time_window: item.time || null },
      constraints: { required: false, fixed_day: false, fixed_time: false, fixed_order: false },
      manual_rank: index,
      metadata: { item: clone(item) }
    };
  }

  function itineraryToDraft(itinerary, cities, options = {}) {
    const seed = options.seed || itinerary.title || 'generated-trip';
    const cityStops = (cities || []).map(city => ({
      id: cityStopId(city.name),
      name: String(city.name || '').trim(),
      days: Number(city.days) || 1,
      transport: city.transport || 'auto',
      fixed_order: false
    }));
    const stopByName = new Map(cityStops.map(stop => [stop.name, stop]));
    const nodes = [];
    const days = (itinerary.days || []).map(day => {
      const dayId = `day-${day.day}`;
      const cityId = stopByName.get(day.city)?.id || cityStopId(day.city);
      const dayKey = day.date || day.day;
      const dayNodes = (day.items || []).map((item, index) => itemToNode(item, dayId, cityId, seed, dayKey, index));
      nodes.push(...dayNodes);
      return {
        id: dayId,
        day: Number(day.day),
        date: day.date || null,
        primary_city_id: cityId,
        node_ids: dayNodes.map(node => node.id),
        max_driving_minutes: null
      };
    });
    return {
      schema_version: SCHEMA_VERSION,
      id: `trip-${hashText(seed)}`,
      revision: 0,
      mode: 'itinerary',
      route_shape: 'one_way',
      strategy: 'balanced',
      start_date: options.startDate || '',
      city_stops: cityStops,
      nodes,
      days,
      route: null
    };
  }

  function nodeToItem(node) {
    return {
      ...(node.metadata?.item || {}),
      id: node.id,
      title: node.name,
      city: node.city,
      time: node.schedule.time_window || node.metadata?.item?.time || '',
      lat: node.location.lat,
      lng: node.location.lng
    };
  }

  function normalizeSegment(value) {
    return String(value || '').replace(/\s*[→>-]+\s*/g, ' → ').trim();
  }

  function reconcileTransportGuide(draft, guide) {
    if (!Array.isArray(guide)) return guide;
    const existing = new Map(guide.map(segment => [normalizeSegment(segment.segment), segment]));
    return draft.city_stops.slice(0, -1).map((city, index) => {
      const nextCity = draft.city_stops[index + 1];
      const segment = `${city.name} → ${nextCity.name}`;
      return existing.get(normalizeSegment(segment)) || {
        segment,
        tool: nextCity.transport || 'auto',
        options: [],
        data_source: 'unavailable',
        note: '城市顺序已修改，需要重新确认该段交通'
      };
    });
  }

  function draftToItinerary(draft, baseItinerary) {
    const result = clone(baseItinerary);
    const nodeById = new Map(draft.nodes.map(node => [node.id, node]));
    const baseDayByNumber = new Map((result.days || []).map(day => [Number(day.day), day]));
    const baseDayById = new Map((result.days || []).map(day => [`day-${day.day}`, day]));
    const cityById = new Map(draft.city_stops.map(city => [city.id, city]));
    result.days = draft.days.map(day => ({
      ...(baseDayById.get(day.id) || baseDayByNumber.get(Number(day.day)) || {}),
      day: Number(day.day),
      date: day.date || null,
      city: cityById.get(day.primary_city_id)?.name || '',
      items: day.node_ids.map(id => nodeById.get(id)).filter(Boolean).map(nodeToItem)
    }));
    result.route = draft.route == null ? null : clone(draft.route);
    result.transport_guide = reconcileTransportGuide(draft, result.transport_guide);
    return result;
  }

  function draftToCities(draft) {
    return draft.city_stops.map(city => ({ name: city.name, days: city.days, transport: city.transport || 'auto' }));
  }

  function isTripDraft(value) {
    if (!value || value.schema_version !== 2 || !Array.isArray(value.city_stops)
      || !Array.isArray(value.nodes) || !Array.isArray(value.days)) return false;
    if (!Number.isInteger(value.revision) || value.revision < 0
      || !['itinerary', 'self_drive'].includes(value.mode)) return false;
    if (value.city_stops.length > 20 || value.nodes.length > 200 || value.days.length > 60) return false;
    const validCities = value.city_stops.every(city =>
      city && typeof city.id === 'string' && typeof city.name === 'string' && city.name.length <= 200
    );
    const validNodes = value.nodes.every(node =>
      node && typeof node.id === 'string' && typeof node.name === 'string' && node.name.length <= 200
      && node.location && typeof node.location === 'object'
      && Number.isFinite(node.location.lat) && Number.isFinite(node.location.lng)
      && node.schedule && typeof node.schedule === 'object'
      && node.constraints && typeof node.constraints === 'object'
    );
    const validDays = value.days.every(day =>
      day && typeof day.id === 'string' && Array.isArray(day.node_ids) && day.node_ids.length <= 200
      && day.node_ids.every(id => typeof id === 'string')
    );
    const validRoute = value.route == null || (
      typeof value.route === 'object'
      && (!value.route.ordered_node_ids || (
        Array.isArray(value.route.ordered_node_ids)
        && value.route.ordered_node_ids.length <= 200
        && value.route.ordered_node_ids.every(id => typeof id === 'string')
      ))
    );
    return validCities && validNodes && validDays && validRoute;
  }

  root.AeroTravelDraft = Object.freeze({
    SCHEMA_VERSION,
    clone,
    hashText,
    itineraryToDraft,
    draftToItinerary,
    draftToCities,
    isTripDraft
  });
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: 将草稿状态和测试命令接入现有应用**

在 `createInitialState()` 返回值中加入：

```javascript
editMode: false,
workingDraft: null,
candidatePlan: null,
draftHistory: null,
appliedUndo: null,
planningMode: 'itinerary',
routeShape: 'one_way',
routeStrategy: 'balanced',
activeOptimizationController: null,
activeRouteController: null,
routeRequestTimer: null,
cancelPointPicker: null
```

在 `static/index.html` 中把 `draft.js` 放在 `state.js` 之后、`app.js` 之前。在 `scripts/check.ps1` 的 JavaScript 语法检查后加入：

```powershell
$frontendTests = Get-ChildItem tests/frontend -Filter *.test.js -ErrorAction SilentlyContinue
if ($frontendTests) {
    Write-Host "== Frontend unit tests =="
    Invoke-Checked node --test @($frontendTests.FullName)
}
```

在 `.gitignore` 增加 `.superpowers/`。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/frontend/draft.test.js`
Expected: 3 tests PASS。

Run: `node --check static/draft.js`
Expected: exit 0。

```powershell
git add .gitignore scripts/check.ps1 static/draft.js static/state.js static/index.html tests/frontend/draft.test.js
git commit -m "feat: add editable trip draft model"
```

### Task 2: 实现不可变草稿操作与撤销/重做

**Files:**
- Create: `static/draft-ops.js`
- Create: `static/history.js`
- Create: `tests/frontend/draft-ops.test.js`
- Create: `tests/frontend/history.test.js`
- Modify: `static/index.html:292-300`

- [ ] **Step 1: 写添加、移动、约束和历史失败测试**

```javascript
// tests/frontend/draft-ops.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
global.window = {};
require('../../static/draft.js');
require('../../static/draft-ops.js');

const {
  addNode, moveNode, updateNode, updateConstraints, removeNode, reorderCityStops, validateStructure
} = window.AeroTravelDraftOps;

function emptyDraft() {
  return {
    schema_version: 2, revision: 0, city_stops: [{ id: 'city-hz', name: '杭州', days: 1 }],
    days: [{ id: 'day-1', day: 1, primary_city_id: 'city-hz', node_ids: [] }], nodes: []
  };
}

test('user-added nodes default to required and can move into a day', () => {
  const added = addNode(emptyDraft(), { name: '西溪湿地', city: '杭州', city_id: 'city-hz', lat: 30.26, lng: 120.06 }, () => 'node-user');
  assert.equal(added.nodes[0].constraints.required, true);
  assert.equal(added.nodes[0].status, 'wishlist');
  const moved = moveNode(added, 'node-user', 'day-1', 0);
  assert.deepEqual(moved.days[0].node_ids, ['node-user']);
  assert.equal(moved.nodes[0].schedule.day_id, 'day-1');
  assert.equal(moved.revision, 2);
});

test('constraint updates are explicit and structural validation finds duplicates', () => {
  const added = addNode(emptyDraft(), { name: '西湖', city: '杭州', city_id: 'city-hz' }, () => 'node-user');
  const locked = updateConstraints(added, 'node-user', { fixed_day: true });
  assert.equal(locked.nodes[0].constraints.fixed_day, true);
  const broken = structuredClone(locked);
  broken.days[0].node_ids = ['node-user', 'node-user'];
  assert.deepEqual(validateStructure(broken).map(error => error.code), ['duplicate_node']);
  const brokenRoute = structuredClone(added);
  brokenRoute.route = { ordered_node_ids: ['node-user', 'node-user'] };
  assert.deepEqual(validateStructure(brokenRoute).map(error => error.code), ['duplicate_route_node']);
});

test('node edits, deletion and city reordering keep canonical references consistent', () => {
  const draft = emptyDraft();
  draft.city_stops.push({ id: 'city-sh', name: '上海', days: 1 });
  draft.days.push({ id: 'day-2', day: 2, primary_city_id: 'city-sh', node_ids: [] });
  const added = addNode(draft, { name: '外滩', city: '上海', city_id: 'city-sh' }, () => 'node-user');
  added.route = { ordered_node_ids: ['node-user'] };
  const renamed = updateNode(added, 'node-user', { name: '外滩观景步道', duration_minutes: 90 });
  assert.equal(renamed.nodes[0].name, '外滩观景步道');
  const scheduled = moveNode(renamed, 'node-user', 'day-2', 0);
  const locked = updateConstraints(scheduled, 'node-user', { fixed_day: true, fixed_order: true });
  assert.throws(() => moveNode(locked, 'node-user', 'day-1', 0), /fixed_day_locked/);
  const reordered = reorderCityStops(renamed, 1, 0);
  assert.deepEqual(reordered.city_stops.map(city => city.id), ['city-sh', 'city-hz']);
  assert.deepEqual(reordered.days.map(day => day.primary_city_id), ['city-sh', 'city-hz']);
  const removed = removeNode(reordered, 'node-user');
  assert.deepEqual(removed.route.ordered_node_ids, []);
});
```

```javascript
// tests/frontend/history.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
global.window = {};
require('../../static/history.js');
const { createHistory, push, undo, redo } = window.AeroTravelHistory;

test('history restores drafts and clears redo after a new edit', () => {
  let history = createHistory({ revision: 0 }, 2);
  history = push(history, { revision: 1 });
  history = push(history, { revision: 2 });
  history = undo(history);
  assert.equal(history.present.revision, 3);
  history = redo(history);
  assert.equal(history.present.revision, 4);
  history = undo(history);
  assert.equal(history.present.revision, 5);
  history = push(history, { revision: 6 });
  assert.equal(history.future.length, 0);
});
```

- [ ] **Step 2: 运行测试并确认模块不存在**

Run: `node --test tests/frontend/draft-ops.test.js tests/frontend/history.test.js`
Expected: FAIL，分别包含 `Cannot find module '../../static/draft-ops.js'` 和 `history.js`。

- [ ] **Step 3: 实现不可变草稿操作**

```javascript
// static/draft-ops.js
(function (root) {
  const { clone } = root.AeroTravelDraft;

  function next(draft) {
    const result = clone(draft);
    result.revision = Number(draft.revision || 0) + 1;
    return result;
  }

  function addNode(draft, place, idFactory = () => crypto.randomUUID()) {
    const result = next(draft);
    const userSource = place.source || 'manual';
    result.nodes.push({
      id: idFactory(), source: userSource, provider_id: place.provider_id || null,
      name: String(place.name || '').trim(), city_id: place.city_id || '', city: place.city || '',
      location: { lat: Number(place.lat) || 0, lng: Number(place.lng) || 0,
        status: Number(place.lat) && Number(place.lng) ? 'resolved' : 'unresolved' },
      status: 'wishlist', duration_minutes: Number(place.duration_minutes) || 120,
      schedule: { day_id: null, time_window: null },
      constraints: { required: ['manual', 'amap_search', 'map_pick'].includes(userSource), fixed_day: false, fixed_time: false, fixed_order: false },
      manual_rank: null, metadata: { ...(place.metadata || {}) }
    });
    return result;
  }

  function moveNode(draft, nodeId, dayId, targetIndex = 0) {
    const result = next(draft);
    const node = result.nodes.find(item => item.id === nodeId);
    if (!node) throw new Error(`unknown node: ${nodeId}`);
    const currentDay = result.days.find(day => day.node_ids.includes(nodeId));
    const currentIndex = currentDay?.node_ids.indexOf(nodeId) ?? -1;
    if (node.constraints.fixed_day && node.schedule.day_id !== null && dayId !== node.schedule.day_id) {
      throw new Error('fixed_day_locked');
    }
    if (node.constraints.fixed_order && node.schedule.day_id !== null && (
      dayId !== node.schedule.day_id || (dayId !== null && targetIndex !== currentIndex)
    )) throw new Error('fixed_order_locked');
    if (node.constraints.fixed_time && dayId === node.schedule.day_id && targetIndex !== currentIndex) {
      throw new Error('fixed_time_order_locked');
    }
    result.days.forEach(day => { day.node_ids = day.node_ids.filter(id => id !== nodeId); });
    if (dayId === null) {
      node.status = 'wishlist';
      node.schedule.day_id = null;
      if (result.mode === 'self_drive' && result.route?.ordered_node_ids) {
        result.route.ordered_node_ids = result.route.ordered_node_ids.filter(id => id !== nodeId);
      }
      return result;
    }
    const day = result.days.find(item => item.id === dayId);
    if (!day) throw new Error(`unknown day: ${dayId}`);
    day.node_ids.splice(Math.max(0, Math.min(targetIndex, day.node_ids.length)), 0, nodeId);
    node.status = 'scheduled';
    node.schedule.day_id = dayId;
    node.manual_rank = targetIndex;
    if (result.mode === 'self_drive' && result.route?.ordered_node_ids && !result.route.ordered_node_ids.includes(nodeId)) {
      result.route.ordered_node_ids.push(nodeId);
    }
    return result;
  }

  function updateNode(draft, nodeId, patch) {
    const result = next(draft);
    const node = result.nodes.find(item => item.id === nodeId);
    if (!node) throw new Error(`unknown node: ${nodeId}`);
    if (Object.hasOwn(patch, 'name')) {
      const name = String(patch.name || '').trim();
      if (!name) throw new Error('node name is required');
      node.name = name;
    }
    if (Object.hasOwn(patch, 'duration_minutes')) {
      node.duration_minutes = Math.max(0, Math.min(1440, Number(patch.duration_minutes) || 0));
    }
    return result;
  }

  function reorderCityStops(draft, fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= draft.city_stops.length || toIndex < 0 || toIndex >= draft.city_stops.length) {
      return clone(draft);
    }
    const result = next(draft);
    const fixedAt = new Map(result.city_stops.flatMap((city, index) => city.fixed_order ? [[index, city.id]] : []));
    const chronologicalDates = result.days.map(day => day.date || null);
    const [moved] = result.city_stops.splice(fromIndex, 1);
    result.city_stops.splice(toIndex, 0, moved);
    if ([...fixedAt].some(([index, id]) => result.city_stops[index]?.id !== id)) return clone(draft);
    const rank = new Map(result.city_stops.map((city, index) => [city.id, index]));
    const oldDayRank = new Map(result.days.map((day, index) => [day.id, index]));
    result.days.sort((a, b) =>
      (rank.get(a.primary_city_id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.primary_city_id) ?? Number.MAX_SAFE_INTEGER)
      || oldDayRank.get(a.id) - oldDayRank.get(b.id)
    );
    const newDayRank = new Map(result.days.map((day, index) => [day.id, index]));
    const fixedDayIds = new Set(result.nodes.filter(node => node.constraints.fixed_day).map(node => node.schedule.day_id));
    if ([...fixedDayIds].some(dayId => oldDayRank.get(dayId) !== newDayRank.get(dayId))) return clone(draft);
    result.days.forEach((day, index) => {
      day.day = index + 1;
      day.date = chronologicalDates[index];
    });
    return result;
  }

  function updateConstraints(draft, nodeId, patch, timeWindow) {
    const result = next(draft);
    const node = result.nodes.find(item => item.id === nodeId);
    if (!node) throw new Error(`unknown node: ${nodeId}`);
    node.constraints = { ...node.constraints, ...patch };
    if (timeWindow !== undefined) node.schedule.time_window = timeWindow || null;
    return result;
  }

  function removeNode(draft, nodeId) {
    const result = next(draft);
    result.days.forEach(day => { day.node_ids = day.node_ids.filter(id => id !== nodeId); });
    const node = result.nodes.find(item => item.id === nodeId);
    if (node) {
      node.status = 'removed';
      node.schedule.day_id = null;
      node.constraints.required = false; // Explicit user deletion overrides the previous must-visit choice.
    }
    if (result.route?.ordered_node_ids) {
      result.route.ordered_node_ids = result.route.ordered_node_ids.filter(id => id !== nodeId);
    }
    return result;
  }

  function validateStructure(draft) {
    const known = new Set(draft.nodes.map(node => node.id));
    const seen = new Set();
    const errors = [];
    for (const day of draft.days) {
      for (const id of day.node_ids) {
        if (!known.has(id)) errors.push({ code: 'unknown_node', node_id: id, day_id: day.id });
        else if (seen.has(id)) errors.push({ code: 'duplicate_node', node_id: id, day_id: day.id });
        seen.add(id);
      }
    }
    const routeSeen = new Set();
    for (const id of draft.route?.ordered_node_ids || []) {
      if (!known.has(id)) errors.push({ code: 'unknown_route_node', node_id: id });
      else if (routeSeen.has(id)) errors.push({ code: 'duplicate_route_node', node_id: id });
      routeSeen.add(id);
    }
    return errors;
  }

  root.AeroTravelDraftOps = Object.freeze({
    addNode, moveNode, updateNode, updateConstraints, removeNode, reorderCityStops, validateStructure
  });
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: 实现有界历史**

```javascript
// static/history.js
(function (root) {
  const copy = value => JSON.parse(JSON.stringify(value));
  const createHistory = (initial, limit = 50) => ({ past: [], present: copy(initial), future: [], limit });
  const push = (history, value) => ({
    ...history,
    past: [...history.past, copy(history.present)].slice(-history.limit),
    present: copy(value),
    future: []
  });
  const restoreWithNextRevision = (snapshot, present) => ({
    ...copy(snapshot), revision: Number(present.revision || 0) + 1
  });
  const undo = history => history.past.length ? ({
    ...history,
    past: history.past.slice(0, -1),
    present: restoreWithNextRevision(history.past.at(-1), history.present),
    future: [copy(history.present), ...history.future]
  }) : history;
  const redo = history => history.future.length ? ({
    ...history,
    past: [...history.past, copy(history.present)].slice(-history.limit),
    present: restoreWithNextRevision(history.future[0], history.present),
    future: history.future.slice(1)
  }) : history;
  root.AeroTravelHistory = Object.freeze({ createHistory, push, undo, redo });
})(typeof window !== 'undefined' ? window : globalThis);
```

在 `static/index.html` 中按 `draft.js`、`draft-ops.js`、`history.js`、`app.js` 顺序加载。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/frontend/draft-ops.test.js tests/frontend/history.test.js`
Expected: 4 tests PASS。

```powershell
git add static/draft-ops.js static/history.js static/index.html tests/frontend/draft-ops.test.js tests/frontend/history.test.js
git commit -m "feat: add reversible itinerary draft operations"
```

### Task 3: 升级本地快照并保持 version 1 可恢复

**Files:**
- Modify: `static/storage.js:1-38`
- Modify: `static/app.js:124-188,748-776`
- Create: `tests/frontend/storage.test.js`

- [ ] **Step 1: 写 version 2 和写入失败测试**

```javascript
// tests/frontend/storage.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
global.window = {};
require('../../static/storage.js');

test('storage preserves legacy entries and writes version 2 entries', () => {
  let raw = JSON.stringify([{ id: 1, plan: { days: [] } }]);
  window.localStorage = { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
  const storage = window.AeroTravelStorage.createTripStorage('trips', 8);
  assert.equal(storage.load()[0].schema_version, undefined);
  const result = storage.save({ id: 2, schema_version: 2, appliedPlan: {}, draft: {} });
  assert.equal(result.ok, true);
  assert.equal(JSON.parse(raw)[0].schema_version, 2);
});

test('storage reports quota failures instead of silently claiming success', () => {
  window.localStorage = { getItem: () => '[]', setItem: () => { throw new Error('quota'); } };
  const storage = window.AeroTravelStorage.createTripStorage('trips', 8);
  assert.deepEqual(storage.save({ id: 1 }), { ok: false, error: 'storage_unavailable' });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/frontend/storage.test.js`
Expected: FAIL，因为当前 `save()` 返回 `undefined`。

- [ ] **Step 3: 让 storage 返回显式结果但保持读取兼容**

```javascript
// replace save/remove bodies in static/storage.js
function save(entry) {
  try {
    const trips = load();
    trips.unshift(entry);
    trips.length = Math.min(trips.length, maxSavedTrips);
    window.localStorage.setItem(storageKey, JSON.stringify(trips));
    return { ok: true };
  } catch (_) {
    return { ok: false, error: 'storage_unavailable' };
  }
}

function remove(id) {
  try {
    const trips = load().filter(entry => entry.id !== id);
    window.localStorage.setItem(storageKey, JSON.stringify(trips));
    return { ok: true };
  } catch (_) {
    return { ok: false, error: 'storage_unavailable' };
  }
}
```

- [ ] **Step 4: 扩展保存、恢复和 `applyPlan()`**

`saveTripSnapshot()` 写入以下稳定结构：

```javascript
const entry = {
  id: Date.now(),
  schema_version: 2,
  savedAt: new Date().toISOString(),
  title: state.itinerary?.title || '未命名行程',
  cities: JSON.parse(JSON.stringify(state.cities)),
  pace: state.pace,
  budget: state.budget,
  globalTransport: state.globalTransport,
  interests: state.interests,
  departureDate: el.departureDate.value,
  selectedOptions: { ...state.selectedOptions },
  appliedPlan: JSON.parse(JSON.stringify(state.itinerary)),
  draft: JSON.parse(JSON.stringify(state.workingDraft))
};
const result = tripStorage.save(entry);
if (!result.ok) showToast('本次修改尚未保存到浏览器，请保留当前页面。', 'error');
```

把函数签名从 `saveTripSnapshot(rawPlan)` 改为无参数 `saveTripSnapshot()`，标题和 plan 均从 `state.itinerary` 读取；`generatePlan()` 中 `applyPlan(...)` 之后的调用同步改为 `saveTripSnapshot()`，避免保存 AI 原始 JSON 而丢失已映射节点。

`applyPlan()` 新增 `daysAreMapped`、`draft` 和 `readOnly` 选项：

```javascript
state.activeOptimizationController?.abort();
state.activeRouteController?.abort();
state.activeOptimizationController = null;
state.activeRouteController = null;
const mappedDays = options.daysAreMapped
  ? JSON.parse(JSON.stringify(plan.days || []))
  : mapPlanToItems(plan);
state.itinerary = {
  ...plan,
  tips,
  days: mappedDays,
  _serverQualityChecks: plan.quality_checks || null
};
if (options.readOnly) {
  state.workingDraft = null;
  state.draftHistory = null;
  state.editMode = false;
} else {
  state.workingDraft = options.draft || itineraryToDraft(state.itinerary, state.cities, {
    seed: options.seed || `${plan.title || 'trip'}-${el.departureDate.value}`,
    startDate: el.departureDate.value
  });
  state.draftHistory = window.AeroTravelHistory.createHistory(state.workingDraft, 50);
}
```

恢复时：version 2 调用 `applyPlan(entry.appliedPlan, message, { daysAreMapped: true, draft: entry.draft })`。version 1 先尝试迁移；迁移失败时再走旧的只读恢复，不覆盖或删除原快照：

```javascript
if (entry.schema_version === 2) {
  const validDraft = window.AeroTravelDraft.isTripDraft(entry.draft)
    && window.AeroTravelDraftOps.validateStructure(entry.draft).length === 0;
  if (entry.appliedPlan && validDraft) {
    applyPlan(entry.appliedPlan, message, { daysAreMapped: true, draft: entry.draft });
  } else {
    applyPlan(entry.appliedPlan || entry.plan, '本地草稿已损坏，当前按只读模式恢复。', {
      daysAreMapped: Boolean(entry.appliedPlan),
      selectedOptions: selectedOptionsSnapshot,
      readOnly: true
    });
    showToast('本地草稿校验失败，原始快照未被覆盖。', 'error');
  }
} else {
  try {
    applyPlan(entry.plan, message, {
      selectedOptions: selectedOptionsSnapshot,
      seed: `snapshot-${entry.id}`
    });
  } catch (_) {
    applyPlan(entry.plan, '旧行程已按只读模式恢复，当前数据无法迁移为可编辑草稿。', {
      selectedOptions: selectedOptionsSnapshot,
      readOnly: true
    });
    showToast('此旧快照暂时只能浏览，原始数据未被覆盖。', 'error');
  }
}
```

version 1 成功迁移时只在内存中生成确定性节点 ID，不写回旧快照。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/frontend/storage.test.js tests/frontend/draft.test.js`
Expected: 4 tests PASS。

```powershell
git add static/storage.js static/app.js tests/frontend/storage.test.js
git commit -m "feat: persist versioned editable trip snapshots"
```

### Task 4: 构建想去清单与每日编辑器

**Files:**
- Create: `static/editor.js`
- Create: `tests/frontend/editor.test.js`
- Modify: `static/index.html:212-263,291-300`
- Modify: `static/styles.css:682-879,1218-1394`
- Modify: `static/app.js:11-50,814-878,1383-1567`

- [ ] **Step 1: 写安全渲染和编辑状态失败测试**

```javascript
// tests/frontend/editor.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
global.window = {};
require('../../static/editor.js');

const escapeHtml = value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;');
test('wishlist rendering escapes untrusted names and exposes move controls', () => {
  const html = window.AeroTravelEditor.renderWishlist([
    { id: 'n1', name: '<img onerror=alert(1)>', status: 'wishlist', location: { status: 'unresolved' }, constraints: { required: true } }
  ], escapeHtml);
  assert.match(html, /&lt;img onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /data-action="schedule"/);
  assert.match(html, /data-action="edit-node"/);
  assert.match(html, /data-action="remove-node"/);
  assert.match(html, /待定位/);
});

test('city rendering exposes keyboard-operable ordering controls', () => {
  const html = window.AeroTravelEditor.renderCityStops(
    [{ id: 'hz', name: '杭州' }, { id: 'sh', name: '上海' }], escapeHtml
  );
  assert.match(html, /data-action="city-up"/);
  assert.match(html, /data-action="city-down"/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/frontend/editor.test.js`
Expected: FAIL，错误包含 `Cannot find module '../../static/editor.js'`。

- [ ] **Step 3: 实现无 DOM 的编辑器渲染函数**

```javascript
// static/editor.js
(function (root) {
  function renderWishlist(nodes, escapeHtml) {
    if (!nodes.length) return '<div class="editor-empty">想去清单为空</div>';
    return nodes.map(node => `
      <article class="wishlist-item" data-node-id="${escapeHtml(node.id)}">
        <div><strong>${escapeHtml(node.name)}</strong>
          <small>${node.location.status === 'resolved' ? escapeHtml(node.city || '已定位') : '待定位'}</small>
        </div>
        <span class="constraint-status">${node.constraints.required ? '必去' : '可选'}</span>
        <button class="btn btn-icon" type="button" data-action="schedule" data-node-id="${escapeHtml(node.id)}" aria-label="安排 ${escapeHtml(node.name)}">+</button>
        <button class="btn btn-icon" type="button" data-action="edit-node" data-node-id="${escapeHtml(node.id)}" aria-label="编辑 ${escapeHtml(node.name)}">✎</button>
        <button class="btn btn-icon" type="button" data-action="remove-node" data-node-id="${escapeHtml(node.id)}" aria-label="删除 ${escapeHtml(node.name)}">×</button>
      </article>`).join('');
  }

  function renderDayNodes(nodes, escapeHtml) {
    return nodes.map((node, index) => `
      <article class="draft-node" draggable="${node.source !== 'system' && !node.constraints.fixed_order && !node.constraints.fixed_time}" data-node-id="${escapeHtml(node.id)}">
        <button class="drag-handle" type="button" aria-label="移动 ${escapeHtml(node.name)}">::</button>
        <div><strong>${escapeHtml(node.name)}</strong><small>${escapeHtml(node.schedule.time_window || '时间待安排')}</small></div>
        <button class="btn btn-icon" type="button" data-action="constraints" data-node-id="${escapeHtml(node.id)}" aria-label="设置 ${escapeHtml(node.name)} 的约束">锁</button>
        <button class="btn btn-icon" type="button" data-action="edit-node" data-node-id="${escapeHtml(node.id)}" aria-label="编辑 ${escapeHtml(node.name)}">✎</button>
        <button class="btn btn-icon" type="button" data-action="remove-node" data-node-id="${escapeHtml(node.id)}" aria-label="删除 ${escapeHtml(node.name)}">×</button>
        <div class="node-move-menu">
          <button type="button" data-action="move-up" data-index="${index}" ${node.constraints.fixed_order || node.constraints.fixed_time ? 'disabled' : ''}>上移</button>
          <button type="button" data-action="move-down" data-index="${index}" ${node.constraints.fixed_order || node.constraints.fixed_time ? 'disabled' : ''}>下移</button>
          <button type="button" data-action="move-day" ${node.constraints.fixed_day || node.constraints.fixed_order ? 'disabled' : ''}>移动到其他日期</button>
        </div>
      </article>`).join('');
  }

  function renderCityStops(cities, escapeHtml) {
    return cities.map((city, index) => `
      <article class="city-order-item" data-city-id="${escapeHtml(city.id)}">
        <strong>${escapeHtml(city.name)}</strong>
        <button class="btn btn-icon" type="button" data-action="city-up" data-index="${index}" ${index === 0 ? 'disabled' : ''} aria-label="上移 ${escapeHtml(city.name)}">↑</button>
        <button class="btn btn-icon" type="button" data-action="city-down" data-index="${index}" ${index === cities.length - 1 ? 'disabled' : ''} aria-label="下移 ${escapeHtml(city.name)}">↓</button>
      </article>`).join('');
  }

  root.AeroTravelEditor = Object.freeze({ renderWishlist, renderDayNodes, renderCityStops });
})(typeof window !== 'undefined' ? window : globalThis);
```

在 `static/index.html` 中把 `editor.js` 放在 `history.js` 之后、`app.js` 之前。

- [ ] **Step 4: 加入稳定编辑工作台并绑定操作**

在 `results-pane .pane-body` 的现有 `.stack` 前加入：

```html
<div class="plan-mode-bar">
  <div class="segmented" id="planModeGroup" style="--segments:2">
    <button class="is-active" type="button" data-value="browse">浏览</button>
    <button type="button" data-value="edit">编辑</button>
  </div>
</div>
<div class="itinerary-editor" id="itineraryEditor" hidden>
  <aside class="wishlist-panel">
    <div class="row-between"><h3 class="section-label">城市顺序</h3></div>
    <div id="cityStopOrder"></div>
    <div class="row-between"><h3 class="section-label">想去清单</h3><button class="btn btn-icon" id="addWishBtn" type="button" aria-label="添加想去地点">+</button></div>
    <div id="wishlistList"></div>
  </aside>
  <section class="day-editor"><div id="draftDayTabs"></div><div id="draftNodeList"></div></section>
</div>
<div class="draft-action-bar" id="draftActionBar" hidden>
  <span id="draftStatus">没有未应用修改</span>
  <button class="btn btn-ghost" id="undoDraftBtn" type="button">撤销</button>
  <button class="btn btn-ghost" id="redoDraftBtn" type="button">重做</button>
  <button class="btn btn-ghost" id="undoAppliedBtn" type="button" hidden>撤销已应用优化</button>
  <button class="btn btn-ghost" id="saveDraftBtn" type="button">仅保存</button>
  <button class="btn btn-primary" id="optimizeDraftBtn" type="button">智能优化</button>
</div>
<dialog id="constraintDialog" aria-labelledby="constraintDialogTitle">
  <form id="constraintForm">
    <h2 id="constraintDialogTitle">地点约束</h2>
    <label><input id="constraintRequired" type="checkbox"> 必去</label>
    <label><input id="constraintFixedDay" type="checkbox"> 固定日期</label>
    <label><input id="constraintFixedTime" type="checkbox"> 固定时段</label>
    <label>到达时间 <input id="constraintTime" type="time"></label>
    <label><input id="constraintFixedOrder" type="checkbox"> 固定顺序</label>
    <div class="dialog-actions">
      <button class="btn btn-ghost" id="cancelConstraintBtn" type="button">取消</button>
      <button class="btn btn-primary" type="submit">保存约束</button>
    </div>
  </form>
</dialog>
```

`static/app.js` 只通过 `AeroTravelDraftOps` 更新 `state.draftHistory`，随后令 `state.workingDraft = state.draftHistory.present` 并调用 `renderEditor()`。CSS 使用当前左栏宽度内的 `minmax(150px, 0.36fr) minmax(0, 0.64fr)`；900px 以下把想去清单改为抽屉/页签，不把双栏压缩到移动屏。

约束按钮打开原生 `<dialog id="constraintDialog">`，包含四个明确控件：`required` checkbox、`fixed_day` checkbox、`fixed_time` checkbox 加 `input[type=time]`、`fixed_order` checkbox。保存时调用 `updateConstraints(draft, nodeId, constraintPatch, timeInput.value)`，一次 revision 同时写入四个约束和时间窗；取消不修改 draft。跨城市移动时先比较 node `city_id` 与目标日 `primary_city_id`，普通行程用 `window.confirm('该地点属于其他城市，是否将这一天标记为跨城日？')` 明确确认，自驾模式直接允许。跨城状态由当天是否含有 `city_id !== primary_city_id` 的节点实时推导并显示“跨城”标签，不改写地点事实城市，也不增加第二个状态字段。

`static/app.js` 的协调函数保持为：

```javascript
function commitDraft(nextDraft) {
  if (!nextDraft || nextDraft.revision === state.workingDraft.revision) return;
  state.draftHistory = window.AeroTravelHistory.push(state.draftHistory, nextDraft);
  state.workingDraft = state.draftHistory.present;
  state.candidatePlan = null;
  renderEditor();
  renderMap();
}

function renderEditor() {
  if (!state.workingDraft || !state.editMode) return;
  const nodeById = new Map(state.workingDraft.nodes.map(node => [node.id, node]));
  const wishlist = state.workingDraft.nodes.filter(node => node.status === 'wishlist' && node.source !== 'system');
  const day = state.workingDraft.days.find(item => item.day === state.currentDay) || state.workingDraft.days[0];
  el.cityStopOrder.innerHTML = window.AeroTravelEditor.renderCityStops(state.workingDraft.city_stops, escapeHtml);
  el.wishlistList.innerHTML = window.AeroTravelEditor.renderWishlist(wishlist, escapeHtml);
  el.draftNodeList.innerHTML = window.AeroTravelEditor.renderDayNodes(
    (day?.node_ids || []).map(id => nodeById.get(id)).filter(Boolean),
    escapeHtml
  );
  el.itineraryEditor.hidden = false;
  el.draftActionBar.hidden = false;
  el.draftStatus.textContent = `${state.draftHistory.past.length} 处修改尚未应用`;
}

```

想去清单和每日列表使用同一个委托 handler；编辑名称、删除、上移/下移、移动日期和约束 dialog 都只计算参数并调用 `commitDraft()`，不得直接 `splice(state.itinerary...)`：

```javascript
function handleDraftListAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const nodeId = button.dataset.nodeId || button.closest('[data-node-id]')?.dataset.nodeId;
  if (button.dataset.action === 'schedule') {
    const day = state.workingDraft.days.find(item => item.day === state.currentDay);
    commitDraft(window.AeroTravelDraftOps.moveNode(state.workingDraft, nodeId, day.id, day.node_ids.length));
  } else if (button.dataset.action === 'constraints') {
    openConstraintDialog(nodeId);
  } else if (button.dataset.action === 'remove-node') {
    if (window.confirm('从当前草稿删除这个地点？')) {
      commitDraft(window.AeroTravelDraftOps.removeNode(state.workingDraft, nodeId));
    }
  } else if (button.dataset.action === 'edit-node') {
    const node = state.workingDraft.nodes.find(item => item.id === nodeId);
    const name = window.prompt('地点名称', node?.name || '');
    if (name !== null && name.trim()) {
      commitDraft(window.AeroTravelDraftOps.updateNode(state.workingDraft, nodeId, { name }));
    }
  } else if (button.dataset.action === 'move-up' || button.dataset.action === 'move-down') {
    const day = state.workingDraft.days.find(item => item.day === state.currentDay);
    const index = day.node_ids.indexOf(nodeId);
    const target = index + (button.dataset.action === 'move-up' ? -1 : 1);
    if (target >= 0 && target < day.node_ids.length) {
      commitDraft(window.AeroTravelDraftOps.moveNode(state.workingDraft, nodeId, day.id, target));
    }
  }
}

el.wishlistList.addEventListener('click', handleDraftListAction);
el.draftNodeList.addEventListener('click', handleDraftListAction);
el.cityStopOrder.addEventListener('click', event => {
  const button = event.target.closest('[data-action^="city-"]');
  if (!button) return;
  const from = Number(button.dataset.index);
  const to = from + (button.dataset.action === 'city-up' ? -1 : 1);
  commitDraft(window.AeroTravelDraftOps.reorderCityStops(state.workingDraft, from, to));
});
```

`schedule`、`move-day`、拖拽和约束 dialog 分别复用 `moveNode()` / `updateConstraints()`；跨城市移动仍执行上一段定义的确认流程。

约束 dialog 保存一次只产生一个 revision；取消不修改草稿：

```javascript
let editingConstraintNodeId = null;

function openConstraintDialog(nodeId) {
  const node = state.workingDraft.nodes.find(item => item.id === nodeId);
  if (!node) return;
  editingConstraintNodeId = nodeId;
  el.constraintRequired.checked = node.constraints.required;
  el.constraintFixedDay.checked = node.constraints.fixed_day;
  el.constraintFixedDay.disabled = node.status !== 'scheduled';
  el.constraintFixedTime.checked = node.constraints.fixed_time;
  el.constraintTime.value = node.schedule.time_window || '';
  el.constraintTime.disabled = !node.constraints.fixed_time;
  el.constraintFixedOrder.checked = node.constraints.fixed_order;
  el.constraintFixedOrder.disabled = node.status !== 'scheduled';
  el.constraintDialog.showModal();
}

el.constraintFixedTime.addEventListener('change', () => {
  el.constraintTime.disabled = !el.constraintFixedTime.checked;
});
el.constraintForm.addEventListener('submit', event => {
  event.preventDefault();
  const patch = {
    required: el.constraintRequired.checked,
    fixed_day: el.constraintFixedDay.checked,
    fixed_time: el.constraintFixedTime.checked,
    fixed_order: el.constraintFixedOrder.checked
  };
  commitDraft(window.AeroTravelDraftOps.updateConstraints(
    state.workingDraft,
    editingConstraintNodeId,
    patch,
    patch.fixed_time ? el.constraintTime.value : null
  ));
  editingConstraintNodeId = null;
  el.constraintDialog.close();
});
el.cancelConstraintBtn.addEventListener('click', () => {
  editingConstraintNodeId = null;
  el.constraintDialog.close();
});

function restoreDraftHistory(nextHistory) {
  if (nextHistory === state.draftHistory) return;
  state.activeOptimizationController?.abort();
  state.activeRouteController?.abort();
  state.draftHistory = nextHistory;
  state.workingDraft = nextHistory.present;
  state.candidatePlan = null;
  renderEditor();
  renderMap();
}

el.undoDraftBtn.addEventListener('click', () => {
  restoreDraftHistory(window.AeroTravelHistory.undo(state.draftHistory));
});
el.redoDraftBtn.addEventListener('click', () => {
  restoreDraftHistory(window.AeroTravelHistory.redo(state.draftHistory));
});
```

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/frontend/*.test.js`
Expected: all frontend tests PASS。

Run: `node --check static/editor.js && node --check static/app.js`（PowerShell 中分别运行两条命令）
Expected: both exit 0。

```powershell
git add static/editor.js static/index.html static/styles.css static/app.js tests/frontend/editor.test.js
git commit -m "feat: add wishlist and daily itinerary editor"
```

### Task 5: 增加地点搜索、名称解析和地图点选

**Files:**
- Create: `schemas/location.py`
- Modify: `clients/amap.py:7-73`
- Modify: `routers/location.py:1-55`
- Modify: `static/map.js:1-14`
- Modify: `static/app.js` location-add event handlers
- Modify: `static/index.html` add-place dialog
- Test: `tests/clients/test_amap_client.py`
- Test: `tests/routers/test_non_transport_routes.py`

- [ ] **Step 1: 写反向地理编码解析和路由失败测试**

```python
# tests/clients/test_amap_client.py
from clients.amap import parse_reverse_geocode


class AmapReverseGeocodeTests(unittest.TestCase):
    def test_parse_reverse_geocode_normalizes_address_component(self):
        data = {
            "status": "1",
            "regeocode": {
                "formatted_address": "浙江省杭州市西湖区文三路",
                "addressComponent": {"city": "杭州市", "district": "西湖区"},
                "pois": [{"id": "B001", "name": "文三路", "location": "120.12,30.28"}],
            },
        }
        result = parse_reverse_geocode(data, 30.28, 120.12)
        self.assertEqual(result, {
            "provider_id": "B001", "name": "文三路", "city": "杭州市",
            "address": "浙江省杭州市西湖区文三路", "lat": 30.28, "lng": 120.12,
        })


class AmapPoiIdentityTests(unittest.TestCase):
    def test_parse_amap_pois_exposes_additive_provider_identity(self):
        result = parse_amap_pois({
            "pois": [{"id": "B001", "name": "西湖", "cityname": "杭州市", "location": "120.15,30.25"}],
        })
        self.assertEqual(result[0]["provider_id"], "B001")
        self.assertEqual(result[0]["city"], "杭州市")
```

```python
class NonTransportRouteTests(unittest.TestCase):
    def test_reverse_geocode_route_delegates_to_amap(self):
        app = FastAPI()
        app.include_router(create_location_router(fake_settings(), logger=None))

        async def fake_reverse(*_args, **_kwargs):
            return {
                "status": "ok",
                "place": {
                    "provider_id": "B001", "name": "文三路", "city": "杭州市",
                    "address": "浙江省杭州市西湖区文三路", "lat": 30.28, "lng": 120.12,
                },
            }

        with patch("routers.location.amap_reverse_geocode", fake_reverse):
            response = TestClient(app).get("/api/reverse_geocode", params={"lat": 30.28, "lng": 120.12})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["place"]["name"], "文三路")

    def test_reverse_geocode_rejects_invalid_coordinates_with_stable_code(self):
        app = FastAPI()
        app.include_router(create_location_router(fake_settings(), logger=None))
        response = TestClient(app).get("/api/reverse_geocode", params={"lat": 91, "lng": 120.12})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "invalid_coordinates")
```

- [ ] **Step 2: 运行测试并确认导入失败**

Run: `python -m unittest discover -s tests/clients -p "test_amap_client.py" -v`
Expected: FAIL，无法导入 `parse_reverse_geocode`。

- [ ] **Step 3: 实现高德反向地理编码客户端**

```python
# clients/amap.py
AMAP_REVERSE_GEOCODE_URL = "https://restapi.amap.com/v3/geocode/regeo"


def parse_reverse_geocode(data: dict, lat: float, lng: float) -> dict:
    if data.get("status") != "1" or not isinstance(data.get("regeocode"), dict):
        raise ValueError("高德反向地理编码返回无效")
    regeocode = data["regeocode"]
    component = regeocode.get("addressComponent") or {}
    city_value = component.get("city") or component.get("province") or ""
    city = city_value[0] if isinstance(city_value, list) and city_value else city_value
    pois = regeocode.get("pois") or []
    poi = pois[0] if pois and isinstance(pois[0], dict) else {}
    return {
        "provider_id": poi.get("id") or None,
        "name": poi.get("name") or regeocode.get("formatted_address") or "地图选点",
        "city": city,
        "address": regeocode.get("formatted_address", ""),
        "lat": lat,
        "lng": lng,
    }


async def reverse_geocode(amap_key: str, lat: float, lng: float) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            AMAP_REVERSE_GEOCODE_URL,
            params={"key": amap_key, "location": f"{lng},{lat}", "extensions": "all"},
        )
    if response.status_code != 200:
        raise RuntimeError(f"高德 API 请求失败: {response.status_code}")
    return {"status": "ok", "place": parse_reverse_geocode(response.json(), lat, lng)}
```

同一步创建独立位置响应模型，避免里程碑 A 依赖 Task 7 才出现的草稿模型：

```python
# schemas/location.py
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ReverseGeocodePlace(StrictModel):
    provider_id: str | None = None
    name: str = Field(min_length=1, max_length=200)
    city: str = Field(max_length=200)
    address: str = Field(max_length=500)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class ReverseGeocodeResponse(StrictModel):
    status: Literal["ok"]
    place: ReverseGeocodePlace
```

同一任务给现有 `parse_amap_pois()` 的归一化结果增加两个可选字段，不删除或改名任何现有字段：

```python
"provider_id": poi.get("id") or None,
"city": poi.get("cityname", ""),
```

这样搜索、地图点选和名称解析都可以进入同一个 `addPlaceToWishlist()` 输入契约。

- [ ] **Step 4: 注册安全路由并接入三种前端入口**

`routers/location.py` 导入别名 `reverse_geocode as amap_reverse_geocode` 和 `schemas.location.ReverseGeocodeResponse`，并在 factory 中加入：

```python
@router.get("/api/reverse_geocode", response_model=ReverseGeocodeResponse)
async def reverse_geocode(lat: float, lng: float):
    if not settings.amap_key:
        raise HTTPException(
            status_code=400,
            detail={"code": "amap_not_configured", "message": "未配置高德地图 Key (AMAP_KEY)"},
        )
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_coordinates", "message": "经纬度超出有效范围"},
        )
    try:
        return await amap_reverse_geocode(settings.amap_key, lat, lng)
    except Exception as exc:
        _log_warning(logger, "reverse_geocode_failed", error_type=exc.__class__.__name__)
        raise HTTPException(
            status_code=502,
            detail={"code": "reverse_geocode_unavailable", "message": "地点解析暂不可用"},
        ) from exc
```

`static/index.html` 增加一个地点对话框，三种入口共享同一个名称输入和结果区：

```html
<dialog id="addPlaceDialog" aria-labelledby="addPlaceTitle">
  <form id="addPlaceSearchForm">
    <h2 id="addPlaceTitle">添加想去地点</h2>
    <label>地点名称 <input id="addPlaceQuery" type="search" maxlength="100" required></label>
    <div class="dialog-actions">
      <button class="btn btn-primary" type="submit">搜索地点</button>
      <button class="btn btn-ghost" id="usePlaceNameBtn" type="button">先按名称添加</button>
      <button class="btn btn-ghost" id="pickPlaceOnMapBtn" type="button">在地图上选点</button>
    </div>
    <div id="addPlaceResults" role="listbox" aria-label="地点搜索结果"></div>
    <button class="btn btn-ghost" id="closeAddPlaceBtn" type="button">关闭</button>
  </form>
</dialog>
```

`static/map.js` 增加一次性拾取器：

```javascript
function enablePointPicker(map, onPick) {
  const container = map.getContainer();
  container.classList.add('is-picking-point');
  function handleClick(event) {
    container.classList.remove('is-picking-point');
    map.off('click', handleClick);
    onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
  }
  map.on('click', handleClick);
  return () => {
    container.classList.remove('is-picking-point');
    map.off('click', handleClick);
  };
}
```

把 `enablePointPicker` 加入 `window.AeroTravelMap`。`static/app.js` 的添加地点对话框统一把搜索结果、文本解析结果和地图结果传给 `AeroTravelDraftOps.addNode()`；三种用户来源分别使用 `amap_search`、`manual`、`map_pick`，默认必去。所有返回 metadata 在 HTML 插入前继续经过 `escapeHtml()` / `cleanMetaValue()`。

```javascript
function addPlaceToWishlist(place, source) {
  const city = state.workingDraft.city_stops.find(item => item.name === cleanMetaValue(place.city))
    || state.workingDraft.city_stops.find(item => item.id === state.workingDraft.days.find(day => day.day === state.currentDay)?.primary_city_id);
  const nextDraft = window.AeroTravelDraftOps.addNode(state.workingDraft, {
    source,
    provider_id: cleanMetaValue(place.provider_id),
    name: cleanMetaValue(place.name),
    city_id: city?.id || '',
    city: cleanMetaValue(place.city) || city?.name || '',
    lat: Number(place.lat) || 0,
    lng: Number(place.lng) || 0,
    metadata: {
      address: cleanMetaValue(place.address), rating: cleanMetaValue(place.rating),
      tel: cleanMetaValue(place.tel), opentime: cleanMetaValue(place.opentime)
    }
  });
  commitDraft(nextDraft);
}

async function addMapPoint(point) {
  try {
    const data = await fetchJson(`/api/reverse_geocode?lat=${encodeURIComponent(point.lat)}&lng=${encodeURIComponent(point.lng)}`);
    addPlaceToWishlist(data.place, 'map_pick');
  } catch (_) {
    addPlaceToWishlist({ name: '地图选点', lat: point.lat, lng: point.lng, city: '' }, 'map_pick');
    showToast('地点名称暂未解析，可稍后编辑名称。', 'error');
  }
}
```

名称搜索和纯名称降级按当前日期的主城市执行；搜索结果只通过 `textContent` 或转义后的模板写入：

```javascript
el.addPlaceSearchForm.addEventListener('submit', async event => {
  event.preventDefault();
  const query = el.addPlaceQuery.value.trim();
  const day = state.workingDraft.days.find(item => item.day === state.currentDay);
  const city = state.workingDraft.city_stops.find(item => item.id === day?.primary_city_id)?.name || '';
  const data = await fetchJson(`/api/search_pois?city=${encodeURIComponent(city)}&keywords=${encodeURIComponent(query)}&count=10`);
  el.addPlaceResults.innerHTML = (data.pois || []).map((place, index) => `
    <button type="button" role="option" data-place-index="${index}">
      <strong>${escapeHtml(cleanMetaValue(place.name))}</strong>
      <small>${escapeHtml(cleanMetaValue(place.address))}</small>
    </button>`).join('');
  el.addPlaceResults.onclick = resultEvent => {
    const button = resultEvent.target.closest('[data-place-index]');
    if (!button) return;
    addPlaceToWishlist(data.pois[Number(button.dataset.placeIndex)], 'amap_search');
    el.addPlaceDialog.close();
  };
});

el.usePlaceNameBtn.addEventListener('click', () => {
  const name = el.addPlaceQuery.value.trim();
  if (!name) return;
  addPlaceToWishlist({ name }, 'manual');
  el.addPlaceDialog.close();
});

el.pickPlaceOnMapBtn.addEventListener('click', () => {
  el.addPlaceDialog.close();
  state.cancelPointPicker?.();
  state.cancelPointPicker = window.AeroTravelMap.enablePointPicker(map, addMapPoint);
});
```

使用 Task 1 已加入的 `cancelPointPicker: null`；关闭对话框或重新进入点选时先调用旧 cancel 函数，避免累积地图 click handler。

- [ ] **Step 5: 验证并提交**

Run: `python -m unittest discover -s tests/clients -p "test_amap_client.py" -v`
Expected: PASS。

Run: `python -m unittest discover -s tests/routers -p "test_non_transport_routes.py" -v`
Expected: PASS including reverse-geocode route。

```powershell
git add schemas/location.py clients/amap.py routers/location.py static/map.js static/app.js static/index.html tests/clients/test_amap_client.py tests/routers/test_non_transport_routes.py
git commit -m "feat: add resolvable wishlist locations"
```

### Task 6: 完成“仅保存”、地图草稿预览和里程碑 A 验证

**Files:**
- Modify: `static/app.js:748-812,986-1026,1383-1567`
- Modify: `static/map.js`
- Modify: `static/styles.css`
- Modify: `docs/smoke-checklist.md`
- Modify: `IMPLEMENTATION.md`
- Test: `tests/frontend/draft.test.js`

- [ ] **Step 1: 增加只保存不重排的回归测试**

```javascript
// tests/frontend/draft.test.js
test('draftToItinerary changes only the edited day order', () => {
  const twoDay = {
    title: '杭州',
    days: [
      { day: 1, city: '杭州', items: [{ id: 'a', type: 'experience', title: 'A', city: '杭州' }, { id: 'b', type: 'experience', title: 'B', city: '杭州' }] },
      { day: 2, city: '杭州', items: [{ id: 'c', type: 'experience', title: 'C', city: '杭州' }] }
    ]
  };
  const draft = itineraryToDraft(twoDay, [{ name: '杭州', days: 2 }], { seed: 'stable' });
  draft.days[0].node_ids.reverse();
  const result = draftToItinerary(draft, twoDay);
  assert.deepEqual(result.days[0].items.map(item => item.title), ['B', 'A']);
  assert.deepEqual(result.days[1].items.map(item => item.title), ['C']);
});

test('draftToItinerary never keeps stale transport segments after city reordering', () => {
  const plan = {
    title: '三城行程', days: [],
    transport_guide: [
      { segment: 'A → C', options: [{ id: 'old-1' }] },
      { segment: 'C → B', options: [{ id: 'old-2' }] }
    ]
  };
  const draft = itineraryToDraft(plan, [
    { name: 'A', days: 1 }, { name: 'B', days: 1 }, { name: 'C', days: 1 }
  ], { seed: 'cities' });
  const result = draftToItinerary(draft, plan);
  assert.deepEqual(result.transport_guide.map(segment => segment.segment), ['A → B', 'B → C']);
  assert.ok(result.transport_guide.every(segment => segment.data_source === 'unavailable'));
});
```

- [ ] **Step 2: 运行测试并确认当前转换器行为**

Run: `node --test tests/frontend/draft.test.js`
Expected: PASS；若失败，先修复转换器，禁止在 app 层补数组索引逻辑。

- [ ] **Step 3: 实现仅保存和质量警告**

`saveDraftBtn` 点击流程必须严格为：

```javascript
function applyWorkingDraft() {
  const errors = window.AeroTravelDraftOps.validateStructure(state.workingDraft);
  if (errors.length) {
    showToast('行程结构存在错误，请先处理重复或失效节点。', 'error');
    return;
  }
  const nextItinerary = draftToItinerary(state.workingDraft, state.itinerary);
  const hasScheduleWarnings = nextItinerary.days.some(day => checkDayConflicts(day).size > 0)
    || buildLocalQualityChecks(nextItinerary).some(item => item.level === 'error');
  if (hasScheduleWarnings && !window.confirm('当前安排仍有时间或城市冲突，是否按手工顺序保存？')) return;
  state.itinerary = nextItinerary;
  state.cities = draftToCities(state.workingDraft);
  state.totalDays = computeTotalDays();
  refreshQualityChecks();
  saveTripSnapshot();
  state.draftHistory = window.AeroTravelHistory.createHistory(state.workingDraft, 50);
  renderAll();
  showToast('已按当前顺序保存，没有自动重排行程。', 'success');
}
```

复制、长图和 ICS 继续读取 `state.itinerary`。编辑模式中的地图通过 `draftToItinerary(state.workingDraft, state.itinerary)` 生成临时预览，但不得覆盖 `state.itinerary`。

- [ ] **Step 4: 完成地图和移动端行为**

`static/map.js` 增加独立的已安排、未安排 marker layer；未安排点使用空心状态，待定位点不创建 marker。移动端想去清单通过页签/抽屉打开，节点操作必须同时支持上移、下移和移动到日期，不把 HTML5 drag 作为唯一入口。更新 `docs/smoke-checklist.md`，加入添加地点、跨天移动、四种约束、仅保存、撤销和刷新恢复。

- [ ] **Step 5: 运行里程碑 A 质量门并提交**

Run: `.\scripts\check.ps1`
Expected: compile、Ruff、Mypy、Python tests、Node syntax 和 frontend tests 全部通过。

Browser smoke at `http://localhost:8000/static/index.html`:

- 页面与初始行程加载，控制台无 error/warning。
- 搜索、名称输入和地图点选均进入想去清单。
- 跨天移动后选择仅保存，未编辑日期逐项不变。
- 刷新并恢复快照后，想去清单和约束仍存在。
- 390x844 和 1440x900 视口不重叠，地图非空。

```powershell
git add static/app.js static/map.js static/styles.css docs/smoke-checklist.md IMPLEMENTATION.md tests/frontend/draft.test.js
git commit -m "feat: ship editable itinerary core"
```

## 里程碑 B：约束式局部优化

### Task 7: 定义后端草稿模型与硬约束校验器

**Files:**
- Create: `schemas/draft.py`
- Create: `planner/constraints.py`
- Create: `tests/planner/test_constraints.py`
- Modify: `schemas/__init__.py`

- [ ] **Step 1: 写硬约束失败测试**

```python
# tests/planner/test_constraints.py
import unittest

from planner.constraints import validate_constraints
from schemas.draft import TripDraft


def make_draft(**overrides) -> TripDraft:
    payload = {
        "schema_version": 2,
        "id": "trip-1",
        "revision": 3,
        "mode": "itinerary",
        "route_shape": "one_way",
        "strategy": "balanced",
        "city_stops": [{"id": "city-hz", "name": "杭州", "days": 1}],
        "nodes": [{
            "id": "n1", "source": "manual", "name": "西湖", "city_id": "city-hz", "city": "杭州",
            "location": {"lat": 30.25, "lng": 120.15, "status": "resolved"},
            "status": "scheduled", "schedule": {"day_id": "day-1", "time_window": "09:00"},
            "constraints": {"required": True, "fixed_day": True, "fixed_time": True, "fixed_order": False},
        }],
        "days": [{"id": "day-1", "day": 1, "primary_city_id": "city-hz", "node_ids": ["n1"]}],
    }
    payload.update(overrides)
    return TripDraft.model_validate(payload)


class ConstraintValidationTests(unittest.TestCase):
    def test_rejects_duplicate_nodes_and_invalid_fixed_day(self):
        draft = make_draft()
        draft.days[0].node_ids = ["n1", "n1"]
        draft.nodes[0].schedule.day_id = "missing-day"
        codes = [item["code"] for item in validate_constraints(draft)]
        self.assertEqual(codes, ["duplicate_node", "fixed_day_mismatch"])

    def test_required_unresolved_wishlist_is_warning_not_deletion(self):
        draft = make_draft()
        draft.days[0].node_ids = []
        draft.nodes[0].status = "wishlist"
        draft.nodes[0].schedule.day_id = None
        draft.nodes[0].location.status = "unresolved"
        violations = validate_constraints(draft)
        self.assertEqual(violations, [])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 运行测试并确认导入失败**

Run: `python -m unittest discover -s tests/planner -p "test_constraints.py" -v`
Expected: FAIL，无法导入 `planner.constraints` 或 `schemas.draft`。

- [ ] **Step 3: 实现严格 Pydantic v2 模型**

```python
# schemas/draft.py
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PlaceLocation(StrictModel):
    lat: float = Field(default=0, ge=-90, le=90)
    lng: float = Field(default=0, ge=-180, le=180)
    status: Literal["resolved", "unresolved"] = "unresolved"


class NodeSchedule(StrictModel):
    day_id: str | None = None
    time_window: str | None = None


class NodeConstraints(StrictModel):
    required: bool = False
    fixed_day: bool = False
    fixed_time: bool = False
    fixed_order: bool = False


class PlaceNode(StrictModel):
    id: str
    source: str = Field(max_length=50)
    provider_id: str | None = Field(default=None, max_length=200)
    name: str = Field(min_length=1, max_length=200)
    city_id: str
    city: str = Field(max_length=200)
    location: PlaceLocation = Field(default_factory=PlaceLocation)
    status: Literal["wishlist", "scheduled", "removed"] = "wishlist"
    duration_minutes: int = Field(default=120, ge=0, le=1440)
    schedule: NodeSchedule = Field(default_factory=NodeSchedule)
    constraints: NodeConstraints = Field(default_factory=NodeConstraints)
    manual_rank: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict, max_length=30)


class CityStop(StrictModel):
    id: str
    name: str = Field(min_length=1, max_length=200)
    days: int = Field(default=1, ge=1, le=15)
    transport: str = "auto"
    fixed_order: bool = False


class DayDraft(StrictModel):
    id: str
    day: int = Field(ge=1, le=60)
    date: str | None = None
    primary_city_id: str
    node_ids: list[str] = Field(default_factory=list, max_length=200)
    max_driving_minutes: int | None = Field(default=None, ge=30, le=900)


class TripDraft(StrictModel):
    schema_version: Literal[2]
    id: str
    revision: int = Field(ge=0)
    mode: Literal["itinerary", "self_drive"]
    route_shape: Literal["one_way", "round_trip"]
    strategy: Literal["efficient", "balanced", "experience"]
    start_date: str = ""
    city_stops: list[CityStop] = Field(default_factory=list, max_length=20)
    nodes: list[PlaceNode] = Field(default_factory=list, max_length=200)
    days: list[DayDraft] = Field(default_factory=list, max_length=60)
    route: dict[str, Any] | None = Field(default=None, max_length=30)


class OptimizeScope(StrictModel):
    type: Literal["day", "city", "trip"]
    id: str | None = None


class OptimizeRequest(StrictModel):
    base_revision: int = Field(ge=0)
    scope: OptimizeScope
    draft: TripDraft


class DrivingRouteRequest(StrictModel):
    route_shape: Literal["one_way", "round_trip"]
    nodes: list[PlaceNode] = Field(min_length=2, max_length=20)


class ApiWarning(StrictModel):
    code: str
    message: str
    node_id: str | None = None
    day_id: str | None = None
    from_node_id: str | None = None
    to_node_id: str | None = None


class ChangePosition(StrictModel):
    day_id: str | None = None
    index: int | None = None
    route_index: int | None = None


class CandidateDiff(StrictModel):
    type: Literal["add", "move", "remove", "update"]
    node_id: str
    node_name: str
    from_position: ChangePosition | None = Field(default=None, alias="from")
    to_position: ChangePosition | None = Field(default=None, alias="to")
    reason: str


class OptimizeResponse(StrictModel):
    base_revision: int
    candidate: TripDraft
    diff: list[CandidateDiff] = Field(default_factory=list)
    warnings: list[ApiWarning] = Field(default_factory=list)
    data_sources: list[str] = Field(default_factory=list)


class DrivingSegment(StrictModel):
    from_node_id: str
    to_node_id: str
    status: Literal["provider", "estimate", "unavailable"]
    distance_meters: int | None = Field(default=None, ge=0)
    duration_seconds: int | None = Field(default=None, ge=0)
    tolls_yuan: float | None = Field(default=None, ge=0)
    polyline: list[list[float]] = Field(default_factory=list)


class DrivingTotals(StrictModel):
    distance_meters: int | None = Field(ge=0)
    duration_seconds: int | None = Field(ge=0)
    tolls_yuan: float | None = Field(ge=0)


class DrivingRouteResponse(StrictModel):
    source: Literal["amap", "estimate", "partial"]
    status: Literal["provider", "estimate", "unavailable"]
    route_shape: Literal["one_way", "round_trip"]
    ordered_node_ids: list[str]
    segments: list[DrivingSegment]
    totals: DrivingTotals
    polyline: list[list[float]]
    warnings: list[ApiWarning]
    fetched_at: datetime


```

- [ ] **Step 4: 实现结构与硬约束校验**

```python
# planner/constraints.py
from schemas.draft import TripDraft


def validate_constraints(draft: TripDraft) -> list[dict]:
    violations: list[dict] = []
    day_ids = {day.id for day in draft.days}
    city_ids = {city.id for city in draft.city_stops}
    known_nodes = {node.id for node in draft.nodes}
    route_ids = list((draft.route or {}).get("ordered_node_ids") or [])
    seen: set[str] = set()

    for day in draft.days:
        if day.primary_city_id not in city_ids:
            violations.append({"code": "unknown_city", "day_id": day.id, "city_id": day.primary_city_id})
        for node_id in day.node_ids:
            if node_id not in known_nodes:
                violations.append({"code": "unknown_node", "day_id": day.id, "node_id": node_id})
            elif node_id in seen:
                violations.append({"code": "duplicate_node", "day_id": day.id, "node_id": node_id})
            seen.add(node_id)

    scheduled_day = {node_id: day.id for day in draft.days for node_id in day.node_ids}
    for node in draft.nodes:
        if node.status == "removed" and node.constraints.required:
            violations.append({"code": "required_node_removed", "node_id": node.id})
        if (
            draft.mode == "self_drive"
            and node.status == "scheduled"
            and node.constraints.required
            and node.id not in route_ids
        ):
            violations.append({"code": "required_route_node_missing", "node_id": node.id})
        if node.constraints.fixed_day and (
            not node.schedule.day_id
            or node.schedule.day_id not in day_ids
            or scheduled_day.get(node.id) != node.schedule.day_id
        ):
            violations.append({"code": "fixed_day_mismatch", "node_id": node.id, "day_id": node.schedule.day_id})
        if node.constraints.fixed_time and not node.schedule.time_window:
            violations.append({"code": "fixed_time_missing", "node_id": node.id})
        if (
            node.constraints.fixed_order
            and draft.mode == "itinerary"
            and node.status == "scheduled"
            and node.id not in scheduled_day
        ):
            violations.append({"code": "fixed_order_unscheduled", "node_id": node.id})
        if node.constraints.fixed_order and draft.mode == "self_drive" and node.id not in route_ids:
            violations.append({"code": "fixed_order_route_missing", "node_id": node.id})

    if draft.mode == "self_drive":
        if not draft.days:
            violations.append({"code": "missing_route_days"})
        if len(route_ids) < 2:
            violations.append({"code": "insufficient_route_nodes"})
        route_seen: set[str] = set()
        for node_id in route_ids:
            if node_id not in known_nodes:
                violations.append({"code": "unknown_route_node", "node_id": node_id})
            elif node_id in route_seen:
                violations.append({"code": "duplicate_route_node", "node_id": node_id})
            route_seen.add(node_id)

    return violations
```

保持错误顺序稳定：先按日期扫描结构，再按 `draft.nodes` 原顺序扫描约束。不要使用 set 迭代生成响应。

- [ ] **Step 5: 验证并提交**

Run: `python -m unittest discover -s tests/planner -p "test_constraints.py" -v`
Expected: 2 tests PASS。

Run: `python -m compileall schemas/draft.py planner/constraints.py`
Expected: exit 0。

```powershell
git add schemas/draft.py schemas/__init__.py planner/constraints.py tests/planner/test_constraints.py
git commit -m "feat: validate itinerary draft constraints"
```

### Task 8: 实现确定性的普通行程局部优化与 diff

**Files:**
- Create: `planner/draft_optimizer.py`
- Create: `tests/planner/test_draft_optimizer.py`
- Modify: `planner/__init__.py`

- [ ] **Step 1: 写作用范围、锁定锚点和 diff 失败测试**

```python
# tests/planner/test_draft_optimizer.py
import unittest

from planner.draft_optimizer import build_diff, optimize_itinerary
from schemas.draft import CityStop, DayDraft, OptimizeScope, TripDraft


def make_optimizer_draft() -> TripDraft:
    coords = {"a": (30.0, 120.0), "b": (30.01, 120.01), "c": (31.0, 121.0), "d": (32.0, 122.0)}
    return TripDraft.model_validate({
        "schema_version": 2, "id": "trip-1", "revision": 1, "mode": "itinerary",
        "route_shape": "one_way", "strategy": "balanced",
        "city_stops": [{"id": "city-hz", "name": "杭州", "days": 2}],
        "nodes": [{
            "id": node_id, "source": "ai", "name": node_id, "city_id": "city-hz", "city": "杭州",
            "location": {"lat": lat, "lng": lng, "status": "resolved"}, "status": "scheduled",
            "schedule": {"day_id": "day-1" if node_id != "d" else "day-2"},
        } for node_id, (lat, lng) in coords.items()],
        "days": [
            {"id": "day-1", "day": 1, "primary_city_id": "city-hz", "node_ids": ["a", "c", "b"]},
            {"id": "day-2", "day": 2, "primary_city_id": "city-hz", "node_ids": ["d"]},
        ],
    })


class DraftOptimizerTests(unittest.TestCase):
    def test_day_scope_reorders_only_unlocked_nodes_in_that_day(self):
        draft = make_optimizer_draft()
        candidate = optimize_itinerary(draft, OptimizeScope(type="day", id="day-1"))
        self.assertEqual(candidate.days[0].node_ids, ["a", "b", "c"])
        self.assertEqual(candidate.days[1].node_ids, ["d"])
        self.assertEqual(build_diff(draft, candidate)[0]["type"], "move")

    def test_fixed_order_node_keeps_its_exact_index(self):
        draft = make_optimizer_draft()
        next(node for node in draft.nodes if node.id == "c").constraints.fixed_order = True
        candidate = optimize_itinerary(draft, OptimizeScope(type="day", id="day-1"))
        self.assertEqual(candidate.days[0].node_ids.index("c"), 1)

    def test_fixed_time_node_is_an_order_anchor_without_rescheduling(self):
        draft = make_optimizer_draft()
        node = next(node for node in draft.nodes if node.id == "c")
        node.constraints.fixed_time = True
        node.schedule.time_window = "10:30"
        candidate = optimize_itinerary(draft, OptimizeScope(type="day", id="day-1"))
        self.assertEqual(candidate.days[0].node_ids.index("c"), 1)
        self.assertEqual(next(item for item in candidate.nodes if item.id == "c").schedule.time_window, "10:30")

    def test_build_diff_reports_self_drive_route_moves(self):
        draft = make_optimizer_draft()
        draft.mode = "self_drive"
        draft.route = {"ordered_node_ids": ["a", "b", "c"]}
        candidate = draft.model_copy(deep=True)
        candidate.route = {"ordered_node_ids": ["a", "c", "b"]}
        self.assertEqual([item["node_id"] for item in build_diff(draft, candidate)], ["b", "c"])

    def test_trip_scope_reorders_unlocked_city_blocks_and_reports_diff(self):
        draft = make_optimizer_draft()
        draft.city_stops = [CityStop.model_validate(item) for item in [
            {"id": "city-a", "name": "A", "days": 1},
            {"id": "city-c", "name": "C", "days": 1},
            {"id": "city-b", "name": "B", "days": 1},
        ]]
        draft.days = [DayDraft.model_validate(item) for item in [
            {"id": "day-a", "day": 1, "primary_city_id": "city-a", "node_ids": ["a"]},
            {"id": "day-c", "day": 2, "primary_city_id": "city-c", "node_ids": ["c"]},
            {"id": "day-b", "day": 3, "primary_city_id": "city-b", "node_ids": ["b"]},
        ]]
        for node_id, city_id in {"a": "city-a", "b": "city-b", "c": "city-c"}.items():
            node = next(item for item in draft.nodes if item.id == node_id)
            node.city_id = city_id
            node.schedule.day_id = f"day-{node_id}"
        candidate = optimize_itinerary(draft, OptimizeScope(type="trip"))
        self.assertEqual([city.id for city in candidate.city_stops], ["city-a", "city-b", "city-c"])
        self.assertEqual([day.id for day in candidate.days], ["day-a", "day-b", "day-c"])
        self.assertIn("city-b", [item["node_id"] for item in build_diff(draft, candidate)])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 运行测试并确认导入失败**

Run: `python -m unittest discover -s tests/planner -p "test_draft_optimizer.py" -v`
Expected: FAIL，无法导入 `planner.draft_optimizer`。

- [ ] **Step 3: 实现锚点之间的最近邻排序**

```python
# planner/draft_optimizer.py
from planner.transport import haversine_km
from schemas.draft import DayDraft, OptimizeScope, PlaceNode, TripDraft


def _distance(a: PlaceNode, b: PlaceNode) -> float:
    return haversine_km(
        {"lat": a.location.lat, "lng": a.location.lng},
        {"lat": b.location.lat, "lng": b.location.lng},
    )


def _greedy_block(node_ids: list[str], nodes: dict[str, PlaceNode], start_id: str | None) -> list[str]:
    remaining = [node_id for node_id in node_ids if nodes[node_id].location.status == "resolved"]
    unresolved = [node_id for node_id in node_ids if nodes[node_id].location.status != "resolved"]
    if not remaining:
        return node_ids
    ordered: list[str] = []
    if start_id and start_id in nodes and nodes[start_id].location.status == "resolved":
        current = nodes[start_id]
    else:
        first = remaining.pop(0)
        ordered.append(first)
        current = nodes[first]
    while remaining:
        next_id = min(remaining, key=lambda node_id: (_distance(current, nodes[node_id]), node_ids.index(node_id)))
        remaining.remove(next_id)
        ordered.append(next_id)
        current = nodes[next_id]
    return ordered + unresolved


def _optimize_day(day: DayDraft, nodes: dict[str, PlaceNode]) -> list[str]:
    order = list(day.node_ids)
    locked_indexes = [
        index for index, node_id in enumerate(order)
        if nodes[node_id].constraints.fixed_order
        or nodes[node_id].constraints.fixed_time
        or nodes[node_id].source == "system"
    ]
    boundaries = [-1, *locked_indexes, len(order)]
    result = list(order)
    for left, right in zip(boundaries, boundaries[1:]):
        block = order[left + 1:right]
        start_id = order[left] if left >= 0 else None
        result[left + 1:right] = _greedy_block(block, nodes, start_id)
    return result


def _city_center(city_id: str, nodes: dict[str, PlaceNode]) -> dict | None:
    located = [
        node for node in nodes.values()
        if node.city_id == city_id and node.status == "scheduled" and node.location.status == "resolved"
    ]
    if not located:
        return None
    return {
        "lat": sum(node.location.lat for node in located) / len(located),
        "lng": sum(node.location.lng for node in located) / len(located),
    }


def _city_distance(a: str, b: str, centers: dict[str, dict | None]) -> float:
    left, right = centers.get(a), centers.get(b)
    if left is None or right is None:
        return float("inf")
    return haversine_km(left, right)


def _optimize_city_blocks(candidate: TripDraft, nodes: dict[str, PlaceNode]) -> None:
    if len(candidate.city_stops) < 3 or any(node.constraints.fixed_day for node in nodes.values()):
        return
    original = [city.id for city in candidate.city_stops]
    centers = {city_id: _city_center(city_id, nodes) for city_id in original}
    locked = {0, *(
        index for index, city in enumerate(candidate.city_stops)
        if city.fixed_order or centers[city.id] is None
    )}
    order = list(original)
    boundaries = sorted({0, *locked, len(original)})
    for left, right in zip(boundaries, boundaries[1:]):
        remaining = list(original[left + 1:right])
        current = original[left]
        if centers[current] is None:
            continue
        block: list[str] = []
        while remaining:
            next_id = min(remaining, key=lambda city_id: (
                _city_distance(current, city_id, centers), original.index(city_id)
            ))
            remaining.remove(next_id)
            block.append(next_id)
            current = next_id
        order[left + 1:right] = block
    city_by_id = {city.id: city for city in candidate.city_stops}
    candidate.city_stops = [city_by_id[city_id] for city_id in order]
    rank = {city_id: index for index, city_id in enumerate(order)}
    old_day_rank = {day.id: index for index, day in enumerate(candidate.days)}
    chronological_dates = [day.date for day in candidate.days]
    candidate.days.sort(key=lambda day: (rank.get(day.primary_city_id, len(rank)), old_day_rank[day.id]))
    for index, day in enumerate(candidate.days):
        day.day = index + 1
        day.date = chronological_dates[index]


def optimize_itinerary(draft: TripDraft, scope: OptimizeScope) -> TripDraft:
    candidate = draft.model_copy(deep=True)
    node_by_id = {node.id: node for node in candidate.nodes}
    if scope.type == "trip":
        _optimize_city_blocks(candidate, node_by_id)
    allowed_days = {
        day.id for day in candidate.days
        if scope.type == "trip"
        or (scope.type == "day" and day.id == scope.id)
        or (scope.type == "city" and day.primary_city_id == scope.id)
    }
    for day in candidate.days:
        if day.id in allowed_days:
            day.node_ids = _optimize_day(day, node_by_id)
    candidate.revision = draft.revision + 1
    return candidate
```

- [ ] **Step 4: 实现稳定候选差异**

```python
def build_diff(before: TripDraft, after: TripDraft) -> list[dict]:
    before_pos = {
        node_id: {"day_id": day.id, "index": index}
        for day in before.days for index, node_id in enumerate(day.node_ids)
    }
    after_pos = {
        node_id: {"day_id": day.id, "index": index}
        for day in after.days for index, node_id in enumerate(day.node_ids)
    }
    node_name = {node.id: node.name for node in [*before.nodes, *after.nodes]}
    changes = []
    for node in before.nodes:
        old, new = before_pos.get(node.id), after_pos.get(node.id)
        if old and not new:
            changes.append({"type": "remove", "node_id": node.id, "node_name": node_name[node.id], "from": old, "to": None, "reason": "候选方案移除可选节点"})
        elif old != new:
            changes.append({"type": "move", "node_id": node.id, "node_name": node_name[node.id], "from": old, "to": new, "reason": "减少折返并平衡当日顺序"})
    for node in after.nodes:
        if node.id not in {item.id for item in before.nodes}:
            changes.append({"type": "add", "node_id": node.id, "node_name": node_name[node.id], "from": None, "to": after_pos.get(node.id), "reason": "加入候选日程"})
    if before.mode == "self_drive":
        old_route = list((before.route or {}).get("ordered_node_ids") or [])
        new_route = list((after.route or {}).get("ordered_node_ids") or [])
        for node_id in old_route:
            if node_id in new_route and old_route.index(node_id) != new_route.index(node_id):
                changes.append({
                    "type": "move", "node_id": node_id, "node_name": node_name.get(node_id, node_id),
                    "from": {"route_index": old_route.index(node_id)},
                    "to": {"route_index": new_route.index(node_id)},
                    "reason": "调整自驾主路线以减少折返",
                })
    if before.mode != "self_drive":
        before_city_pos = {city.id: index for index, city in enumerate(before.city_stops)}
        after_city_pos = {city.id: index for index, city in enumerate(after.city_stops)}
        for city in before.city_stops:
            if city.id in after_city_pos and before_city_pos[city.id] != after_city_pos[city.id]:
                changes.append({
                    "type": "move", "node_id": city.id, "node_name": city.name,
                    "from": {"route_index": before_city_pos[city.id]},
                    "to": {"route_index": after_city_pos[city.id]},
                    "reason": "调整未锁定城市顺序以减少跨城折返",
                })
    return changes
```

优化后再次调用 `validate_constraints(candidate)`；若产生任何冲突，视为程序错误并拒绝候选，不返回部分结果。

- [ ] **Step 5: 验证并提交**

Run: `python -m unittest discover -s tests/planner -p "test_draft_optimizer.py" -v`
Expected: 5 tests PASS。

```powershell
git add planner/draft_optimizer.py planner/__init__.py tests/planner/test_draft_optimizer.py
git commit -m "feat: optimize unlocked itinerary nodes locally"
```

### Task 9: 暴露无状态 `/api/plan/optimize`

**Files:**
- Modify: `routers/planning.py:1-28`
- Modify: `tests/routers/test_non_transport_routes.py`

- [ ] **Step 1: 写成功、冲突和 base revision 路由测试**

```python
# tests/routers/test_non_transport_routes.py
def make_optimize_request_json():
    return {
        "base_revision": 4,
        "scope": {"type": "day", "id": "day-1"},
        "draft": {
            "schema_version": 2, "id": "trip-1", "revision": 4, "mode": "itinerary",
            "route_shape": "one_way", "strategy": "balanced",
            "city_stops": [{"id": "city-hz", "name": "杭州", "days": 1}],
            "nodes": [{
                "id": "n1", "source": "manual", "name": "西湖", "city_id": "city-hz", "city": "杭州",
                "location": {"lat": 30.25, "lng": 120.15, "status": "resolved"},
                "status": "scheduled", "schedule": {"day_id": "day-1"},
                "constraints": {"required": True},
            }],
            "days": [{"id": "day-1", "day": 1, "primary_city_id": "city-hz", "node_ids": ["n1"]}],
        },
    }


class NonTransportRouteTests(unittest.TestCase):
    # Add these methods to the existing class; do not create a second class declaration.
    def test_optimize_route_returns_candidate_for_same_base_revision(self):
        app = FastAPI()
        app.include_router(create_planning_router(fake_settings(), logger=None))
        request_json = make_optimize_request_json()
        response = TestClient(app).post("/api/plan/optimize", json=request_json)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["base_revision"], request_json["base_revision"])
        self.assertIn("candidate", response.json())
        self.assertIn("diff", response.json())

    def test_optimize_route_reports_structured_constraint_conflict(self):
        app = FastAPI()
        app.include_router(create_planning_router(fake_settings(), logger=None))
        request_json = make_optimize_request_json()
        request_json["draft"]["days"][0]["node_ids"] *= 2
        response = TestClient(app).post("/api/plan/optimize", json=request_json)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "constraint_conflict")

    def test_optimize_route_rejects_mismatched_request_revision(self):
        app = FastAPI()
        app.include_router(create_planning_router(fake_settings(), logger=None))
        request_json = make_optimize_request_json()
        request_json["base_revision"] = 3
        response = TestClient(app).post("/api/plan/optimize", json=request_json)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["code"], "stale_revision")
```

把两个测试方法放入现有 `NonTransportRouteTests` 类；`make_optimize_request_json()` 保持模块级纯 helper，不从其他测试模块导入 fixture。

- [ ] **Step 2: 运行测试并确认 404**

Run: `python -m unittest discover -s tests/routers -p "test_non_transport_routes.py" -v`
Expected: new optimize tests FAIL with HTTP 404。

- [ ] **Step 3: 注册优化路由**

```python
# routers/planning.py, inside create_planning_router()
from planner.constraints import validate_constraints
from planner.draft_optimizer import build_diff, optimize_itinerary
from schemas.draft import OptimizeRequest, OptimizeResponse

@router.post("/api/plan/optimize", response_model=OptimizeResponse)
async def optimize_plan(request: OptimizeRequest):
    if request.base_revision != request.draft.revision:
        raise HTTPException(
            status_code=409,
            detail={"code": "stale_revision", "message": "草稿版本已变化，请重新优化"},
        )
    violations = validate_constraints(request.draft)
    if violations:
        raise HTTPException(
            status_code=422,
            detail={"code": "constraint_conflict", "message": "行程约束互相冲突", "conflicts": violations},
        )
    candidate = optimize_itinerary(request.draft, request.scope)
    candidate_violations = validate_constraints(candidate)
    if candidate_violations:
        _log_warning(logger, "optimizer_constraint_regression", conflict_count=len(candidate_violations))
        raise HTTPException(
            status_code=500,
            detail={"code": "optimizer_invalid_result", "message": "优化结果校验失败"},
        )
    unresolved = [node.id for node in candidate.nodes if node.location.status == "unresolved"]
    warnings = [
        {"code": "unresolved_node", "node_id": node_id, "message": "地点尚未定位，未参与本次优化"}
        for node_id in unresolved
    ]
    return {
        "base_revision": request.base_revision,
        "candidate": candidate.model_dump(mode="json"),
        "diff": build_diff(request.draft, candidate),
        "warnings": warnings,
        "data_sources": ["draft", "haversine"],
    }


def _log_warning(logger, event: str, **fields) -> None:
    if logger:
        log_event(logger, logging.WARNING, event, **fields)
```

同时在模块顶部导入 `logging` 和 `core.observability.log_event`。`_log_warning()` 只记录冲突数量，不记录完整草稿。

- [ ] **Step 4: 验证旧 `/api/plan` 契约仍然通过**

Run: `python -m unittest discover -s tests/routers -p "test_non_transport_routes.py" -v`
Expected: existing plan tests and new optimize tests all PASS。

- [ ] **Step 5: 提交**

```powershell
git add routers/planning.py tests/routers/test_non_transport_routes.py
git commit -m "feat: expose stateless itinerary optimization"
```

### Task 10: 增加候选差异、revision 防护和应用/放弃流程

**Files:**
- Create: `static/candidate.js`
- Create: `tests/frontend/candidate.test.js`
- Modify: `static/draft-ops.js`
- Modify: `tests/frontend/draft-ops.test.js`
- Modify: `static/api.js:1-24`
- Modify: `static/index.html` candidate dialog and optimize scope
- Modify: `static/styles.css`
- Modify: `static/app.js`
- Modify: `docs/smoke-checklist.md`

- [ ] **Step 1: 写差异转义和候选锁定复核失败测试**

```javascript
// tests/frontend/candidate.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
global.window = {};
require('../../static/candidate.js');

test('candidate diff groups changes and escapes reasons', () => {
  const html = window.AeroTravelCandidate.renderDiff([
    { type: 'move', node_id: 'n1', node_name: '西湖', from: { day_id: 'day-1', index: 0 }, to: { day_id: 'day-1', index: 1 }, reason: '<script>x</script>' }
  ], value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;'));
  assert.match(html, /移动/);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
```

在 `draft-ops.test.js` 增加完整候选复核用例：

```javascript
const { validateCandidateLocks } = window.AeroTravelDraftOps;

test('candidate validation rejects required, fixed-day and fixed-order regressions', () => {
  const base = emptyDraft();
  base.nodes = [{
    id: 'n1', status: 'scheduled', schedule: { day_id: 'day-1', time_window: '09:00' },
    constraints: { required: true, fixed_day: true, fixed_time: true, fixed_order: true }
  }];
  base.days[0].node_ids = ['n1'];

  const removed = structuredClone(base);
  removed.nodes[0].status = 'removed';
  removed.nodes[0].schedule.day_id = null;
  removed.days[0].node_ids = [];
  assert.deepEqual(validateCandidateLocks(base, removed).map(item => item.code), [
    'required_node_removed', 'fixed_day_changed', 'fixed_time_position_changed', 'fixed_order_changed'
  ]);
});

test('candidate validation keeps required self-drive nodes in route order', () => {
  const base = emptyDraft();
  base.nodes = [{
    id: 'n1', status: 'scheduled', schedule: { day_id: null, time_window: null },
    constraints: { required: true, fixed_day: false, fixed_time: false, fixed_order: false }
  }];
  base.route = { ordered_node_ids: ['n1'] };
  const candidate = structuredClone(base);
  candidate.route.ordered_node_ids = [];
  assert.deepEqual(validateCandidateLocks(base, candidate).map(item => item.code), [
    'required_route_node_removed'
  ]);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/frontend/candidate.test.js tests/frontend/draft-ops.test.js`
Expected: FAIL，candidate 模块和 `validateCandidateLocks` 尚不存在。

- [ ] **Step 3: 实现差异渲染和客户端锁定复核**

```javascript
// static/candidate.js
(function (root) {
  const labels = { add: '新增', move: '移动', remove: '移除', update: '更新' };
  function renderDiff(diff, escapeHtml) {
    if (!diff.length) return '<div class="candidate-empty">当前顺序已经合理，没有需要应用的变化。</div>';
    const types = ['add', 'move', 'remove', 'update'];
    return types.map(type => {
      const changes = diff.filter(change => change.type === type);
      if (!changes.length) return '';
      return `<section class="candidate-group" data-change-type="${type}">
        <h3>${labels[type]}</h3>
        ${changes.map(change => `
          <article class="candidate-change">
            <span>${escapeHtml(change.node_name || change.node_id)}</span>
            <p>${escapeHtml(change.reason || '')}</p>
          </article>`).join('')}
      </section>`;
    }).join('');
  }
  root.AeroTravelCandidate = Object.freeze({ renderDiff });
})(typeof window !== 'undefined' ? window : globalThis);
```

在 `static/index.html` 中把 `candidate.js` 放在 `editor.js` 之后、`app.js` 之前。

在 `</main>` 后加入：

```html
<dialog class="candidate-dialog" id="candidateDialog" aria-labelledby="candidateTitle">
  <h2 id="candidateTitle">优化建议</h2>
  <div id="candidateDiff"></div>
  <ul id="candidateWarnings"></ul>
  <div class="candidate-actions">
    <button class="btn btn-ghost" id="discardCandidateBtn" type="button">放弃</button>
    <button class="btn btn-primary" id="applyCandidateBtn" type="button">应用候选方案</button>
  </div>
</dialog>
```

把这些 ID 加入 `el`，并把 `optimizeScope` select 放在智能优化按钮前，值固定为 `day`、`city`、`trip`。

在 `static/draft-ops.js` 加入并导出：

```javascript
function validateCandidateLocks(before, after) {
  const errors = [];
  const afterById = new Map(after.nodes.map(node => [node.id, node]));
  const positions = draft => new Map(draft.days.flatMap(day => day.node_ids.map((id, index) => [id, { day_id: day.id, index }])));
  const beforePositions = positions(before);
  const afterPositions = positions(after);
  const beforeRoute = new Map(((before.route || {}).ordered_node_ids || []).map((id, index) => [id, index]));
  const afterRoute = new Map(((after.route || {}).ordered_node_ids || []).map((id, index) => [id, index]));

  for (const node of before.nodes) {
    const candidate = afterById.get(node.id);
    if (node.constraints.required && (
      !candidate || candidate.status === 'removed'
      || (node.status === 'scheduled' && candidate.status !== 'scheduled')
    )) {
      errors.push({ code: 'required_node_removed', node_id: node.id });
    }
    if (node.constraints.required && beforeRoute.has(node.id) && !afterRoute.has(node.id)) {
      errors.push({ code: 'required_route_node_removed', node_id: node.id });
    }
    if (node.constraints.fixed_day && candidate?.schedule.day_id !== node.schedule.day_id) {
      errors.push({ code: 'fixed_day_changed', node_id: node.id });
    }
    if (node.constraints.fixed_time && candidate?.schedule.time_window !== node.schedule.time_window) {
      errors.push({ code: 'fixed_time_changed', node_id: node.id });
    }
    if (node.constraints.fixed_time) {
      const oldPosition = beforePositions.get(node.id);
      const newPosition = afterPositions.get(node.id);
      if (oldPosition && (
        !newPosition || oldPosition.day_id !== newPosition.day_id || oldPosition.index !== newPosition.index
      )) {
        errors.push({ code: 'fixed_time_position_changed', node_id: node.id });
      }
      if (beforeRoute.has(node.id) && beforeRoute.get(node.id) !== afterRoute.get(node.id)) {
        errors.push({ code: 'fixed_time_route_position_changed', node_id: node.id });
      }
    }
    if (node.constraints.fixed_order) {
      const oldPosition = beforePositions.get(node.id);
      const newPosition = afterPositions.get(node.id);
      if (oldPosition && (
        !newPosition || oldPosition.day_id !== newPosition.day_id || oldPosition.index !== newPosition.index
      )) {
        errors.push({ code: 'fixed_order_changed', node_id: node.id });
      }
      if (beforeRoute.has(node.id) && beforeRoute.get(node.id) !== afterRoute.get(node.id)) {
        errors.push({ code: 'fixed_route_order_changed', node_id: node.id });
      }
    }
  }

  const candidateCities = new Map(after.city_stops.map((city, index) => [city.id, index]));
  before.city_stops.forEach((city, index) => {
    if (city.fixed_order && candidateCities.get(city.id) !== index) {
      errors.push({ code: 'fixed_city_order_changed', city_id: city.id });
    }
  });
  return errors;
}

root.AeroTravelDraftOps = Object.freeze({
  addNode, moveNode, updateConstraints, removeNode, validateStructure, validateCandidateLocks
});
```

- [ ] **Step 4: 接入请求取消、revision 和 `<dialog>`**

`static/api.js` 增加保留结构化 detail 的 `ApiError`：

```javascript
class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function fetchJson(url, options) {
  let targetUrl = url;
  if (url.startsWith('/api') && (window.location.protocol === 'file:' || window.location.port !== '8000')) {
    targetUrl = `http://localhost:8000${url}`;
  }
  const response = await fetch(targetUrl, options);
  if (!response.ok) {
    let detail = null;
    try { detail = (await response.json()).detail; } catch (_) {}
    const message = typeof detail === 'string' ? detail : detail?.message || '请求失败';
    throw new ApiError(message, response.status, detail);
  }
  return response.json();
}

window.AeroTravelApi = Object.freeze({ ApiError, fetchJson });
```

`optimizeWorkingDraft()` 必须按以下顺序执行：

```javascript
async function optimizeWorkingDraft(scope) {
  state.activeOptimizationController?.abort();
  const controller = new AbortController();
  state.activeOptimizationController = controller;
  const requestedRevision = state.workingDraft.revision;
  try {
    const response = await fetchJson('/api/plan/optimize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ base_revision: requestedRevision, scope, draft: state.workingDraft })
    });
    if (response.base_revision !== requestedRevision || requestedRevision !== state.workingDraft.revision) {
      showToast('草稿已更新，旧的优化结果已忽略。', 'error');
      return;
    }
    const lockErrors = window.AeroTravelDraftOps.validateCandidateLocks(state.workingDraft, response.candidate);
    if (lockErrors.length) throw new Error('候选方案违反锁定条件');
    state.candidatePlan = response;
    renderCandidateDialog();
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (error instanceof window.AeroTravelApi.ApiError && error.detail?.code === 'constraint_conflict') {
      const names = new Map(state.workingDraft.nodes.map(node => [node.id, node.name]));
      state.candidatePlan = {
        candidate: null,
        diff: [],
        warnings: (error.detail.conflicts || []).map(conflict => ({
          code: conflict.code,
          message: `${names.get(conflict.node_id) || conflict.node_id || '行程'}：${conflict.code}`
        }))
      };
      renderCandidateDialog();
    } else {
      showToast(error.message || '优化暂不可用，草稿没有变化。', 'error');
    }
  } finally {
    if (state.activeOptimizationController === controller) state.activeOptimizationController = null;
  }
}

function renderCandidateDialog() {
  const hasCandidate = Boolean(state.candidatePlan?.candidate);
  el.candidateTitle.textContent = hasCandidate ? '优化建议' : '约束冲突';
  el.candidateDiff.innerHTML = hasCandidate
    ? window.AeroTravelCandidate.renderDiff(state.candidatePlan?.diff || [], escapeHtml)
    : '<div class="candidate-empty">当前约束无法同时满足，草稿未被修改。</div>';
  el.candidateWarnings.innerHTML = (state.candidatePlan?.warnings || [])
    .map(item => `<li>${escapeHtml(item.message || item.code)}</li>`).join('');
  el.applyCandidateBtn.disabled = !hasCandidate;
  el.candidateDialog.showModal();
}
```

再次点击正在加载的“智能优化”按钮时调用 `state.activeOptimizationController.abort()`，按钮恢复为“智能优化”，草稿和已应用行程均不变化。道路重算使用独立的 `activeRouteController`，两类请求不得互相取消。

候选对话框只提供查看差异、放弃、应用。应用与撤销已应用候选使用一个明确快照，不复用未应用编辑历史：

```javascript
function applyCandidatePlan() {
  const candidate = state.candidatePlan?.candidate;
  if (!candidate) return;
  const lockErrors = window.AeroTravelDraftOps.validateCandidateLocks(state.workingDraft, candidate);
  if (lockErrors.length || state.candidatePlan.base_revision !== state.workingDraft.revision) {
    showToast('草稿已变化，请重新生成优化候选。', 'error');
    return;
  }
  state.appliedUndo = {
    itinerary: JSON.parse(JSON.stringify(state.itinerary)),
    cities: JSON.parse(JSON.stringify(state.cities)),
    draft: JSON.parse(JSON.stringify(state.workingDraft))
  };
  state.workingDraft = candidate;
  state.itinerary = draftToItinerary(candidate, state.itinerary);
  state.cities = draftToCities(candidate);
  state.totalDays = computeTotalDays();
  state.planningMode = candidate.mode;
  state.routeShape = candidate.route_shape;
  state.routeStrategy = candidate.strategy;
  state.draftHistory = window.AeroTravelHistory.createHistory(candidate, 50);
  state.candidatePlan = null;
  state.appliedUndo && (el.undoAppliedBtn.hidden = false);
  el.candidateDialog.close();
  refreshQualityChecks();
  saveTripSnapshot();
  renderAll();
}

function undoAppliedCandidate() {
  if (!state.appliedUndo) return;
  state.itinerary = state.appliedUndo.itinerary;
  state.cities = state.appliedUndo.cities;
  state.workingDraft = JSON.parse(JSON.stringify(state.appliedUndo.draft));
  state.workingDraft.revision = Number(state.draftHistory.present.revision || 0) + 1;
  state.draftHistory = window.AeroTravelHistory.createHistory(state.workingDraft, 50);
  state.planningMode = state.workingDraft.mode;
  state.routeShape = state.workingDraft.route_shape;
  state.routeStrategy = state.workingDraft.strategy;
  state.totalDays = computeTotalDays();
  state.appliedUndo = null;
  el.undoAppliedBtn.hidden = true;
  refreshQualityChecks();
  saveTripSnapshot();
  renderAll();
}
```

放弃按钮只设置 `state.candidatePlan = null` 并关闭 dialog；`undoAppliedBtn` 只调用 `undoAppliedCandidate()`。优化范围控件提供当前日、当前城市和全行程，构造请求时分别传当前 `day.id`、当前 `primary_city_id` 或 `null`。

- [ ] **Step 5: 运行里程碑 B 质量门并提交**

Run: `.\scripts\check.ps1`
Expected: all quality gates PASS。

Browser smoke:

- 当前日优化不改变其他日。
- 锁定日期、时段和顺序均不变。
- 修改草稿后让旧请求返回，候选不会打开。
- 放弃不改变草稿；应用后撤销恢复应用前版本。
- 高德和 AI 不可用时，手工编辑和仅保存仍可使用。

```powershell
git add static/candidate.js static/draft-ops.js static/api.js static/index.html static/styles.css static/app.js tests/frontend/candidate.test.js tests/frontend/draft-ops.test.js docs/smoke-checklist.md
git commit -m "feat: add reviewable itinerary optimization candidates"
```

## 里程碑 C：自驾路线规划

### Task 11: 增加高德驾车距离与路线解析

**Files:**
- Modify: `clients/amap.py:7-153`
- Modify: `tests/clients/test_amap_client.py`

- [ ] **Step 1: 写距离和最终路线解析失败测试**

```python
# tests/clients/test_amap_client.py
from clients.amap import parse_driving_distance_results, parse_driving_route


class AmapDrivingParsingTests(unittest.TestCase):
    def test_parse_driving_distance_results_keeps_origin_order(self):
        data = {
            "status": "1",
            "results": [
                {"origin_id": "1", "dest_id": "0", "distance": "23000", "duration": "1800"},
                {"origin_id": "2", "dest_id": "0", "distance": "12000", "duration": "900"},
            ],
        }
        result = parse_driving_distance_results(data, ["a", "b"], "c")
        self.assertEqual(result, [
            {"from_node_id": "a", "to_node_id": "c", "distance_meters": 23000, "duration_seconds": 1800},
            {"from_node_id": "b", "to_node_id": "c", "distance_meters": 12000, "duration_seconds": 900},
        ])

    def test_parse_driving_route_collects_cost_and_leaflet_polyline(self):
        data = {
            "status": "1",
            "route": {"paths": [{
                "distance": "31000",
                "cost": {"duration": "2100", "tolls": "18"},
                "steps": [{"polyline": "120.10,30.20;120.20,30.30"}],
            }]},
        }
        result = parse_driving_route(data, "a", "b")
        self.assertEqual(result["distance_meters"], 31000)
        self.assertEqual(result["duration_seconds"], 2100)
        self.assertEqual(result["tolls_yuan"], 18.0)
        self.assertEqual(result["polyline"], [[30.20, 120.10], [30.30, 120.20]])
```

- [ ] **Step 2: 运行测试并确认导入失败**

Run: `python -m unittest discover -s tests/clients -p "test_amap_client.py" -v`
Expected: FAIL，无法导入两个 driving parser。

- [ ] **Step 3: 实现纯解析函数**

```python
# clients/amap.py
AMAP_DRIVING_DISTANCE_URL = "https://restapi.amap.com/v3/distance"
AMAP_DRIVING_ROUTE_URL = "https://restapi.amap.com/v5/direction/driving"


def parse_driving_distance_results(data: dict, origin_ids: list[str], destination_id: str) -> list[dict]:
    if data.get("status") != "1" or not isinstance(data.get("results"), list):
        raise ValueError("高德驾车距离返回无效")
    results = data["results"]
    if len(results) != len(origin_ids):
        raise ValueError("高德驾车距离结果数量不匹配")
    return [
        {
            "from_node_id": origin_id,
            "to_node_id": destination_id,
            "distance_meters": int(float(item.get("distance") or 0)),
            "duration_seconds": int(float(item.get("duration") or 0)),
        }
        for origin_id, item in zip(origin_ids, results)
    ]


def parse_driving_route(data: dict, from_node_id: str, to_node_id: str) -> dict:
    paths = (data.get("route") or {}).get("paths") or []
    if data.get("status") != "1" or not paths:
        raise ValueError("高德驾车路线返回无有效路径")
    path = paths[0]
    cost = path.get("cost") or {}
    polyline: list[list[float]] = []
    for step in path.get("steps") or []:
        for point in str(step.get("polyline") or "").split(";"):
            if not point:
                continue
            lng_text, lat_text = point.split(",")
            coordinate = [float(lat_text), float(lng_text)]
            if not polyline or polyline[-1] != coordinate:
                polyline.append(coordinate)
    return {
        "from_node_id": from_node_id,
        "to_node_id": to_node_id,
        "status": "provider",
        "distance_meters": int(float(path.get("distance") or 0)),
        "duration_seconds": int(float(cost.get("duration") or path.get("duration") or 0)),
        "tolls_yuan": float(cost.get("tolls") or path.get("tolls") or 0),
        "polyline": polyline,
    }
```

- [ ] **Step 4: 实现 httpx 调用边界**

```python
async def query_driving_distances(amap_key: str, origins: list[dict], destination: dict) -> list[dict]:
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            AMAP_DRIVING_DISTANCE_URL,
            params={
                "key": amap_key,
                "origins": "|".join(f"{node['lng']},{node['lat']}" for node in origins),
                "destination": f"{destination['lng']},{destination['lat']}",
                "type": 1,
            },
        )
    if response.status_code != 200:
        raise RuntimeError(f"高德 API 请求失败: {response.status_code}")
    return parse_driving_distance_results(response.json(), [node["id"] for node in origins], destination["id"])


async def query_driving_segment(amap_key: str, origin: dict, destination: dict) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            AMAP_DRIVING_ROUTE_URL,
            params={
                "key": amap_key,
                "origin": f"{origin['lng']},{origin['lat']}",
                "destination": f"{destination['lng']},{destination['lat']}",
                "show_fields": "cost,polyline",
            },
        )
    if response.status_code != 200:
        raise RuntimeError(f"高德 API 请求失败: {response.status_code}")
    return parse_driving_route(response.json(), origin["id"], destination["id"])
```

- [ ] **Step 5: 验证并提交**

Run: `python -m unittest discover -s tests/clients -p "test_amap_client.py" -v`
Expected: all Amap client tests PASS。

```powershell
git add clients/amap.py tests/clients/test_amap_client.py
git commit -m "feat: parse Amap driving route data"
```

### Task 12: 构建道路服务与 `/api/transport/driving-route`

**Files:**
- Create: `services/driving_route_service.py`
- Create: `tests/services/test_driving_route_service.py`
- Modify: `routers/transport.py:1-147`
- Modify: `server.py:16-42`
- Modify: `tests/routers/test_transport_routes.py`

- [ ] **Step 1: 写环线、估算和部分失败测试**

```python
# tests/services/test_driving_route_service.py
import unittest

from services.driving_route_service import build_driving_route


NODES = [
    {"id": "a", "name": "A", "lat": 30.0, "lng": 120.0},
    {"id": "b", "name": "B", "lat": 30.5, "lng": 120.5},
]


class DrivingRouteServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_round_trip_adds_return_segment_and_provider_totals(self):
        async def fetch(_key, origin, destination):
            return {
                "from_node_id": origin["id"], "to_node_id": destination["id"], "status": "provider",
                "distance_meters": 10000, "duration_seconds": 900, "tolls_yuan": 5.0, "polyline": [],
            }
        result = await build_driving_route("key", NODES, "round_trip", fetch_segment=fetch)
        self.assertEqual(len(result["segments"]), 2)
        self.assertEqual(result["totals"], {"distance_meters": 20000, "duration_seconds": 1800, "tolls_yuan": 10.0})
        self.assertEqual(result["status"], "provider")

    async def test_missing_key_returns_explicit_estimate(self):
        result = await build_driving_route("", NODES, "one_way")
        self.assertEqual(result["status"], "estimate")
        self.assertIsNone(result["totals"]["tolls_yuan"])

    async def test_partial_provider_failure_does_not_invent_totals(self):
        calls = 0
        async def fetch(_key, origin, destination):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("provider down")
            return {"from_node_id": origin["id"], "to_node_id": destination["id"], "status": "provider", "distance_meters": 1, "duration_seconds": 1, "tolls_yuan": 0, "polyline": []}
        result = await build_driving_route("key", [*NODES, {"id": "c", "name": "C", "lat": 31.0, "lng": 121.0}], "one_way", fetch_segment=fetch)
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(result["totals"], {"distance_meters": None, "duration_seconds": None, "tolls_yuan": None})


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 运行测试并确认导入失败**

Run: `python -m unittest discover -s tests/services -p "test_driving_route_service.py" -v`
Expected: FAIL，无法导入 service。

- [ ] **Step 3: 实现 provider/estimate/unavailable 三态服务**

```python
# services/driving_route_service.py
import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

from clients.amap import query_driving_segment
from planner.transport import haversine_km


def _estimate_segment(origin: dict, destination: dict) -> dict:
    distance_meters = round(haversine_km(origin, destination) * 1000 * 1.25)
    return {
        "from_node_id": origin["id"], "to_node_id": destination["id"], "status": "estimate",
        "distance_meters": distance_meters, "duration_seconds": round(distance_meters / 1000 / 60 * 3600),
        "tolls_yuan": None, "polyline": [[origin["lat"], origin["lng"]], [destination["lat"], destination["lng"]]],
    }


async def build_driving_route(
    amap_key: str,
    nodes: list[dict],
    route_shape: str,
    fetch_segment: Callable[[str, dict, dict], Awaitable[dict]] = query_driving_segment,
) -> dict:
    route_nodes = list(nodes)
    pairs = list(zip(route_nodes, route_nodes[1:]))
    if route_shape == "round_trip":
        pairs.append((route_nodes[-1], route_nodes[0]))
    if not amap_key:
        segments = [_estimate_segment(origin, destination) for origin, destination in pairs]
        return _route_result(nodes, segments, route_shape, "estimate", [{
            "code": "route_estimated",
            "message": "道路接口未配置，当前为估算",
        }])

    semaphore = asyncio.Semaphore(4)
    async def load_pair(origin: dict, destination: dict):
        async with semaphore:
            return await fetch_segment(amap_key, origin, destination)

    loaded = await asyncio.gather(
        *(load_pair(origin, destination) for origin, destination in pairs),
        return_exceptions=True,
    )
    segments, warnings, failed = [], [], False
    for (origin, destination), loaded_segment in zip(pairs, loaded):
        if isinstance(loaded_segment, Exception):
            failed = True
            warnings.append({
                "code": "segment_unavailable",
                "from_node_id": origin["id"],
                "to_node_id": destination["id"],
                "message": f"{origin['name']} → {destination['name']} 道路数据不可用",
            })
            segments.append({"from_node_id": origin["id"], "to_node_id": destination["id"], "status": "unavailable"})
        else:
            segments.append(loaded_segment)
    return _route_result(nodes, segments, route_shape, "unavailable" if failed else "provider", warnings)


def _route_result(
    nodes: list[dict], segments: list[dict], route_shape: str, status: str, warnings: list[dict]
) -> dict:
    if status == "unavailable":
        totals = {"distance_meters": None, "duration_seconds": None, "tolls_yuan": None}
    else:
        toll_values = [segment.get("tolls_yuan") for segment in segments]
        totals = {
            "distance_meters": sum(segment["distance_meters"] for segment in segments),
            "duration_seconds": sum(segment["duration_seconds"] for segment in segments),
            "tolls_yuan": None if any(value is None for value in toll_values) else sum(toll_values),
        }
    polyline = [point for segment in segments for point in segment.get("polyline", [])]
    return {
        "source": "amap" if status == "provider" else "estimate" if status == "estimate" else "partial",
        "status": status,
        "route_shape": route_shape,
        "ordered_node_ids": [node["id"] for node in nodes],
        "segments": segments, "totals": totals, "polyline": polyline, "warnings": warnings,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
```

- [ ] **Step 4: 注册注入 settings 的子路由**

在 `routers/transport.py` 保留现有全局 `router`，另加 factory，避免重构现有火车/航班路由：

```python
from schemas.draft import DrivingRouteRequest, DrivingRouteResponse
from services.driving_route_service import build_driving_route


def create_driving_router(settings, logger) -> APIRouter:
    driving_router = APIRouter(prefix="/api/transport", tags=["transport"])

    @driving_router.post("/driving-route", response_model=DrivingRouteResponse)
    async def driving_route(request: DrivingRouteRequest):
        nodes = [
            {"id": node.id, "name": node.name, "lat": node.location.lat, "lng": node.location.lng}
            for node in request.nodes
            if node.location.status == "resolved"
        ]
        if len(nodes) != len(request.nodes):
            raise HTTPException(
                status_code=422,
                detail={"code": "unresolved_route_node", "message": "路线中存在尚未定位的节点"},
            )
        result = await build_driving_route(settings.amap_key, nodes, request.route_shape)
        if result["status"] == "unavailable" and logger:
            log_event(
                logger,
                logging.WARNING,
                "driving_route_partial_failure",
                segment_count=len(result["segments"]),
            )
        return result

    return driving_router
```

在 `routers/transport.py` 顶部增加 `import logging` 和 `from core.observability import log_event`；日志只包含分段数量，不包含坐标或供应商原始响应。

`server.py` 导入并注册 `create_driving_router(settings, logger)`。在 `test_transport_routes.py` 加入以下 imports、helper 和完整路由测试：

```python
from types import SimpleNamespace
from fastapi import FastAPI
from routers.transport import create_driving_router


def route_node(node_id: str, lng: float) -> dict:
    return {
        "id": node_id, "source": "manual", "name": node_id, "city_id": "city-hz", "city": "杭州",
        "location": {"lat": 30.0, "lng": lng, "status": "resolved"}, "status": "scheduled",
        "schedule": {}, "constraints": {"required": True},
    }


class DrivingRouteTests(unittest.TestCase):
    def test_driving_route_keeps_request_order_and_shape(self):
        app = FastAPI()
        app.include_router(create_driving_router(SimpleNamespace(amap_key="key"), logger=None))

        async def fake_build(_key, nodes, route_shape):
            return {
                "source": "amap", "status": "provider", "route_shape": route_shape,
                "ordered_node_ids": [node["id"] for node in nodes], "segments": [],
                "totals": {"distance_meters": 0, "duration_seconds": 0, "tolls_yuan": 0},
                "polyline": [], "warnings": [], "fetched_at": "2026-07-10T00:00:00+00:00",
            }

        with patch("routers.transport.build_driving_route", fake_build):
            response = TestClient(app).post(
                "/api/transport/driving-route",
                json={"route_shape": "round_trip", "nodes": [route_node("b", 120.2), route_node("a", 120.1)]},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["ordered_node_ids"], ["b", "a"])
        self.assertEqual(response.json()["route_shape"], "round_trip")
```

加入以下 21 节点请求测试，断言 FastAPI/Pydantic 返回 422；不得在路由内静默截断：

```python
    def test_driving_route_rejects_more_than_twenty_nodes(self):
        app = FastAPI()
        app.include_router(create_driving_router(SimpleNamespace(amap_key="key"), logger=None))
        response = TestClient(app).post(
            "/api/transport/driving-route",
            json={
                "route_shape": "one_way",
                "nodes": [route_node(str(index), 120.0 + index / 1000) for index in range(21)],
            },
        )
        self.assertEqual(response.status_code, 422)
```

- [ ] **Step 5: 验证并提交**

Run: `python -m unittest discover -s tests/services -p "test_driving_route_service.py" -v`
Expected: 3 tests PASS。

Run: `python -m unittest discover -s tests/routers -p "test_transport_routes.py" -v`
Expected: existing and driving route tests PASS。

```powershell
git add services/driving_route_service.py routers/transport.py server.py tests/services/test_driving_route_service.py tests/routers/test_transport_routes.py
git commit -m "feat: expose resilient driving route metrics"
```

### Task 13: 实现受约束自驾排序和按天拆分

**Files:**
- Create: `planner/route_optimizer.py`
- Create: `tests/planner/test_route_optimizer.py`
- Modify: `services/driving_route_service.py`
- Modify: `planner/draft_optimizer.py`
- Modify: `routers/planning.py`
- Modify: `tests/planner/test_draft_optimizer.py`
- Modify: `tests/routers/test_non_transport_routes.py`

- [ ] **Step 1: 写环线、单程、锚点、节点上限和拆天失败测试**

```python
# tests/planner/test_route_optimizer.py
import unittest

from planner.route_optimizer import RouteNodeLimitError, optimize_route_order, split_route_days


COSTS = {
    ("a", "b"): {"distance_meters": 10, "duration_seconds": 10},
    ("a", "c"): {"distance_meters": 100, "duration_seconds": 100},
    ("b", "c"): {"distance_meters": 10, "duration_seconds": 10},
    ("c", "b"): {"distance_meters": 10, "duration_seconds": 10},
    ("b", "d"): {"distance_meters": 100, "duration_seconds": 100},
    ("c", "d"): {"distance_meters": 10, "duration_seconds": 10},
    ("b", "a"): {"distance_meters": 100, "duration_seconds": 100},
    ("c", "a"): {"distance_meters": 10, "duration_seconds": 10},
}


class RouteOptimizerTests(unittest.TestCase):
    def test_one_way_keeps_endpoints_and_improves_middle_order(self):
        nodes = [{"id": "a"}, {"id": "c"}, {"id": "b"}, {"id": "d"}]
        self.assertEqual(optimize_route_order(nodes, COSTS, "one_way", "efficient"), ["a", "b", "c", "d"])

    def test_fixed_order_node_keeps_exact_index(self):
        nodes = [{"id": "a"}, {"id": "c", "fixed_order": True}, {"id": "b"}]
        result = optimize_route_order(nodes, COSTS, "round_trip", "balanced")
        self.assertEqual(result.index("c"), 1)

    def test_three_strategies_have_stable_manual_order_tradeoffs(self):
        nodes = [{"id": "a"}, {"id": "c"}, {"id": "b"}, {"id": "d"}]
        costs = {
            ("a", "b"): {"distance_meters": 0, "duration_seconds": 5},
            ("b", "c"): {"distance_meters": 0, "duration_seconds": 5},
            ("c", "d"): {"distance_meters": 0, "duration_seconds": 10},
            ("a", "c"): {"distance_meters": 0, "duration_seconds": 10},
            ("c", "b"): {"distance_meters": 0, "duration_seconds": 5},
            ("b", "d"): {"distance_meters": 0, "duration_seconds": 15},
        }
        self.assertEqual(optimize_route_order(nodes, costs, "one_way", "efficient"), ["a", "b", "c", "d"])
        self.assertEqual(optimize_route_order(nodes, costs, "one_way", "balanced"), ["a", "c", "b", "d"])
        self.assertEqual(optimize_route_order(nodes, costs, "one_way", "experience"), ["a", "c", "b", "d"])

    def test_more_than_twenty_nodes_raises_stable_error(self):
        with self.assertRaisesRegex(RouteNodeLimitError, "route_node_limit_exceeded"):
            optimize_route_order([{"id": str(index)} for index in range(21)], {}, "one_way", "balanced")

    def test_split_route_days_respects_max_driving_minutes(self):
        order = ["a", "b", "c"]
        split_costs = {
            ("a", "b"): {"distance_meters": 1000, "duration_seconds": 40},
            ("b", "c"): {"distance_meters": 1000, "duration_seconds": 40},
        }
        days = split_route_days(order, split_costs, max_driving_minutes=1)
        self.assertEqual(days, [["a", "b"], ["b", "c"]])

    def test_round_trip_split_accounts_for_return_to_start(self):
        costs = {
            ("a", "b"): {"distance_meters": 1000, "duration_seconds": 20},
            ("b", "c"): {"distance_meters": 1000, "duration_seconds": 20},
            ("c", "a"): {"distance_meters": 1000, "duration_seconds": 20},
        }
        days = split_route_days(["a", "b", "c"], costs, 1, route_shape="round_trip")
        self.assertEqual(days, [["a", "b", "c", "a"]])


if __name__ == "__main__":
    unittest.main()
```

在 `tests/planner/test_draft_optimizer.py` 增加异步协调测试，证明未定位节点仍留在候选顺序中，并且最终道路详情被回填：

```python
from unittest.mock import patch

from planner.draft_optimizer import optimize_draft


class SelfDriveDraftOptimizerTests(unittest.IsolatedAsyncioTestCase):
    async def test_self_drive_keeps_unresolved_nodes_and_hydrates_final_route(self):
        draft = make_optimizer_draft()
        draft.mode = "self_drive"
        draft.route = {"ordered_node_ids": ["a", "c", "b"]}
        next(node for node in draft.nodes if node.id == "c").location.status = "unresolved"

        async def fake_matrix(_key, _nodes):
            return {
                ("a", "b"): {"distance_meters": 1000, "duration_seconds": 60},
                ("b", "a"): {"distance_meters": 1000, "duration_seconds": 60},
            }, "amap"

        async def fake_route(_key, nodes, route_shape):
            return {
                "source": "amap", "status": "provider", "route_shape": route_shape,
                "ordered_node_ids": [node["id"] for node in nodes], "segments": [],
                "totals": {"distance_meters": 1000, "duration_seconds": 60, "tolls_yuan": 0},
                "polyline": [[30.0, 120.0], [30.01, 120.01]], "warnings": [],
            }

        with (
            patch("planner.draft_optimizer.build_driving_cost_matrix", fake_matrix),
            patch("planner.draft_optimizer.build_driving_route", fake_route),
        ):
            candidate, sources = await optimize_draft(draft, OptimizeScope(type="trip"), "key")

        self.assertEqual(candidate.route["ordered_node_ids"], ["a", "c", "b"])
        self.assertEqual(candidate.route["totals"]["distance_meters"], 1000)
        self.assertEqual(sources, ["amap"])
```

- [ ] **Step 2: 运行测试并确认导入失败**

Run: `python -m unittest discover -s tests/planner -p "test_route_optimizer.py" -v`
Expected: FAIL，无法导入 `planner.route_optimizer`。

- [ ] **Step 3: 实现稳定路线评分和受约束 2-opt**

```python
# planner/route_optimizer.py
STRATEGY_WEIGHTS = {
    "efficient": {"duration": 1.0, "distance": 0.0002, "manual": 1.0},
    "balanced": {"duration": 0.8, "distance": 0.0001, "manual": 5.0},
    "experience": {"duration": 0.5, "distance": 0.00005, "manual": 12.0},
}


class RouteNodeLimitError(ValueError):
    pass


def _edge_score(a: str, b: str, costs: dict, strategy: str) -> float:
    edge = costs.get((a, b)) or {"duration_seconds": float("inf"), "distance_meters": float("inf")}
    weights = STRATEGY_WEIGHTS[strategy]
    return edge["duration_seconds"] * weights["duration"] + edge["distance_meters"] * weights["distance"]


def _route_score(order: list[str], costs: dict, route_shape: str, strategy: str, original: list[str]) -> float:
    pairs = list(zip(order, order[1:]))
    if route_shape == "round_trip":
        pairs.append((order[-1], order[0]))
    manual_penalty = sum(abs(original.index(node_id) - index) for index, node_id in enumerate(order))
    return sum(_edge_score(a, b, costs, strategy) for a, b in pairs) + manual_penalty * STRATEGY_WEIGHTS[strategy]["manual"]


def _nearest_neighbor_seed(original: list[str], costs: dict, locked: set[int], strategy: str) -> list[str]:
    seeded = list(original)
    boundaries = sorted({0, *locked, len(original)})
    for left, right in zip(boundaries, boundaries[1:]):
        block = original[left + 1:right]
        current = original[left]
        ordered: list[str] = []
        remaining = list(block)
        while remaining:
            next_id = min(remaining, key=lambda node_id: (_edge_score(current, node_id, costs, strategy), original.index(node_id)))
            remaining.remove(next_id)
            ordered.append(next_id)
            current = next_id
        seeded[left + 1:right] = ordered
    return seeded


def optimize_route_order(nodes: list[dict], costs: dict, route_shape: str, strategy: str) -> list[str]:
    if len(nodes) > 20:
        raise RouteNodeLimitError("route_node_limit_exceeded")
    original = [node["id"] for node in nodes]
    if len(original) < 3:
        return original
    locked = {index for index, node in enumerate(nodes) if node.get("fixed_order")}
    locked.add(0)
    if route_shape == "one_way":
        locked.add(len(nodes) - 1)
    best = _nearest_neighbor_seed(original, costs, locked, strategy)
    improved = True
    while improved:
        improved = False
        best_score = _route_score(best, costs, route_shape, strategy, original)
        for left in range(1, len(best) - 1):
            for right in range(left + 1, len(best)):
                if any(index in locked for index in range(left, right + 1)):
                    continue
                candidate = best[:left] + list(reversed(best[left:right + 1])) + best[right + 1:]
                score = _route_score(candidate, costs, route_shape, strategy, original)
                if score < best_score:
                    best, best_score, improved = candidate, score, True
        # finite permutations and strict score reduction guarantee termination
    return best
```

- [ ] **Step 4: 实现成本矩阵、按天拆分并接入优化 API**

在 `planner/route_optimizer.py` 增加：

```python
def _route_pairs(order: list[str], route_shape: str) -> list[tuple[str, str]]:
    pairs = list(zip(order, order[1:]))
    if route_shape == "round_trip" and len(order) > 1:
        pairs.append((order[-1], order[0]))
    return pairs


def split_route_days(
    order: list[str], costs: dict, max_driving_minutes: int | list[int], route_shape: str = "one_way"
) -> list[list[str]]:
    if not order:
        return []
    limits = max_driving_minutes if isinstance(max_driving_minutes, list) else [max_driving_minutes]
    days: list[list[str]] = [[order[0]]]
    elapsed = 0
    for origin, destination in _route_pairs(order, route_shape):
        limit_seconds = limits[min(len(days) - 1, len(limits) - 1)] * 60
        duration = int((costs.get((origin, destination)) or {}).get("duration_seconds") or 0)
        if len(days[-1]) > 1 and elapsed + duration > limit_seconds:
            days.append([origin, destination])
            elapsed = duration
        else:
            days[-1].append(destination)
            elapsed += duration
    return days


def driving_limit_warnings(
    day_segments: list[list[str]], costs: dict, max_driving_minutes: int | list[int]
) -> list[dict]:
    limits = max_driving_minutes if isinstance(max_driving_minutes, list) else [max_driving_minutes]
    return [
        {
            "code": "single_segment_over_daily_limit",
            "from_node_id": origin,
            "to_node_id": destination,
            "message": "单段驾驶时间超过每日上限",
        }
        for day_index, segment in enumerate(day_segments)
        for origin, destination in zip(segment, segment[1:])
        if int((costs.get((origin, destination)) or {}).get("duration_seconds") or 0)
        > limits[min(day_index, len(limits) - 1)] * 60
    ]
```

在 `services/driving_route_service.py` 增加完整成本矩阵实现：

```python
from clients.amap import query_driving_distances


async def build_driving_cost_matrix(amap_key: str, nodes: list[dict]) -> tuple[dict, str]:
    def estimate_matrix() -> dict:
        return {
            (origin["id"], destination["id"]): {
                "distance_meters": segment["distance_meters"],
                "duration_seconds": segment["duration_seconds"],
            }
            for origin in nodes for destination in nodes if origin["id"] != destination["id"]
            for segment in [_estimate_segment(origin, destination)]
        }

    if not amap_key:
        return estimate_matrix(), "estimate"
    matrix: dict = {}
    try:
        for destination in nodes:
            origins = [node for node in nodes if node["id"] != destination["id"]]
            for result in await query_driving_distances(amap_key, origins, destination):
                matrix[(result["from_node_id"], result["to_node_id"])] = {
                    "distance_meters": result["distance_meters"],
                    "duration_seconds": result["duration_seconds"],
                }
    except Exception:
        return estimate_matrix(), "estimate"
    return matrix, "amap"
```

`split_route_days()` 逐段累加 duration，超过当天 `max_driving_minutes * 60` 时从上一节点开始下一日分段；`driving_limit_warnings()` 单独报告在实际分配日期中本身已经超限、无法通过切日解决的分段。默认上限：efficient 240、balanced 300、experience 360 分钟，每个 `DayDraft.max_driving_minutes` 分别覆盖对应日期。

`planner/draft_optimizer.py` 增加 async 统一入口：

```python
from planner.route_optimizer import driving_limit_warnings, optimize_route_order, split_route_days
from services.driving_route_service import build_driving_cost_matrix, build_driving_route


async def optimize_draft(draft: TripDraft, scope: OptimizeScope, amap_key: str) -> tuple[TripDraft, list[str]]:
    if draft.mode == "itinerary":
        candidate = optimize_itinerary(draft, scope)
        candidate.revision = draft.revision + 1
        return candidate, ["draft", "haversine"]

    candidate = draft.model_copy(deep=True)
    node_by_id = {node.id: node for node in candidate.nodes}
    fallback_order = [
        node_id for day in candidate.days for node_id in day.node_ids
        if node_by_id[node_id].source != "system"
    ]
    requested_order = (candidate.route or {}).get("ordered_node_ids") or fallback_order
    route_nodes = [
        node_by_id[node_id] for node_id in requested_order
        if node_id in node_by_id and node_by_id[node_id].location.status == "resolved"
    ]
    service_nodes = [
        {
            "id": node.id,
            "lat": node.location.lat,
            "lng": node.location.lng,
            "fixed_order": node.constraints.fixed_order
            or node.constraints.fixed_time
            or any(city.id == node.city_id and city.fixed_order for city in candidate.city_stops),
        }
        for node in route_nodes
    ]
    if len(service_nodes) < 2:
        raise ValueError("insufficient_resolved_route_nodes")
    costs, source = await build_driving_cost_matrix(amap_key, service_nodes)
    optimized_resolved_ids = optimize_route_order(service_nodes, costs, candidate.route_shape, candidate.strategy)
    resolved_ids = set(optimized_resolved_ids)
    resolved_iter = iter(optimized_resolved_ids)
    optimized_ids = [next(resolved_iter) if node_id in resolved_ids else node_id for node_id in requested_order]
    city_route_rank = {
        node_by_id[node_id].city_id: index
        for index, node_id in enumerate(optimized_ids)
        if node_id in node_by_id and node_by_id[node_id].source == "city_stop"
    }
    original_city_rank = {city.id: index for index, city in enumerate(candidate.city_stops)}
    candidate.city_stops.sort(key=lambda city: (
        city_route_rank.get(city.id, len(city_route_rank) + original_city_rank[city.id]),
        original_city_rank[city.id],
    ))
    default_limits = {"efficient": 240, "balanced": 300, "experience": 360}
    limits = [
        day.max_driving_minutes or default_limits[candidate.strategy]
        for day in candidate.days
    ]
    chunks = split_route_days(optimized_resolved_ids, costs, limits, candidate.route_shape)
    if len(chunks) > len(candidate.days):
        raise ValueError("daily_driving_limit_exceeded")
    day_index = {day.id: index for index, day in enumerate(candidate.days)}
    assigned_day: dict[str, int] = {}
    for index, chunk in enumerate(chunks):
        for node_id in chunk:
            assigned_day.setdefault(node_id, index)
    for node_id, index in assigned_day.items():
        node = node_by_id[node_id]
        if node.constraints.fixed_day and day_index.get(node.schedule.day_id) != index:
            raise ValueError("fixed_day_route_conflict")
    service_by_id = {node["id"]: node for node in service_nodes}
    final_route = await build_driving_route(
        amap_key,
        [service_by_id[node_id] for node_id in optimized_resolved_ids],
        candidate.route_shape,
    )
    matrix_warnings = [] if source == "amap" else [{
        "code": "cost_matrix_estimated",
        "message": "道路成本矩阵暂不可用，本次排序使用明确标记的估算值",
    }]
    candidate.route = {
        **final_route,
        "ordered_node_ids": optimized_ids,
        "day_segments": chunks,
        "warnings": [
            *matrix_warnings,
            *final_route.get("warnings", []),
            *driving_limit_warnings(chunks, costs, limits),
        ],
    }
    candidate.revision = draft.revision + 1
    return candidate, list(dict.fromkeys([source, final_route["source"]]))
```

`routers/planning.py` 把 Task 9 的 `optimize_itinerary` 导入和同步调用替换为以下导入与异步调用：

```python
from planner.draft_optimizer import build_diff, optimize_draft
from planner.route_optimizer import RouteNodeLimitError
```

```python
try:
    candidate, data_sources = await optimize_draft(request.draft, request.scope, settings.amap_key)
except RouteNodeLimitError as exc:
    raise HTTPException(
        status_code=422,
        detail={"code": "route_node_limit_exceeded", "message": "单条自驾路线最多支持 20 个已定位节点"},
    ) from exc
except ValueError as exc:
    if str(exc) not in {
        "daily_driving_limit_exceeded", "fixed_day_route_conflict", "insufficient_resolved_route_nodes"
    }:
        raise
    raise HTTPException(
        status_code=422,
        detail={
            "code": "constraint_conflict",
            "message": str(exc),
            "conflicts": [{"code": str(exc)}],
        },
    ) from exc

candidate_violations = validate_constraints(candidate)
if candidate_violations:
    _log_warning(logger, "optimizer_constraint_regression", conflict_count=len(candidate_violations))
    raise HTTPException(
        status_code=500,
        detail={"code": "optimizer_invalid_result", "message": "优化结果校验失败"},
    )
unresolved_warnings = [
    {"code": "unresolved_node", "node_id": node.id, "message": "地点尚未定位，未参与本次优化"}
    for node in candidate.nodes if node.location.status == "unresolved"
]
return {
    "base_revision": request.base_revision,
    "candidate": candidate.model_dump(mode="json"),
    "diff": build_diff(request.draft, candidate),
    "warnings": unresolved_warnings + (candidate.route or {}).get("warnings", []),
    "data_sources": data_sources,
}
```

- [ ] **Step 5: 验证并提交**

Run: `python -m unittest discover -s tests/planner -p "test_route_optimizer.py" -v`
Expected: 6 tests PASS。

Run: `python -m unittest discover -s tests/planner -p "test_draft_optimizer.py" -v`
Expected: itinerary and self-drive optimizer tests PASS。

Run: `python -m unittest discover -s tests/routers -p "test_non_transport_routes.py" -v`
Expected: itinerary and self-drive optimize route tests PASS。

```powershell
git add planner/route_optimizer.py planner/draft_optimizer.py services/driving_route_service.py routers/planning.py tests/planner/test_route_optimizer.py tests/planner/test_draft_optimizer.py tests/routers/test_non_transport_routes.py
git commit -m "feat: optimize constrained self-drive routes"
```

### Task 14: 构建自驾节点编辑器和道路地图预览

**Files:**
- Create: `static/self-drive.js`
- Create: `tests/frontend/self-drive.test.js`
- Modify: `static/state.js`
- Modify: `static/map.js`
- Modify: `static/index.html`
- Modify: `static/styles.css`
- Modify: `static/app.js`
- Modify: `static/storage.js`

- [ ] **Step 1: 写自驾请求顺序、环线和摘要失败测试**

```javascript
// tests/frontend/self-drive.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
global.window = {};
require('../../static/self-drive.js');

const draft = {
  route_shape: 'round_trip', strategy: 'balanced',
  route: { ordered_node_ids: ['a', 'b'] },
  nodes: [
    { id: 'a', name: '杭州', status: 'scheduled', location: { lat: 30.2, lng: 120.1, status: 'resolved' } },
    { id: 'b', name: '千岛湖', status: 'scheduled', location: { lat: 29.6, lng: 119.0, status: 'resolved' } }
  ],
  days: [{ id: 'day-1', node_ids: ['a', 'b'] }]
};

test('buildRouteRequest preserves manual node order without duplicating round-trip start', () => {
  const request = window.AeroTravelSelfDrive.buildRouteRequest(draft);
  assert.equal(request.route_shape, 'round_trip');
  assert.deepEqual(request.nodes.map(node => node.id), ['a', 'b']);
});

test('reorderRoute changes only route order and increments revision', () => {
  const moved = window.AeroTravelSelfDrive.reorderRoute(draft, 1, 0);
  assert.deepEqual(moved.route.ordered_node_ids, ['b', 'a']);
  assert.equal(moved.revision, 1);
  assert.deepEqual(draft.route.ordered_node_ids, ['a', 'b']);
});

test('reorderRoute cannot move another node across a fixed-order anchor', () => {
  const locked = structuredClone(draft);
  locked.nodes[1].constraints = { fixed_order: true };
  locked.nodes.push({ id: 'c', name: '绍兴', status: 'scheduled', location: { lat: 30.0, lng: 120.5, status: 'resolved' } });
  locked.route.ordered_node_ids.push('c');
  const moved = window.AeroTravelSelfDrive.reorderRoute(locked, 2, 0);
  assert.deepEqual(moved.route.ordered_node_ids, ['a', 'b', 'c']);
});

test('formatRouteSummary labels provider and estimate data', () => {
  const provider = window.AeroTravelSelfDrive.formatRouteSummary({ status: 'provider', totals: { distance_meters: 326000, duration_seconds: 19200, tolls_yuan: 148 } });
  assert.match(provider, /326 km/);
  assert.match(provider, /高德道路数据/);
  const estimate = window.AeroTravelSelfDrive.formatRouteSummary({ status: 'estimate', totals: { distance_meters: 100000, duration_seconds: 6000, tolls_yuan: null } });
  assert.match(estimate, /估算/);
});

test('updateRouteSettings changes shape and strategy in one revision', () => {
  const updated = window.AeroTravelSelfDrive.updateRouteSettings(draft, {
    route_shape: 'one_way', strategy: 'experience'
  });
  assert.equal(updated.route_shape, 'one_way');
  assert.equal(updated.strategy, 'experience');
  assert.equal(updated.revision, 1);
});

test('renderRouteNodes escapes names and provides non-drag move buttons', () => {
  const unsafe = structuredClone(draft);
  unsafe.nodes[0].name = '<img onerror=alert(1)>';
  const html = window.AeroTravelSelfDrive.renderRouteNodes(unsafe, value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;'));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /data-action="route-up"/);
  assert.match(html, /data-action="route-down"/);
  assert.match(html, /data-action="constraints"/);
  assert.match(html, /data-action="remove-node"/);
});
```

- [ ] **Step 2: 运行测试并确认模块不存在**

Run: `node --test tests/frontend/self-drive.test.js`
Expected: FAIL，无法导入 `static/self-drive.js`。

- [ ] **Step 3: 实现纯自驾视图模型**

```javascript
// static/self-drive.js
(function (root) {
  function orderedNodes(draft) {
    const byId = new Map(draft.nodes.map(node => [node.id, node]));
    const fallback = draft.days.flatMap(day => day.node_ids).filter(id => byId.get(id)?.source !== 'system');
    const order = draft.route?.ordered_node_ids || fallback;
    return order.map(id => byId.get(id)).filter(node => node && node.status !== 'removed');
  }

  function initializeSelfDriveRoute(draft, centers, idFactory) {
    const result = JSON.parse(JSON.stringify(draft));
    result.mode = 'self_drive';
    result.route_shape ||= 'one_way';
    result.strategy ||= 'balanced';
    const routeIds = [];
    for (const city of result.city_stops) {
      let node = result.nodes.find(item => item.source === 'city_stop' && item.city_id === city.id);
      if (!node) {
        const center = centers[city.name] || {};
        node = {
          id: idFactory(), source: 'city_stop', provider_id: null, name: city.name, city_id: city.id, city: city.name,
          location: { lat: Number(center.lat) || 0, lng: Number(center.lng) || 0, status: center.lat && center.lng ? 'resolved' : 'unresolved' },
          status: 'scheduled', duration_minutes: 0, schedule: { day_id: null, time_window: null },
          constraints: { required: true, fixed_day: false, fixed_time: false, fixed_order: city.fixed_order },
          manual_rank: routeIds.length, metadata: { route_node: true }
        };
        result.nodes.push(node);
      }
      routeIds.push(node.id);
      const cityExperiences = result.days.flatMap(day => day.node_ids)
        .map(id => result.nodes.find(item => item.id === id))
        .filter(item => item?.city_id === city.id && item.source !== 'system');
      routeIds.push(...cityExperiences.map(item => item.id));
    }
    result.route = { ...(result.route || {}), ordered_node_ids: [...new Set(routeIds)] };
    result.revision = Number(result.revision || 0) + 1;
    return result;
  }

  function buildRouteRequest(draft) {
    return {
      route_shape: draft.route_shape,
      nodes: orderedNodes(draft).filter(node => node.location.status === 'resolved')
    };
  }

  function clearRouteMetrics(route) {
    const {
      segments: _segments, totals: _totals, polyline: _polyline, fetched_at: _fetchedAt,
      day_segments: _daySegments, status: _status, source: _source, ...routeInput
    } = route || {};
    return routeInput;
  }

  function reorderRoute(draft, fromIndex, toIndex) {
    const result = JSON.parse(JSON.stringify(draft));
    const order = [...(result.route?.ordered_node_ids || [])];
    if (fromIndex < 0 || fromIndex >= order.length || toIndex < 0 || toIndex >= order.length) return result;
    const nodeByIdBefore = new Map(result.nodes.map(node => [node.id, node]));
    const fixedAt = new Map(order.flatMap((id, index) =>
      nodeByIdBefore.get(id)?.constraints?.fixed_order || nodeByIdBefore.get(id)?.constraints?.fixed_time
        ? [[index, id]] : []
    ));
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);
    if ([...fixedAt].some(([index, id]) => order[index] !== id)) return JSON.parse(JSON.stringify(draft));
    result.route = { ...clearRouteMetrics(result.route), ordered_node_ids: order };
    const nodeById = new Map(result.nodes.map(node => [node.id, node]));
    const cityRank = new Map(
      order.map(id => nodeById.get(id)).filter(node => node?.source === 'city_stop')
        .map((node, index) => [node.city_id, index])
    );
    result.city_stops.sort((a, b) =>
      (cityRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (cityRank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
    result.revision = Number(result.revision || 0) + 1;
    return result;
  }

  function formatRouteSummary(route) {
    if (!route?.totals) return '等待道路重算';
    const totals = route?.totals || {};
    const distance = Number.isFinite(totals.distance_meters) ? `${Math.round(totals.distance_meters / 1000)} km` : '里程不可用';
    const duration = Number.isFinite(totals.duration_seconds) ? `${Math.floor(totals.duration_seconds / 3600)} 小时 ${Math.round((totals.duration_seconds % 3600) / 60)} 分` : '车程不可用';
    const tolls = Number.isFinite(totals.tolls_yuan) ? `约 ${totals.tolls_yuan} 元` : '过路费待确认';
    const source = route?.status === 'provider' ? '高德道路数据' : route?.status === 'estimate' ? '估算' : '部分路段不可用';
    return `${distance} · ${duration} · ${tolls} · ${source}`;
  }

  function updateRouteSettings(draft, patch) {
    const result = JSON.parse(JSON.stringify(draft));
    if (patch.route_shape) result.route_shape = patch.route_shape;
    if (patch.strategy) result.strategy = patch.strategy;
    result.route = clearRouteMetrics(result.route);
    result.revision = Number(result.revision || 0) + 1;
    return result;
  }

  function renderRouteNodes(draft, escapeHtml) {
    return orderedNodes(draft).map((node, index, nodes) => `
      <article class="route-node" draggable="${!node.constraints?.fixed_order && !node.constraints?.fixed_time}" data-node-id="${escapeHtml(node.id)}" data-index="${index}">
        <span class="route-node-index">${index + 1}</span>
        <div><strong>${escapeHtml(node.name)}</strong><small>${escapeHtml(node.city || '城市待确认')}</small></div>
        <button type="button" class="btn btn-icon" data-action="route-up" data-index="${index}" ${index === 0 || node.constraints?.fixed_order || node.constraints?.fixed_time ? 'disabled' : ''} aria-label="上移 ${escapeHtml(node.name)}">↑</button>
        <button type="button" class="btn btn-icon" data-action="route-down" data-index="${index}" ${index === nodes.length - 1 || node.constraints?.fixed_order || node.constraints?.fixed_time ? 'disabled' : ''} aria-label="下移 ${escapeHtml(node.name)}">↓</button>
        <button type="button" class="btn btn-icon" data-action="constraints" data-node-id="${escapeHtml(node.id)}" aria-label="设置 ${escapeHtml(node.name)} 的约束">锁</button>
        <button type="button" class="btn btn-icon" data-action="edit-node" data-node-id="${escapeHtml(node.id)}" aria-label="编辑 ${escapeHtml(node.name)}">✎</button>
        <button type="button" class="btn btn-icon" data-action="remove-node" data-node-id="${escapeHtml(node.id)}" aria-label="删除 ${escapeHtml(node.name)}">×</button>
      </article>`).join('');
  }

  root.AeroTravelSelfDrive = Object.freeze({
    orderedNodes, initializeSelfDriveRoute, reorderRoute, buildRouteRequest, formatRouteSummary,
    updateRouteSettings, renderRouteNodes
  });
})(typeof window !== 'undefined' ? window : globalThis);
```

在 `static/index.html` 中把 `self-drive.js` 放在 `candidate.js` 之后、`app.js` 之前。

- [ ] **Step 4: 接入模式、手动重算和 Leaflet 道路图层**

`static/index.html` 在规划输入顶部增加“城市行程 / 自驾路线”分段控件；自驾时显示环线/单程和三策略控件。结果编辑区复用节点列表，另显示按天分段和路线摘要。所有按钮都有文本或 `aria-label`，不用颜色单独表示锁定或数据来源。

`static/map.js` 增加：

```javascript
function replaceRoutePolyline(map, currentLayer, points, options = {}) {
  if (currentLayer) currentLayer.remove();
  if (!points || points.length < 2) return null;
  return L.polyline(points, {
    color: options.status === 'provider' ? '#c96442' : '#77736b',
    weight: 4,
    opacity: 0.9,
    dashArray: options.status === 'provider' ? null : '8 8'
  }).addTo(map);
}
```

首次切入自驾时调用 `initializeSelfDriveRoute(state.workingDraft, state.cityCenters, () => crypto.randomUUID())`；再次切换只复用已有 `route.ordered_node_ids`，不重复创建城市节点。环线/单程和策略控件更新 draft 的 `route_shape` / `strategy` 并增加 revision；路线节点的编辑、锁定和删除复用 Task 4 的委托 handler。

每次手动移动自驾节点后，用 300ms debounce 调用 `/api/transport/driving-route`。道路响应是派生数据，不增加 revision，也不压入新的撤销步骤；它必须合并进当前 history 的 present，且不能覆盖用户顺序和已有按天分段：

```javascript
async function refreshDrivingRoute() {
  state.activeRouteController?.abort();
  const controller = new AbortController();
  state.activeRouteController = controller;
  const requestedRevision = state.workingDraft.revision;
  const request = window.AeroTravelSelfDrive.buildRouteRequest(state.workingDraft);
  if (request.nodes.length < 2 || request.nodes.length > 20) return;
  try {
    const response = await fetchJson('/api/transport/driving-route', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify(request)
    });
    if (requestedRevision !== state.workingDraft.revision) return;
    const previousRoute = state.workingDraft.route || {};
    const updatedDraft = JSON.parse(JSON.stringify(state.workingDraft));
    updatedDraft.route = {
      ...previousRoute,
      ...response,
      ordered_node_ids: [...(previousRoute.ordered_node_ids || [])],
      day_segments: previousRoute.day_segments || []
    };
    state.workingDraft = updatedDraft;
    state.draftHistory = { ...state.draftHistory, present: updatedDraft };
    renderEditor();
    renderMap();
  } catch (error) {
    if (error.name !== 'AbortError') showToast('道路指标暂不可用，节点顺序已保留。', 'error');
  } finally {
    if (state.activeRouteController === controller) state.activeRouteController = null;
  }
}

function scheduleDrivingRouteRefresh() {
  window.clearTimeout(state.routeRequestTimer);
  state.routeRequestTimer = window.setTimeout(refreshDrivingRoute, 300);
}
```

新请求先 abort 旧道路请求，并在发出时闭包保存 `requestedRevision`，返回后若它不等于 `state.workingDraft.revision` 就忽略。该请求不调用 `/api/plan/optimize`，因此不会触发 AI 或重排。环线只在道路服务中添加返回段，`route.ordered_node_ids` 不复制起点；`route.day_segments` 可以在最后一段重复起点以表达返程。

路线少于 2 个已定位节点时禁用“重新计算”和“智能优化”，显示“至少添加两个已定位节点”；已定位节点超过 20 个时禁用请求并显示设计规格中的节点上限，不在前端截断数组。未定位节点继续保留在列表原位置并显示“待定位”。应用自驾优化候选后直接渲染候选中已回填的最终道路详情，无需第二次 AI 请求。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/frontend/*.test.js`
Expected: all frontend tests PASS。

Browser smoke:

- 自驾/普通模式切换不丢草稿。
- 环线和单程切换后端点语义正确。
- 手动拖动只重算道路，不改变节点顺序。
- provider 路线为实线，estimate 为虚线且有文本标签。
- 390x844 视口可通过上移/下移完成全部操作。

```powershell
git add static/self-drive.js static/state.js static/map.js static/index.html static/styles.css static/app.js static/storage.js tests/frontend/self-drive.test.js
git commit -m "feat: add flexible self-drive route editor"
```

### Task 15: 完成恢复、文档、全量质量门和浏览器验收

**Files:**
- Modify: `tests/frontend/storage.test.js`
- Modify: `tests/frontend/draft.test.js`
- Modify: `README.md`
- Modify: `IMPLEMENTATION.md`
- Modify: `tasks/todo.md`
- Modify: `docs/smoke-checklist.md`
- Modify: `CHANGELOG.md`
- Create: `docs/decisions/ADR-002-constraint-driven-editable-planning.md`

- [ ] **Step 1: 增加完整快照恢复测试**

```javascript
// tests/frontend/storage.test.js
test('version 2 snapshot preserves self-drive mode, route and constraints', () => {
  let raw = '[]';
  window.localStorage = { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
  const storage = window.AeroTravelStorage.createTripStorage('trips', 8);
  const entry = {
    id: 7, schema_version: 2,
    appliedPlan: { days: [] },
    draft: {
      schema_version: 2, mode: 'self_drive', route_shape: 'round_trip', strategy: 'experience',
      route: { status: 'provider', ordered_node_ids: ['a', 'b'] },
      nodes: [{ id: 'a', constraints: { required: true, fixed_day: true, fixed_time: false, fixed_order: true } }]
    }
  };
  assert.equal(storage.save(entry).ok, true);
  const restored = storage.load()[0];
  assert.equal(restored.draft.mode, 'self_drive');
  assert.equal(restored.draft.route_shape, 'round_trip');
  assert.equal(restored.draft.nodes[0].constraints.fixed_order, true);
});
```

在 `draft.test.js` 增加相同 version 1 快照输入两次产生相同节点 ID 的测试，seed 使用 snapshot ID、日期、原数组位置、名称和坐标：

```javascript
test('legacy snapshot conversion produces stable ids without inventing constraints', () => {
  const legacy = {
    title: '旧杭州行程',
    days: [{
      day: 1, date: '2026-07-18', city: '杭州',
      items: [{ type: 'hotel', title: '湖滨住宿', city: '杭州', lat: 30.25, lng: 120.16 }]
    }]
  };
  const first = itineraryToDraft(legacy, [{ name: '杭州', days: 1 }], { seed: 'snapshot-7' });
  const second = itineraryToDraft(structuredClone(legacy), [{ name: '杭州', days: 1 }], { seed: 'snapshot-7' });
  assert.equal(first.nodes[0].id, second.nodes[0].id);
  assert.deepEqual(first.nodes[0].constraints, {
    required: false, fixed_day: false, fixed_time: false, fixed_order: false
  });
});
```

- [ ] **Step 2: 运行恢复测试并验证迁移行为**

Run: `node --test tests/frontend/storage.test.js tests/frontend/draft.test.js`
Expected: all tests PASS。若失败，只修改 `static/storage.js` / `static/draft.js` 的迁移与恢复逻辑，不在测试中删除断言。

- [ ] **Step 3: 更新用户与工程文档**

`README.md` 增加：生成后编辑、想去清单、四类约束、自驾三策略、道路数据来源和降级说明；API 表加入 `/api/reverse_geocode`、`/api/plan/optimize`、`/api/transport/driving-route`。

`IMPLEMENTATION.md` 记录新模块边界和实际完成的任务。`tasks/todo.md` 将本计划已完成项勾选，未完成项保持未勾选。`docs/smoke-checklist.md` 使用可执行步骤覆盖设计规格第 14.4 节。`CHANGELOG.md` 在 Unreleased 下记录用户可见功能和兼容性说明。

新增 ADR，记录为什么不能继续用“整份 AI 重生成”承担编辑和道路排序：

```markdown
# ADR-002: Use constraint-driven editable planning

## Status
Accepted

## Date
2026-07-10

## Context
AeroTravel 的 AI 结果原本基本只读。局部加入或移动地点后重新生成整份行程，会改变用户没有要求修改的日期和顺序。自驾路线还需要可信道路成本、稳定节点顺序和可解释的硬约束，不能由语言模型计算最短道路。

## Decision
浏览器维护 AppliedPlan、WorkingDraft 和 CandidatePlan 三段式状态，继续使用 `localStorage` version 2 快照。用户手工操作只修改 WorkingDraft；“仅保存”按原样应用，“智能优化”由无状态后端在明确作用范围和硬约束内生成可审阅候选。

普通地理排序和自驾路线排序使用确定性启发式算法。高德只提供地点与道路数据，AI 继续负责初稿、软评分和解释，不得绕过必去、固定日期、固定时段、固定顺序或端点约束。道路接口返回 provider-neutral 的有序节点、分段、总计和几何数据，为未来导航导出预留边界，但本阶段不实现导航跳转。

## Alternatives Considered

### 每次编辑后重新调用 AI 生成整份行程
拒绝：无法保证未编辑部分稳定，也无法可靠执行道路最短路径和硬约束。

### 只在前端保存一个可变行程对象
拒绝：无法区分已应用结果、未保存编辑和待审阅候选，异步旧响应也容易覆盖用户新修改。

### 引入数据库和账号同步
拒绝：当前产品仍是单用户本地工具，增加服务端持久化超出范围。

## Consequences
- 局部编辑和仅保存不依赖 AI 或道路服务。
- 新增稳定 draft schema、revision、候选差异和 version 1/2 迁移责任。
- 路线质量受启发式算法和第三方道路数据质量限制，但结果可重复、可测试、可降级。
- 未来导航适配必须只依赖公开道路响应契约，不读取当前 UI 私有状态。
```

- [ ] **Step 4: 运行完整本地与安全质量门**

Run: `.\scripts\check.ps1`
Expected: compile、Ruff、Mypy、Python tests、Node syntax 和 frontend tests 全部通过。

Run: `.\scripts\security.ps1`
Expected: tracked secret scan and dependency audit pass。

Run: `git diff --check`
Expected: no whitespace errors。

- [ ] **Step 5: 执行真实浏览器验收**

启动：`python server.py`，访问 `http://localhost:8000/static/index.html`。执行 `docs/smoke-checklist.md`，并使用浏览器测试工具检查：

- 1440x900、1024x768、390x844 三个视口。
- 控制台无 error/warning；网络中没有意外的第三方密钥响应。
- 地图 canvas/tile 区域非空，marker 和道路 polyline 与列表顺序一致。
- 用户新增地点默认必去；仅保存不改其他节点。
- 当前日、城市和全行程优化范围正确；锁定永不被违反。
- 候选可以放弃、应用和撤销；旧 revision 响应被丢弃。
- 自驾环线、单程、三策略、手动排列和道路降级均可操作。
- 刷新后恢复 applied plan、working draft、wishlist、constraints、mode、strategy 和 route。

- [ ] **Step 6: 最终提交**

```powershell
git add README.md IMPLEMENTATION.md tasks/todo.md docs/smoke-checklist.md CHANGELOG.md docs/decisions/ADR-002-constraint-driven-editable-planning.md tests/frontend/storage.test.js tests/frontend/draft.test.js static/storage.js static/draft.js
git commit -m "feat: complete editable itinerary and self-drive planning"
```

## 规格覆盖映射

| 设计规格 | 实施任务 |
|---|---|
| 第 4 节交互与三种地点入口 | Tasks 4-6、14 |
| 第 5 节 AppliedPlan / WorkingDraft / CandidatePlan | Tasks 1-3、10 |
| 第 6 节硬约束和软目标 | Tasks 2、7-8、10、13 |
| 第 7 节普通与自驾优化流程 | Tasks 8-10、13 |
| 第 8 节三个新增 API | Tasks 5、9、12 |
| 第 9 节前后端代码边界 | 全部任务按文件结构表执行 |
| 第 10 节 version 1/2 持久化迁移 | Tasks 1、3、15 |
| 第 11 节异常与降级 | Tasks 3、5、7、9-13 |
| 第 12 节可访问性与移动端 | Tasks 4、6、10、14-15 |
| 第 13 节分阶段交付 | 里程碑 A、B、C |
| 第 14 节测试策略 | 每个任务的失败测试与验证步骤 |
| 第 15 节 13 条验收标准 | Tasks 6、10、14、15 的质量门与浏览器验收 |

## 完成定义

- 设计规格第 15 节的 13 条验收标准全部有自动化测试或明确浏览器检查对应。
- `.\scripts\check.ps1`、`.\scripts\security.ps1` 和 `git diff --check` 均通过。
- 普通编辑不依赖 AI 或高德；道路服务失败不破坏草稿或已应用行程。
- `/api/plan`、现有交通接口、快照上限、`state.cities[].days` 和 `applyPlan()` 主 hydration 路径保持兼容。
- 没有数据库、账号、前端框架、打包步骤或未经 ADR 批准的持久化变化。
