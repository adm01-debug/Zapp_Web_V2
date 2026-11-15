# Dossiê — claude__chore-secdef-guard-ci-test-261107-1600

**Ref:** `origin/claude/chore-secdef-guard-ci-test-261107-1600` · tip `afeba2d3b` · merge-base `0601e3b64` · 1 commit, sem PR.
**Commit:** `afeba2d3b chore: adiciona teste de contrato CI para guard SECURITY DEFINER`

## Propósito
Teste de contrato (bash + Postgres 17 descartável via Docker) que aplica a migration
`supabase/migrations/20261107153000_fix_gamification_streak_resolutions_guard.sql` e prova que
`update_agent_streak(uuid,boolean)` e `increment_agent_resolutions(uuid)` usam o guard canônico
(`auth.role() = 'anon' OR (auth.uid() IS NOT NULL AND NOT ...)`) e não o guard quebrado
(`auth.role() = 'authenticated' AND NOT ...`, que bloqueava service_role com uid null).
Cobre: 4 asserts estáticos via `pg_get_functiondef` + 4 cenários de runtime (service_role sem claims passa,
anon nega, authenticated dono passa, authenticated alheio nega).

## Arquivo × achado × evidência
| Arquivo | Status | Achado | Evidência |
|---|---|---|---|
| `scripts/db-audit/secdef-guard-check.test.sh` (154 linhas, novo) | NEW_FILE_ABSENT_IN_MAIN / ABSENT_APPLIES_CLEAN | **PERDIDO**. Não existe na main nem equivalente. | `git ls-tree origin/main scripts/db-audit/` não lista o arquivo; `git grep -n "secdef-guard" origin/main -- .` vazio; `git grep -n "agent_streak\|agent_resolutions" origin/main -- scripts/db-audit/check-live-invariants.sql scripts/db-audit/global-guards-regression.test.mjs scripts/db-audit/contracts scripts/db-audit/check-secdef-public-execute.sql` vazio. Única menção em testes: `scripts/db-tests/01-security-grants.sql:12` (checa só ausência de EXECUTE para anon, não o padrão do guard). |

## O alvo do teste está na main e em produção (o teste continua fazendo sentido)
- Migration na main: `supabase/migrations/20261107153000_fix_gamification_streak_resolutions_guard.sql`, commit `a9c9835bd fix(db): protege streak e resoluções por usuário autenticado (#2766)` — a PR #2766 integrou **só a migration** (1 arquivo), não o teste.
- Produção (`db_query`, só leitura, 2026-11-15): `schema_migrations` contém `20261107153000`; `update_agent_streak` e `increment_agent_resolutions` → guard canônico `true`, guard quebrado `false` (as mesmas 4 asserts estáticas do teste passam ao vivo).
- Os stubs do teste (`is_admin_or_supervisor`, `register_agent_active_day`, `agent_stats`, `profiles`) casam com o corpo da migration da main (lê `agent_stats`, chama `register_agent_active_day`, `is_admin_or_supervisor`).

## Veredito: PERDIDA_TOTAL (confiança alta)
Trabalho útil (teste que protege regressão de segurança/service_role em RPC de gamificação) não está na main.
Valor **médio**: protege comportamento já corrigido e aplicado em produção; não corrige bug novo.
`apagar_branch_seguro = false`.

## Para portar (ordem)
1. Copiar `scripts/db-audit/secdef-guard-check.test.sh` a partir de `git show origin/claude/chore-secdef-guard-ci-test-261107-1600:scripts/db-audit/secdef-guard-check.test.sh` (aplica limpo; nenhum ajuste de conteúdo necessário — migration-alvo existe na main com o mesmo nome).
2. Registrar no CI: `.github/workflows/db-guard.yml`, array `testes=(...)` do passo "Provar contratos shell restantes em serviços descartáveis" (linha ~1619–1655) — sem isso `scripts/ci/check-test-inventory.mjs` marca o teste como órfão (ver comentário em `db-guard.yml:598-599`). Imagem: o passo já faz `docker tag "$POSTGRES_TEST_IMAGE" postgres:17-alpine`, que é o default de `SECDEF_GUARD_POSTGRES_IMAGE` no script; alternativa é passo próprio com `env: SECDEF_GUARD_POSTGRES_IMAGE: ${{ env.POSTGRES_TEST_IMAGE }}` + `retry-disposable-postgres-test.sh`.
3. Opcional: listar o novo teste em `scripts/db-audit/README.md`.
Toca workflow → PR fica aberta para o dono (regra AGENTS.md: CI/workflows).

