# Trip Delivery Phase 4/5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators attach up to 3 curated HTTPS reference links per place and pre-render an Amap static overview image into the trip package so PNG/PDF maps work offline without exposing `AMAP_KEY`.

**Architecture:** Refs live on itinerary items (and draft `metadata.item.refs`); package already normalizes them for the share page. Static maps are fetched only from the workbench via a backend proxy, embedded as `package.static_map.data_url`, and used by PNG sheet / print renderers; interactive share maps stay Leaflet + `route_lines`. Failures degrade to placeholders and never block publish.

**Tech Stack:** FastAPI + httpx (Amap staticmap proxy), no-build vanilla JS (`window.AeroTravel*`), Node `node:test`, unittest.

## Global Constraints

- No accounts, database, payment, or auto-hosting.
- Never embed `AMAP_KEY` in customer HTML.
- Static map API limits: max 1024×1024, ≤10 markers, ≤4 paths (product doc).
- Max 3 refs per item; only `http://` / `https://` URLs.
- Static map failure → `status: 'unavailable'`, continue export/publish.
- Prefer extending existing modules; keep `app.js` as orchestration only.
- Quality gate: `.\scripts\check.ps1` after each logical task group.
- Spec: `docs/superpowers/specs/2026-07-12-trip-delivery-refs-static-map-design.md`

## File Map

| File | Responsibility |
|---|---|
| `static/trip-package.js` | `normalizeRefs`, `static_map` on package, static-map request payload helpers |
| `static/draft-ops.js` | `updateNode` accepts `refs` → writes `metadata.item.refs` |
| `static/app.js` | Edit-node refs prompts, delivery checklist, `enrichStaticMap`, export/publish await |
| `static/index.html` | Export menu: 「参考链接检查」 |
| `static/trip-share-render.js` | PNG/print use `static_map` img or placeholder |
| `clients/amap.py` | Static map URL + fetch bytes |
| `routers/location.py` | `GET /api/static_map` proxy |
| `tests/frontend/trip-package.test.js` | refs + static_map package tests |
| `tests/frontend/draft-ops.test.js` | refs round-trip via updateNode |
| `tests/clients/test_amap_client.py` | URL builder / no-key |
| `tests/routers/test_non_transport_routes.py` or new route tests | `/api/static_map` |
| `docs/product/专属行程交付-操作说明.md` | Operator steps for refs + static map |

---

### Task 1: Normalize refs + package static_map field

**Files:**
- Modify: `static/trip-package.js`
- Test: `tests/frontend/trip-package.test.js`

**Interfaces:**
- Produces: `normalizeRefs(raw) → [{label,url,kind}]` (max 3, https/http only)
- Produces: `buildTripPackage` accepts `opts.staticMap` and sets `pkg.static_map`
- Produces: `buildStaticMapRequest(pkg) → { width, height, markers: [{lat,lng,label}], path: [[lat,lng],...] | null }`
- Consumes: existing `normalizeItem`, `map_anchors`, `route_lines`

- [ ] **Step 1: Write failing tests**

Append to `tests/frontend/trip-package.test.js`:

```js
test("normalizeRefs keeps max 3 https urls and drops invalid", () => {
  const { normalizeRefs } = window.AeroTravelTripPackage;
  const refs = normalizeRefs([
    { label: "笔记", url: "https://xhslink.com/a", kind: "xhs" },
    { label: "坏", url: "javascript:alert(1)" },
    { url: "http://example.com/b" },
    { label: "四", url: "https://example.com/c" },
    { label: "五", url: "https://example.com/d" }
  ]);
  assert.equal(refs.length, 3);
  assert.equal(refs[0].kind, "xhs");
  assert.equal(refs[1].url, "http://example.com/b");
  assert.equal(refs[2].url, "https://example.com/c");
});

test("buildTripPackage attaches static_map when provided", () => {
  const pkg = buildTripPackage(samplePlan(), {
    token: "StaticMapToken1234567",
    staticMap: {
      data_url: "data:image/png;base64,AAA",
      status: "ready",
      width: 640,
      height: 640,
      note: "道路数据"
    }
  });
  assert.equal(pkg.static_map.status, "ready");
  assert.match(pkg.static_map.data_url, /^data:image\/png;base64,/);
});

test("buildStaticMapRequest caps markers at 10 and prefers overview route line", () => {
  const { buildStaticMapRequest } = window.AeroTravelTripPackage;
  const anchors = Array.from({ length: 12 }, (_, i) => ({
    order: i + 1,
    title: `P${i}`,
    lat: 39.9 + i * 0.01,
    lng: 116.4 + i * 0.01
  }));
  const req = buildStaticMapRequest({
    map_anchors: anchors,
    route_lines: [{
      day: null,
      status: "provider",
      points: [[39.9, 116.4], [39.91, 116.41], [39.92, 116.42]]
    }]
  });
  assert.equal(req.markers.length, 10);
  assert.equal(req.path.length, 3);
  assert.equal(req.width, 640);
  assert.equal(req.height, 640);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/frontend/trip-package.test.js`  
