import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '../../test/memoryStorage';
import { clearStoredUser, readStoredUser, writeStoredUser } from '../storedUser';

const ana = { id: 'user-1', name: 'Ana', email: 'ana@example.com', country: 'Spain', isAdmin: false, hasPasskey: false, isGuest: false };

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage());
});

describe('the person signed in on this device', () => {
  it('is kept and read back as it was', () => {
    writeStoredUser(ana);
    expect(readStoredUser()).toEqual(ana);
  });

  it('is nobody when nothing was kept, and after clearing', () => {
    expect(readStoredUser()).toBeNull();
    writeStoredUser(ana);
    clearStoredUser();
    expect(readStoredUser()).toBeNull();
  });

  it('is still read when it was saved before passkeys and the demo flag existed: those read as "no"', () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 'user-1', name: 'Ana', email: 'ana@example.com', country: 'Spain', isAdmin: true }));

    expect(readStoredUser()).toEqual({ id: 'user-1', name: 'Ana', email: 'ana@example.com', country: 'Spain', isAdmin: true, hasPasskey: false, isGuest: false });
  });

  it('is nobody when what was kept is damaged or is not a person', () => {
    localStorage.setItem('auth_user', '{not json');
    expect(readStoredUser()).toBeNull();
    localStorage.setItem('auth_user', JSON.stringify({ hello: 'world' }));
    expect(readStoredUser()).toBeNull();
  });
});
