import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { verifyToken } from '../lib/auth';
import { refuse } from './auth';

/**
 * A guest's session is only as good as the guest's account: once the account is erased (signed out, or its hour is
 * over) the token stops working at once, instead of lingering until it expires. Sessions of real accounts are not
 * asked about, and a request with no session (or a bad one) is left to the routes that need one.
 */
export function guestGate(isLive: (userId: string) => Promise<boolean>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    const session = token ? verifyToken(token) : null;
    if (!session?.guest) return next();
    isLive(session.userId).then(
      (live) => (live ? next() : refuse(res, 'GUEST_SESSION_ENDED')),
      next,
    );
  };
}