Expected: FAIL — `normalizeRefs` / `buildStaticMapRequest` / `static_map` missing

- [ ] **Step 3: Implement in `static/trip-package.js`**

Add helpers (near other normalizers):

```js
function normalizeRefs(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const ref of list) {
    if (!ref) continue;
    const url = clean(ref.url);
    if (!/^https?:\/\//i.test(url)) continue;
    const kind = ['web', 'xhs', 'dianping', 'official'].includes(ref.kind)
      ? ref.kind
      : 'web';
    out.push({
      label: clean(ref.label) || '参考',
      url,
      kind
    });
    if (out.length >= 3) break;
  }
  return out;
}

function normalizeStaticMap(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const status = data.status === 'ready' && clean(data.data_url) ? 'ready' : 'unavailable';
  return {
    data_url: status === 'ready' ? clean(data.data_url) : '',
    status,
    width: Number(data.width) || 0,
    height: Number(data.height) || 0,
    note: clean(data.note)
  };
}

function buildStaticMapRequest(pkg, options) {
  const opts = options || {};
  const width = Math.min(1024, Math.max(200, Number(opts.width) || 640));
  const height = Math.min(1024, Math.max(200, Number(opts.height) || 640));
  const markers = (pkg.map_anchors || [])
    .filter(a => Number.isFinite(Number(a.lat)) && Number.isFinite(Number(a.lng)))
    .slice(0, 10)
    .map((a, i) => ({
      lat: Number(a.lat),
      lng: Number(a.lng),
      label: String(a.order || i + 1)
    }));
  const overview = (pkg.route_lines || []).find(l => l.day == null)
    || (pkg.route_lines || []).find(l => l.status === 'provider')
    || null;
  let path = null;
  if (overview && Array.isArray(overview.points) && overview.points.length >= 2) {
    path = simplifyPoints(overview.points, 80);
  }
  return { width, height, markers, path, path_status: overview?.status || 'estimate' };
}
```

In `normalizeItem`, replace inline refs map with `refs: normalizeRefs(item.refs)`.

In `buildTripPackage` return object, add:

```js
static_map: normalizeStaticMap(opts.staticMap),
```

Export on `AeroTravelTripPackage`: `normalizeRefs`, `normalizeStaticMap`, `buildStaticMapRequest`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/frontend/trip-package.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add static/trip-package.js tests/frontend/trip-package.test.js
git commit -m "feat: package refs normalizer and static_map field"
```

---

### Task 2: Draft-ops persist refs on metadata.item

**Files:**
- Modify: `static/draft-ops.js` (`updateNode`)
- Test: `tests/frontend/draft-ops.test.js`

**Interfaces:**
- Consumes: `normalizeRefs` optional; may inline same rules or call package if loaded
- Produces: `updateNode(draft, nodeId, { refs })` writes `node.metadata.item.refs`
- Ensures: `nodeToItem` already spreads `metadata.item`, so itinerary gets refs

- [ ] **Step 1: Write failing test**

In `tests/frontend/draft-ops.test.js`, add a minimal draft fixture (or reuse existing) and:

```js
test("updateNode writes refs onto metadata.item for itinerary round-trip", () => {
  // arrange a draft with one scheduled node that has metadata.item
  const draft = /* existing helper or inline minimal valid draft */;
  const nodeId = draft.nodes[0].id;
  const next = window.AeroTravelDraftOps.updateNode(draft, nodeId, {
    refs: [
      { label: "攻略", url: "https://example.com/a", kind: "web" },
      { label: "坏", url: "not-a-url" }
    ]
  });
  const node = next.nodes.find(n => n.id === nodeId);
  assert.equal(node.metadata.item.refs.length, 1);
  assert.equal(node.metadata.item.refs[0].url, "https://example.com/a");
  const item = window.AeroTravelDraft.nodeToItem(node);
  assert.equal(item.refs[0].url, "https://example.com/a");
});
```

If `nodeToItem` is not exported, assert via `draftToItinerary` instead:

```js
const plan = window.AeroTravelDraft.draftToItinerary(next, { /* minimal */ });
// find item by title and assert refs
```

Use the same patterns as existing tests in that file for fixtures.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/frontend/draft-ops.test.js`  
Expected: FAIL — refs not applied

