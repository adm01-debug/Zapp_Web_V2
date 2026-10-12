Especialista: workersql
Executor do refazer: senior (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261011151650_edit_message_rpc.sql`: o gatilho `trg_guard_message_immutable_columns` agora observa também `is_deleted` e a função `guard_message_immutable_columns()` recusa `is_deleted=true -> false` por cliente autenticado com erro 42501 `message_undelete_forbidden`. `postgres` e `service_role` não foram bloqueados, preservando RPC e fluxos de dono/Edge.
- `scripts/db-audit/edit-message-authorization.test.sh`: adicionei a prova real do undelete recusado, ajustei o teste do soft delete com texto forjado para usar mensagem RECEBIDA e conferi que a definição do trigger contém `is_deleted`.
- `.github/workflows/db-guard.yml`: registrei o teste novo no DB Guard offline; foi indispensável porque o juiz barato bloqueou o fechamento com “.test.sh novo sem passo no CI”.
- `src/integrations/supabase/types.ts`: mantive só o tipo gerado da nova RPC `edit_message`, sem regredir funções já existentes da base atual.
- `.tmp/relato.md`: reescrevi o relato do refazer com os pontos da recusa e as provas executadas.

## Pontos da recusa
- Ponto 1: reversão `is_deleted true -> false` por authenticated agora é barrada. Arquivo: `supabase/migrations/20261011151650_edit_message_rpc.sql`. Prova: `scripts/db-audit/edit-message-authorization.test.sh`, caso B21.
  - Vermelho antes, com a migration anterior `a3579a91a`: `[FAIL] B21 authenticated nao desfaz soft delete (message_undelete_forbidden): deveria falhar, mas passou`.
  - Verde depois: `[PASS] B21 authenticated nao desfaz soft delete (message_undelete_forbidden)`.
- Ponto 2: o teste (c) foi adicionado e o teste (a) de soft delete forjado agora usa mensagem recebida (`M_RECV`) com `UPDATE content='HACKEADO', is_deleted=true`. Prova: `scripts/db-audit/edit-message-authorization.test.sh`, casos B19 e B21.
  - Verde depois: `[PASS] B19 soft delete nao vira atalho para reescrever texto arbitrario em mensagem RECEBIDA` e `[PASS] B21 authenticated nao desfaz soft delete (message_undelete_forbidden)`.
- Ponto 3: comentários da migration e cabeçalho do teste foram reescritos para a regra nova: só tombstone exato na primeira transição para apagada, sem reversão por cliente, e edição de conteúdo só pela RPC.
  - Prova no diff: alterações nos comentários de `supabase/migrations/20261011151650_edit_message_rpc.sql` e `scripts/db-audit/edit-message-authorization.test.sh`.
- Ponto 4: relato refeito só com os quatro itens reais da recusa: bypass do soft delete, reversão de `is_deleted`, testes (a) a (d) e comentário.
  - Testes (a) a (d): B19 prova texto forjado no soft delete; B21 prova undelete recusado; B18/B22/B23 provam fluxos legítimos preservados; B24 prova `service_role` preservado.

## Por que toquei arquivos fora da lista curta do cartão
- `scripts/db-audit/edit-message-authorization.test.sh` foi indispensável porque a recusa pediu explicitamente testes (a) a (d) e prova vermelho/verde; sem ele a correção SQL não ficaria provada.
- `.github/workflows/db-guard.yml` foi indispensável porque o juiz barato recusou o fechamento quando o teste novo ficou órfão de CI. A alteração é só o passo que executa `scripts/db-audit/edit-message-authorization.test.sh`, sem afrouxar guarda.

## Prova executada
- Vermelho antes: rodei `scripts/db-audit/edit-message-authorization.test.sh` com a migration anterior `a3579a91a`; saída relevante em `.tmp/edit-message-red.log`: `[FAIL] B21 authenticated nao desfaz soft delete (message_undelete_forbidden): deveria falhar, mas passou`.
- Verde depois: `scripts/db-audit/edit-message-authorization.test.sh > .tmp/edit-message-green.log 2>&1` terminou com exit 0 e a linha final `[OK] contrato de autorizacao da edicao de mensagem (edit_message) verificado`.
- `bun run db:guard` terminou com exit 0: `OK: nenhuma violacao nova.` e `DESTINO_URL ausente - estrutura local validada; comparacao com ledger pulada.`
- `zapp-verify . --rapido` terminou com exit 0: `VERIFY: VERDE SEM BANCO (8s) — o banco NÃO foi verificado; registros em /home/joaquim_ataides/.local/state/zapp-verify/65390ad7016e`.
- `git diff HEAD --check` terminou com exit 0.
- `node scripts/ci/check-test-inventory.mjs` foi rodado depois de registrar o teste no workflow: não lista `scripts/db-audit/edit-message-authorization.test.sh`; ainda falha por 3 órfãos preexistentes de outros cartões (`department-invite-contract-audit-vocabulary`, `talkx-conversion-defaults`, `team-chat-media-contract`). Não corrigi esses órfãos por estarem fora deste refazer.

## Arquivos do diff
Diff final medido: 5 arquivos, 1 teste novo/alterado.
```text
.github/workflows/db-guard.yml
.tmp/relato.md
scripts/db-audit/edit-message-authorization.test.sh
src/integrations/supabase/types.ts
supabase/migrations/20261011151650_edit_message_rpc.sql
```

## O que não fiz
- Não toquei em tela, Edge Function, política existente nem manifesto.
- Não rodei banco local integrado no `zapp-verify` porque o próprio comando retornou `VERDE SEM BANCO`; a prova SQL real deste cartão foi o teste descartável de Postgres em `scripts/db-audit/edit-message-authorization.test.sh`, incluindo rollback C1-C3.
