              RUNTIME=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At \
                -f scripts/db-audit/talkx-template-history-runtime.sql)
              ;;
            20260909220000|20260909240000|20260909250000|20260909260000|20260909270000)
              RUNTIME=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At \
                -f scripts/db-audit/message-delivery-phase1-runtime.sql)