- [ ] **Step 3: Implement `updateNode` refs branch**

In `static/draft-ops.js` `updateNode`, after name/duration handling:

```js
if (Object.hasOwn(patch, 'refs')) {
  const raw = Array.isArray(patch.refs) ? patch.refs : [];
  const refs = [];
  for (const ref of raw) {
    if (!ref) continue;
    const url = String(ref.url || '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    refs.push({
      label: String(ref.label || '参考').trim() || '参考',
      url,
      kind: ['web', 'xhs', 'dianping', 'official'].includes(ref.kind) ? ref.kind : 'web'
    });
    if (refs.length >= 3) break;
  }
  if (!node.metadata || typeof node.metadata !== 'object') node.metadata = {};
  if (!node.metadata.item || typeof node.metadata.item !== 'object') node.metadata.item = {};
  node.metadata.item.refs = refs;
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/frontend/draft-ops.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add static/draft-ops.js tests/frontend/draft-ops.test.js
git commit -m "feat: persist place refs on draft metadata.item"
```

---

### Task 3: Workbench refs editor + delivery checklist

**Files:**
- Modify: `static/app.js` (`handleDraftListAction` edit-node, export menu handler)
- Modify: `static/index.html` (export + mobile menus)
- Test: extend `tests/frontend/trip-package.test.js` only if pure helpers extracted; otherwise manual smoke + existing package/nav tests

**Interfaces:**
- Consumes: `AeroTravelDraftOps.updateNode`, `normalizeRefs` optional
- Produces: `editNodeRefs(nodeId)`, `openRefsChecklist()`, menu action `refs-check`

- [ ] **Step 1: Add menu items**

In `static/index.html` export menu and mobile more menu, after preview or before ics:

```html
<button type="button" role="menuitem" data-action="refs-check">参考链接检查</button>
```

- [ ] **Step 2: Implement helpers in `app.js`**

```js
function parseRefPromptLine(line) {
  const text = String(line || '').trim();
  if (!text) return null;
  const pipe = text.indexOf('|');
  if (pipe === -1) return { label: '参考', url: text, kind: 'web' };
  return {
    label: text.slice(0, pipe).trim() || '参考',
    url: text.slice(pipe + 1).trim(),
    kind: 'web'
  };
}

function promptEditRefs(existing) {
  const current = Array.isArray(existing) ? existing.slice(0, 3) : [];
  const next = [];
  for (let i = 0; i < 3; i += 1) {
    const preset = current[i]
      ? `${current[i].label || '参考'}|${current[i].url || ''}`
      : '';
    const input = window.prompt(
      `参考链接 ${i + 1}/3（格式：标签|https://... ，留空结束）`,
      preset
    );
    if (input === null) return null; // cancel entire edit
    const parsed = parseRefPromptLine(input);
    if (!parsed) break;
    if (!/^https?:\/\//i.test(parsed.url)) {
      showToast(`已跳过非法链接：${parsed.url}`, 'error');
      continue;
    }
    next.push(parsed);
  }
  return next;
}

