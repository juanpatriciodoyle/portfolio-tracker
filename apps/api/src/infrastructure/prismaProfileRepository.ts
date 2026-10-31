import type { PrismaClient } from '@prisma/client';
import type { ProfileRepository, StoredProfile } from '../application/ports';

/** Stores the one sealed profile each user has. */
export class PrismaProfileRepository implements ProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(userId: string): Promise<StoredProfile | null> {
    const row = await this.prisma.userProfile.findUnique({ where: { userId }, select: { payload: true } });
    return row ? { payload: row.payload } : null;
  }

  async save(userId: string, payload: string): Promise<void> {
    await this.prisma.userProfile.upsert({ where: { userId }, create: { userId, payload }, update: { payload } });
  }
}
