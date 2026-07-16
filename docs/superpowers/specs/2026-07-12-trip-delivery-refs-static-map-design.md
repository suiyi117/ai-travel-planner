# Phase 4/5 交付补丁设计：精选参考链接 + 静态地图预渲染

**日期：** 2026-07-12
**分支：** `feature/专属行程交付`
**状态：** 已评审（对话确认方案 A）
**上位文档：**
- [专属交互行程页](../../product/专属交互行程页.md)
- [地图行程单生成系统](../../product/地图行程单生成系统.md)
- [专属行程交付-操作说明](../../product/专属行程交付-操作说明.md)

## 问题

交付闭环 MVP 已有统一 trip package → HTML / PNG / PDF，但：

1. 客户页可渲染 `item.refs` chips，工作台无法录入精选外链。
2. PNG / PDF 依赖 Leaflet 瓦片截图，CORS 与离线场景下地图常空白。
3. 需要在不引入账号 / DB / 支付的前提下，把「经营者可交付」质量补到可支撑 30 天验证。

## 目标

- 经营者能为地点挂最多 3 条人工精选 HTTPS 参考链接，并在交付前检查覆盖。
- 工作台在发布/导出时预渲染高德静态总览图写入 package；PNG / PDF 优先用该图，失败则降级继续。
- 客户互动地图仍用 Leaflet；静态图不把 `AMAP_KEY` 打进客户 HTML。

## 非目标

- 账号、数据库、自动托管、访问码、支付。
- 客户页运行时请求静态图 API。
- 生成式 AI 画地图或路线。
- 完整模态编辑器重构（保持现有 prompt 轻量交互风格）。
- 每日多张静态图或横向第二模板（可后续迭代）。

## 方案选择

采用 **方案 A：最小扩展**。

- refs：扩展现有节点 ✎ prompt 流 + 交付前轻量检查列表。
- 静态图：后端代理高德 staticmap；工作台预渲染 data URL 写入 package；失败 `unavailable` 不阻断。

未选 B（完整模态 UI）因改动面大、与当前 editor 风格不一致。
未选 C（仅发布时批量填 refs）因不进入 itinerary/draft，重生成会丢。

## 数据模型

### refs（挂在行程 item 上）

```js
item.refs: Array<{
  label: string,          // 展示名，默认「参考」
  url: string,            // 必须 http: 或 https:
  kind: 'web' | 'xhs' | 'dianping' | 'official'
}>
// 每地点最多 3 条；空 url 丢弃
```

- 草稿：`node.metadata.item.refs`；`draftToItinerary` 已从 `metadata.item` 回写，须保证编辑时同步写入 metadata。
- package：`normalizeItem` 已规范化 refs；客户页 `buildItemActions` 已出 chips。

### static_map（挂在 package 顶层）

```js
package.static_map: {
  data_url: string,       // data:image/png;base64,... 或 ''
  status: 'ready' | 'unavailable',
  width: number,          // 请求宽度，≤1024
  height: number,         // 请求高度，≤1024
  note: string            // 可选，如「道路数据」/「估算」
}
```

- 仅工作台 enrich 时写入；自包含 HTML 随 package 内联。
- 无图时 `status: 'unavailable'`，`data_url: ''`。

### 已有、本设计不改的字段

- `share_url` / `valid_until` / `route_lines`（Phase 1–3 已落地）

## 组件与流程

### Phase 4 — 精选参考链接

1. **节点编辑（✎）**
   - 保留改名称。
   - 随后循环 prompt 输入 `标签|URL`（或仅 URL）；空输入结束。
   - 校验：trim、最多 3 条、仅 `http://` / `https://`。
   - 写入：`updateNode` 更新 `name`，并设置 `metadata.item.refs`（及若存在的并行 item 字段路径，以 draft 往返为准）。

2. **交付检查**
   - 导出菜单增加「参考链接检查」（或发布前可选打开）。
   - 列出：Day · 地点 · refs 条数；无链高亮。
   - 「编辑」复用同一套 refs 编辑逻辑。
   - 不强制每地都有链；检查是辅助不是门禁。

