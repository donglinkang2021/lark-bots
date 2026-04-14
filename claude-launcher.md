# Claude Launcher -- 统一 tmux 启动器

## 背景

在使用 Claude Code 时，我需要在不同场景下以不同配置启动 Claude（标准模式、沙盒模式、GLM 后端、Team 模式等），并且希望每次在同一目录下打开时能复用同一个 tmux session。之前这些逻辑分散在 `~/.bashrc`（Linux）和 `~/.zshrc`（macOS）中，互相不一致，且 `~/.tmux.conf` 中的快捷键也硬编码了 Linux 专用的 `md5sum`。

本文档记录了将所有启动逻辑统一到一个共享脚本的过程，方便日后回顾和在新机器上复用。

## 文件结构

```
~/.claude/scripts/claude-launch    # 核心脚本（可执行），跨平台共享
~/.bashrc                          # 仅一行 source 调用
~/.zshrc                           # 仅一行 source 调用
~/.tmux.conf                       # 仅一行调用 claude-launch
```

`~/.claude` 在本机是一个 symlink，指向：
```
/inspire/hdd/global_user/donglinkang-253108120084/configs/.claude
```
所以 `claude-launch` 实际保存在持久化的共享配置目录中，换机器只需恢复这个 symlink。

## 支持的命令

| 命令   | 功能                               | tmux session 前缀        |
|--------|------------------------------------|--------------------------|
| `cc`   | 标准 Claude                        | `claude-<hash>`          |
| `scc`  | 沙盒模式（跳过权限确认）           | `sandbox-claude-<hash>`  |
| `cg`   | GLM 后端                           | `claude-g-<hash>`        |
| `scg`  | 沙盒 + GLM                         | `sandbox-claude-g-<hash>`|
| `tcg`  | Team 模式 + GLM                    | `team-claude-g-<hash>`   |
| `stcg` | 沙盒 + Team 模式 + GLM             | `sandbox-team-claude-g-<hash>` |

其中 `<hash>` 是当前工作目录的 MD5 前 8 位，保证同一目录复用同一 session。

## 工作原理

1. 在 shell 启动时（bash 或 zsh），rc 文件 source `claude-launch --source-functions`，将 6 个快捷函数注入当前 shell。
2. 用户输入如 `cg` 时，函数调用内部 `_cl_launch cg $PWD`。
3. `_cl_launch` 根据 variant 查表得到 session 前缀、环境变量、claude 命令。
4. 对 `$PWD` 取 MD5 哈希（macOS 用 `md5 -q`，Linux 用 `md5sum`）生成 session 名。
5. 若 tmux session 不存在则创建；若已存在则直接 attach。
6. 若当前已在 tmux 内，则以 80%x80% 的 popup 窗口打开；否则直接 attach。

tmux 快捷键 `prefix + y` 同样调用 `claude-launch cc`，行为一致。

## 如何修改 GLM 配置

打开 `~/.claude/scripts/claude-launch`，修改顶部三行：

```bash
GLM_BASE_URL="https://glm-51-fp8-sgl.openapi-qb-ai.sii.edu.cn"
GLM_AUTH_TOKEN="qHs/RFVgP+N5KwKOBYp1N5DXgZCvh/290fd/NYSOSV8="
GLM_MODEL="glm-5.1-fp8"
```

所有 `*g` 变体（`cg`, `scg`, `tcg`, `stcg`）会自动使用新值。

## 如何添加新的变体

1. 在 `_cl_variant()` 的 `case` 中添加新分支，设置 `SESSION_PREFIX`、`ENV_VARS`、`CLAUDE_CMD`。
2. 在 `--source-functions` 块中添加对应的 shell 函数。
3. 更新 `*)`  和 usage 中的 valid 列表。

## 在新机器上部署

```bash
# 1. 恢复 ~/.claude symlink（如果用的是共享存储）
ln -sf /path/to/shared/configs/.claude ~/.claude

# 2. 在 ~/.bashrc 或 ~/.zshrc 末尾添加：
[ -f "$HOME/.claude/scripts/claude-launch" ] && . "$HOME/.claude/scripts/claude-launch" --source-functions

# 3.（可选）在 ~/.tmux.conf 中添加快捷键：
# bind -r y run-shell '$HOME/.claude/scripts/claude-launch cc "#{pane_current_path}"'

# 4. 确认脚本可执行
chmod +x ~/.claude/scripts/claude-launch
```

不需要区分 macOS 还是 Linux，脚本内部自动检测。

## Appendix

### A. `~/.claude/scripts/claude-launch`