## Hunks essenciais (arquivo inteiro na branch; abaixo o núcleo — restante é boilerplate padrão dos `*.test.sh` de db-audit)
```bash
migration="$repo_root/supabase/migrations/20261107153000_fix_gamification_streak_resolutions_guard.sql"
postgres_image="${SECDEF_GUARD_POSTGRES_IMAGE:-postgres:17-alpine}"
# pre.sql: schema auth + roles anon/authenticated/service_role; stubs auth.role()/auth.uid() via request.jwt.claim.*;
# tabelas profiles(id,user_id) e agent_stats(profile_id,current_streak,best_streak,last_active_date,conversations_resolved,updated_at);
# stubs is_admin_or_supervisor(uuid)->false e register_agent_active_day(uuid,date)->NULL; fixture profile aaaa…0001/user bbbb…0001.
psql_file "$migration"
expect_value '... canonico presente' 'true'  "SELECT pg_get_functiondef('public.update_agent_streak(uuid,boolean)'::regprocedure) ILIKE '%auth.role() = ''anon''%'"
expect_value '... quebrado ausente'  'false' "SELECT pg_get_functiondef('public.update_agent_streak(uuid,boolean)'::regprocedure) ILIKE '%auth.role() = ''authenticated'' AND NOT%'"
# idem para increment_agent_resolutions(uuid)
# runtime: sem claims → {"newResolutions":1}; role=anon → 'permission denied';
# role=authenticated+sub=dono → {"newResolutions":2}; role=authenticated+sub=alheio → 'permission denied'
```

## Verificação adversarial
Parecer: CONCORDO com PERDIDA_TOTAL. Tentei refutar por três vias (já está na main / foi removido de propósito / não encaixa mais) e nenhuma se sustenta.

1. Ausente na main, sem equivalente. `git ls-tree -r --name-only origin/main -- scripts/db-audit` (main em `dac285f62`) não lista `secdef-guard-check.test.sh`; `git grep -ln "secdef-guard\|SECDEF_GUARD" origin/main` → zero linhas. Nenhum teste da main afirma o guard canônico destas duas RPCs: `git grep -ln "role() = 'anon' OR" origin/main -- scripts/ supabase/tests/ e2e/` → zero. Os candidatos próximos cobrem outra coisa: `supabase/tests/gamification_streak_dias_seguidos.sql` (T11/T12) prova ACL de `register_agent_active_day`/`update_agent_streak`, não a forma do guard nem `increment_agent_resolutions` em runtime; `scripts/db-audit/gamification-marco-nao-bloqueia-envio.test.sh` é do marco de mensagens (`grant_agent_achievement`); `scripts/db-audit/global-guards-regression.test.mjs` é TC-014 (runtime-config + baseline realtime); `scripts/db-tests/01-security-grants.sql:12` só lista nomes de RPC num teste de grants.

2. Não foi removido de propósito. `git log -S'secdef-guard-check' --oneline origin/main` → vazio: o arquivo nunca entrou na main, logo não há revert/remoção deliberada a respeitar.

3. Ainda encaixa, e o contrato bate com a produção. A migration alvo existe na main no mesmo caminho (`supabase/migrations/20261107153000_fix_gamification_streak_resolutions_guard.sql`) já com o guard canônico (`auth.role() = 'anon' OR (auth.uid() IS NOT NULL AND NOT …)`, linhas 16-22 e 50-56), e as APIs usadas pelo script (`retry`/docker descartável, `pg_get_functiondef`, stubs `auth.role()`/`auth.uid()`) são o padrão dos demais `*.test.sh` de db-audit. Produção confirma (SELECT só leitura, MCP `SUPABASE - ZAPP WEB V2 - MCP`, projeto `tnnnlkbymytvtqngbbqh`):
   `increment_agent_resolutions(uuid)` → tem_anon=t, tem_guard_quebrado=f, anon_exec=f, auth_exec=t;
   `update_agent_streak(uuid,boolean)` → tem_anon=t, tem_guard_quebrado=f, anon_exec=f, auth_exec=f (REVOKE de `20261113170600`).
   Ou seja: as 4 asserções estáticas e as 4 de runtime do script continuam verdadeiras hoje; nada no script contradiz o REVOKE posterior, porque o runtime dele só exercita `increment_agent_resolutions` (que segue com EXECUTE para authenticated) num Postgres descartável com grants próprios.
   Valor da guarda: a forma quebrada (`auth.role() = 'authenticated' AND NOT …`) ainda está viva em arquivos da main (`20261013044500_gamification_streak_dias_seguidos.sql:19,250-251`, `20260927340000`, `20261003272707`), isto é, o padrão que bloqueia `service_role` continua à mão para ser copiado — exatamente o que o teste detectaria.

Ressalva para a recuperação (não muda o veredito): copiar só o arquivo deixa CI VERMELHA. `scripts/ci/check-test-inventory.mjs:83-90` cruza todo `scripts/db-audit/*.test.sh` do disco com as menções em `.github/workflows/db-guard.yml` e não admite exceção (comentário na linha 67). Confirma o passo 2 do dossiê: o port tem de incluir o registro no array `testes=(` de `db-guard.yml:1619`. Toca workflow → PR fica aberta para o dono.

Branch NÃO pode ser apagada antes do port.
Não verificado: não executei o script (exigiria docker + Postgres descartável nesta sessão); a avaliação de que ele passa é por leitura + estado vivo da produção, não por execução.
