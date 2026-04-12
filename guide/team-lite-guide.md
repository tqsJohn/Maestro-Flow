# Maestro Team Lite — 使用指南

面向 2-8 人小团队的 Git-native 协作扩展。架构与设计理由见
[team-lite-design.md](./team-lite-design.md)，本文只讲「怎么用」。

## 快速开始

3 步加入你的团队：

```bash
# 1. 确认 git 身份已配置（uid 从 user.email 的 local-part 派生）
git config user.name  # 例: Alice
git config user.email # 例: alice@example.com

# 2. 登记成员（幂等，可重复跑）
maestro team join

# 3. 启用 PostToolUse 心跳 hook（per-project 写入 .claude/settings.json）
maestro hooks install --project
```

完成后，`maestro team whoami` 应能打印你的 uid / host / role。每次你在
Claude Code 里调用工具，`maestro-team-monitor` 会自动向
`.workflow/collab/activity.jsonl` 追加一条心跳。

## 日常工作流

```bash
# 查看谁在做什么（最近 30 分钟）
maestro team status

# 同步队友改动（stash → pull --rebase → pop → push）
maestro team sync

# 启动 /maestro-plan 或 /maestro-execute 前会自动跑 preflight，
# 如果队友在同一 phase 活动会打印警告并拒绝继续
```

`/maestro-plan` 和 `/maestro-execute` 命令的 markdown 模板已经集成了
preflight 调用，你不需要手工触发。

## 核心命令速查

**`maestro team join`** — 幂等注册当前 git 身份到
`.workflow/collab/members/{uid}.json`

```
$ maestro team join
Joined as alice <alice@example.com> on alice-laptop (admin)
```

**`maestro team whoami`** — 展开本地成员档案

```
$ maestro team whoami
uid:    alice
name:   Alice
email:  alice@example.com
host:   alice-laptop
role:   admin
joined: 2026-04-11T10:00:00.000Z
```

**`maestro team status [--window N]`** — 按时间倒序展示最近 N 分钟（默认 30）的队友活动

```
$ maestro team status
Active in last 30 min:
  alice@alice-laptop    maestro-execute     P3/TASK-001    2 min ago
  bob@bob-desktop       wiki-update         spec-auth      5 min ago
```

**`maestro team report --action <name>`** — 手动上报一条 activity。通常
由 hook 调用，也可用在长跑脚本里：

```bash
maestro team report --action nightly-import --phase 3 --target etl-jobs
```

**`maestro team sync [--dry-run]`** — 一键同步（stash → pull --rebase → pop → push）

```
$ maestro team sync
Stashing local changes (maestro-team-sync-auto)...
Pulling from origin/HEAD (rebase)...
Pushing...
Sync complete.
```

**`maestro team preflight --phase N [--force] [--json]`** — 冲突预扫描

```
$ maestro team preflight --phase 3
⚠ bob@bob-desktop is active on phase 3 (last: maestro-execute, 4 min ago)
exit: 1
```

## Statusline

安装 hook 后，Claude Code 状态栏会出现队友段：

```
model | P3 | TASK-001 | ~/proj | 👥 alice (P3/001) | bob (spec-auth) +2
```

格式约定：
- `👥` emoji 开头，最多展示 3 个最活跃的队友
- `alice (P3/001)` — `alice` 在 phase 3 / TASK-001 活动
- `bob (spec-auth)` — `bob` 在操作 `spec-auth` 这个 target
- `+2` — 还有 2 位队友活动，但超出 inline 上限被折叠

开启条件：已执行 `maestro team join`（无成员档案则整段不显示），且
`activity.jsonl` 里存在 30 分钟内的非自身事件。结果缓存 10 秒以避免
statusline 刷新时把磁盘 IO 拉满。

## 冲突预警

`maestro team preflight --phase N` 会 tail 最近 500 条 activity，过滤出
同 phase 但非自身的心跳，命中则 exit 1。`/maestro-plan` 与
`/maestro-execute` 命令会在执行体前调用它，因此两人同时进入同一 phase 时
后进入者会看到警告。

