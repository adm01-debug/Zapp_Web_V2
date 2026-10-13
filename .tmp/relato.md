Especialista: worker (geral)

## O que é este cartão (leia primeiro)
Cartão SÓ RELATO/PROVA, por instrução do revisor ("Corrigir: SÓ O RELATO", "sem refatorar e sem
ampliar diff"). O diff DESTE cartão é apenas `.tmp/relato.md`. O código (base + fix + teste) NÃO é
deste cartão e NÃO foi cherry-pickado para cá de propósito, para não ampliar o diff: ele vive em
t_24edcc38, branch `v2/restrigir-grant-window-open-261013-2610130851e642` @ 87ea75533, que o revisor
já declarou "correto e no escopo". Decisão mantida: opção A — EXECUTE só para `service_role`, porque o
único consumidor é a Edge `talkx-scheduler` (SERVICE_ROLE_KEY).

## Ponto 1: check-secdef-public-execute contra base+fix (saída literal)
Comando exato (harness descartável, mesmo PRE_SQL/papéis do teste versionado do pai):
```
docker run -d --name C -e POSTGRES_PASSWORD=test_only postgres:17-alpine
docker exec -i C psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < .tmp/n102/pre.sql    # roles anon/authenticated/service_role + stubs
docker exec -i C psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < .tmp/n102/base.sql   # BASE real 20261009203548 (git show 87ea75533:supabase/migrations/20261009203548_talkx_campaigns_send_weekdays_dnd.sql)
docker exec -i C psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < .tmp/n102/fix.sql    # FIX 20261013085500 (git show 87ea75533:supabase/migrations/20261013085500_talkx_n102_window_fixes.sql)
docker exec -i C psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < scripts/db-audit/check-secdef-public-execute.sql
```
Saída literal (últimas linhas; exit ao final):
```
### 3) FIX 20261013085500_talkx_n102_window_fixes.sql
REVOKE
GRANT
### 4) guard scripts/db-audit/check-secdef-public-execute.sql contra base+fix
SET
NOTICE:  check-secdef-public-execute: OK (4 funcoes SECURITY DEFINER em public, nenhuma com PUBLIC/anon)
DO
EXIT_CODE=0
```
Ou seja: o guard genérico fica VERDE sobre base+fix (NOTICE OK, exit 0). Era esta a prova que faltava
no item Prova do relato anterior.

## Ponto 2: known-violations.json — chave fica obsoleta? o check acusa?
- O guard que RODEI (`scripts/db-audit/check-secdef-public-execute.sql`) NÃO lê `known-violations.json`
  (grep: nenhuma ocorrência no arquivo) → **não acusa** a chave. Ele só olha `pg_proc`/`pg_roles`.
- A chave `rpc:talkx_campaign_window_open:supabase/functions/talkx-scheduler/index.ts`
  (`scripts/db-audit/known-violations.json:7`) é consumida por `scripts/db-audit/supabase-usage-guard.mjs`
  (baseline/ratchet: `obsoletas` em :317, mensagem "Entradas obsoletas no baseline" em :342).
- Hoje ela **NÃO está obsoleta**: conferi `git ls-tree dia/2026-10-13 supabase/migrations/` e NEM
  20261009203548 NEM 20261013085500 estão na dia. A projeção é forward-only sobre as migrations da dia,
  então ainda não vê o alvo — por isso o guard de CI continua sem acusar.
- Ela **fica obsoleta no instante em que a base entrar em dia/**: aí o alvo passa a existir, a chave
  vira obsoleta e o próprio `supabase-usage-guard` falha pedindo a remoção. Ajuste do baseline =
  **pendência do cartão do guard de CI**, não desta fatia (o revisor autorizou só registrar).

## Ponto 3: item 1 do CRITÉRIO DE PRONTO (estava truncado)
Item 1 reescrito: a base `20261009203548_talkx_campaigns_send_weekdays_dnd.sql` **entra só via
cherry-pick do pai t_37e0dde7, sem edição desta fatia**; as correções desta fatia vão na migration
nova `20261013085500_talkx_n102_window_fixes.sql`. Não toquei em RLS/tabelas nem no contrato de acesso.

## Contexto do código do pai (fora do diff deste cartão)
- `supabase/migrations/20261013085500_talkx_n102_window_fixes.sql`: `REVOKE ALL ON FUNCTION
  public.talkx_campaign_window_open(uuid, timestamptz) FROM PUBLIC, anon, authenticated;` +
  `GRANT EXECUTE ... TO service_role;`.
- `scripts/db-audit/talkx-n102-window-open-access.test.mjs`: prova em PG17 descartável com papéis reais
  (BLOCO A vermelho: authenticated executa na base; BLOCO B verde: anon/authenticated sem EXECUTE,
  authenticated recebe 42501, service_role retorna true; BLOCO C rollback idempotente). Prova do pai
  (não re-executada aqui, para não trazer os arquivos do pai para este diff): `node --test
  scripts/db-audit/talkx-n102-window-open-access.test.mjs` → 3 pass.

## O que NÃO fiz e por quê
- Não cherry-piquei o código do pai para este workspace (instrução do cartão: sem ampliar diff).
- Não alterei contrato de acesso, RLS ou tabelas; não fiz push/merge/deploy nem toquei produção.