function editNodeWithRefs(nodeId) {
  const node = state.workingDraft.nodes.find(n => n.id === nodeId);
  if (!node) return;
  const name = window.prompt('地点名称', node.name || '');
  if (name === null || !name.trim()) return;
  const existing = node.metadata?.item?.refs || [];
  const refs = promptEditRefs(existing);
  if (refs === null) return;
  commitDraft(window.AeroTravelDraftOps.updateNode(state.workingDraft, nodeId, {
    name: name.trim(),
    refs
  }));
  showToast(refs.length ? `已保存 ${refs.length} 条参考链接` : '已清空参考链接', 'success');
}

function openRefsChecklist() {
  if (!state.workingDraft) {
    showToast('请先进入可编辑行程。', 'error');
    return;
  }
  const lines = [];
  state.workingDraft.days.forEach(day => {
    day.node_ids.forEach(id => {
      const node = state.workingDraft.nodes.find(n => n.id === id);
      if (!node || node.source === 'system' && false) { /* still list spots */ }
      if (!node) return;
      const count = (node.metadata?.item?.refs || []).length;
      lines.push({
        id: node.id,
        label: `D${day.day} · ${node.name} · ${count ? `${count} 条链接` : '无链接'}`
      });
    });
  });
  if (!lines.length) {
    showToast('当前没有可检查的地点。', 'error');
    return;
  }
  const menu = lines.map((row, i) => `${i + 1}. ${row.label}`).join('\n');
  const pick = window.prompt(`参考链接检查（输入序号编辑，取消关闭）\n${menu}`, '');
  if (pick === null || !String(pick).trim()) return;
  const index = Number(pick) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= lines.length) {
    showToast('无效序号', 'error');
    return;
  }
  editNodeWithRefs(lines[index].id);
}
```

Wire `edit-node` action to `editNodeWithRefs(nodeId)` instead of name-only prompt.

In export menu switch:

```js
else if (action === 'refs-check') openRefsChecklist();
```

- [ ] **Step 3: Manual smoke**

Run server if needed: `python server.py`  
Steps: open editor → ✎ node → add `攻略|https://example.com` → 导出「参考链接检查」→ 预览专属页应见 chips（after package rebuild via draft apply/commit path).  
If preview uses `state.itinerary`, ensure `commitDraft` / apply updates itinerary items with refs (via `draftToItinerary`). If commit only updates draft, call the same path that refreshes itinerary from draft after edit (follow existing `commitDraft` behavior).

- [ ] **Step 4: Commit**

```powershell
git add static/app.js static/index.html
git commit -m "feat: edit and checklist place reference links"
```

---

### Task 4: Amap static map client

**Files:**
- Modify: `clients/amap.py`
- Test: `tests/clients/test_amap_client.py`

**Interfaces:**
- Produces: `AMAP_STATIC_MAP_URL = "https://restapi.amap.com/v3/staticmap"`
- Produces: `build_static_map_params(key, *, width, height, markers, path) -> dict`
- Produces: `async def fetch_static_map(amap_key, *, width, height, markers, path) -> dict`  
  returns `{ "status": "ok", "content_type": "image/png", "content": bytes }` or `{ "status": "error", "info": str }`

- [ ] **Step 1: Write failing tests**

```python
def test_build_static_map_params_encodes_markers_and_path(self):
    from clients.amap import build_static_map_params
    params = build_static_map_params(
        "test-key",
        width=640,
        height=640,
        markers=[{"lat": 39.9, "lng": 116.4, "label": "1"}],
        path=[[39.9, 116.4], [39.91, 116.41]],
    )
    self.assertEqual(params["key"], "test-key")
    self.assertEqual(params["size"], "640*640")
    self.assertIn("116.4,39.9", params["markers"])
    self.assertIn("path", params)

def test_fetch_static_map_without_key_returns_error(self):
    from clients.amap import fetch_static_map
    result = asyncio.run(fetch_static_map("", width=100, height=100, markers=[], path=None))
    self.assertEqual(result["status"], "error")
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `python -m unittest tests.clients.test_amap_client -v`

- [ ] **Step 3: Implement**

```python
AMAP_STATIC_MAP_URL = "https://restapi.amap.com/v3/staticmap"

