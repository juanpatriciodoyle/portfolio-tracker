/** Something the caller asked for does not exist for them (or belongs to someone else: the two look identical). */
export class ResourceNotFoundError extends Error {
  constructor(readonly resource: string) {
    super(`${resource} not found`);
    this.name = 'ResourceNotFoundError';
  }
}
