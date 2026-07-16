# 部署与回滚清单

## 适用范围

本清单面向当前单实例 FastAPI + 静态前端部署形态。项目仍保持无数据库、无构建步骤、无登录系统，因此上线重点是环境变量、密钥、CORS、健康检查、日志和可回滚版本。

## 生产环境变量

| 变量 | 必填 | 建议值 | 说明 |
|---|---|---|---|
| `APP_ENV` | 是 | `production` | 启用生产安全默认值；禁止 `ALLOWED_ORIGINS=*`。 |
| `ALLOWED_ORIGINS` | 是 | `https://your-domain.example` | 逗号分隔的浏览器来源白名单，必须是实际域名。 |
| `AMAP_KEY` | 是 | 高德 Web 服务 Key | 后端代理 POI、城市中心、天气查询。 |
| `AI_API_KEY` | 是 | 模型供应商 API Key | OpenAI-compatible Chat Completions key。 |
| `AI_BASE_URL` | 否 | 供应商 endpoint | 默认 `https://api.openai.com/v1`。 |
| `AI_MODEL` | 否 | 生产选定模型 | 默认 `gpt-5.5`。 |
| `EXPOSE_CLIENT_CONFIG` | 否 | `false` | 当前前端不需要浏览器端地图 key，生产保持关闭。 |
| `LOG_LEVEL` | 否 | `INFO` | 请求日志为结构化 JSON。 |
| `JUHE_FLIGHT_API_KEY` | 否 | 空或真实 key | 不配置时使用内置航线参考数据。 |

## 上线前检查

- [ ] `.env` 未提交到 Git。
- [ ] `APP_ENV=production`。
- [ ] `ALLOWED_ORIGINS` 只包含正式域名，不包含 `*`。
- [ ] `EXPOSE_CLIENT_CONFIG=false`，除非明确要兼容旧版前端。
- [ ] `AMAP_KEY` 和 `AI_API_KEY` 已在部署平台的密钥管理中配置。
- [ ] `.\scripts\check.ps1` 本地通过。
- [ ] CI 通过。
- [ ] 人工冒烟清单 `docs/smoke-checklist.md` 在预发布或生产等价环境通过。
- [ ] 部署产物对应的 Git commit 或发布包编号已记录。

## 部署后 10 分钟观察

- [ ] `GET /api/health` 返回 200 且 `status=ok`。
- [ ] 日志持续输出 `request_completed` 事件。
- [ ] 没有新增 5xx 错误峰值。
- [ ] `/api/search_pois`、`/api/city_center`、`/api/weather` 无持续失败。
- [ ] `/api/plan` 的平均响应时间与上线前基线接近。
- [ ] 前端控制台无新增 JavaScript error。

## 回滚触发条件

满足任一条件即回滚：

- `/api/health` 连续 2 分钟不可用。
- 5xx 错误率明显高于上线前基线，或连续出现同类 500。
- `/api/plan` 主流程不可用。
- 高德或 AI key 暴露到 `/api/config` 或前端页面。
- CORS 配置导致正式域名无法访问 API。
- 前端首屏不可用、地图无法渲染或关键交互阻塞。

## 回滚步骤

1. 将流量切回上一版本，或重新部署上一稳定 commit。
2. 确认旧版本 `GET /api/health` 返回 `status=ok`。
3. 重新执行 `docs/smoke-checklist.md` 中的 P0 项。
4. 保留故障版本日志和请求 ID，用于后续复盘。
5. 在 `IMPLEMENTATION.md` 或变更记录中记录回滚原因、影响范围和修复计划。

## 当前架构备注

- 交互地图优先加载 OpenFreeMap / MapLibre 矢量底图，并保留高德栅格回退；部署网络需允许访问 `unpkg.com` 与 `tiles.openfreemap.org`。
- 地图显示层会将高德 GCJ-02 坐标转换为 WGS84，不需要开启 `EXPOSE_CLIENT_CONFIG`，也不应向浏览器暴露 `AMAP_KEY`。
- 无数据库迁移，因此回滚不涉及数据 schema。
- 用户保存的行程快照在浏览器 localStorage 中，服务端回滚不会迁移或删除。
- 12306 站点缓存位于 `services/.cache/`，可删除后由服务启动时自动重建。
