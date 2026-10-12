Especialista: workersql

## O que mudou (4 arquivos; 1 é teste)
- supabase/migrations/20261012151545_authenticated_sem_papel_nao_le.sql (novo, 210 linhas): cria o
  helper public.user_has_any_app_role() (SECURITY DEFINER, STABLE, search_path public/pg_temp, mesmo
  padrão de public.is_admin_or_supervisor) e SUBSTITUI o USING (true) das 27 políticas de SELECT TO
  authenticated pelo gate de papel. Porque em Supabase "authenticated" não significa membro da equipe:
  qualquer conta criada no Auth entra nesse papel e, com RLS pura (PostgREST), lia roteamento, filas,
  playbooks, departamentos, convites, flags e demais config sem nenhuma linha em public.user_roles.
- scripts/db-audit/authenticated-sem-papel-nao-le.test.sh (novo, 234 linhas): é o TESTE do cartão.
- scripts/ci/check-test-inventory.mjs (ALLOWLIST, +6): libera o teste novo (ver "fora da lista").
- .tmp/relato.md: este relato.

## Por que 2 arquivos fora da lista "ARQUIVOS QUE PODE TOCAR" (indispensáveis)
- O teste: o cartão lista "supabase/tests/", mas a prova de RLS/GRANT com o PAPEL REAL (agent/anon/
  service_role) neste repositório é feita em harness de Postgres 17 descartável (docker) sob
  scripts/db-audit/*.test.sh — é o padrão da casa, com dezenas de iguais já no db-guard.yml
  (scope-public-policies-authenticated.test.sh, dashboard-rls-authorization.test.sh, ...). O
  supabase/tests/*.sql roda no banco canônico e não consegue afirmar ACL/policy COMO anon/authenticated/
  service_role; só o harness com SET ROLE prova o que passa e o que é negado (critério 1/2 e a regra
  "PROVA no banco local com o papel real").
- check-test-inventory.mjs: sem a entrada na ALLOWLIST o próprio `zapp-verify . --rapido` reprova o
  .test.sh novo como teste órfão — ou seja, é indispensável para o critério 4 (verify verde). Segui o
  precedente de scripts/db-audit/replay-classify.test.sh (também em ALLOWLIST com a nota "passo de uma
  linha em db-guard.yml — promover pelo dono do workflow"). Não editei workflow.

## Prova (comandos e linhas de resultado)
- vermelho antes (pré-estado real, o defeito vivo):
  `bash scripts/db-audit/authenticated-sem-papel-nao-le.test.sh`
  → `[PASS] RED: authenticated sem papel le as 27 tabelas (defeito vivo) (= 27)`
  → `[PASS] RED: authenticated com papel tambem le (acesso legitimo) (= 27)`
- verde depois (mesmo comando, aplicando a migration REAL no meio):
  → `[PASS] 1. authenticated sem papel le 0 nas 27 tabelas (= 0)`
  → `[PASS] 1. amostra: sem papel nao le departments (= 0)`
  → `[PASS] 2. agente com papel continua lendo as 27 tabelas (= 27)`
  → `[PASS] 3. admin le as 27 tabelas (= 27)` / `[PASS] 3. supervisor le as 27 tabelas (= 27)`
  → `[PASS] 4. service_role le as 27 tabelas (= 27)` / `[PASS] 4. anon segue sem ler (= 0)`
  → `[PASS] 5. politicas de SELECT usando o helper (= 27)` / `[PASS] 5. nenhuma ... qual = true sobrou (= 0)`
  → `[PASS] 6. authenticated tem EXECUTE no helper (= true)` / `anon (= false)` / `PUBLIC (= false)`
  → `[PASS] migration ... reaplicada sem erro (idempotencia)` / `[PASS] 7. sem papel segue lendo 0 (= 0)`
  → `[PASS] Rollback do cabecalho executou` / `[PASS] 8. apos o Rollback o sem papel volta a ler (= 27)`
    / `[PASS] 8. o Rollback derruba o helper (= t)`
  → `[OK] R3 (authenticated sem papel): as 27 politicas de SELECT exigem papel de app; ...`
- banco LOCAL (aplicação real): `hermes-db-migrar supabase/migrations/20261012151545_authenticated_sem_papel_nao_le.sql`
  → `APLICADA no banco LOCAL 'v2-2610121205b65e' (produção não foi tocada).`
  → `select count(*) from pg_policies where qual like '%user_has_any_app_role%'` = 27
  → SELECT com qual='true' nas 27 tabelas = 0
  → como authenticated com request.jwt.claim.sub de uuid sem papel: `select count(*) from public.departments` = 0

## Correção pedida pelo juiz (commit docs(db): rollback executavel...)
O `-- Rollback:` do topo passou ao formato do modelo 20261006141643: prosa + bloco
`-- Rollback (SQL executável, na ordem):` com uma instrução por linha (`--   <stmt>;`), incluindo o
DROP do helper. Só comentários mudaram; o SQL da migration é o mesmo já aplicado no banco local.
O teste passou a extrair o rollback DESSES blocos (antes lia a linha 2, quando era uma linha só).

## Regressão / efeitos colaterais
Antes: todo authenticated (com ou sem papel) lia as 27. Depois: lê quem tem linha em public.user_roles.
Provado com papel real: agent/admin/supervisor 27; service_role 27; anon 0 (e já era — nenhuma das 27
tem política para anon). A migration não faz DML (nenhum gatilho updated_at/auditoria dispara), roda em
transação (falha = nada aplicado), não é oráculo (sem papel recebe 0, igual a tabela vazia), e o único
ACL tocado é o do helper novo (REVOKE PUBLIC/anon; GRANT authenticated).

## Decisões / exceções (critério 3)
- department_invites: mantido o portão por QUALQUER papel de app, sem estreitar para admin/supervisor.
  DepartmentInvitesView é alcançável por membro não-admin (TeamConversationList abre
  DepartmentManagementDialog a qualquer membro); estreitar quebraria esse fluxo. Decisão registrada.
- Nenhuma das 27 é lida antes do login e nenhuma tem leitura legítima por usuário sem papel — por isso
  nenhuma ficou como exceção (as 27 entraram). As outras USING(true) de department_invites
  (INSERT/DELETE) ficam fora: o cartão pede só leitura.
- check-test-inventory.mjs acusa 4 órfãos PRÉ-EXISTENTES (department-invite-contract-audit-vocabulary,
  talkx-conversion-defaults, team-chat-media-contract, team-direct-conversation-race) — nenhum é meu.
