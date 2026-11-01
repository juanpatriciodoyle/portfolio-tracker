import { Router } from 'express';
import type { SecondSalaryService } from '../application/secondSalaryService';
import { secondSalaryQuery, type CalendarDate } from '../contracts';
import { handle, noStore, parseRequest, requireUser, userIdOf } from './http';

export interface SecondSalaryRouterDeps {
  readonly service: SecondSalaryService;
  readonly today: () => CalendarDate;
}

/** What the portfolio could pay each month and which milestones of living costs it covers. Mounted under /api; needs a bearer token. */
export function createSecondSalaryRouter({ service, today }: SecondSalaryRouterDeps): Router {
  const router = Router();
  router.use('/insights/second-salary', noStore, requireUser);

  router.get(
    '/insights/second-salary',
    handle(async (req, res) => {
      const { asOf } = parseRequest(secondSalaryQuery, req.query);
      res.json(await service.secondSalary(userIdOf(req), asOf ?? today()));
    })
  );

  return router;
}