```bash
#!/usr/bin/env bash
# claude-launch — unified Claude tmux launcher for macOS and Linux
# Usage: claude-launch <variant> [workdir]
#   variant: cc | scc | cg | scg | tcg | stcg
#   workdir:  defaults to $PWD
#
# Can also be sourced to define shell functions:
#   source claude-launch --source-functions

set -euo pipefail

# ---------------------------------------------------------------------------
# GLM config — edit these two lines when the endpoint or token changes
# ---------------------------------------------------------------------------
GLM_BASE_URL="https://glm-51-fp8-sgl.openapi-qb-ai.sii.edu.cn"
GLM_AUTH_TOKEN="qHs/RFVgP+N5KwKOBYp1N5DXgZCvh/290fd/NYSOSV8="
GLM_MODEL="glm-5.1-fp8"

# Composite env string used by all *g variants
_CL_GLM_ENV="ANTHROPIC_BASE_URL=${GLM_BASE_URL} ANTHROPIC_AUTH_TOKEN=${GLM_AUTH_TOKEN} ANTHROPIC_DEFAULT_OPUS_MODEL=${GLM_MODEL} ANTHROPIC_DEFAULT_SONNET_MODEL=${GLM_MODEL} ANTHROPIC_DEFAULT_HAIKU_MODEL=${GLM_MODEL}"

# ---------------------------------------------------------------------------
# OS-portable md5 hash (first 8 hex chars)
# ---------------------------------------------------------------------------
_cl_hash() {
  if command -v md5sum >/dev/null 2>&1; then
    printf '%s' "$1" | md5sum | cut -c1-8
  else
    printf '%s' "$1" | md5 -q | cut -c1-8
  fi
}

# ---------------------------------------------------------------------------
# Detect shell for interactive spawning inside tmux
# ---------------------------------------------------------------------------
_cl_shell() {
  local sh
  sh="$(basename "${SHELL:-/bin/bash}")"
  case "$sh" in
    zsh|bash) echo "$sh" ;;
    *)        echo "bash" ;;
  esac
}

# ---------------------------------------------------------------------------
# Variant definitions
#   Each variant sets: SESSION_PREFIX, ENV_VARS (space-separated k=v),
#                      CLAUDE_CMD
# ---------------------------------------------------------------------------
_cl_variant() {
  local variant="$1"

  SESSION_PREFIX=""
  ENV_VARS=""
  CLAUDE_CMD="claude"

  case "$variant" in
    cc)
      SESSION_PREFIX="claude"
      ;;
    scc)
      SESSION_PREFIX="sandbox-claude"
      ENV_VARS="IS_SANDBOX=1"
      CLAUDE_CMD="claude --dangerously-skip-permissions"
      ;;
    cg)
      SESSION_PREFIX="claude-g"
      ENV_VARS="$_CL_GLM_ENV"
      ;;
    scg)
      SESSION_PREFIX="sandbox-claude-g"
      ENV_VARS="IS_SANDBOX=1 $_CL_GLM_ENV"
      CLAUDE_CMD="claude --dangerously-skip-permissions"
      ;;
    tcg)
      SESSION_PREFIX="team-claude-g"
      ENV_VARS="CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 $_CL_GLM_ENV"
      ;;
    stcg)
      SESSION_PREFIX="sandbox-team-claude-g"
      ENV_VARS="IS_SANDBOX=1 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 $_CL_GLM_ENV"
      CLAUDE_CMD="claude --dangerously-skip-permissions"
      ;;
    *)
      echo "claude-launch: unknown variant '$variant'" >&2
      echo "  valid: cc scc cg scg tcg stcg" >&2
      return 1
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Core launcher
# ---------------------------------------------------------------------------
_cl_launch() {
  local variant="${1:-cc}"
  local workdir="${2:-$PWD}"

  _cl_variant "$variant"

  local hash
  hash="$(_cl_hash "$workdir")"
  local session="${SESSION_PREFIX}-${hash}"

  local sh
  sh="$(_cl_shell)"

  # Build the command string that runs inside tmux
  local cmd
  if [ -n "$ENV_VARS" ]; then
    cmd="env ${ENV_VARS} ${CLAUDE_CMD}"
  else
    cmd="${CLAUDE_CMD}"
  fi

  # Create session if it doesn't exist
  tmux has-session -t "$session" 2>/dev/null || \
    tmux new-session -d -s "$session" -c "$workdir" "$sh -ic '$cmd'"

  # Attach: popup if already in tmux, otherwise direct attach
  if [ -n "${TMUX:-}" ]; then
    tmux display-popup -w80% -h80% -E "tmux attach-session -t '$session'"
  else
    tmux attach-session -t "$session"
  fi
}

# ---------------------------------------------------------------------------
# Source mode: define shell functions and return
# ---------------------------------------------------------------------------
if [ "${1:-}" = "--source-functions" ]; then
  cc()   { _cl_launch cc   "$PWD"; }
  scc()  { _cl_launch scc  "$PWD"; }
  cg()   { _cl_launch cg   "$PWD"; }
  scg()  { _cl_launch scg  "$PWD"; }
  tcg()  { _cl_launch tcg  "$PWD"; }
  stcg() { _cl_launch stcg "$PWD"; }
  return 0 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# Direct execution mode (e.g. from tmux binding)
# ---------------------------------------------------------------------------
if [ $# -lt 1 ]; then
  echo "Usage: claude-launch <cc|scc|cg|scg|tcg|stcg> [workdir]" >&2
  exit 1
fi

_cl_launch "$@"
```

### B. `~/.bashrc` 中添加的行（替换原有的 `cc`/`scc` 函数体）

```bash
# Claude launchers: cc scc cg scg tcg (shared across bash/zsh/tmux)
[ -f "$HOME/.claude/scripts/claude-launch" ] && . "$HOME/.claude/scripts/claude-launch" --source-functions
```

### C. `~/.zshrc` 中添加的行

```bash
# Claude launchers: cc scc cg scg tcg (shared across bash/zsh/tmux)
[ -f "$HOME/.claude/scripts/claude-launch" ] && . "$HOME/.claude/scripts/claude-launch" --source-functions
```

### D. `~/.tmux.conf` 快捷键（替换原有的 5 行内联逻辑）

```
bind -r y run-shell '$HOME/.claude/scripts/claude-launch cc "#{pane_current_path}"'
```
