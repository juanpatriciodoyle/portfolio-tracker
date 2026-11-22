import express from 'express';
import request from 'supertest';
import { JSON_BODY_LIMIT, apiErrorHandler, apiNotFound } from '../routes/fallbacks';

function app(logged: string[] = []) {
  const server = express();
  server.use(express.json({ limit: JSON_BODY_LIMIT }));
  server.post('/api/echo', (req, res) => void res.json(req.body));
  server.get('/api/boom', () => {
    throw new TypeError('contains someone@example.test');
  });
  server.use('/api', apiNotFound);
  server.use(apiErrorHandler({ info: () => undefined, warn: () => undefined, error: (event, fields) => void logged.push(`${event}:${JSON.stringify(fields)}`) }));
  return server;
}

describe('API fallbacks', () => {
  it('answers an unknown address with a JSON 404, never an HTML page', async () => {
    const response = await request(app()).get('/api/nothing-here');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found.' });
  });

  it('refuses a body over the limit with 413 and a plain message', async () => {
    const response = await request(app()).post('/api/echo').send({ text: 'x'.repeat(150_000) });
    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: 'That request is too large.' });
  });

  it('accepts a body under the limit', async () => {
    const response = await request(app()).post('/api/echo').send({ text: 'x'.repeat(10_000) });
    expect(response.status).toBe(200);
  });

  it('answers malformed JSON with 400', async () => {
    const response = await request(app()).post('/api/echo').set('Content-Type', 'application/json').send('{ not json');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'That request could not be read.' });
  });

  it('turns an unexpected failure into a plain 500 and logs only its kind', async () => {
    const logged: string[] = [];
    const response = await request(app(logged)).get('/api/boom');

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('someone@example.test');
    expect(logged).toEqual(['unhandled_error:{"error":"TypeError"}']);
  });
});
