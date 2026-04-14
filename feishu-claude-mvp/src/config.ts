import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv();

const splitCsv = (value: string | undefined): string[] =>
  value
    ?.split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0) ?? [];

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolvePath = (value: string | undefined, fallback: string): string => {
  const candidate = value?.trim();
  if (!candidate) {
    return fallback;
  }

  return path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
};

const optionalString = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export type BridgeConfig = {
  readonly projectRoot: string;
  readonly allowedSenderIds: readonly string[];
  readonly allowedChatIds: readonly string[];
  readonly botOpenId: string | null;
  readonly larkCliPath: string;
  readonly claudeCliPath: string;
  readonly claudeBareMode: boolean;
  readonly claudePermissionMode: string;
  readonly claudeModel: string | null;
  readonly claudeSystemPrompt: string | null;
  readonly claudeAllowedTools: readonly string[];
  readonly claudeAddDirs: readonly string[];
  readonly anthropicBaseUrl: string | null;
  readonly anthropicAuthToken: string | null;
  readonly anthropicDefaultOpusModel: string | null;
  readonly anthropicDefaultSonnetModel: string | null;
  readonly anthropicDefaultHaikuModel: string | null;
  readonly replyChunkSize: number;
  readonly minEventIntervalMs: number;
  readonly streamingFlushIntervalMs: number;
  readonly streamingMinFlushChars: number;
  readonly claudeTimeoutMs: number;
  readonly maxPromptChars: number;
  readonly stateFilePath: string;
  readonly lockFilePath: string;
};


export const loadConfig = (): BridgeConfig => {
  const projectRoot = process.env.PROJECT_ROOT?.trim();

  if (!projectRoot) {
    throw new Error('PROJECT_ROOT is required');
  }

  const allowedSenderIds = splitCsv(process.env.ALLOWED_SENDER_IDS);
  const allowedChatIds = splitCsv(process.env.ALLOWED_CHAT_IDS);

  if (allowedSenderIds.length === 0 && allowedChatIds.length === 0) {
    throw new Error('At least one of ALLOWED_SENDER_IDS or ALLOWED_CHAT_IDS must be configured');
  }

  return {
    projectRoot: resolvePath(projectRoot, projectRoot),
    allowedSenderIds,
    allowedChatIds,
    botOpenId: optionalString(process.env.BOT_OPEN_ID),
    larkCliPath: process.env.LARK_CLI_PATH?.trim() || 'lark-cli',
    claudeCliPath: process.env.CLAUDE_CLI_PATH?.trim() || 'claude',
    claudeBareMode: process.env.CLAUDE_BARE_MODE?.trim().toLowerCase() === 'true',
    claudePermissionMode: optionalString(process.env.CLAUDE_PERMISSION_MODE) ?? 'default',
    claudeModel: optionalString(process.env.CLAUDE_MODEL),
    claudeSystemPrompt: optionalString(process.env.CLAUDE_SYSTEM_PROMPT),
    claudeAllowedTools: splitCsv(process.env.CLAUDE_ALLOWED_TOOLS),
    claudeAddDirs: splitCsv(process.env.CLAUDE_ADD_DIRS).map((dir) => resolvePath(dir, dir)),
    anthropicBaseUrl: optionalString(process.env.ANTHROPIC_BASE_URL),
    anthropicAuthToken: optionalString(process.env.ANTHROPIC_AUTH_TOKEN),
    anthropicDefaultOpusModel: optionalString(process.env.ANTHROPIC_DEFAULT_OPUS_MODEL),
    anthropicDefaultSonnetModel: optionalString(process.env.ANTHROPIC_DEFAULT_SONNET_MODEL),
    anthropicDefaultHaikuModel: optionalString(process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL),
    replyChunkSize: parsePositiveInt(process.env.REPLY_CHUNK_SIZE, 1500),
    minEventIntervalMs: parsePositiveInt(process.env.MIN_EVENT_INTERVAL_MS, 1000),
    streamingFlushIntervalMs: parsePositiveInt(process.env.STREAMING_FLUSH_INTERVAL_MS, 750),
    streamingMinFlushChars: parsePositiveInt(process.env.STREAMING_MIN_FLUSH_CHARS, 120),
    claudeTimeoutMs: parsePositiveInt(process.env.CLAUDE_TIMEOUT_MS, 600_000),
    maxPromptChars: parsePositiveInt(process.env.MAX_PROMPT_CHARS, 8_000),
    stateFilePath: resolvePath(process.env.STATE_FILE_PATH, path.resolve(process.cwd(), 'data/state.json')),
    lockFilePath: resolvePath(process.env.LOCK_FILE_PATH, path.resolve(process.cwd(), 'data/bridge.lock')),
  };
};