什么时候用 `--force` 绕过：
- **你已经和队友协调过**（口头、IM 等），确认是合作而非冲突
- 队友的心跳是历史遗留（超过 30 分钟窗口内但实际已停手）
- 临时补丁类工作，你知道范围不会撞车

**不要用 `--force` 的场景**：拿不准、没人确认过、警告里的 action 是
`maestro-execute`（意味着对方正在动代码）。

## 同步策略

**什么时候跑 `team sync`**：
- 开始新 phase 前
- 被 preflight 拦下，想拿最新状态再判断
- 长时间没 pull（> 2 小时）

**stash pop 遇到 conflict**：`team sync` 会以 exit 4 停在冲突状态。你的
改动仍然在 stash 里（`git stash list` 能看到 `maestro-team-sync-auto`
条目）。手动解决后 `git add` + `git commit`，或 `git stash drop` 丢掉
本地改动。

**rebase 失败**：`team sync` 会自动 `git rebase --abort` 并尝试
`git stash pop` 恢复现场。如果你看到 `Warning: failed to restore stash`，
你的改动还在 stash 列表里，手动 `git stash pop` 即可。

**push 被拒**：`team sync` 会自动重试一次 pull --rebase + push。两次都
失败时 exit 3，保留 stash。查 `git log --oneline origin/HEAD..HEAD` 看
本地超前情况，必要时分批 push。

## 故障排查

**"Team mode not enabled"** — 你没跑过 `maestro team join`，或者当前工作
目录不是 git 仓库。验证：`git config user.email` 有值，且
`.workflow/collab/members/` 下存在 `{你的 uid}.json`。

**`activity.jsonl` 在哪里** — `.workflow/collab/activity.jsonl`。这是
团队共享的 append-only 日志，`.gitattributes` 里配置了 `merge=union` 所以
行级并集合并，很少出冲突。

**日志轮转** — 文件 > 10 MB 或每周一 00:00 会被重命名为
`.workflow/collab/activity-archives/activity-{YYYY}W{WW}.jsonl`。轮转由
`maestro team sync` 顺带检查，也可以手动 `maestro team sync --dry-run`
查看是否需要触发。

**清空某人的活动** — activity.jsonl 是 append-only 的，不要手编辑单行。
如需清空整个文件：`rm .workflow/collab/activity.jsonl`，下次心跳会自动
重建。

**Hook 没触发** — 跑 `maestro hooks status` 检查 PostToolUse 入口里是否
包含 `maestro-team-monitor.js`，没有则重跑 `maestro hooks install --project`。
hook 设计是静默失败，只能靠 `team status` 间接验证。

**跨机同 uid 冲突** — 两人 git email 的 local-part 相同时（`alice@a.com`
vs `alice@b.com`），join 会给后来者追加数字后缀（`alice-2`）。

## 与 agent 协作边界

`maestro team` 命令**只**读写 `.workflow/collab/` 目录——这是**人类
团队协作**的数据域。`.workflow/.team/` 目录是**agent 流水线**内部角色间
消息总线，由 `src/tools/team-msg.ts` 独占管理，两者严格不互通。

不要手工在 `.workflow/.team/` 下放东西，也不要让 `maestro team report`
写入 agent 域。命名重复是历史原因；磁盘布局已经隔离。详情见
[team-lite-design.md](./team-lite-design.md) 「命名空间边界」章节。

## 测试说明

全部 team-lite 测试使用 Node.js 内置 `node:test`：

```bash
npx tsx --test src/utils/__tests__/jsonl-log.test.ts \
  src/tools/__tests__/team-members.test.ts \
  src/tools/__tests__/team-activity.test.ts \
  src/hooks/__tests__/team-monitor.test.ts \
  src/commands/__tests__/team-preflight.test.ts \
  src/hooks/__tests__/statusline-team.test.ts
```

端到端冒烟（自动 build + 临时 git 仓库 + 跑完所有子命令）：

```bash
node scripts/team-lite-smoke.mjs
```
