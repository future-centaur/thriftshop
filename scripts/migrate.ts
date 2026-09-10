// Standalone migration runner. Useful for CI, fresh local DB, or one-off migrations
// without booting the full API server. Reads .sql files from /migrations and applies them.
//
// Usage:  pnpm migrate

import { runMigrations } from '../backend/infrastructure/migrations.js';

runMigrations()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
