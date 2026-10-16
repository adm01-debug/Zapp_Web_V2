Especialista: senior (area-sql-banco)

## Ponto 1: rebase/retomada sobre a ponta atual, conflito resolvido, teste do cartão no CI/db-audit e verificação
- Trabalho anterior: trouxe o commit `b7f32d7ee` para o workspace novo com `git cherry-pick -n` sobre `dia/2026-10-12`.
- Conflito: o cherry-pick conflitou em `.github/workflows/db-guard.yml`; resolvi preservando a ponta atual e reaplicando só o passo exigido pelo inventário para `scripts/db-audit/sec-y25-01-insert-alvo.test.sh`, sem trazer outro trecho do workflow antigo.
- Correção preservada: `supabase/migrations/20261009090603_sec_y25_01_insert_alvo.sql` mantém as policies/gatilho que amarram `deal_activities.deal_id`, `calls.contact_id` e `conversation_tasks.contact_id` ao alvo permitido.
- Ajuste feito nesta retomada: admin/supervisor agora só relaxa o ALVO, nunca o AUTOR. `performed_by` e `agent_id` precisam ser o perfil de `auth.uid()`; `created_by` continua `current_profile_id()`.
- Teste do cartão: `scripts/db-audit/sec-y25-01-insert-alvo.test.sh` roda PostgreSQL descartável com papéis reais (`authenticated`, `anon`, `service_role`, `postgres`), prova o estado anterior vulnerável, aplica a migration real, executa o rollback extraído do cabeçalho e reaplica a correção.

## Provas do ponto 1
- Vermelho sem correção de alvo: `SEC_Y25_CORRECAO="$PWD/.tmp/sec_y25_mutant_sem_alvo.sql" scripts/db-audit/sec-y25-01-insert-alvo.test.sh` -> `[FAIL] B1 agente B não grava atividade no negócio do agente A deveria falhar`.
- Vermelho contra a regressão apontada na retomada (admin falsificando autor): `SEC_Y25_CORRECAO="$PWD/.tmp/sec_y25_mutant_admin_spoof.sql" scripts/db-audit/sec-y25-01-insert-alvo.test.sh` -> `[FAIL] B6b admin não falsifica performed_by de outro perfil deveria falhar`.
- Verde do teste do cartão: `scripts/db-audit/sec-y25-01-insert-alvo.test.sh` -> `[PASS] B6b admin não falsifica performed_by de outro perfil`, `[PASS] B11b admin não falsifica agent_id de outro perfil`, `[PASS] B11c admin não falsifica created_by de outro perfil`, `[PASS] C1/C1b/C2/C4` para rollback/reaplicação e resumo `[OK] SEC-Y25-01: INSERT de deal_activities, calls e conversation_tasks amarrado ao alvo`.
- Inventário do meu teste: `.github/workflows/db-guard.yml` agora chama `bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/sec-y25-01-insert-alvo.test.sh`. `node scripts/ci/check-test-inventory.mjs` não listou este teste como órfão; o comando segue vermelho por 6 órfãos preexistentes fora deste diff (`department-invite-contract-audit-vocabulary`, `ia-usage-outbox-duravel`, `talkx-conversion-defaults`, `team-chat-department-transfer-guards`, `team-chat-media-contract`, `team-direct-conversation-race`).
- `zapp-verify . --rapido` -> `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO (7s)`.
- `zapp-verify full .` foi executado e NÃO ficou verde por falha fora do diff: `FALHOU testes 772s`, `Test Files 1 failed | 1314 passed (1315)`, `Tests 1 failed | 11901 passed | 25 expected fail | 14 todo (11941)`, erro em `src/components/inbox/__tests__/RealtimeInboxView.selectedMessagesError.test.tsx` (`TypeError: The "event" argument must be an instance of Event. Received an instance of Event`). Rodei o arquivo isolado com `bunx vitest run src/components/inbox/__tests__/RealtimeInboxView.selectedMessagesError.test.tsx` e ele também falhou pelo mesmo erro de WebSocket/undici; nenhum arquivo de `src/components/inbox/**` está no diff deste cartão.

## Arquivos no diff
`.github/workflows/db-guard.yml`
`.tmp/relato.md`
`scripts/db-audit/sec-y25-01-insert-alvo.test.sh`
`supabase/migrations/20261009090603_sec_y25_01_insert_alvo.sql`

## Verificações executadas
- `bash -n scripts/db-audit/sec-y25-01-insert-alvo.test.sh` -> exit 0.
- `SEC_Y25_CORRECAO="$PWD/.tmp/sec_y25_mutant_sem_alvo.sql" scripts/db-audit/sec-y25-01-insert-alvo.test.sh` -> falhou como esperado em B1.
- `SEC_Y25_CORRECAO="$PWD/.tmp/sec_y25_mutant_admin_spoof.sql" scripts/db-audit/sec-y25-01-insert-alvo.test.sh` -> falhou como esperado em B6b.
- `scripts/db-audit/sec-y25-01-insert-alvo.test.sh` -> `[OK] SEC-Y25-01: INSERT de deal_activities, calls e conversation_tasks amarrado ao alvo`.
- `node scripts/ci/check-test-inventory.mjs` -> vermelho só por 6 órfãos preexistentes; `sec-y25-01-insert-alvo.test.sh` não aparece na lista.
- `git diff --check` -> exit 0.
- `zapp-verify . --rapido` -> verde sem banco.
- `zapp-verify full .` -> vermelho em teste de inbox fora do diff; log em `.tmp/zapp-verify-full.log`.
