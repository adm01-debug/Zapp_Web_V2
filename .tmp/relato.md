Especialista: workersql

FAIXA DO PAI: commit 33598d96e do cartão t_623ff6d6 — não é deste cartão. Trouxe por `git cherry-pick` → `4832506662`, única ponta desta branch.

## O que mudou e por quê
- Motivo da recusa: "a branch da tarefa andou depois do fechar" (HEAD `0b59f3dbc2` ≠ sha revisado `33598d96e`). O serviço é ALINHAR a branch ao commit revisado; nenhum conteúdo foi reescrito.
- `supabase/migrations/20261013042745_audit_admin_changes.sql` (novo): função `public.audit_admin_change()` (SECURITY DEFINER, `search_path = public, pg_temp`, `revoke all ... from public, anon, authenticated, service_role`) + 8 gatilhos `AFTER INSERT/UPDATE/DELETE` (em `profiles` só `AFTER UPDATE OF is_active, access_level, max_chats, can_download`).
- `supabase/tests/audit_admin_changes.sql`: suíte de prova (papéis reais).
- Conteúdo idêntico ao revisado, por hash: `git hash-object supabase/tests/audit_admin_changes.sql` = `0e6dc3f88cb45222fba131b7dd2eba514ef5bf1c` = `git rev-parse 33598d96e:supabase/tests/audit_admin_changes.sql`; `git diff 33598d96e 4832506662 -- <os dois arquivos>` sai VAZIO.
- O commit extra que fez a branch andar (`0b59f3dbc2`, que trocava a suíte por `scripts/db-audit/*.test.sh` + ALLOWLIST de `scripts/ci/check-test-inventory.mjs`) NÃO foi trazido: arquivos fora de "ARQUIVOS QUE PODE TOCAR".

## O defeito ainda existe no código atual?
- Não é defeito de código, é de processo (a branch andou). A entrega não é redundante: `git grep -n "on public\.\(profiles\|global_settings\|ip_whitelist\|blocked_ips\|blocked_countries\|geo_blocking_settings\|rate_limit_configs\|agent_visibility_grants\)" supabase/migrations/` só acha os gatilhos da própria `20261013042745_audit_admin_changes.sql`.

## Prova
- vermelho antes (prova herdada do commit revisado, conteúdo byte-idêntico; Postgres 17 descartável, migrations reais, escrita como `SET ROLE` real): `-v sem_guarda=1` → `ERROR: FALHOU [T.1 oito gatilhos instalados]: esperado [8], obtido [0]` (rc=3).
- verde depois (mesma suíte) → `PASS: trilha das acoes administrativas — 8 gatilhos nao-vacuos, profiles restrito aos 4 campos de acesso, global_settings sem valor, ator JWT/sistema, EXECUTE negado e trilha a prova de forja.` (rc=0).
- Rollback executado de verdade: `PASS [RB.1 nenhum gatilho administrativo sobrou] -> 0`, `PASS [RB.2 a funcao audit_admin_change sumiu] -> 0`, `PASS [RB.3 a trilha ja gravada permanece (nenhum dado apagado)] -> true`.
- passa/negado por papel real (o cartão pede explícito): `anon` NEGADO em `42501` ao ler/escrever a trilha e sem EXECUTE; `authenticated` é auditado (1 operação = 1 registro nas 8 tabelas, ator = uid do JWT) mas NEGADO a forjar/adulterar/apagar `audit_logs` (policy) e sem EXECUTE na função; `service_role` grava com ator NULO marcado `service_role_or_direct_sql`; valor de `global_settings` e telefone/e-mail nunca aparecem em `details`. Suíte: 65 linhas `PASS`, `exit=0`.
- verificação que EU rodei AGORA nesta tentativa:
  - `zapp-verify . --rapido` → `OK dependencias`, `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`; `AVISO banco_local NÃO VERIFICADO: sem nome de conjunto`; `VERIFY: VERDE SEM BANCO` (exit 0).
  - `zapp-verify full .` → `OK testes 527s`, `OK build 8s`; `VERIFY: VERDE SEM BANCO (631s)` (FULL_EXIT=0).
- NÃO reexecutei o docker nesta tentativa (o `docker exec … psql` é proibido no meu perfil): a prova de banco é a do commit revisado, cujo conteúdo confirmei byte-idêntico por hash.

## O que NÃO fiz e por quê
- Não criei `scripts/db-audit/*.test.sh` nem toquei `scripts/ci/check-test-inventory.mjs`/workflow: fora de "ARQUIVOS QUE PODE TOCAR" — foi esse commit extra que fez a branch andar depois do fechar.
- Não reescrevi a suíte (o defeito era de processo) e não toquei produção, banco real nem GRANT de objeto existente.
- Nada do banco real citado.
