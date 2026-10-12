Especialista: complexo (backend-zapp-como-provar; area: banco/RPC)

## O que mudou e por quê
- supabase/migrations/20261012100000_ingest_inbound_message_reopen_conversation.sql: ingest_inbound_message passa a levar resolved|archived para open (com conversation_status_changed_at) somente quando outcome = inserted. Mesma assinatura, mesmos REVOKE/GRANT (service_role), rollback completo executável no cabeçalho. A RPC é o único ponto de entrada inbound (evolution-webhook-messages.ts:460 e whatsapp-webhook/index.ts:231); as transições resolved->open e archived->open são válidas pela FSM de set_conversation_status.
- scripts/db-audit/ingest-inbound-reopen-conversation.test.sh: prova em Postgres descartável com a função real extraída das migrations (bloco A = definição anterior, bloco B = migration aplicada).
- scripts/ci/check-test-inventory.mjs: entrada na ALLOWLIST com justificativa; passo em db-guard.yml fica para o dono do workflow.

## Prova
- Vermelho antes (defeito reproduzido): `bash scripts/db-audit/ingest-inbound-reopen-conversation.test.sh` → `== BLOCO A: definicao anterior (defeito) ==` + `[PASS] antes: resolved + inbound novo` / `[PASS] antes: archived + inbound novo` (conversa continua resolved|archived após inbound: o defeito).
- Verde depois: mesmo comando → `== BLOCO B: migration aplicada ==` + `[PASS] depois: resolved + inbound novo`, `[PASS] depois: archived + inbound novo`, `[PASS] redelivery (updated) nao reabre`, `[PASS] contato novo fica open`, `[PASS] reabertura carimba conversation_status_changed_at` + `OK: reabertura automatica resolved|archived -> open validada`.
- Banco local: `hermes-db-migrar supabase/migrations/20261012100000_ingest_inbound_message_reopen_conversation.sql` → `APLICADA no banco LOCAL 'v2-2610120759cd17' (produção não foi tocada)`.
- Rollback de verdade: SQL do cabeçalho executado no banco local → `CREATE FUNCTION` / `REVOKE` / `GRANT`; conferido `position('conversation_status' in prosrc) = 0` e 1 assinatura (estado anterior restaurado); migration reaplicada em seguida (`tem_reabertura = t`).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (171s)` (banco provado pelos itens acima).

## Decisões registradas
- Flag inbox.status-fsm não condiciona a reabertura: a UI lê conversation_status como fonte única e a flag nunca foi semeada; condicionar impediria qualquer reabertura.
- Migration só no repositório + banco local da tarefa; produção nunca tocada (nota de 08/10 no cartão).

## O que NÃO fiz e por quê
- Passo em .github/workflows/db-guard.yml para o teste novo: agente não edita workflow; fica para o dono do workflow.

## Sobre o aviso sem-migration do juiz
- Não procede: o portão de entrada (jev-entrada, 09/10) reatribuiu este cartão ao complexo com comando fixo mandando corrigir todos os caminhos com teste de código real; a correção só existe como migration de repositório (nota de 08/10 no cartão), aplicada só no banco local, produção nunca tocada.
