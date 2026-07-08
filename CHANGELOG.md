# Changelog

本项目的所有重要变更记录，遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵从 `MAJOR.MINOR.PATCH`。

---

## [1.0.0] - 2026-07-08

### Added 新增
- 多城市行程规划：支持添加、删除、拖拽排序目的地城市
- AI 驱动的行程生成：支持 OpenAI / 通义千问 / DeepSeek / 智谱 GLM 等多家 LLM
- 12306 火车/高铁实时时刻表查询（`services/train_service.py`）
- 航班查询服务（聚合数据 API + 18 条热门城际航线回退数据，`services/flight_service.py`）
- 高德地图 POI 搜索与城市中心坐标查询
- Leaflet 交互式地图（高德瓦片、景点标记、路线折线、同步时间线）
- 时间线行程视图：按日标签页、类型筛选、费用明细、出行贴士
- 交通方式选择：支持全局偏好与分段独立指定（智能推荐/高铁/飞机/自驾）
- 响应式布局：桌面三列、平板双列、移动端单列
- 本地回退/演示模式：8 个主要中国城市的内置景点数据库
- `.env.example` 配置模板

### Technical Notes
- 后端：Python 3.10+ / FastAPI / Uvicorn
- 前端：纯 HTML/CSS/JS（无框架），Claude Design System 暖色主题
- 47+ 城市车站-电报码映射，55+ 城市机场 IATA 码映射
