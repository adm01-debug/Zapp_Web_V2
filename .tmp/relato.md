Especialista: senior

## Pontos do revisor

Ponto 1.1: B19 não provava o bypass pedido.
- O que mudei: `scripts/db-audit/edit-message-authorization.test.sh:311-315` agora divide o B19 em dois passos no mesmo alvo editável (`$M_SENT`): B19a exige que `UPDATE public.messages SET content = ...` por `authenticated` falhe com `message_content_edit_requires_rpc`; B19b chama a RPC real `public.edit_message($M_SENT, ...)` e exige o conteúdo retornado pela própria RPC.
- Prova vermelha: rodei uma cópia temporária do teste com `DROP TRIGGER IF EXISTS trg_guard_message_immutable_columns ON public.messages` imediatamente antes do B19. Resultado: `mutation_exit=1` e `[FAIL] B19a bypass da RPC: UPDATE direto no mesmo alvo editavel pela RPC e recusado: deveria falhar, mas passou`.
- Prova verde: `bash scripts/db-audit/edit-message-authorization.test.sh` passou em Postgres descartável, incluindo `[PASS] B19a bypass da RPC: UPDATE direto no mesmo alvo editavel pela RPC e recusado`, `[PASS] B19b bypass da RPC: RPC edit_message edita o mesmo alvo que o UPDATE direto recusou`, `[PASS] B21 authenticated nao desfaz soft delete (message_undelete_forbidden)` e `[OK] contrato de autorizacao da edicao de mensagem (edit_message) verificado`.

Ponto 1.2: o passo novo do CI passava uma variável que o teste ignorava.
- O que mudei: `scripts/db-audit/edit-message-authorization.test.sh:28` agora lê `EDIT_MESSAGE_AUTHZ_TEST_POSTGRES_IMAGE` primeiro e mantém `EDIT_MESSAGE_TEST_POSTGRES_IMAGE` como fallback; assim o nome usado pelo passo novo de CI deixa de ser ignorado. Registrei o teste em `.github/workflows/db-guard.yml:371-374` porque o próprio `hermes-tarefa-fechar` apontou que o inventário de testes reprovaria sem o passo no CI; esse é o único arquivo fora da lista inicial e responde diretamente ao ponto 1.2 do revisor.
- Prova: `EDIT_MESSAGE_AUTHZ_TEST_POSTGRES_IMAGE=postgres:17-alpine bash scripts/db-audit/edit-message-authorization.test.sh` passou até `[OK] contrato de autorizacao da edicao de mensagem (edit_message) verificado`; `node scripts/ci/check-test-inventory.mjs` não lista mais `edit-message-authorization.test.sh` como órfão (falha apenas em três testes órfãos preexistentes: `department-invite-contract-audit-vocabulary`, `talkx-conversion-defaults`, `team-chat-media-contract`).

Ponto 2: diff final só com trabalho deste cartão.
- O que mudei: reapliquei do commit 1836d103f665 a migration, o teste de banco e o tipo gerado; corrigi o B19 e registrei o teste no CI com a variável correta. O único arquivo fora da lista inicial é `.github/workflows/db-guard.yml`, justificado pelo ponto 1.2 e pelo inventário automático de testes do fechar.
- Prova: `git diff --name-only dia/2026-10-12...HEAD` lista somente o workflow do teste, este relato e os três arquivos de banco/tipo abaixo; conferi antes do commit que o identificador do banco real não aparece no diff.

## Arquivos no diff

```
.github/workflows/db-guard.yml
.tmp/relato.md
scripts/db-audit/edit-message-authorization.test.sh
src/integrations/supabase/types.ts
supabase/migrations/20261011151650_edit_message_rpc.sql
```

## Verificações executadas

- `EDIT_MESSAGE_AUTHZ_TEST_POSTGRES_IMAGE=postgres:17-alpine bash scripts/db-audit/edit-message-authorization.test.sh` → `[OK] contrato de autorizacao da edicao de mensagem (edit_message) verificado`.
- Mutação temporária do B19 sem a guarda → `mutation_exit=1` e falha em B19a porque o UPDATE direto passou.
- `node scripts/ci/check-test-inventory.mjs` → não acusou `scripts/db-audit/edit-message-authorization.test.sh`; falhou só por três órfãos preexistentes não tocados por este cartão.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (22s) — o banco NÃO foi verificado; registros em /home/joaquim_ataides/.local/state/zapp-verify/95591f259354`.
