type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, string | number | boolean | null | undefined>;

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const minimumLevel: LogLevel = process.env.TABBLETOP_LOG_LEVEL === "debug" ? "debug" : "info";

function writeLogLine(level: LogLevel, message: string, context?: LogContext): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minimumLevel]) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...context });
  if (level === "error" || level === "warn") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = Object.freeze({
  debug: (message: string, context?: LogContext) => writeLogLine("debug", message, context),
  info: (message: string, context?: LogContext) => writeLogLine("info", message, context),
  warn: (message: string, context?: LogContext) => writeLogLine("warn", message, context),
  error(message: string, error?: unknown, context?: LogContext) {
    const details = error instanceof Error ? { errorName: error.name, errorMessage: error.message, stack: error.stack } : {};
    writeLogLine("error", message, { ...context, ...details });
  },
});

export type Logger = typeof logger;
