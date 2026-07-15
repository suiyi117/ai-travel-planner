# README 产品展示强化版设计

## 状态

已于 2026-07-11 通过可视化评审。最终选择“产品故事 + 工程入口”的产品展示强化版。

## 目标

让 GitHub 访客立即看懂 AeroTravel 的真实界面、旅行者能完成什么，以及它为什么比一段 AI 生成文本更实用，同时保留清晰的启动和工程文档入口。

此外，所有当前保留的 GitHub 分支都要在 GitHub 可见页面中注明用途和生命周期，而不只是记录在本地工程文档里。

## 受众

README 按以下优先级服务两类读者：

1. 判断产品是否值得体验的旅行者、评估者和作品集访客。
2. 判断项目能否运行、检查或扩展的开发者。

因此，README 前半部分展示产品和用户结果，技术启动与架构说明放在产品故事之后。

## README 信息结构

README 按以下顺序组织：

1. 居中的产品名、一句话价值主张和克制的徽章行。
2. 一张全宽当前产品截图，展示已生成的行程和打开的按需地图抽屉。
3. 四项结果摘要：多城规划、真实数据、可编辑行程和交付导出。
4. 三步旅行者路径：路线、偏好、行程。
5. 视觉能力区：一张较大的行程截图，加两张地图抽屉、编辑/导出细节截图。
6. 简洁的可信度说明：高德 POI/天气、OpenAI-compatible 模型、12306/航班参考和本地快照。
7. 60 秒本地启动。
8. 架构与核心目录边界。
9. 模型与环境配置。
10. 质量、安全、部署、分支管理和发布文档。
11. License。

较长的运维参考内容可以使用 Markdown `<details>` 折叠，以提升扫描效率；首次运行必需的命令必须保持展开。

## 视觉素材

只使用当前应用的真实截图。不得使用生成式概念图，也不得继续把已经过时的双栏工作台截图当作产品主图。

在 `docs/assets/` 下创建或替换以下资源：

| 资源 | 内容 | 用途 |
|---|---|---|
| `aerotravel-overview.png` | Step 3 已生成行程、摘要和打开的地图抽屉 | 全宽产品主图 |
| `aerotravel-itinerary.png` | 时间线、天气、交通和预算，地图不占据主体 | 证明结果结构化且可执行 |
| `aerotravel-map-drawer.png` | 地图抽屉、路线和真实 POI 详情 | 证明地理上下文和真实地点数据 |
| `aerotravel-editor.png` | 编辑约束以及交付/导出操作 | 证明行程可调整、可交付 |

使用稳定的桌面视口截图，浏览器控制台不得出现错误。只裁掉无意义的浏览器空白，不裁掉理解工作流所需的界面。压缩图片以控制 GitHub README 体积，同时保证界面文字可辨认。

只有在 README 引用全部迁移且新主图验证通过后，才能删除旧的 `docs/assets/aerotravel-home.png`。

## 文案风格

- 先讲用户结果，不先讲实现名词。
- 使用短标题和短段落。
- 精简核心能力，消除当前“为什么值得看”“使用路径”和架构部分之间的重复。
- 技术表述必须准确：无数据库、无登录、本地浏览器快照、高德由后端代理、航班 API 可选。
- 不使用装饰性 emoji 九宫格或过量徽章，视觉吸引力由真实产品图片承担。
- 中文为主；技术名和命令在有助于准确表达时保留英文。

## GitHub 分支注明方式

GitHub 的 Branches 页面没有自由填写“分支备注”的字段，因此使用三个 GitHub 可见位置共同注明：

1. 在 `README.md` 直接增加“当前 GitHub 分支”表，包含分支名、用途、关联 PR、维护方和删除条件。
2. 在 Dependabot PR #13 和 PR #14 顶部增加简短的“Branch purpose”说明，同时保留其自动生成的依赖详情。
3. 为 PR #13 和 PR #14 添加 `branch: temporary` 标签；标签说明写明源分支会在 PR 合并或关闭后删除。

README 表格注明：

- `master`：永久保留的受保护稳定分支，只能通过 Pull Request 修改。
- `dependabot/github_actions/github-actions-6ebb6fc752`：PR #13 的 GitHub Actions 临时依赖升级分支。
- `dependabot/pip/python-dependencies-315ee4c38f`：PR #14 的 Python 临时依赖升级分支。

表格必须说明 Dependabot 分支名由 GitHub 自动生成，实时状态以关联 Pull Request 为准。通用命名和清理规则继续由 `docs/engineering/branch-management.md` 维护。

## GitHub 修改安全边界

- 新用途说明下面必须保留 Dependabot 自动生成的原始 PR 正文。
- 不向 Dependabot 分支推送提交。
- 本次 README 修改不合并、不关闭 PR #13 或 PR #14。
- 不修改 `master` 保护、必需检查或 Dependabot 配置。
- `branch: temporary` 标签不存在时才创建，已经存在则复用。

## 范围

包含：

- 重写并重排 `README.md`。
- 截取并加入当前产品图片。
- 完成引用迁移后删除过时截图。
- 使 `docs/engineering/branch-management.md` 与 GitHub 可见分支表保持一致。
- 在 GitHub 上更新 PR #13、PR #14 的说明和标签。

不包含：

- 产品界面行为修改。
- 后端或 API 修改。
- 依赖升级或合并 Dependabot PR。
- 新建落地页、Logo、生成式插画或前端框架。
- 修改无关且未跟踪的 `docs/product/` 目录。

## 验证

合并前必须：

1. 运行 `.\scripts\check.ps1`。
2. 运行 `git diff --check`，并检查暂存文件是否含密钥或无关修改。
3. 在 GitHub 或等价 Markdown 预览中检查图片尺寸、表格、`<details>` 和链接。
4. 启动应用，确认每张截图都来自当前三步向导和按需地图抽屉。
5. 确认截图时浏览器控制台无错误或警告。
6. 确认 PR #13 和 PR #14 在新增用途说明下仍保留自动生成的依赖详情。
7. 确认 `branch: temporary` 标签存在并已应用到两个 Dependabot PR。
8. README PR 合并并删除其临时分支后，确认远端只保留 `master` 和两个进行中的 Dependabot 分支。
