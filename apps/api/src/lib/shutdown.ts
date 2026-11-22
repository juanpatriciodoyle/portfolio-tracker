import { errorName, type Logger } from './logger';

class ShutdownTimeout extends Error {
  constructor() {
    super('Connections did not finish in time');
    this.name = 'ShutdownTimeout';
  }
}

interface ShutdownParts {
  /** Things that start work on their own (schedulers): stopped first. */
  readonly stop: ReadonlyArray<() => void | Promise<void>>;
  /** Stops taking new requests and resolves when the running ones are done. */
  readonly closeServer: () => Promise<void>;
  readonly disconnect: () => Promise<void>;
  readonly logger: Logger;
  readonly exit: (code: number) => void;
  /** How long a connection that will not end may hold the shutdown up. */
  readonly graceMs: number;
}

/** What to do on SIGTERM / SIGINT: stop the schedulers, finish the requests in flight, let go of the database, exit. Once. */
export function createShutdown({ stop, closeServer, disconnect, logger, exit, graceMs }: ShutdownParts) {
  let running: Promise<void> | null = null;

  const run = async (signal: string): Promise<void> => {
    logger.info('shutdown_started', { signal });
    let clean = true;

    try {
      for (const stopper of stop) await stopper();
      await Promise.race([
        closeServer(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new ShutdownTimeout()), graceMs).unref()),
      ]);
    } catch (error) {
      clean = false;
      logger.error('shutdown_incomplete', { reason: errorName(error) });
    }

    try {
      await disconnect();
    } catch {
      clean = false;
    }

    if (clean) logger.info('shutdown_complete');
    exit(clean ? 0 : 1);
  };

  return (signal: string): Promise<void> => (running ??= run(signal));
}
