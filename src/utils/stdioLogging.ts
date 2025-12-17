import fs from 'node:fs';

type LogChannels = 'stdin' | 'stdout' | 'stderr';

function timestamp(): string {
  return new Date().toISOString();
}

function append(logFile: string, channel: LogChannels, payload: string): void {
  const line = `[${timestamp()}] [${channel.toUpperCase()}] ${payload}\n`;
  try {
    fs.appendFileSync(logFile, line);
  } catch {
    // Swallow logging errors to avoid impacting MCP communication.
  }
}

/**
 * Enable passive stdio logging for diagnostics without modifying the protocol stream.
 * Controlled via environment:
 * - MCP_STDIO_LOG_FILE: absolute path to the log file (required). If set, logging is enabled.
 */
export function enableStdioLogging(): void {
  const logFile = process.env.MCP_STDIO_LOG_FILE;
  if (!logFile) {
    return;
  }

  // Capture inbound data and ensure we run before other listeners by prepending.
  process.stdin.prependListener('data', (chunk: Buffer | string) => {
    append(logFile, 'stdin', chunk.toString());
  });

  // Patch stdout/stderr writes to tee to file while preserving normal behavior.
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (
    chunk: Uint8Array | string,
    encoding?: BufferEncoding | ((err?: Error) => void),
    cb?: (err?: Error) => void,
  ): boolean => {
    append(logFile, 'stdout', chunk.toString());

    return originalStdoutWrite(
      chunk,
      // @ts-expect-error: encoding can either be a BufferEncoding or a callback, but this matches Node.js types
      encoding,
      cb,
    );
  };

  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (
    chunk: Uint8Array | string,
    encoding?: BufferEncoding | ((err?: Error) => void),
    cb?: (err?: Error) => void,
  ): boolean => {
    append(logFile, 'stderr', chunk.toString());
    return originalStderrWrite(
      chunk,
      // @ts-expect-error: encoding can either be a BufferEncoding or a callback, but this matches Node.js types
      encoding,
      cb,
    );
  };
}
