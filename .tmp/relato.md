Especialista: workersql

## O que mudou neste refazer 1 (1 arquivo de codigo + relato)
- src/lib/__tests__/rlsGroupAccess.test.ts: o teste `whatsapp_groups / SELECT` exigia `USING(true)` para todo
  autenticado — o contrato vulneravel que a migration 20261012151545 remove de proposito. Atualizado para o
  contrato novo, espelhando o teste de `whatsapp_connections` do mesmo arquivo: SELECT continua exigindo o papel
  `authenticated`, mas o predicado nao pode ser `'true'` e tem de ser gate de papel
  (`user_has_any_app_role` ou `is_admin_or_supervisor`); filtro fortalecido de `command === 'SELECT'` para
  `cobreComando(p, 'SELECT')` (cobre tambem o `FOR ALL` "Admins can manage whatsapp groups") e predicado lido via
  `predicadoEfetivo`. Nenhuma assercao afrouxada: antes 1 policy coberta, agora 2, ambas com predicado de papel.
  Mandato: recusa ("quebra os TESTES no empilhamento — rlsGroupAccess.test.ts") + correcao prescrita em t_263db724.
- Heranca aproveitada sem recomeçar (commit d40a1f1b8, verificada intacta via `git diff` — nao toquei nela):
  migration 20261012151545 (helper `user_has_any_app_role` + 27 SELECTs com gate), harness
  scripts/db-audit/authenticated-sem-papel-nao-le.test.sh, entrada ALLOWLIST em check-test-inventory.mjs.

## Prova
- vermelho antes: `bun run test src/lib/__tests__/rlsGroupAccess.test.ts` →
  `FAIL ... SELECT e aberto a todo usuario autenticado` / `expected 'public.user_has_any_app_role()' to be 'true'`
  (`Tests 1 failed | 6 passed (7)`).
- verde depois (mesmo comando): `Test Files 1 passed (1)` / `Tests 7 passed (7)`.
- `bun run test src/lib/__tests__/rlsConversationAccess.test.ts` → `Test Files 1 passed (1)` / `Tests 18 passed (18)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (18s)` (OK db_guard, tipos, lint, migrations).
- harness de banco `bash scripts/db-audit/authenticated-sem-papel-nao-le.test.sh` (Postgres descartavel, papel
  real) → `[OK] R3 (authenticated sem papel)` (sem papel 0/27; agente/admin/supervisor/service_role 27; anon 0;
  helper so authenticated; idempotencia; Rollback executa e devolve `USING(true)` + derruba o helper).

## Pontos da recusa
- Ponto 1 (unico — quebra no empilhamento em rlsGroupAccess.test.ts): resolvido no arquivo acima; teste que prova:
  `src/lib/__tests__/rlsGroupAccess.test.ts > RLS real: whatsapp_groups > SELECT exige papel em user_roles`
  (vermelho antes com `to be 'true'`, verde depois, saídas acima).

## O que NAO fiz e por que
- Nao toquei na migration nem no harness: o defeito era so o teste cravado no contrato antigo.
- Nao toquei em `src/lib/__tests__/rlsSchemaGuard.test.ts` nem em `supabase/schema-manifest.json`. Medicao para o
  dono: com a migration de 27 tabelas o guarda fica em `132/159 = 0.8302 < 0.9` (snapshot do manifest e de 10-06;
  sem a migration, 12/12 passam). Ajustar o limiar ou o manifest seria afrouxar guarda — causa medida de recusa —
  e o manifest e artefato do bot types-sync (proibido junto da migration). Achado registrado em comentario do
  cartao; nao e regressao do meu diff (o guarda reage a migration herdada, nao ao teste que corrigi).

## Arquivos (`git diff --name-only bff18177fd..HEAD`)
- .tmp/relato.md
- scripts/ci/check-test-inventory.mjs
- scripts/db-audit/authenticated-sem-papel-nao-le.test.sh
- src/lib/__tests__/rlsGroupAccess.test.ts
- supabase/migrations/20261012151545_authenticated_sem_papel_nao_le.sql
