import { AdminIdentities, parseAdminEmails } from '../application/adminIdentities';

const hash = (raw: string) => `hash:${raw}`;

describe('parseAdminEmails', () => {
  it('is empty when nothing is set', () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails('')).toEqual([]);
    expect(parseAdminEmails('  , ,')).toEqual([]);
  });

  it('reads a comma separated list, trimming spaces and skipping blanks', () => {
    expect(parseAdminEmails(' boss@example.test , ,second@example.test ')).toEqual(['boss@example.test', 'second@example.test']);
  });
});

describe('AdminIdentities', () => {
  it('knows an administrator by the hash of their email, never by the email', () => {
    const admins = new AdminIdentities(['boss@example.test'], hash);
    expect(admins.isAdmin('hash:boss@example.test')).toBe(true);
    expect(admins.isAdmin('hash:someone@example.test')).toBe(false);
  });

  it('has no administrator at all when none is configured', () => {
    const admins = new AdminIdentities([], hash);
    expect(admins.isAdmin('hash:boss@example.test')).toBe(false);
    expect(admins.isAdmin('')).toBe(false);
  });
});