3. **消费**
   - 无需改客户页 chips 逻辑（已有）；补测试覆盖带 refs 的 package → 渲染。

### Phase 5 — 静态地图预渲染 + 5a 兜底

```text
buildCurrentTripPackage(extra)
  → base package (含 route_lines / anchors)
  → enrichStaticMap(pkg)   // 异步，导出/发布路径 await
       GET /api/static_map?... 或 POST JSON 标记/路径
       成功 → static_map.status=ready + data_url
       失败 → unavailable，继续
  → preview / publish / PNG / PDF
```

| 输出 | 地图 |
|---|---|
| PNG sheet | `ready` → `<img src=data_url>`；否则锚点列表 +「地图见专属链接」 |
| 打印 PDF | 同上（断网可见预渲染图） |
| 客户互动 HTML | Leaflet + `route_lines`；不依赖 static_map |
| 5a | 若仍走 Leaflet 截图：短等待；失败占位，不假装成功 |

### 后端

- `clients/amap.py`
  - 构造高德静态地图 URL（markers ≤10、paths ≤4、尺寸 ≤1024）。
  - 拉取 PNG bytes；错误映射清晰。
- `routers/location.py`
  - `GET /api/static_map`（或等价）：校验参数、无 key → 400、上游失败 → 502/降级信息。
  - 响应：`image/png` 或 JSON `{ image_base64, width, height }`（实现计划选定一种并测）。
- **不**在客户 HTML 中嵌入 `AMAP_KEY`。

### 路径/标记简化规则

- 标记：优先 `map_anchors` 顺序，截断至 10。
- 路径：优先 `route_lines` 中 overview（`day: null`）或 status=provider 的线；点列抽稀至 API 可接受长度。
- 超限：服务端/客户端先简化再请求；仍失败 → unavailable。

## 错误处理

| 场景 | 行为 |
|---|---|
| 非法 refs URL | 跳过该条 + toast |
| refs > 3 | 截断并提示 |
| 无 AMAP_KEY / 静态图失败 | `static_map.unavailable`，发布/导出继续 |
| 用户取消 prompt | 不修改草稿 |
| html2canvas 失败 | toast，建议 PDF / 专属页 |

## 测试计划

- 前端：refs 规范化与截断；package 透传 `static_map`；render PNG/print 分支；draft 往返 refs（若改 draft-ops）。
- 后端：staticmap URL/参数；无 key；标记上限；bytes/base64 响应。
- 门禁：`.\scripts\check.ps1`。
- 手工：编辑 refs → 预览 chips；有 key 导出 PNG 见底图；断网打开自包含 HTML 打印仍见预渲染图。

## 文件触点（实现时）

| 区域 | 文件 |
|---|---|
| 编排 | `static/app.js` |
| package | `static/trip-package.js` |
| 渲染 | `static/trip-share-render.js`、必要时 `trip-share-boot.js` / CSS |
| 草稿 | `static/draft-ops.js` / `draft.js`（仅当往返丢 refs） |
| 后端 | `clients/amap.py`、`routers/location.py`、对应 `tests/` |
| 文档 | `docs/product/专属行程交付-操作说明.md` |

## 验收标准

- [ ] 节点可增删改最多 3 条 HTTPS refs，预览页显示对应 chips。
- [ ] 交付检查列出各地点链接覆盖，可点进编辑。
- [ ] 有 Key 时发布/导出 package 含 `static_map.status=ready`，PNG/PDF 使用该图。
- [ ] 无 Key 或失败时仍可发布，PNG/PDF 有明确占位。
- [ ] 客户 HTML 不含 AMAP_KEY。
- [ ] `.\scripts\check.ps1` 通过。

## 实现顺序建议

1. refs 写入路径 + 测试（TDD）
2. 交付检查列表
3. amap staticmap client + 路由 + 测试
4. `enrichStaticMap` + package 字段
5. render PNG/print 用 img / 占位
6. 导出/发布 await enrich；操作说明更新

---

**对话确认记录：** 范围 4+5a+5b；预渲染进 package；refs=弹窗+交付检查；失败降级继续；方案 A。
