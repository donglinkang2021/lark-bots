# Feishu Claude MVP

将飞书 IM 与本地 Claude CLI 串联的轻量桥接服务。在飞书中直接与 Claude 对话，支持流式输出、LaTeX 公式渲染、多轮会话续接，以及 GLM 等第三方 Anthropic 兼容后端。

## 功能特性

- **实时消息桥接** — 通过 lark-cli 订阅飞书消息事件，转发至本地 Claude CLI 并回复
- **流式输出** — Claude 生成内容实时更新到飞书消息卡片，无需等待完整回复
- **LaTeX 公式渲染** — 自动识别 `$$...$$` 行间公式，渲染为高清图片嵌入卡片；`$...$` 行内公式以代码样式展示
- **多轮会话** — 每个飞书对话维护独立的 Claude 会话，使用 `--resume` 自动续接上下文
- **富文本 / 纯文本切换** — `/card` 卡片模式（默认，支持 Markdown 渲染和公式图片）和 `/markdown` 纯文本模式
- **访问控制** — 基于发送者 ID 和群聊 ID 的白名单机制；发送者在白名单中时跳过群聊检查
- **工作目录切换** — `/cd <path>` 按会话切换 Claude 工作目录，自动加载对应项目的 `.claude/` 配置
- **自定义后端** — 支持通过环境变量接入 GLM 或其他 Anthropic 兼容 API
- **单实例锁定** — 文件锁防止多实例运行，支持优雅停止
- **状态持久化** — 会话和去重记录原子写入磁盘，重启后恢复

## 前置要求

| 依赖 | 说明 |
|------|------|
| **Node.js** ≥ 18 | 运行时环境 |
| **lark-cli** | 飞书 CLI 工具，用于事件订阅和消息收发 |
| **Claude CLI** | Anthropic 官方 CLI，用于 AI 对话 |
| **飞书自建应用** | 需开通机器人能力和事件订阅 |

## 从零开始配置

以下是从注册飞书应用到启动桥接服务的完整流程。

### 第一步：安装 lark-cli

```bash
# npm 全局安装
npm install -g @anthropic-ai/lark-cli

# 或使用官方安装脚本（参考 lark-cli 文档）
```

安装完成后登录飞书：

```bash
lark-cli auth login
```

按提示完成扫码或网页授权。登录成功后，lark-cli 会自动管理 token 刷新。

### 第二步：创建飞书自建应用

