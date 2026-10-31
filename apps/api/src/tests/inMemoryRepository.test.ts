import { InMemoryLivingPhaseRepository } from './support/inMemoryRepositories';
import { livingPhaseRepositoryContract } from './support/livingPhaseRepositoryContract';

livingPhaseRepositoryContract('in memory', async () => ({
  repository: new InMemoryLivingPhaseRepository(),
  userA: 'user-a',
  userB: 'user-b',
}));
