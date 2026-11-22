import { createShutdown } from '../lib/shutdown';

function build({ closeServer = async (): Promise<void> => undefined, disconnect = async (): Promise<void> => undefined, graceMs = 50, stop = [] as Array<() => void | Promise<void>> } = {}) {
  const order: string[] = [];
  const logged: string[] = [];
  const exits: number[] = [];
  const shutdown = createShutdown({
    stop: [() => void order.push('scheduler stopped'), ...stop],
    closeServer: async () => (order.push('server closing'), closeServer()),
    disconnect: async () => (order.push('database disconnected'), disconnect()),
    logger: { info: (event) => void logged.push(event), warn: (event) => void logged.push(event), error: (event) => void logged.push(event) },
    exit: (code) => void exits.push(code),
    graceMs,
  });
  return { shutdown, order, logged, exits };
}

describe('createShutdown', () => {
  it('stops the schedulers, stops taking requests, lets the running ones finish, then lets go of the database, and exits cleanly', async () => {
    const { shutdown, order, exits } = build();
    await shutdown('SIGTERM');
    expect(order).toEqual(['scheduler stopped', 'server closing', 'database disconnected']);
    expect(exits).toEqual([0]);
  });

  it('does it once, however many signals arrive', async () => {
    const { shutdown, order, exits } = build();
    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);
    expect(order.filter((step) => step === 'server closing')).toHaveLength(1);
    expect(exits).toEqual([0]);
  });

  it('exits with a failure when something would not close, but still lets go of the database', async () => {
    const { shutdown, order, exits } = build({ closeServer: async () => { throw new Error('boom'); } });
    await shutdown('SIGTERM');
    expect(order).toContain('database disconnected');
    expect(exits).toEqual([1]);
  });

  it('does not wait for ever on a connection that never ends', async () => {
    const { shutdown, exits } = build({ closeServer: () => new Promise<void>(() => undefined), graceMs: 20 });
    await shutdown('SIGTERM');
    expect(exits).toEqual([1]);
  });

  it('says what it is doing, with the signal', async () => {
    const { shutdown, logged } = build();
    await shutdown('SIGINT');
    expect(logged).toEqual(['shutdown_started', 'shutdown_complete']);
  });
});
