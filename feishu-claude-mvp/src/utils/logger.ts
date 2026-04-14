type LogContext = Record<string, unknown>;

const serializeContext = (context: LogContext | undefined): string => {
  if (!context || Object.keys(context).length === 0) {
    return '';
  }

  return ` ${JSON.stringify(context)}`;
};

const log = (level: 'INFO' | 'WARN' | 'ERROR', message: string, context?: LogContext): void => {
  const line = `[${new Date().toISOString()}] [${level}] ${message}${serializeContext(context)}`;

  if (level === 'ERROR') {
    console.error(line);
    return;
  }

  console.log(line);
};

export const logger = {
  info: (message: string, context?: LogContext): void => log('INFO', message, context),
  warn: (message: string, context?: LogContext): void => log('WARN', message, context),
  error: (message: string, context?: LogContext): void => log('ERROR', message, context),
};
