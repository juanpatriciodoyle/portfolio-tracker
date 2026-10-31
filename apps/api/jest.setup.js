// The server refuses to sign tokens without JWT_SECRET (no built-in fallback), so tests that use
// tokens get a throwaway one. Individual tests can change or delete it.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'jest-only-secret';
