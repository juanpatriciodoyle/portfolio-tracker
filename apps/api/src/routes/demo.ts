import { Router } from 'express';
import { INTERNAL_ERROR_MESSAGE } from '../contracts';
import type { ApiErrorResponse } from '../contracts';
import { generateToken } from '../lib/auth';
import { requireUser, userIdOf } from './http';

export const GUEST_NAME = 'Joe';

export interface GuestAccount {
  readonly id: string;
  readonly email: string | null;
  readonly avatarUrl: string | null;
  readonly country: string;
}

/** Port: the guest's shared account. Restoring it erases every change a guest made and re-seeds Joe's defaults. */
export interface DemoWorkspace {
  restore(): Promise<GuestAccount>;
  isGuestAccount(userId: string): Promise<boolean>;
}

const DEMO_FAILED = 'The sneak peek could not be prepared right now. Try again in a moment, or sign in with your own account.';
const NOT_A_GUEST = 'Only the sneak peek (guest) account can be reset. Your own data was not touched.';

export function createDemoRouter(workspace: DemoWorkspace): Router {
  const router = Router();

  // Every guest session begins from the clean seed, even if the previous guest never signed out.
  router.post('/auth/demo', async (_req, res) => {
    try {
      const guest = await workspace.restore();
      res.status(200).json({
        success: true,
        token: generateToken(guest.id),
        user: {
          id: guest.id,
          email: guest.email ?? 'demo@portfolio.local',
          name: GUEST_NAME,
          avatarUrl: guest.avatarUrl,
          country: guest.country,
        },
      });
    } catch (error) {
      console.error('Guest sign-in failed:', error instanceof Error ? error.name : 'unknown');
      res.status(500).json({ error: DEMO_FAILED } satisfies ApiErrorResponse);
    }
  });

  // Called when a guest signs out: nothing a guest did may outlive the session.
  router.post('/auth/demo/reset', requireUser, async (req, res) => {
    try {
      if (!(await workspace.isGuestAccount(userIdOf(req)))) {
        res.status(403).json({ error: NOT_A_GUEST } satisfies ApiErrorResponse);
        return;
      }
      await workspace.restore();
      res.status(204).end();
    } catch (error) {
      console.error('Guest reset failed:', error instanceof Error ? error.name : 'unknown');
      res.status(500).json({ error: INTERNAL_ERROR_MESSAGE } satisfies ApiErrorResponse);
    }
  });

  return router;
}
