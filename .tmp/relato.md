Especialista: worker (sql) (area-sql-banco)

## Como resolvi o motivo da retomada (conflito com a ponta dia/2026-10-12)
- Trabalho anterior recuperado por `git cherry-pick 06360db40` (branch
  `v2/rpcs-saida-remocao-coluna-role-t-c5c23f5-261009090416d7`).
- Conflito UNICO: `.github/workflows/db-guard.yml` — a ponta de hoje tinha, no mesmo ponto,
  o passo novo TC-009 (`team-receipts-reactions-conversation-id.test.sh`). Resolvi PRESERVANDO
  os DOIS passos: o TC-009 da ponta ficou intacto e o passo TC-004 desta entrega entrou logo
  abaixo. Nada que ja estava na ponta foi removido.

## O defeito ainda existe no codigo ATUAL?
- Sim. A ultima definicao de `leave_team_group`/`remove_team_member` antes da correcao e
  20261003272707_reconcile_local_replay_with_canonical.sql (linhas 996-1049 e 1292-1344), que
  usa a coluna INEXISTENTE `tcm.role`; a coluna real e `member_role`. Nenhuma migration
  posterior a 20261006170426 redefine essas RPCs (varri o diretorio; resultado vazio).
- Provado no codigo real: BLOCO A do contrato extrai o corpo VIGENTE verbatim do repo e
  reproduz o erro 42703 no caminho feliz.

## O que mudou
- `supabase/migrations/20261006170426_fix_member_role_leave_remove_rpcs.sql` (nova): mesmos
  assinatura/RETURNS jsonb/SECURITY DEFINER/search_path e mesmas guardas das RPCs; unica
  mudanca e ler/gravar `member_role` (a promocao do proximo dono passou de `SET role` para
  `SET member_role`). `-- Rollback:` executavel no topo (SQL comentado, na ordem, restaurando
  os dois corpos anteriores com `tcm.role`).
- `scripts/db-audit/team-member-role-rpcs.test.sh` (novo contrato): BLOCO A = defeito no corpo
  vigente, BLOCO B = correcao aplicada, BLOCO C = executa o rollback real; roda como os papeis
  reais (`authenticated`/`anon`). Usa Docker real (cria roles globais).
- `.github/workflows/db-guard.yml`: passo `TC-004` registrado (o inventario do CI reprova
  `.test.sh` sem passo) — preservando o passo TC-009 da ponta.

## Prova (PostgreSQL 17 descartavel, migrations reais, papel real)
- vermelho antes: `TEAM_MEMBER_ROLE_TEST_MIGRATIONS_DIR=$PWD/supabase/migrations bash scripts/db-audit/team-member-role-rpcs.test.sh`
  → `[PASS] A1 (defeito) leave_team_group estoura no caminho feliz: column tcm.role does not exist`
  e `[PASS] A2 (defeito) remove_team_member estoura no caminho feliz: column tcm.role does not exist`
- verde depois: mesma execucao →
  `[OK] member_role nas RPCs e rollback executavel verificados no PostgreSQL local (A=antes, B=correcao, C=rollback)`
  (todos os PASS, incluindo `B2b a promocao gravou member_role=owner (coluna real)` e
  `C5/C6 rollback executado: ... voltou ao erro anterior em tcm.role`)
- `hermes-db-migrar supabase/migrations/20261006170426_...` →
  `APLICADA no banco LOCAL 'v2-261012170456d0' (producao nao foi tocada)`
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (82s)` (dependencias/db_guard/tipos/lint/migrations OK)

## Passada de efeito colateral
- Gatilhos: a migration nao toca dados (so `CREATE OR REPLACE FUNCTION`), nenhum backfill.
- Atomica: migration aplica em uma transacao; qualquer erro desfaz tudo.
- Sem oraculo: as guardas de erro continuam identicas (not_authenticated/not_a_member/
  actor_not_a_member/target_not_a_member/not_authorized/cannot_remove_owner/cannot_remove_self).
- Permissao: nenhum GRANT/REVOKE/policy alterado — `test.sh` confere que anon segue sem EXECUTE
  e authenticated segue com EXECUTE (B16-B19, C4).
- Contrato preservado: assinatura/RETURNS/SECURITY DEFINER/search_path inalterados (B0c-B0e).

## Sobre o aviso automático "cartão diz SEM DDL/migration" (falso positivo)
O rodapé do template traz "REGRAS: ... sem DDL/Edge/dependência nova **salvo se o pedido original
exigia**". O pedido original DESTE cartão é de banco ("área migrations", item 31 do
BACKLOG_VERIFICADO) e a própria ENTREGA do cartão manda "Migration só pelo `hermes-db-migrar`
(banco LOCAL)". A migration é, portanto, exigida pelo pedido — não é DDL fora de escopo.

## O que NAO fiz e por que
- Nao editei nenhuma migration existente (correcao = migration nova).
- Nao toquei `create_team_group_conversation`/`transfer_team_conversation_ownership` (sao de
  outro cartao, ja corrigidos na ponta).
- Nao editei o passo TC-009 da ponta.
