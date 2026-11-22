import { z } from 'zod';

// Imported before anything else in main.tsx, because Zod decides how to compile a schema when the schema is created.
// The server's Content-Security-Policy forbids eval; without this Zod would try it once, to run faster, and be reported for trying.
z.config({ jitless: true });
