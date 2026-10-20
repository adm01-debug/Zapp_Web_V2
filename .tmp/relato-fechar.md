- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 16s;OK lint 2s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (13/10 01:24, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  18 --
 src/integrations/supabase/types.ts                 |  20 ++
 .../20261013035338_admin_add_remove_role_rpc.sql   | 129 +++++++++
 supabase/tests/user_roles_add_remove_role.sql      | 288 +++++++++++++++++++++
 4 files changed, 437 insertions(+), 18 deletions(-)
```
- Nenhum arquivo de teste alterado neste cartão (há código alterado SEM teste novo: o revisor exige teste que prove)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261013035338_admin_add_remove_role_rpc.sql, supabase/tests/user_roles_add_remove_role.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:\.delete\(\)|\bDELET, padrão:\bDROP\b, padrão:\bGRANT\b

Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261013035338_admin_add_remove_role_rpc.sql` (NOVO): cria as duas RPCs que faltavam para o par do `admin_set_role`.
  - `admin_add_role(_user_id uuid, _role app_role)` → concede papel (INSERT em `user_roles`), `RETURNS TABLE(out_user_id, out_role)`.
  - `admin_remove_role(_user_id uuid, _role app_role)` → revoga papel (DELETE em `user_roles`), mesmo retorno.
  - Contrato igual ao `admin_set_role`: `SECURITY DEFINER` + `SET search_path TO 'public'`; exige sessão JWT (`auth.uid()` não nulo → senão `jwt_session_required`, cobrindo service_role sem JWT); só `is_admin(auth.uid())` (senão `admin_required`).
  - Travas do remove: piso de admin (`count(admin) <= 1` → `cannot_demote_last_admin`) **conferido antes** da trava de próprio admin (`_user_id = caller AND _role='admin'` → `cannot_remove_own_admin`); assim o piso também é alcançável/testável quando o chamador é o último admin. Estado inválido explícito: `role_already_assigned` (add) e `role_not_assigned` (remove), em vez de no-op silencioso.
  - Auditoria NÃO é escrita na função: o gatilho vigente `audit_user_role_changes` (INSERT→`role_granted`, DELETE→`role_revoked`, `granted_by`/`revoked_by = auth.uid()`) e o `sync_profile_role_from_user_roles` disparam sozinhos na escrita de `user_roles`, como no `admin_set_role`.
  - Least privilege: `REVOKE EXECUTE ... FROM PUBLIC, anon` e `GRANT EXECUTE ... TO authenticated, service_role` (só as duas funções novas); `COMMENT ON FUNCTION` nas duas.
- `src/integrations/supabase/types.ts`: só acrescenta as entradas `admin_add_role` / `admin_remove_role` em `Functions` (Args `_role`/`_user_id`, Returns `{out_role, out_user_id}[]`), no mesmo formato do `admin_set_role` — é o contrato que o front (cartão irmão) usa.
- `supabase/tests/user_roles_add_remove_role.sql` (NOVO): a prova, rodando no banco LOCAL da tarefa com os papéis REAIS `anon`/`authenticated`/`service_role` (`SET LOCAL ROLE` + JWT sintético, o caminho do PostgREST; o helper confere `current_user` e falha se o papel não pegou). Tudo numa transação que termina em `ROLLBACK`.

## Passada de efeitos colaterais
- A escrita é UM statement (INSERT/DELETE), numa transação implícita: a falha não deixa nada aplicado (o teste prova: operação negada → contagem de linhas/auditoria inalterada).
- Gatilhos lidos antes: `audit_user_role_changes` e `sync_profile_role_from_user_roles` disparam na escrita de `user_roles`; a sync é o caminho interno já permitido (flag em `prevent_profile_privilege_escalation`), igual ao `admin_set_role`.
- Nenhum GRANT/papel/ACL além das duas funções novas; nenhuma tabela, policy ou enum tocada.
- Sem oráculo: a resposta e o erro dependem do papel do CHAMADOR, não de existir ou não o alvo.
- Sobre o ajuste no teste: o piso de admin é sobre a INSTALAÇÃO INTEIRA, então o teste normaliza `user_roles` para os 4 usuários-fixura dentro da transação (desfeito no ROLLBACK) — sem isso a semente do banco local mudava o resultado.

## Prova
- vermelho antes: `{ printf '\\set sem_rpc 1\n'; cat supabase/tests/user_roles_add_remove_role.sql; } | zapp-db-local psql . v2-2610130050c2ce` → `ERROR: function "public.admin_add_role(uuid,public.app_role)" does not exist` / `EXIT=3` (sem as RPCs, as asserções caem).
- verde depois: `zapp-db-local psql . v2-2610130050c2ce < supabase/tests/user_roles_add_remove_role.sql` → `EXIT=0`, `TODOS OS CASOS PASSARAM` (todas as asserções `[OK]`, nenhum `[FAIL]`): ACL/existência (authenticated/service_role=true, anon=false, 42501 na chamada real), definição (`prosecdef` + `search_path` fixo), `jwt_session_required`, `admin_required`, `role_already_assigned`, `role_not_assigned`, `cannot_remove_own_admin`, `cannot_demote_last_admin`, efeito nas linhas de `user_roles`, e `audit_logs` `role_granted`/`role_revoked` com a autoria do admin chamador.
- guarda do repo: `zapp-db-local psql . v2-2610130050c2ce < scripts/db-audit/check-secdef-public-execute.sql` → `OK (285 funcoes SECURITY DEFINER em public, nenhuma com PUBLIC/anon)` / `EXIT=0`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (OK db_guard/tipos/lint/migrations; "banco_local NÃO VERIFICADO: sem nome de conjunto" — é assim que o fechar chama).
- migration aplicada no banco LOCAL: `APLICADA_LOCAL=20261013035338_admin_add_remove_role_rpc.sql sha=27376272187a111d`.

## O que NÃO fiz e por quê
- Não toquei a tela (`useRolesPageState.ts`) nem chamei as RPCs no front: fora dos arquivos do cartão; a troca do INSERT/DELETE direto pela RPC é do cartão irmão (o contrato já está em `types.ts`).
- Não editei migration existente (correção = migration nova) nem toquei o banco de produção.
- Não mexi em `schema-manifest.json` (gerado por máquina) nem em `.github/workflows/db-guard.yml`: a suíte nova está em `supabase/tests/`, que o `check-test-inventory.mjs` não varre.

## Alarme determinístico do fechar (não procede)
O fechar acusou "código alterado sem nenhum teste novo/alterado" apontando `src/integrations/supabase/types.ts`. Não procede: o teste que prova o defeito ESTÁ no commit (`supabase/tests/user_roles_add_remove_role.sql`, vermelho→verde acima). O detector do próprio fechar só reconhece `^(src|tests)/...*.test|spec.(ts|tsx|mjs|js)|__tests__/...`; a suíte de BANCO em `supabase/tests/*.sql` não casa o padrão — por isso o falso positivo. Rodando o MESMO comando de fechar de novo, como o aviso pede.
