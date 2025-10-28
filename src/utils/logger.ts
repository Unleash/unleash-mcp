import type { LogLevel } from '../config.js';

type LogMethod = (message: string, details?: Record<string, unknown>) => void;
type ConsoleLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  level: LogLevel;
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
}

const severityOrder: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  info: 2,
  debug: 3
};

function shouldLog(current: LogLevel, target: LogLevel) {
  if (current === 'silent') {
    return false;
  }
  return severityOrder[target] <= severityOrder[current];
}

function mapConsoleLevel(target: ConsoleLevel): Exclude<LogLevel, 'silent'> {
  if (target === 'debug') {
    return 'debug';
  }
  if (target === 'error') {
    return 'error';
  }
  return 'info';
}

function logWithConsole(level: ConsoleLevel, message: string, details?: Record<string, unknown>) {
  const payload = details ? `${message} ${JSON.stringify(details)}` : message;
  switch (level) {
    case 'debug':
      console.debug(payload);
      break;
    case 'info':
      console.info(payload);
      break;
    case 'warn':
      console.warn(payload);
      break;
    case 'error':
      console.error(payload);
      break;
  }
}

export function createLogger(level: LogLevel): Logger {
  const activeLevel = level;
  const log = (consoleLevel: ConsoleLevel): LogMethod => (message, details) => {
    const comparableLevel = mapConsoleLevel(consoleLevel);
    if (!shouldLog(activeLevel, comparableLevel)) {
      return;
    }
    logWithConsole(consoleLevel, message, details);
  };

  return {
    level: activeLevel,
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error')
  };
}
