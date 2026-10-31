import { InMemoryBillingRecordRepository, InMemoryLivingPhaseRepository } from './support/inMemoryRepositories';
import { billingRecordRepositoryContract } from './support/billingRecordRepositoryContract';

billingRecordRepositoryContract('in memory', async () => {
  const phases = new InMemoryLivingPhaseRepository();
  return { repository: new InMemoryBillingRecordRepository(phases), phases, userA: 'user-a', userB: 'user-b' };
});