1. 访问 [飞书开放平台](https://open.feishu.cn/app) ，点击 **创建自建应用**
2. 填写应用名称和描述（如 "Claude Bot"），确认创建
3. 进入应用详情页，完成以下配置：

#### 开通机器人能力

- 左侧菜单选择 **应用能力** → **机器人**
- 点击 **开通机器人能力**

#### 配置事件订阅

- 左侧菜单选择 **事件与回调** → **事件配置**
- 点击 **添加事件**，搜索并订阅 `im.message.receive_v1`（接收消息）
- **事件传输方式**选择 **长连接（WebSocket）**，不需要配置公网回调地址

#### 获取凭据

- 左侧菜单选择 **凭证与基础信息**
- 记录 **App ID** 和 **App Secret**

#### 发布应用

- 在 **版本管理与发布** 页面创建版本并提交审核
- 审核通过后，应用即可使用

#### 获取你的 open_id

你需要在飞书中获取自己的 `open_id`，用于配置白名单。最简单的方式：

```bash
# 通过 lark-cli 搜索自己
lark-cli contact +search-user --query "你的姓名" --format pretty
```

返回结果中的 `open_id` 字段即为所需值。

### 第三步：安装 Claude CLI

```bash
# 参考Anthropic官方文档安装 Claude CLI
# https://docs.anthropic.com/en/docs/claude-code

# 安装完成后登录
claude auth login
```

> 如果你使用 GLM 等第三方后端，可以跳过 Anthropic 登录，在 `.env` 中配置 `ANTHROPIC_BASE_URL` 和 `ANTHROPIC_AUTH_TOKEN` 即可。

### 第四步：配置并启动桥接服务

```bash
# 克隆项目
git clone https://github.com/your-username/feishu-claude-mvp.git
cd feishu-claude-mvp

# 安装依赖
npm install

# 复制环境变量模板
cp .env.example .env
```

编辑 `.env` 文件，填写必要配置：

```bash
# === 必填 ===
PROJECT_ROOT=/absolute/path/to/your/project    # Claude CLI 的工作目录
ALLOWED_SENDER_IDS=ou_xxxxxx                   # 你的飞书 open_id，多个用逗号分隔

# === 选填 ===
ALLOWED_CHAT_IDS=                              # 限制特定群聊 ID，多个用逗号分隔
BOT_OPEN_ID=                                   # 机器人的 open_id，用于过滤自身消息
```

配置完成后启动服务：

```bash
npm start
```

启动成功后，你会看到日志输出，且飞书中会收到一条启动通知消息。

### 验证

在飞书中找到你的机器人，发送一条消息：

```
你好，请介绍一下你自己
```

如果一切配置正确，你会看到 Claude 的流式回复实时更新在消息卡片中。

## 环境变量参考

所有配置通过 `.env` 文件管理（已 gitignore），完整变量列表如下：

### 必填

| 变量 | 说明 |
|------|------|
| `PROJECT_ROOT` | Claude CLI 子进程的工作目录（绝对路径） |
| `ALLOWED_SENDER_IDS` | 允许使用机器人的飞书用户 open_id，多个用逗号分隔 |

> `ALLOWED_SENDER_IDS` 和 `ALLOWED_CHAT_IDS` 至少配置一项，否则启动报错。

### 访问控制

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ALLOWED_CHAT_IDS` | （空） | 允许的群聊 ID，多个用逗号分隔 |
| `BOT_OPEN_ID` | （空） | 机器人自身的 open_id，用于过滤自己发出的消息 |

### Claude CLI 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CLAUDE_CLI_PATH` | `claude` | Claude CLI 可执行文件路径 |
| `CLAUDE_BARE_MODE` | `false` | 设为 `true` 启用 `--bare` 模式 |
| `CLAUDE_PERMISSION_MODE` | `default` | 权限模式：`default` 或 `bypassPermissions`（跳过权限确认并设置 `IS_SANDBOX=1`） |
| `CLAUDE_MODEL` | （空） | 覆盖默认模型，如 `claude-sonnet-4-6` |
| `CLAUDE_SYSTEM_PROMPT` | （空） | 自定义系统提示词 |
| `CLAUDE_ALLOWED_TOOLS` | （空） | 允许使用的工具列表，逗号分隔 |
| `CLAUDE_ADD_DIRS` | （空） | 额外允许访问的目录，逗号分隔，支持相对/绝对路径 |

### 第三方后端（GLM 等）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ANTHROPIC_BASE_URL` | （空） | 自定义 API 端点 URL |
| `ANTHROPIC_AUTH_TOKEN` | （空） | API 认证密钥 |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | （空） | Opus 级别模型名称 |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | （空） | Sonnet 级别模型名称 |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | （空） | Haiku 级别模型名称 |

这些变量会透传给 Claude CLI 子进程作为环境变量，使其连接到兼容的第三方后端。

### 运行时调优

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LARK_CLI_PATH` | `lark-cli` | lark-cli 可执行文件路径 |
| `REPLY_CHUNK_SIZE` | `1500` | 纯文本回复分块字符数 |
| `MIN_EVENT_INTERVAL_MS` | `1000` | 同一对话的最小消息间隔（毫秒），用于防刷 |
| `STREAMING_FLUSH_INTERVAL_MS` | `750` | 流式缓冲区定时刷新间隔（毫秒） |
| `STREAMING_MIN_FLUSH_CHARS` | `120` | 流式缓冲区最小刷新字符数 |
| `STREAMING_UPDATE_INTERVAL_MS` | `1500` | 飞书消息卡片更新节流间隔（毫秒） |
| `CLAUDE_TIMEOUT_MS` | `600000` | Claude CLI 单次执行超时（毫秒，默认 10 分钟） |
| `MAX_PROMPT_CHARS` | `8000` | 单条消息最大字符数 |
| `STATE_FILE_PATH` | `./data/state.json` | 状态持久化文件路径 |
| `LOCK_FILE_PATH` | `./data/bridge.lock` | 单实例锁文件路径 |

## 飞书内指令

在飞书对话中直接发送以下指令：

| 指令 | 别名 | 说明 |
|------|------|------|
| 普通文本 | — | 继续当前 Claude 对话 |
| `/help` | — | 显示帮助信息 |
| `/status` | — | 查看当前会话状态（对话标识、运行状态、渲染模式、Claude 会话 ID） |
| `/reset` | — | 重置当前对话，下一条消息开启全新 Claude 会话 |
| `/cd <path>` | — | 切换工作目录（加载对应 .claude/ 配置，会话将重新开始） |
| `/cd` | — | 查看当前工作目录 |
| `/cd -` | — | 重置回项目根目录 |
| `/markdown` | `/md` | 切换到纯文本模式 |
| `/card` | — | 切换到富文本卡片模式（默认） |

## 架构概览

```
飞书用户发送消息
  → lark-cli event +subscribe (WebSocket 长连接, NDJSON 输出)
  → eventParser 解析事件行
  → bridgeService.handleEvent():
       1. 事件去重 + 访问控制 + 频率限制
       2. 指令路由 (/help, /status, /reset, /markdown, /card, /cd)
       3. 发送 "正在思考..." 确认卡片
       4. 启动 Claude CLI 流式子进程 (stream-json 格式)
       5. 流式增量通过 PATCH API 实时更新卡片
       6. 完成后最终更新：渲染 LaTeX 公式为图片并上传飞书
       7. 持久化会话元数据
```

## 项目结构

```
feishu-claude-mvp/
├── src/
│   ├── index.ts                 # 入口：启动、信号处理、启动通知
│   ├── config.ts                # 环境变量加载与校验
│   ├── bridgeService.ts         # 核心编排：去重、限流、指令路由、流式生命周期
│   ├── claude/
│   │   ├── claudeProcess.ts     # Claude CLI 子进程封装 (runPrompt / runPromptStream)
│   │   ├── responseFormatter.ts # 消息分块、流式缓冲区
│   │   └── formulaRenderer.ts   # LaTeX → SVG → PNG → 飞书图片上传
│   ├── lark/
│   │   ├── cardBuilder.ts       # 飞书卡片 JSON 构建（1.0 / 2.0）
│   │   ├── eventParser.ts       # NDJSON 事件行解析
│   │   ├── replyClient.ts       # 消息回复、卡片回复、PATCH 更新
│   │   ├── subscribeRunner.ts   # 事件订阅（含崩溃自动重连和指数退避）
│   │   └── types.ts             # 消息事件与指令类型定义
│   ├── persistence/
│   │   └── stateFile.ts         # 原子化 JSON 持久化（写临时文件后 rename）
│   ├── router/
│   │   └── commandRouter.ts     # 指令解析与帮助文本
│   ├── security/
│   │   └── guards.ts            # 白名单校验、消息类型/长度检查
│   ├── session/
│   │   ├── sessionStore.ts      # 会话 CRUD、事件去重、状态持久化
│   │   └── sessionTypes.ts      # 会话与持久化状态类型
│   └── utils/
│       ├── backoff.ts           # 指数退避与 sleep
│       └── logger.ts            # 带时间戳的日志工具
├── scripts/
│   └── stop.js                  # 优雅停止脚本
├── test/
│   ├── integration/             # 集成测试
│   └── unit/                    # 单元测试
├── docs/                        # 架构与设计文档
├── .claude/
│   ├── rules/                   # Claude Code 项目规则
│   │   ├── feishu-cards.md      #   飞书卡片 API 约束
│   │   ├── bridge-conventions.md#   开发规范
│   │   └── formula-rendering.md #   公式渲染调参
│   └── skills/
│       └── feishu-bridge-dev/   #   桥接器开发技能
├── .env.example                 # 环境变量模板
├── package.json
└── tsconfig.json
```

## 常用命令

```bash
npm start         # 启动桥接服务
npm run stop      # 优雅停止（读取 PID，发送 SIGINT，清理锁文件和子进程）
npm run dev       # 开发模式（文件变更自动重启）
npm test          # 运行测试
npm run typecheck # TypeScript 类型检查
```

`npm run stop` 会读取 `data/bridge.lock` 中的 PID，向进程组发送 `SIGINT`，并清理残留的 lark-cli 和 claude 子进程。如果锁文件不存在或进程已退出，会自动清理。

## LaTeX 公式渲染

桥接服务在卡片模式下自动识别 Claude 回复中的数学公式：

- **行间公式** `$$...$$` — 通过 texsvg 转为 SVG，8 倍缩放后由 sharp 渲染为 PNG（固定 1200px 宽，自适应高度），上传至飞书后嵌入卡片图片元素
- **行内公式** `$...$` — 以行内代码样式展示，避免图片撑满卡片宽度
- **渲染失败回退** — 自动降级为代码块显示原始 LaTeX

## 使用第三方后端

如果你使用 GLM 或其他 Anthropic 兼容的 API 后端，只需在 `.env` 中配置：

```bash
ANTHROPIC_BASE_URL=https://your-api-endpoint.com/v1
ANTHROPIC_AUTH_TOKEN=your-api-key
ANTHROPIC_DEFAULT_SONNET_MODEL=glm-4-plus
```

这些环境变量会透传给 Claude CLI 子进程，无需修改代码。

## 安全说明

- 所有凭据通过 `.env` 管理，已 gitignore，不会进入代码仓库
- lark-cli 子进程使用白名单化的环境变量（仅传递 `HOME`、`PATH` 等必要变量）
- 用户回复中不暴露内部错误细节
- 支持发送者和群聊白名单限制访问
- 状态文件使用原子写入（先写临时文件再 rename）
- 锁文件权限 `0o600`，状态文件目录权限 `0o700`
- **注意**：Claude CLI 子进程继承完整的环境变量，请仅在可信本地环境中运行

## 已知限制

- 仅支持文本消息（不支持图片、文件等）
- 仅支持文本消息（不支持图片、文件等）
- `/cd` 切换目录后 Claude 会话会重置（因为 Claude CLI 会话按工作目录隔离）
- 设计为个人助手场景，暂未针对群聊多用户场景优化
- 事件处理串行化，长时间运行的 Claude 会话可能延迟其他对话
- Claude 子进程继承本地桥接环境变量用于认证兼容性，请确保运行环境可信

## 开发

```bash
# 安装依赖
npm install

# 开发模式（文件变更自动重启）
npm run dev

# 运行测试
npm test

# 类型检查
npm run typecheck
```

## License

MIT
