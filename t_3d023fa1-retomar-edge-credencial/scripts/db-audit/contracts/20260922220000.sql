              RUNTIME=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At \
                -f scripts/db-audit/notification-delivery-atomicity-runtime.sql)
              ;;
            *)
              # Antes este fallback rejeitava a migration. Como cada contrato
              # dedicado precisa ser escrito a mao aqui, toda migration nova caia
              # nele: o DDL acabava aplicado por MCP, sem dry-run nem confirmacao
              # de hash — causa dos drifts de setembro/2026. O contrato generico
              # nao prova a semantica do alvo; prova que o schema public nao mudou
              # entre o dry-run e o apply, que e a propriedade que autoriza a
              # aplicacao. Ver o cabecalho de generic-migration-runtime.sql.
              echo "Sem contrato dedicado para $TARGET_VERSION; usando o contrato runtime generico."
              RUNTIME=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At \
                -f scripts/db-audit/generic-migration-runtime.sql)
