import express from 'express';
import request from 'supertest';
import { generateToken } from '../lib/auth';
import { createDemoRouter, type DemoWorkspace } from '../routes/demo';

const JOE = 'user-joe';
const ALICE = 'user-alice';

function build(overrides: Partial<DemoWorkspace> = {}) {
  const restores: string[] = [];
  const workspace: DemoWorkspace = {
    restore: async () => {
      restores.push('restore');
      return { id: JOE, email: 'demo@portfolio.local', avatarUrl: null, country: 'Spain' };
    },
    isGuestAccount: async (userId) => userId === JOE,
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use('/api', createDemoRouter(workspace));
  return { app, restores };
}

const bearer = (userId: string) => `Bearer ${generateToken(userId)}`;

describe('guest mode ("Sneak peek" as Joe)', () => {
  it('starts every guest session from Joe’s clean default state', async () => {
    const { app, restores } = build();

    const response = await request(app).post('/api/auth/demo');

    expect(response.status).toBe(200);
    expect(restores).toHaveLength(1);
    expect(response.body.user).toMatchObject({ id: JOE, name: 'Joe' });
    expect(typeof response.body.token).toBe('string');
  });

  it('wipes what the guest changed when the guest signs out', async () => {
    const { app, restores } = build();

    const response = await request(app).post('/api/auth/demo/reset').set('Authorization', bearer(JOE));

    expect(response.status).toBe(204);
    expect(restores).toHaveLength(1);
  });

  it('refuses to wipe a real account, and says why', async () => {
    const { app, restores } = build();

    const response = await request(app).post('/api/auth/demo/reset').set('Authorization', bearer(ALICE));

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/only.*guest/i);
    expect(restores).toHaveLength(0);
  });

  it('refuses a reset without a token', async () => {
    const { app, restores } = build();

    const response = await request(app).post('/api/auth/demo/reset');

    expect(response.status).toBe(401);
    expect(restores).toHaveLength(0);
  });

  it('answers a failed restore with a readable message, not a raw error', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app } = build({ restore: async () => { throw new Error('connection refused'); } });

    const response = await request(app).post('/api/auth/demo');

    expect(response.status).toBe(500);
    expect(response.body.error).not.toMatch(/connection refused|internal server error/i);
    expect(response.body.error.length).toBeGreaterThan(30);
  });
});
