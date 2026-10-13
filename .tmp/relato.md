Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- `.tmp/relato.md`: é este próprio relato. A branch base já versiona esse arquivo (apesar de `.tmp/` estar no `.gitignore`), então ele aparece como 4º arquivo do diff — é o único motivo de o diff ter 4 arquivos, dos quais 1 é de teste. Não é código de produto.
- `supabase/migrations/20261013230010_web_vitals_samples.sql` (novo): medicao de campo dos Web Vitals sem coletor no servidor (PE-108/SL-231). Cria `public.web_vitals_samples` (metric, value, route normalizada, app_version, sampled_on/dia, user_id, created_at) com CHECK de faixa por metrica (CLS 0..10; demais 0..600000 ms), rota sem `?`/`#`/espaco e versao sem espaco; RLS LIGADA e sem GRANT de escrita para cliente (INSERT/UPDATE/DELETE barrados — A4/A5); leitura so para admin (policy + GRANT SELECT). Escrita so pela RPC `public.record_web_vital(jsonb)` SECURITY DEFINER, que valida o LOTE INTEIRO antes de gravar (amostra invalida => 22023, nada pela metade) e aplica rate limit por usuario reusando `public.consume_rate_limit` (60 s, 30 chamadas; estourou => devolve 0 em silencio). Retencao: `public.purge_web_vitals_samples(interval default '30 days')` (so service_role) + `cron.schedule('purge-web-vitals-samples','25 4 * * *')`. Sem PII: rota normalizada no lugar da URL, sem UA/IP/sessao. Rollback executavel no cabecalho.
- `scripts/db-audit/web-vitals-samples-rpc.test.sh` (novo): prova com os PAPEIS REAIS (authenticated/anon/service_role, `SET ROLE`) em Postgres 17 descartavel, aplicando as migrations REAIS (a minha + a de edge_rate_limits) e extraindo `is_admin` verbatim; cobre EXECUTE/GRANT, gravacao, validacao, atomicidade, rate limit, leitura admin, retencao, job do cron e o rollback.
- `scripts/ci/check-test-inventory.mjs`: uma linha na ALLOWLIST com justificativa. O inventario JA reprova 6 orfaos pre-existentes de outros cartoes (department-invite, ia-usage-outbox, talkx-conversion-defaults, team-chat-*); o meu NAO aparece na lista (absolvido). O passo no db-guard.yml fica com o dono do workflow.

## Prova
- vermelho antes: `WEB_VITALS_TEST_MIGRATIONS_DIR=<dir sem a migration> bash scripts/db-audit/web-vitals-samples-rpc.test.sh` -> `[FAIL] migration nao encontrada: 20261013230010_web_vitals_samples.sql`
- verde depois: `bash scripts/db-audit/web-vitals-samples-rpc.test.sh` -> 30 linhas `[PASS]` e final `[OK] contrato de web_vitals_samples, record_web_vital e retencao verificado com papeis reais` (A1..A7, B1..B5, C1..C9+atomicidade, D1..D3, E1..E4, F1..F2, G1..G3).
- migration aplicada no banco LOCAL: `hermes-db-migrar supabase/migrations/20261013230010_web_vitals_samples.sql` -> `APLICADA no banco LOCAL 'v2-261013061216d8' (producao nao foi tocada)`.
- drift: `node scripts/db-audit/check-migration-drift.mjs` -> `arquivos validos em supabase/migrations: 832` (exit 0).
- inventario: `node scripts/ci/check-test-inventory.mjs` -> meu arquivo nao consta entre os orfaos; `node --test scripts/ci/check-test-inventory.unit.mjs` -> 7 pass / 0 fail.

## Pontos de efeito colateral (conferidos antes do relato)
- Sem backfill e sem UPDATE em tabela existente: a unica tabela e nova e o unico caminho de escrita e INSERT; nenhum gatilho de `updated_at` existente e disparado.
- Atomicidade: validacao de TODAS as amostras antes de um unico INSERT (C8: lote com 1 invalida nao grava nada, contagem antes=depois).
- Sem oraculo: a RPC nao revela existencia de usuario nem contagem alheia; erro identico (22023) para qualquer amostra invalida.
- ACL: nao toquei `is_admin` nem outro objeto existente. A policy admin usa `is_admin(auth.uid())`; em producao `authenticated` JA tem EXECUTE nela (default privileges do Supabase ao criar a funcao + o REVOKE da 20260903260000 tirou PUBLIC/anon). Reproduzi esse envelope no teste (sem isso a leitura admin quebra) — verificado em B5.
- Retencao coordenada com PE-102: entrego a funcao de purga e o job com nome distinto (`purge-web-vitals-samples`); a limpeza central do PE-102 pode reassumir o passo sem tocar na tabela.

## O que NÃO fiz e por quê
- Nao criei/editei arquivo do coletor (`src/lib/web-vitals.ts`, hook): e do cartao do cliente (t_0497fe34). Deixei o contrato exato da RPC em `kanban_comment` no cartao.
- Nao escrevi em `global_settings` (interruptor de amostragem citado no cartao do coletor): migration nao grava dado em tabela existente; o front deve tratar chave ausente como desligado.
- Nao liguei o teste ao `.github/workflows/db-guard.yml` (workflow e do dono/worker ci): deixei a ALLOWLIST com justificativa e o registro pendente.
- Nao concedi a policy de leitura a `anon` nem EXECUTE da RPC a `anon` (A1/A3/A6 provam o fechamento).

## Sobre os arquivos fora da lista do cartão (aviso do juiz)
`scripts/db-audit/**` e `supabase/tests/**` sao a MINHA area (skill `area-sql-banco`: "minha area e onde o arquivo mora: supabase/migrations/**, supabase/tests/** e scripts/db-audit/**"), e a propria lista do cartao cita `supabase/tests/` para a prova. A prova em banco exige `SET ROLE authenticated/anon/service_role` num Postgres descartavel, o que um `supabase/tests/*.sql` NAO faz (aqueles rodam como service_role, com BYPASSRLS — esta escrito na cabeca do `supabase/tests/rls_dashboard.sql`). Por isso a prova ficou em `scripts/db-audit/web-vitals-samples-rpc.test.sh`, no mesmo padrao do `dashboard-rls-authorization.test.sh`. A linha em `scripts/ci/check-test-inventory.mjs` e o unico jeito de a suite nova nao nascer orfa no CI sem eu editar `db-guard.yml` (workflow e do dono/worker ci) — e o padrao escrito no proprio arquivo ("Passo de YAML a promover pelo dono do workflow"). Nenhum dos dois arquivos mexe em comportamento de produto.

Observacao: o rodape do cartao traz a linha de REGRAS PERMANENTES ("sem DDL/migration") — cartao de BANCO pede migration por definicao; o CRITERIO DE PRONTO deste cartao e a tabela + RPC.
