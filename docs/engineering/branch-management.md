# Branch Management

本仓库采用短期分支工作流。除受保护的 `master` 外，其他分支都应关联一个进行中的 Pull Request，并在合并或关闭后删除。

## 当前远端分支

以下清单记录 2026-07-11 在 GitHub 上实际保留的分支。Dependabot 分支名由 GitHub 自动生成，后续批次的名称可能变化。

| 分支 | 用途 | 创建与维护方 | 生命周期与删除条件 |
|---|---|---|---|
| `master` | 稳定主分支，保存已通过质量与安全检查的可发布代码 | 仓库维护者 | 永久保留；只能通过 Pull Request 合并，禁止强推和删除 |
| `dependabot/github_actions/github-actions-6ebb6fc752` | GitHub Actions 依赖分组升级，对应 PR #13 | GitHub Dependabot | 临时分支；PR 合并或关闭后删除 |
| `dependabot/pip/python-dependencies-315ee4c38f` | Python 运行与开发依赖分组升级，对应 PR #14 | GitHub Dependabot | 临时分支；PR 合并或关闭后删除 |

GitHub 没有通用的“分支备注”字段，因此分支用途以本文件和对应 Pull Request 的标题、说明为准。实时状态以 GitHub 的 Branches 和 Pull requests 页面为准。

## 分支命名与用途

| 模式 | 用途 | 期限 |
|---|---|---|
| `codex/<topic>` | Codex 执行的代码、文档或维护任务 | 短期；合并或关闭 PR 后删除 |
| `feature/<topic>` | 人工开发的新功能 | 短期；建议 1-3 天内合并，合并后删除 |
| `fix/<topic>` | 缺陷修复 | 短期；验证并合并后删除 |
| `chore/<topic>` | 依赖、工具或仓库维护 | 短期；合并后删除 |
| `dependabot/*` | GitHub 自动创建的依赖升级 | 临时；对应 PR 结束后删除 |

没有进行中 PR 的非 `master` 远端分支不应长期保留。需要长期冻结某个可发布状态时使用不可变 Git tag，不使用长期发布分支。

## 日常检查与清理

查看 GitHub 上的实际远端分支：

```powershell
gh api repos/suiyi117/ai-travel-planner/branches --paginate --jq '.[].name'
```

清理本地已经失效的远端跟踪引用：

```powershell
git fetch --prune origin
```

删除远端分支前先确认其 Pull Request 已合并或关闭。不要删除 `master`，不要对受保护分支强推。
