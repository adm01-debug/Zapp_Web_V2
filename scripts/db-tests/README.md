# Suíte de regressão de banco (Fase 4 do plano de 50 etapas)

```bash
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/db-tests/run-all.mjs
```

Executa cada `.sql` deste diretório (`01-security-grants.sql` …
`05-rls-smoke.sql`) inteiro via `POST /rest/v1/rpc/mcp_exec`, que devolve um
único envelope jsonb `{rows, row_count, truncated, ms}`. A decodificação e
validação do envelope vivem em `rpc-envelope.mjs`.

A suíte só sai `0` com prova: envelope válido e não truncado, cada arquivo
devolvendo ao menos uma assertiva PASS/FAIL, nenhum FAIL e nenhum erro. Zero
assertiva executada **não** é sucesso (regressão R2-INF-010).

`DB_TESTS_DIR` aponta para outro diretório de `.sql` (usado pelos testes).

Teste (sem rede, exercita só o envelope): `node --test scripts/db-tests/run-all.unit.mjs`.
