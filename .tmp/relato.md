Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261012151545_authenticated_sem_papel_nao_le.sql: cria o helper
  public.user_has_any_app_role() (SECURITY DEFINER, STABLE, search_path public/pg_temp, mesmo padrão de
  public.is_admin_or_supervisor) e SUBSTITUI o USING (true) das 27 políticas de SELECT TO authenticated
  pelo gate de papel — porque em Supabase "authenticated" não significa membro da equipe: qualquer conta
  criada no Auth entra nesse papel e, com RLS pura (PostgREST), lia roteamento, filas, playbooks,
  departamentos, convites, flags e demais config sem ter nenhuma linha em public.user_roles.
- scripts/db-audit/authenticated-sem-papel-nao-le.test.sh: harness em Postgres 17 descartável (docker)
  que aplica a migration REAL (marcador authenticated_sem_papel_nao_le_gate) — vermelho antes (sem papel
  lê), verde depois (sem papel lê 0; agente/admin/supervisor/service_role seguem lendo; anon não lê; ACL
  do helper; idempotência; Rollback executado).
- scripts/ci/check-test-inventory.mjs: entrada na ALLOWLIST (o cartão pede; o dono do workflow promove o
  passo de uma linha em db-guard.yml — agente não edita workflow).

## Correção pedida pelo juiz (commit docs(db): rollback executavel do gate authenticated sem papel)
- O cabeçalho passou ao formato do modelo 20261006141643: prosa em `-- Rollback:` + bloco
  `-- Rollback (SQL executável, na ordem):` com uma instrução por linha (`--   <stmt>;`), incluindo
  o DROP do helper novo. Só comentários mudaram; o SQL executável da migration é o mesmo já aplicado
  no banco local (nada a reaplicar).
- O teste passou a extrair o Rollback desse bloco (antes lia a linha 2, quando o rollback era uma
  linha só) e continua provando que ele roda e devolve o estado anterior.

## Prova (comandos e linhas de resultado)
- vermelho antes (pré-estado real): `bash scripts/db-audit/authenticated-sem-papel-nao-le.test.sh`
  → `[PASS] RED: authenticated sem papel le as 27 tabelas (defeito vivo) (= 27)`
- verde depois (mesmo comando, migration real aplicada no meio):
  → `[PASS] 1. authenticated sem papel le 0 nas 27 tabelas (= 0)`
  → `[PASS] 2. agente com papel continua lendo as 27 tabelas (= 27)`
  → `[PASS] 3. admin le as 27 tabelas (= 27)` / `[PASS] 3. supervisor le as 27 tabelas (= 27)`
  → `[PASS] 4. service_role le as 27 tabelas (= 27)` / `[PASS] 4. anon segue sem ler (0 nas 27 tabelas) (= 0)`
  → `[PASS] 5. politicas de SELECT usando o helper (= 27)` / `[PASS] 5. nenhuma politica de SELECT com qual = true sobrou (= 0)`
  → `[PASS] 6. authenticated tem EXECUTE no helper (= true)` / `[PASS] 6. anon nao tem EXECUTE no helper (= false)` / `[PASS] 6. PUBLIC sem EXECUTE no helper (= false)`
  → `[PASS] migration do gate reaplicada sem erro (idempotencia)` / `[PASS] 7. sem papel segue lendo 0 apos reaplicar (= 0)`
  → `[PASS] Rollback do cabecalho executou` / `[PASS] 8. apos o Rollback o sem papel volta a ler (estado anterior) (= 27)` / `[PASS] 8. o Rollback derruba o helper (= t)`
  → `[OK] R3 (authenticated sem papel): as 27 politicas de SELECT exigem papel de app; ...`
- banco LOCAL (aplicação real): `hermes-db-migrar supabase/migrations/20261012151545_authenticated_sem_papel_nao_le.sql`
  → `APLICADA no banco LOCAL 'v2-2610121205b65e' (produção não foi tocada).`
  → `select count(*) from pg_policies where qual like '%user_has_any_app_role%'` = 27
  → SELECT com qual='true' nas 27 tabelas = 0
  → como authenticated com `request.jwt.claim.sub` de uuid sem papel: `select count(*) from public.departments` = 0

## Quem tinha acesso antes e continua tendo (regressão = recusa)
Antes: todo authenticated (com ou sem papel) lia as 27. Depois: lê quem tem linha em public.user_roles.
Provado com papel real no descartável: agent, admin e supervisor leem 27; service_role lê 27; anon lê 0
(e já era assim — nenhuma das 27 tem política para anon, então nada muda para o visitante).
Efeitos colaterais conferidos: a migration não faz DML (nenhum gatilho de updated_at/auditoria dispara),
roda em transação (o hermes-db-migrar emite BEGIN/COMMIT — falha = nada aplicado), não é oráculo (sem
papel recebe 0 linhas, igual a tabela vazia), e o único ACL tocado é o do helper novo.

## Decisões (o que avaliei e o porquê)
- department_invites: mantive o portão por QUALQUER papel de app, sem estreitar para admin/supervisor.
  DepartmentInvitesView é alcançável por membro não-admin (TeamConversationList abre
  DepartmentManagementDialog para qualquer membro); estreitar quebraria esse fluxo. Decisão registrada,
  não esquecimento.

## O que NÃO fiz e por quê
- As outras USING (true) de department_invites (INSERT/DELETE) ficam como estão: o cartão diz "só leitura"
  e manda não alterá-las. Fica como candidato a cartão próprio.
- Não recriei nenhuma política de escrita/GRANT de tabela; nenhuma precisa de exceção (nenhuma das 27 é
  lida antes do login e nenhuma tem leitura legítima sem papel).
- check-test-inventory.mjs acusa 4 órfãos pré-existentes (department-invite-contract-audit-vocabulary,
  talkx-conversion-defaults, team-chat-media-contract, team-direct-conversation-race) — nenhum é meu
  (não aparecem em HEAD nem no meu diff); o meu teste não entra na lista de órfãos.
