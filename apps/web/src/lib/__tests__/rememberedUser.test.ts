import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '../../test/memoryStorage';
import { recallUser, rememberUser } from '../rememberedUser';

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage());
});

describe('the person remembered on this device', () => {
  it('is recalled for the same account, with the name Google gave', () => {
    rememberUser({ id: 'user-1', name: 'Ana', email: 'ana@example.com', avatarUrl: 'https://img/a.png' });

    expect(recallUser('user-1')).toEqual({ id: 'user-1', name: 'Ana', email: 'ana@example.com', avatarUrl: 'https://img/a.png' });
  });

  it('is never recalled for another account', () => {
    rememberUser({ id: 'user-1', name: 'Ana' });
    expect(recallUser('user-2')).toBeNull();
  });

  it('is nothing when nothing was kept, or what was kept is damaged', () => {
    expect(recallUser('user-1')).toBeNull();
    localStorage.setItem('remembered_user', '{not json');
    expect(recallUser('user-1')).toBeNull();
  });
});
