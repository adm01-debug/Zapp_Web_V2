Especialista: senior

## Pontos do revisor

Ponto 1.1: B19 não provava o bypass pedido.
- O que mudei: `scripts/db-audit/edit-message-authorization.test.sh:311-315` agora divide o B19 em dois passos no mesmo alvo editável (`$M_SENT`): B19a exige que `UPDATE public.messages SET content = ...` por `authenticated` falhe com `message_content_edit_requires_rpc`; B19b chama a RPC real `public.edit_message($M_SENT, ...)` e exige o conteúdo retornado pela própria RPC.
- Prova vermelha: rodei uma cópia temporária do teste com `DROP TRIGGER IF EXISTS trg_guard_message_immutable_columns ON public.messages` imediatamente antes do B19. Resultado: `mutation_exit=1` e `[FAIL] B19a bypass da RPC: UPDATE direto no mesmo alvo editavel pela RPC e recusado: deveria falhar, mas passou`.
- Prova verde: `bash scripts/db-audit/edit-message-authorization.test.sh` passou em Postgres descartável, incluindo `[PASS] B19a bypass da RPC: UPDATE direto no mesmo alvo editavel pela RPC e recusado`, `[PASS] B19b bypass da RPC: RPC edit_message edita o mesmo alvo que o UPDATE direto recusou`, `[PASS] B21 authenticated nao desfaz soft delete (message_undelete_forbidden)` e `[OK] contrato de autorizacao da edicao de mensagem (edit_message) verificado`.

Ponto 1.2: o passo novo do CI passava uma variável que o teste ignorava.
- O que mudei: não trouxe o arquivo `.github/workflows/db-guard.yml` do commit anterior; portanto o diff final remove o passo novo de CI que passava `EDIT_MESSAGE_AUTHZ_TEST_POSTGRES_IMAGE`. O teste de banco continua aceitando a variável que ele realmente lê (`EDIT_MESSAGE_TEST_POSTGRES_IMAGE`) em `scripts/db-audit/edit-message-authorization.test.sh:28`, sem criar novo passo de workflow.
- Prova: `git diff --name-only dia/2026-10-12...HEAD` lista só os três arquivos permitidos abaixo, e a checagem `git diff --cached --name-only | grep -c '^\.github/'` antes do commit retornou `0`.

Ponto 2: diff final só com trabalho deste cartão.
- O que mudei: reapliquei do commit 1836d103f665 somente a migration, o teste de banco e o tipo gerado; deixei fora `.github/workflows/db-guard.yml` e `.tmp/relato.md` do commit anterior. O commit final é `bab15c048 fix(db): prova bypass da edicao de mensagem`.
- Prova: `git diff --stat dia/2026-10-12...HEAD` mostra apenas `scripts/db-audit/edit-message-authorization.test.sh`, `src/integrations/supabase/types.ts` e `supabase/migrations/20261011151650_edit_message_rpc.sql`; conferi antes do commit que o identificador do banco real não aparece no diff.

## Arquivos no diff

```
scripts/db-audit/edit-message-authorization.test.sh
src/integrations/supabase/types.ts
supabase/migrations/20261011151650_edit_message_rpc.sql
```

## Verificações executadas

- `bash scripts/db-audit/edit-message-authorization.test.sh` → `[OK] contrato de autorizacao da edicao de mensagem (edit_message) verificado`.
- Mutação temporária do B19 sem a guarda → `mutation_exit=1` e falha em B19a porque o UPDATE direto passou.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (169s) — o banco NÃO foi verificado; registros em /home/joaquim_ataides/.local/state/zapp-verify/95591f259354`.