def build_static_map_params(
    amap_key: str,
    *,
    width: int = 640,
    height: int = 640,
    markers: list[dict] | None = None,
    path: list[list[float]] | None = None,
) -> dict:
    w = max(1, min(1024, int(width or 640)))
    h = max(1, min(1024, int(height or 640)))
    params: dict = {
        "key": amap_key,
        "size": f"{w}*{h}",
        "scale": 2,
    }
    marker_list = list(markers or [])[:10]
    if marker_list:
        # mid,0xFF0000,label:lng,lat
        parts = []
        for marker in marker_list:
            label = str(marker.get("label") or "")[:1] or "1"
            lng = float(marker["lng"])
            lat = float(marker["lat"])
            parts.append(f"mid,0xC96442,{label}:{lng},{lat}")
        params["markers"] = "|".join(parts)
    if path and len(path) >= 2:
        # path style: weight,color,transparency,fillcolor,filltransparency:lng1,lat1;lng2,lat2
        coords = ";".join(f"{float(p[1])},{float(p[0])}" for p in path[:200])
        params["paths"] = f"5,0xC96442,1,,:{coords}"
    return params

async def fetch_static_map(
    amap_key: str,
    *,
    width: int = 640,
    height: int = 640,
    markers: list[dict] | None = None,
    path: list[list[float]] | None = None,
) -> dict:
    if not amap_key:
        return {"status": "error", "info": "missing_api_key"}
    params = build_static_map_params(
        amap_key, width=width, height=height, markers=markers, path=path
    )
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(AMAP_STATIC_MAP_URL, params=params)
        if response.status_code != 200:
            return {"status": "error", "info": f"amap_http_{response.status_code}"}
        content_type = response.headers.get("content-type", "")
        if "image" not in content_type and not response.content.startswith(b"\x89PNG"):
            # Amap often returns JSON error body
            return {"status": "error", "info": "not_an_image"}
        return {
            "status": "ok",
            "content_type": "image/png",
            "content": response.content,
            "width": max(1, min(1024, int(width or 640))),
            "height": max(1, min(1024, int(height or 640))),
        }
    except Exception:
        return {"status": "error", "info": "amap_unavailable"}
```

Adjust marker label encoding if Amap rejects multi-char labels — keep single digit/letter.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```powershell
git add clients/amap.py tests/clients/test_amap_client.py
git commit -m "feat: amap static map client helper"
```

---

### Task 5: `/api/static_map` route

**Files:**
- Modify: `routers/location.py`
- Modify: `tests/routers/test_non_transport_routes.py` (or add focused tests there)

**Interfaces:**
- Produces: `GET /api/static_map?width=&height=&markers=lng,lat|lng,lat&path=lng,lat;lng,lat`
- Response JSON: `{ "status": "ok", "image_base64": "...", "width": 640, "height": 640 }` or error
- Markers query: up to 10 `lng,lat` pairs separated by `|`
- Path query: `lng,lat;lng,lat;...`

- [ ] **Step 1: Write failing route test**

Use existing TestClient pattern in `tests/routers/test_non_transport_routes.py`:

```python
def test_static_map_requires_key(self):
    # app with empty amap_key
    response = client.get("/api/static_map", params={"markers": "116.4,39.9"})
    self.assertEqual(response.status_code, 400)

def test_static_map_ok_returns_base64(self):
    # mock clients.amap.fetch_static_map to return png bytes
    ...
    self.assertEqual(response.status_code, 200)
    body = response.json()
    self.assertEqual(body["status"], "ok")
    self.assertTrue(body["image_base64"])
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement route**

