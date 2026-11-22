import express from 'express';
import request from 'supertest';
import { createLogger, errorName } from '../lib/logger';
import { requestLogger } from '../routes/requestLogger';

function capture() {
  const lines: { level: string; entry: Record<string, unknown> }[] = [];
  const logger = createLogger({ write: (level, line) => lines.push({ level, entry: JSON.parse(line) }), now: () => new Date('2026-11-22T10:00:00.000Z') });
  return { logger, lines };
}

describe('createLogger', () => {
  it('writes one JSON object per event with the time, the level and the event name', () => {
    const { logger, lines } = capture();
    logger.info('server_started', { port: 3000 });
    expect(lines).toEqual([{ level: 'info', entry: { time: '2026-11-22T10:00:00.000Z', level: 'info', event: 'server_started', port: 3000 } }]);
  });

  it('has the three levels people look for', () => {
    const { logger, lines } = capture();
    logger.info('a');
    logger.warn('b');
    logger.error('c');
    expect(lines.map((line) => line.level)).toEqual(['info', 'warn', 'error']);
  });

  it.each(['email', 'token', 'authorization', 'password', 'secret', 'credential', 'cookie', 'accessToken', 'userEmail', 'Authorization'])(
    'never writes a field called %s',
    (name) => {
      const { logger, lines } = capture();
      logger.info('sign_in', { [name]: 'a-sensitive-value', status: 200 });
      expect(JSON.stringify(lines[0].entry)).not.toContain('a-sensitive-value');
      expect(lines[0].entry[name]).toBe('[redacted]');
      expect(lines[0].entry.status).toBe(200);
    }
  );

  it('cannot carry a name or event the caller did not choose over the real ones', () => {
    const { logger, lines } = capture();
    logger.info('real_event', { event: 'fake', level: 'fake', time: 'fake' });
    expect(lines[0].entry).toMatchObject({ event: 'real_event', level: 'info', time: '2026-11-22T10:00:00.000Z' });
  });
});

describe('errorName', () => {
  it('gives the kind of failure and never its message, which can hold personal details', () => {
    expect(errorName(new TypeError('no one@example.test here'))).toBe('TypeError');
    expect(errorName('a string')).toBe('unknown');
  });
});

describe('requestLogger', () => {
  function app() {
    const { logger, lines } = capture();
    const server = express();
    server.use(requestLogger(logger, () => 0));
    server.get('/api/things/:id', (_req, res) => void res.status(201).json({ ok: true }));
    server.get('/api/health', (_req, res) => void res.json({ status: 'ok' }));
    return { server, lines };
  }

  it('logs what happened, not who or with what: method, path, status, duration', async () => {
    const { server, lines } = app();
    await request(server).get('/api/things/42?token=secret-in-the-url&email=a@b.test').set('Authorization', 'Bearer abc.def.ghi').expect(201);

    expect(lines).toHaveLength(1);
    expect(lines[0].entry).toMatchObject({ event: 'request', method: 'GET', path: '/api/things/42', status: 201, durationMs: 0 });
    expect(JSON.stringify(lines[0].entry)).not.toMatch(/secret-in-the-url|a@b\.test|abc\.def|Bearer/);
  });

  it('does not fill the log with health checks', async () => {
    const { server, lines } = app();
    await request(server).get('/api/health').expect(200);
    expect(lines).toEqual([]);
  });
});
