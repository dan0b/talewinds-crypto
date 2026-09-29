import { destination, type Logger, pino } from 'pino';

export type { Logger };

export interface LoggerOptions {
  level: string;
  /** Human-readable output for local development; JSON otherwise. */
  pretty: boolean;
  /** CLI logs go to stderr so stdout stays clean for command output. */
  destination?: 'stdout' | 'stderr';
}

/**
 * Structured JSON logs in production; human-readable in development.
 * Anything that looks like a credential is redacted before it is written.
 */
export function createLogger(name: string, options: LoggerOptions): Logger {
  const fd = options.destination === 'stderr' ? 2 : 1;
  return pino(
    {
      name,
      level: options.level,
      redact: {
        paths: [
          '*.apiKey',
          '*.api_key',
          '*.secret',
          '*.privateKey',
          '*.password',
          '*.authorization',
          'headers.authorization',
          'env.*',
        ],
        censor: '[redacted]',
      },
      ...(options.pretty
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, ignore: 'pid,hostname', destination: fd },
            },
          }
        : {}),
    },
    options.pretty ? undefined : destination(fd),
  );
}