```python
import base64
from clients.amap import fetch_static_map as amap_fetch_static_map

@router.get("/api/static_map")
async def static_map(
    width: int = 640,
    height: int = 640,
    markers: str = "",
    path: str = "",
):
    if not settings.amap_key:
        raise HTTPException(status_code=400, detail="未配置高德地图 Key (AMAP_KEY)")
    marker_list = []
    for index, part in enumerate((markers or "").split("|")):
        if index >= 10:
            break
        part = part.strip()
        if not part:
            continue
        try:
            lng_s, lat_s = part.split(",", 1)
            marker_list.append({
                "lng": float(lng_s),
                "lat": float(lat_s),
                "label": str((index + 1) % 10),
            })
        except ValueError:
            continue
    path_points = []
    if path:
        for part in path.split(";"):
            part = part.strip()
            if not part:
                continue
            try:
                lng_s, lat_s = part.split(",", 1)
                path_points.append([float(lat_s), float(lng_s)])  # store lat,lng for client helper
            except ValueError:
                continue
    result = await amap_fetch_static_map(
        settings.amap_key,
        width=width,
        height=height,
        markers=marker_list,
        path=path_points or None,
    )
    if result.get("status") != "ok":
        raise HTTPException(status_code=502, detail=result.get("info", "static_map_failed"))
    return {
        "status": "ok",
        "image_base64": base64.b64encode(result["content"]).decode("ascii"),
        "width": result["width"],
        "height": result["height"],
    }
```

Note: keep lat/lng convention consistent with `build_static_map_params` (lng,lat in Amap API).

- [ ] **Step 4: Run route + client tests — PASS**

- [ ] **Step 5: Commit**

```powershell
git add routers/location.py tests/routers/test_non_transport_routes.py
git commit -m "feat: proxy amap static map for workbench prerender"
```

---

### Task 6: Workbench enrichStaticMap + export/publish wiring

**Files:**
- Modify: `static/app.js`
- Optionally small helper in `static/trip-package.js` already has `buildStaticMapRequest`

**Interfaces:**
- Produces: `async function enrichStaticMap(pkg) → pkg` (mutates/returns copy with static_map)
- Consumes: `GET /api/static_map`, `fetchJson` / existing API helper
- All of: `exportOverviewImage`, `exportTripPdfBackup`, `previewDedicatedTrip`, `publishDedicatedTrip` await enrich

- [ ] **Step 1: Implement enrich**

```js
async function enrichStaticMap(pkg) {
  if (!pkg) return pkg;
  const req = window.AeroTravelTripPackage.buildStaticMapRequest(pkg);
  if (!req.markers.length) {
    pkg.static_map = {
      data_url: '',
      status: 'unavailable',
      width: req.width,
      height: req.height,
      note: '无可用坐标'
    };
    return pkg;
  }
  const markerParam = req.markers.map(m => `${m.lng},${m.lat}`).join('|');
  const pathParam = req.path
    ? req.path.map(p => `${p[1]},${p[0]}`).join(';')
    : '';
  try {
    const qs = new URLSearchParams({
      width: String(req.width),
      height: String(req.height),
      markers: markerParam
    });
    if (pathParam) qs.set('path', pathParam);
    const data = await fetchJson(`/api/static_map?${qs.toString()}`);
    if (data.status === 'ok' && data.image_base64) {
      pkg.static_map = {
        data_url: `data:image/png;base64,${data.image_base64}`,
        status: 'ready',
        width: data.width || req.width,
        height: data.height || req.height,
        note: req.path_status === 'provider' ? '道路数据' : '估算'
      };
    } else {
      throw new Error(data.message || 'static_map_failed');
    }
  } catch (_err) {
    pkg.static_map = {
      data_url: '',
      status: 'unavailable',
      width: req.width,
      height: req.height,
      note: '地图暂不可用'
    };
  }
  return pkg;
}

async function buildEnrichedTripPackage(extra) {
  const pkg = buildCurrentTripPackage(extra);
  if (!pkg) return null;
  return enrichStaticMap(pkg);
}
```

Update export/preview/publish to use `await buildEnrichedTripPackage(...)`.

For `exportOverviewImage`: after enrich, if `static_map.ready`, render sheet with img (Task 7); do not require Leaflet paint.

- [ ] **Step 2: Smoke without key**

With no key: export overview still downloads sheet with placeholder; no throw.

- [ ] **Step 3: Commit**

```powershell
git add static/app.js
git commit -m "feat: prerender static map into trip package on export"
```

---

### Task 7: PNG / print render use static_map

**Files:**
- Modify: `static/trip-share-render.js` (`renderOverviewPngSheet`, `renderOverviewDesktop` print path / map wrap optional)
- Test: `tests/frontend/trip-share-render.test.js`

