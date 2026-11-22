export type LogLevel = 'info' | 'warn' | 'error';
export type LogFields = Readonly<Record<string, string | number | boolean | null | undefined>>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

/** Names that can hold a secret or a person: whatever they hold is never written. */
const SENSITIVE_FIELD = /email|token|authorization|password|secret|credential|cookie|key|salt/i;

interface LoggerParts {
  readonly write: (level: LogLevel, line: string) => void;
  readonly now: () => Date;
}

/**
 * One JSON object per line, so a log can be searched without a framework. It records what happened (an event name
 * and a few numbers), never bodies, tokens or emails: those fields are blanked even if a caller passes them.
 */
export function createLogger({ write, now }: LoggerParts): Logger {
  const log = (level: LogLevel) => (event: string, fields: LogFields = {}) => {
    const safe: Record<string, string | number | boolean | null | undefined> = {};
    for (const [name, value] of Object.entries(fields)) safe[name] = SENSITIVE_FIELD.test(name) ? '[redacted]' : value;
    write(level, JSON.stringify({ ...safe, time: now().toISOString(), level, event }));
  };
  return { info: log('info'), warn: log('warn'), error: log('error') };
}

/** The kind of failure, never its message: messages can quote what a person typed. */
export const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'unknown');

/** The server's own logger: normal events to stdout, warnings and errors to stderr, where Docker collects both. */
export const log: Logger = createLogger({
  write: (level, line) => (level === 'info' ? console.log(line) : level === 'warn' ? console.warn(line) : console.error(line)),
  now: () => new Date(),
});
