# Welcome to Lark Bots

## How We Use Claude

Based on linkdom's usage over the last 30 days:

Work Type Breakdown:
  Build Feature  ████████░░░░░░░░░░░░  40%
  Debug Fix      ████████░░░░░░░░░░░░  40%
  Prototype      ████░░░░░░░░░░░░░░░░  20%

Top Skills & Commands:
  /compact  ██░░░░░░░░░░░░░░░░░░  2x/month

Top MCP Servers:
  _(no MCP servers configured)_

## Your Setup Checklist

### Codebases
- [ ] lark-bots — 飞书机器人项目（当前仓库）
- [ ] reflection-learning — 反思学习实验
- [ ] reflection-slime — 反思 slime 实验
- [ ] Self-Distillation — 自蒸馏实验
- [ ] colocate — 混合部署相关
- [ ] sglang-demo — SGLang 演示

### MCP Servers to Activate
_(none currently configured)_

### Skills to Know About
- /compact — 压缩对话上下文，长会话续航必备。
- lark-im — 飞书即时通讯，收发消息、管理群聊。
- lark-doc — 飞书云文档，创建和编辑文档。
- lark-calendar — 飞书日历，查看和管理日程。
- lark-base — 飞书多维表格，字段和记录操作。
- lark-drive — 飞书云空间，文件上传下载。
- lark-event — 飞书事件订阅，WebSocket 实时监听。
- lark-vc — 飞书视频会议，查询会议记录和纪要。

## Team Tips

- **用中文沟通** — 团队主要用中文交流，Claude 也支持中英混用，不用刻意切英文。
- **先 Plan 再动手** — 复杂功能先用 planner agent 出方案，确认方向再写代码，避免返工。
- **飞书 Skill 是主力工具** — `lark-im`、`lark-doc`、`lark-calendar` 等飞书 Skill 覆盖了大部分日常操作，先看 Skill 能不能做再考虑手写 API。
- **`/compact` 是续航关键** — 长对话中上下文会逐渐占满，用 `/compact` 压缩后可以继续工作，不用开新会话。
- **用 Team 模式做并行任务** — 需要同时做多件独立的事（比如一边写代码一边跑测试一边做 review），用 Team 模式创建多个 Agent 并行处理，共享任务列表。

## Get Started

1. **确认环境** — 运行 `lark-cli auth login` 确认飞书 CLI 已登录且有权限。
2. **试一个 Skill** — 用 `lark-im +send` 给自己发一条测试消息，验证整个链路通畅。
3. **读一个 Bot 代码** — 在 `lark-bots` 仓库里找一个现有的 bot，让 Claude 帮你走读代码，理解项目结构和飞书事件处理模式。
4. **跑通一次 Team 模式** — 用 Claude Code 创建一个 team，尝试让两个 Agent 分别做"读代码"和"写测试"，体验并行协作的流程。

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. The guide creator's personal usage data — don't extrapolate them into a "team workflow" narrative. -->
