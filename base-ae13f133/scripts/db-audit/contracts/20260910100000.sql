              RUNTIME=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At \
                -f scripts/db-audit/talkx-blacklist-policy-runtime.sql)
              ;;
            20260912130000|20260912140000)
              RUNTIME=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At \
                -f scripts/db-audit/talkx-recovery-runtime.sql)
