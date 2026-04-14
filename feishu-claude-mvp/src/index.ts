import { loadConfig } from './config.js';
import { BridgeService } from './bridgeService.js';
import { ClaudeProcess } from './claude/claudeProcess.js';
import { parseEventLine } from './lark/eventParser.js';
import { ReplyClient } from './lark/replyClient.js';
import { SubscribeRunner } from './lark/subscribeRunner.js';
import { StateFile } from './persistence/stateFile.js';
import { SessionStore } from './session/sessionStore.js';
import { logger } from './utils/logger.js';

const main = async (): Promise<void> => {
  const config = loadConfig();
  const stateFile = new StateFile(config.stateFilePath);
  const sessionStore = new SessionStore(stateFile, config.projectRoot);
  const bridge = new BridgeService(
    config,
    sessionStore,
    new ClaudeProcess(config),
    new ReplyClient(config),
  );
  const subscriber = new SubscribeRunner(config);

  bridge.ensureSingleInstance();

  const release = (): void => {
    bridge.releaseSingleInstance();
  };

  process.on('SIGINT', () => {
    release();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    release();
    process.exit(0);
  });

  process.on('exit', release);

  logger.info('Starting Feishu Claude bridge', { projectRoot: config.projectRoot });

  const notifyUserId = config.allowedSenderIds[0];
  if (notifyUserId) {
    const replyClient = new ReplyClient(config);
    replyClient
      .sendToUser(notifyUserId, 'Feishu Claude bridge 已启动，发送消息即可开始对话。')
      .then(() => logger.info('Startup notification sent', { notifyUserId }))
      .catch((error) =>
        logger.warn('Failed to send startup notification', {
          notifyUserId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
  }

  await subscriber.run(async (line) => {
    logger.info('Received event line', { line });

    const event = parseEventLine(line);
    if (!event) {
      logger.warn('Failed to parse event line', { line });
      return;
    }

    logger.info('Parsed incoming message', {
      eventId: event.eventId,
      messageId: event.messageId,
      chatId: event.chatId,
      senderId: event.senderId,
      messageType: event.messageType,
      content: event.content,
    });

    // Fire-and-forget: each event is handled independently
    // so slow Claude executions don't block subsequent messages
    bridge.handleEvent(event).catch((error) => {
      logger.error('Unhandled error in handleEvent', {
        eventId: event.eventId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
};

void main().catch((error) => {
  logger.error('Bridge crashed', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
