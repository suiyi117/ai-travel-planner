# AI 旅行规划师

输入目的地，AI 自动搜索高德地图景点数据，生成详细旅行行程和交互式地图。

## 功能

- 高德地图 POI 搜索 — 获取真实景点数据（评分、地址、电话、开放时间）
- AI 智能规划 — 根据景点数据和用户偏好生成每日行程
- 交互式地图 — 高德瓦片 + Leaflet.js，标注景点和路线
- 灵活 AI 接口 — 支持 OpenAI / 通义千问 / DeepSeek 等兼容接口

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置 API Key

复制 `.env.example` 为 `.env`，填入你的 API Key：

```bash
cp .env.example .env
```

编辑 `.env` 文件：
- `AMAP_KEY` — 高德地图 Web 服务 Key（[申请地址](https://console.amap.com/dev/key/app)）
- `AI_API_KEY` — AI 大模型 API Key
- `AI_BASE_URL` — AI API 地址（默认 OpenAI，可改为通义千问/DeepSeek）
- `AI_MODEL` — 模型名称

### 3. 启动

```bash
python server.py
```

浏览器打开 http://localhost:8000

## 支持的 AI 模型

| 模型 | AI_BASE_URL | AI_MODEL |
|------|------------|----------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |

## 项目结构

```
ai-travel-planner/
├── server.py              # FastAPI 后端
├── static/
│   └── index.html         # 前端页面
├── .env                   # API Key 配置（不要提交到 Git）
├── .env.example           # 配置模板
├── requirements.txt       # Python 依赖
└── README.md
```

## 技术栈

- **后端**: Python 3.10+ / FastAPI / httpx
- **前端**: HTML / CSS / JavaScript (Vanilla)
- **地图**: Leaflet.js + 高德地图瓦片
- **景点数据**: 高德地图 POI API
- **AI**: OpenAI 兼容接口

## License

MIT