**Interfaces:**
- Consumes: `pkg.static_map`
- PNG map frame: if ready → `<img class="png-static-map" src="..." alt="行程总览地图">`; else existing anchor fallback + text「地图见专属链接」
- Print overview: same img inside map wrap when ready (interactive Leaflet still used on live page)

- [ ] **Step 1: Failing tests**

```js
test("png sheet uses static_map image when ready", () => {
  const html = Render.renderOverviewPngSheet({
    ...samplePkg,
    static_map: {
      status: "ready",
      data_url: "data:image/png;base64,AAA",
      width: 640,
      height: 640
    }
  });
  assert.match(html, /png-static-map/);
  assert.match(html, /data:image\/png;base64,AAA/);
});

test("png sheet falls back when static_map unavailable", () => {
  const html = Render.renderOverviewPngSheet({
    ...samplePkg,
    static_map: { status: "unavailable", data_url: "" }
  });
  assert.match(html, /地图见专属链接|png-map-fallback/);
  assert.doesNotMatch(html, /png-static-map/);
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement render branches**

In `renderOverviewPngSheet`:

```js
const staticMap = pkg.static_map || {};
const mapBlock = staticMap.status === 'ready' && staticMap.data_url
  ? `<img class="png-static-map" src="${escapeHtml(staticMap.data_url)}" alt="行程总览地图" width="${escapeHtml(staticMap.width || 640)}" height="${escapeHtml(staticMap.height || 640)}">`
  : `<div class="png-map-fallback">
       <p class="trip-muted">地图见专属链接</p>
       ${(pkg.map_anchors || []).slice(0, 8).map((a, i) => `<span>${i + 1}. ${escapeHtml(a.title)}</span>`).join('')}
     </div>`;
// use mapBlock inside png-map-frame instead of always empty leaflet div
```

For `renderPrintableDocument` / desktop overview used in print: inject static img above or instead of empty map div when `static_map.ready`. Live `renderTripPage` keeps Leaflet divs for interaction.

Add minimal CSS in `trip-share.css`:

```css
.png-static-map {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 12px;
  background: #e8e6df;
}
```

- [ ] **Step 4: Run render tests — PASS**

- [ ] **Step 5: Commit**

```powershell
git add static/trip-share-render.js static/trip-share.css tests/frontend/trip-share-render.test.js
git commit -m "feat: use prerendered static map in PNG and print sheets"
```

---

### Task 8: Ops doc + full quality gate

**Files:**
- Modify: `docs/product/专属行程交付-操作说明.md`

- [ ] **Step 1: Document operator steps**

Add sections:

1. 编辑地点 ✎ 可添加最多 3 条 `标签|https://...` 参考链接。  
2. 导出菜单「参考链接检查」可按天查看覆盖并点选编辑。  
3. 导出总览图 / PDF / 发布前会尝试生成高德静态总览图；需配置 `AMAP_KEY`。失败时仍可交付，图上显示「地图见专属链接」。  
4. 客户 HTML 不含地图 Key；互动地图仍在线加载瓦片。

- [ ] **Step 2: Run full gate**

```powershell
.\scripts\check.ps1
```

Expected: All available checks passed.

- [ ] **Step 3: Commit**

```powershell
git add docs/product/专属行程交付-操作说明.md
git commit -m "docs: operator steps for refs and static map prerender"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| refs max 3, https only | 1, 2, 3 |
| edit via node ✎ | 3 |
| delivery checklist | 3 |
| draft metadata.item.refs round-trip | 2 |
| static_map on package | 1, 6 |
| workbench prerender only | 6 |
| backend proxy, no key in HTML | 4, 5 |
| PNG/PDF use img / placeholder | 7 |
| failure degrade continue | 6, 7 |
| ops doc | 8 |
| check.ps1 | 8 |

## Placeholder / consistency self-review

- No TBD steps.  
- Marker/path coordinate order: **Amap API uses `lng,lat`**; internal package points stay **`[lat,lng]`** — conversion explicit in Tasks 4–6.  
- `updateNode` refs API: `{ refs: [...] }` only (Task 2/3).  
- Enrich is async and only on workbench export paths.

---

Plan complete and saved to `docs/superpowers/plans/2026-07-12-trip-delivery-refs-static-map.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session with executing-plans and checkpoints  

Which approach?
