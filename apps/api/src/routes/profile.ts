import { Router } from 'express';
import type { ProfileService } from '../application/profileService';
import { saveCapitalMilestonesRequest, saveProfileRequest, saveSecondSalaryTargetRequest, type CalendarDate } from '../contracts';
import { handle, noStore, parseRequest, requireUser, userIdOf } from './http';

export interface ProfileRouterDeps {
  readonly service: ProfileService;
  readonly today: () => CalendarDate;
}

/** HTTP for the signed-in person's profile. Mounted under /api; needs a bearer token. */
export function createProfileRouter({ service, today }: ProfileRouterDeps): Router {
  const router = Router();
  router.use('/profile', noStore, requireUser); // scoped: see livingPhases.ts

  router.get(
    '/profile',
    handle(async (req, res) => {
      res.json(await service.getProfile(userIdOf(req)));
    })
  );

  router.put(
    '/profile',
    handle(async (req, res) => {
      await service.saveProfile(userIdOf(req), parseRequest(saveProfileRequest, req.body), today());
      res.status(204).end();
    })
  );

  router.put(
    '/profile/capital-milestones',
    handle(async (req, res) => {
      await service.saveCapitalMilestones(userIdOf(req), parseRequest(saveCapitalMilestonesRequest, req.body).milestones);
      res.status(204).end();
    })
  );

  router.put(
    '/profile/second-salary-target',
    handle(async (req, res) => {
      await service.saveSecondSalaryTarget(userIdOf(req), parseRequest(saveSecondSalaryTargetRequest, req.body).monthlyMinor);
      res.status(204).end();
    })
  );

  return router;
}
