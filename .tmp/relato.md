Especialista: workersql

## O que mudou e por quê
- supabase/migrations/20261011150527_feature_flags_rollout.sql: migration ADITIVA que (1) acrescenta rollout_percentage int not null default 100 check (0..100), allowed_roles text[] not null default '{}', allowed_user_ids uuid[] not null default '{}', blocked_user_ids uuid[] not null default '{}', expires_at timestamptz null e metadata jsonb not null default '{}' em public.feature_flags (linha existente continua 100%/sem restrição); (2) cria public.evaluate_feature_flags() SECURITY DEFINER, SET search_path = pg_catalog, public, que exige auth.uid() (RAISE 42501 sem JWT) e devolve text[] só com as chaves LIGADAS para o usuário, nesta ordem: enabled → não expirada → não bloqueado → (allowed_user_ids OU ((allowed_roles vazio OU papel) E (100% OU hash estável de user||key mod 100 < percentual))); (3) troca a RLS: SELECT só is_admin_or_supervisor(), INSERT/UPDATE/DELETE só is_admin() (some o USING (true) da policy original), RPC revogada do PUBLIC/anon e concedida só a authenticated; (4) semeia idempotente as 11 flags do cartão DESLIGADAS (enabled=false, rollout 0) sem tocar as existentes. Sem 'chat_scheduled_dispatch', como o cartão pede.
- scripts/db-audit/feature-flags-rollout.test.sh: prova em PostgreSQL 17 descartável que aplica o SQL REAL da migration, roda como anon/authenticated/service roles próprios e cobre percentual (0/50/100), papel, bloqueado vence permitido, expiração, listas que não vazam, agente não lê a tabela e admin escreve. Tem 2 mutações (tira a linha do bloqueio; reabre USING (true)) que comprovam que o contrato não é tautológico.
- src/integrations/supabase/types.ts: tipos gerados atualizados com as 6 colunas e a função (o passo "tipos" do zapp-verify revalida isto).
- .github/workflows/db-guard.yml: passo do teste novo (sem ele o check-test-inventory reprova o .test.sh como órfão, como manda o fluxo de banco do repositório).

## Prova
- vermelho antes (o defeito da V2, no mesmo teste antes de aplicar a migration):
  - `[FAIL] ANTES ... o usuario autenticado comum LE a tabela inteira (policy USING true)` — o teste reproduz e exige o defeito ANTES.
  - `[OK] ANTES: a RPC de avaliacao nao existe = t` / `[OK] ANTES: nao ha coluna rollout_percentage = 0`.
- verde depois: `bash scripts/db-audit/feature-flags-rollout.test.sh` → exit 0, 37 linhas [OK], fechando em `[OK] contrato da etapa 5 (rollout de feature_flags) verificado: 9 assercoes (postgres:17-alpine)`.
  - `[OK] rollout 50: 523/1000 ids receberam (perto da metade, hash distribuido)`
  - `[OK] DEPOIS: agente comum NAO le a tabela = f` / `[OK] DEPOIS: admin le a tabela = t` / `[OK] DEPOIS: supervisor le a tabela = t` / `[OK] DEPOIS: has_table_privilege(anon, feature_flags, SELECT) = f`
  - `[OK] DEPOIS: anon e barrado (42501)` / `[OK] DEPOIS: sem JWT e barrado (42501, exige auth.uid())` / `[OK] DEPOIS: has_function_privilege(authenticated, evaluate_feature_flags, EXECUTE) = t`
  - `[OK] DEPOIS: a resposta nao contem o uuid do usuario = 0` (as listas não saem)
  - `[OK] MUTACAO A: sem o bloqueio o contrato FALHA como esperado` / `[OK] MUTACAO B: com a leitura aberta o contrato FALHA como esperado`
- `bun run db:guard` → `OK: nenhuma violacao nova.` + `arquivos validos em supabase/migrations: 817`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (73s)` com `OK dependencias / db_guard / tipos / lint / migrations` (o passo `tipos` revalida o types.ts contra o schema).
- `hermes-db-migrar supabase/migrations/20261011150527_feature_flags_rollout.sql` → `APLICADA no banco LOCAL 'v2-26101112023c21' (produção não foi tocada)`; o `up` aplicou a migration do zero no banco local, sem falha.
- Rollback: linha `-- Rollback:` no cabeçalho derruba a RPC, as 4 policies, apaga as 11 flags semeadas e as colunas, e recria as policies originais (SELECT authenticated + escrita admin FOR ALL) — inverso executável na ordem.

## Arquivos do commit (5) e escopo
- supabase/migrations/20261011150527_feature_flags_rollout.sql — listado no cartão.
- scripts/db-audit/feature-flags-rollout.test.sh — "testes de banco", listado no cartão.
- src/integrations/supabase/types.ts — "gerado", listado no cartão.
- .github/workflows/db-guard.yml — indispensável: o check-test-inventory reprova como ÓRFÃO todo .test.sh sem passo no CI, e o próprio fluxo de banco do cartão é que manda registrar o teste ali (mesmo padrão dos vizinhos). Sem o passo, o teste não roda no CI.
- .tmp/relato.md — este relato; o repo rastreia esse caminho (já vinha versionado), então ele entra no commit (o fechar exige árvore limpa).

## Pontos do juiz barato
- "código alterado sem teste: src/integrations/supabase/types.ts" não procede: types.ts é artefato GERADO do mesmo schema da migration; a prova do defeito (vermelho→verde) está em scripts/db-audit/feature-flags-rollout.test.sh, que é novo e está neste commit, e o passo `tipos` do `zapp-verify . --rapido` revalida o types.ts contra o banco aplicado. Não existe teste de unidade cabível para um arquivo gerado.

## O que NÃO fiz e por quê
- Ledger de migrations: no MODO_V2 o `hermes-db-migrar` só aplica no banco LOCAL e não grava em `supabase_migrations.schema_migrations` (registro no ledger é do apply pós-merge, pela trilha de banco; docs/MIGRATIONS.md). Não toquei produção.
- A leitura da tabela passa a ser restrita a admin/supervisor: o app comum deve consumir `evaluate_feature_flags()`. O hook `src/hooks/system/useFeatureFlag.ts` (área hooks/telas) ainda lê `feature_flags` direto e vai receber 0 linhas para agente — deixei comentário no cartão para o especialista de hooks trocar pela RPC. Fora da minha área, não editei.
- Não alterei `supabase/schema-manifest.json`/`schema-catalog.json`: são retrato do banco canônico, sincronizados por job próprio.
- Sem push/PR/deploy (só o Joaquim autoriza).
