Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê

Cartão de retomada: trazer para a base `dia/2026-10-12` os dois commits da entrega anterior #31 (TC-004) e resolver o conflito do rebase, sem perder o que a ponta tem.

- **Defeito ainda existe na base:** `git grep -n "tcm\.role" -- supabase/` acha 4 referências vivas em `supabase/migrations/20261003272707_reconcile_local_replay_with_canonical.sql` (linhas 1017, 1023, 1313, 1322) — `leave_team_group` e `remove_team_member` leem a coluna inexistente `tcm.role`; a coluna real é `member_role` (a tabela `team_conversation_members` não tem `role`, confirmado por `zapp-esquema`). Em runtime as duas RPCs estouram 42703 e SAIR DO GRUPO / REMOVER MEMBRO ficam quebrados. Como o defeito continua vivo, o cartão não é o caso "já corrigido": os commits anteriores foram trazidos.
- `supabase/migrations/20261006170426_fix_member_role_leave_remove_rpcs.sql` (trazido de 3cfce43ae, sem alteração): recria os corpos das duas RPCs lendo `member_role` em vez de `tcm.role`, preservando assinatura, `RETURNS jsonb`, `SECURITY DEFINER`, `search_path = public` e ACL (só `authenticated` executa; anon continua sem EXECUTE). Primeira linha é o `-- Rollback:` com o SQL de restauração comentado, extraído e EXECUTADO pelo teste.
- `scripts/db-audit/team-member-role-rpcs.test.sh` (trazido de 3cfce43ae, sem alteração): contrato RED→GREEN→rollback no PostgreSQL 17 descartável, em 3 blocos — bloco A roda o corpo VIGENTE extraído do repo (estoura em `tcm.role`), bloco B aplica a migration (as duas RPCs respondem, contrato e autorização iguais, promovido grava `member_role='owner'`, EXECUTE de anon fechado), bloco C executa o rollback e prova que os corpos anteriores voltam.
- `.github/workflows/db-guard.yml` (trazido de b2fcaaf6f, COM resolução de conflito): o rebase conflitou só nesse arquivo. Resolvi mantendo os dois lados — o passo TC-009 / R2-DB-011 (`team-receipts-reactions-conversation-id.test.sh`, que já estava na ponta `dia/2026-10-12`) e o passo TC-004 (`team-member-role-rpcs.test.sh`, da entrega anterior). Nenhum passo existente foi removido ou reescrito; o diff é puramente aditivo. O passo é necessário porque todo `.test.sh` novo precisa de registro no `db-guard.yml`, senão o `check-test-inventory.mjs` reprova órfão.

## Prova

- vermelho antes (bloco A do contrato, rodado agora): `bash scripts/db-audit/team-member-role-rpcs.test.sh` → `[PASS] A1 (defeito) leave_team_group estoura no caminho feliz: column tcm.role does not exist` e `[PASS] A2 (defeito) remove_team_member estoura no caminho feliz: column tcm.role does not exist`
- verde depois (bloco B/C do mesmo contrato, rodado agora): `[PASS] B1 membro comum sai do grupo (left=true, grupo permanece)` … `[PASS] C6 rollback executado: remove_team_member voltou ao erro anterior em tcm.role` e a linha final `[OK] member_role nas RPCs e rollback executavel verificados no PostgreSQL local (A=antes, B=correcao, C=rollback)` (exit 0, 55 linhas, `.tmp/prova-member-role.log`).
- Conflito do rebase: a resolução manteve os 2 passos; `git diff --stat` da entrega mostra só os 2 arquivos novos da #31 + o passo adicionado no `db-guard.yml`.

## Falso positivo do aviso de DDL (registrado para o portão)

O aviso `PROIBIÇÃO: o cartão diz SEM DDL/migration` não procede: este cartão É de banco — o título é `fix(db)` e a seção "Ação e limite" manda trazer os commits anteriores, que vivem em `supabase/migrations/**`, `scripts/db-audit/**` e no passo do `db-guard.yml`. O aviso nasce da linha de RODAPÉ copiada nos cartões ("... sem DDL, Edge Function, migration nem dependência nova") descrevendo OUTRA trilha (a de front/plano), não o escopo deste cartão. A migration trazida é exatamente a do defeito pedido (`tcm.role` → `member_role`) e não muda RLS, GRANT nem contrato de retorno.

## O que NÃO fiz e por quê

- Não criei migration nova nem reescrevi a existente: o cartão manda trazer os commits anteriores, e a migration `20261006170426` não existe na base, então ela entra como está.
- Não toquei em `src/**` (`useTeamMembers`): o defeito é do corpo das RPCs no banco, provado em Postgres local; contrato de retorno (`jsonb`) é o mesmo de antes, então nenhuma tela precisa mudar.
- Não apliquei a migration no banco de produção nem no banco local da tarefa por `hermes-db-migrar`: a prova é o contrato descartável acima, e produção exige autorização do Joaquim.
- Duplicidade a registrar para o integrador: a branch da retomada anterior (`v2/retomar-rpcs-member-role-261012170456d0`, commit e91c8eeb6) contém a MESMA migration `20261006170426_fix_member_role_leave_remove_rpcs.sql` e a MESMA suíte com bytes idênticos (verificado com `git diff --stat 3cfce43ae e91c8eeb6` nos dois arquivos: sem diferença). Se as duas branches entrarem, o integrador deve ficar com uma só — a migration é `CREATE OR REPLACE` (idempotente), mas o passo do `db-guard.yml` ficaria duplicado.
