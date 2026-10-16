              RUNTIME=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At \
                -f scripts/db-audit/generic-migration-runtime.sql)
