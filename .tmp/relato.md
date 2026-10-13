Especialista: worker (sql) (area-sql-banco) — perfil workersql (t_6fc22a23)

## O que mudou e por quê
- `supabase/migrations/20261013235904_contacts_stats_series.sql` (nova): cria `public.contacts_stats_series(p_include_legacy boolean DEFAULT false) RETURNS jsonb` (STABLE, SECURITY DEFINER, `search_path=public`) devolvendo as 5 chaves que faltavam para o hook parar de paginar `contacts` no navegador: `empresas_distinct` + `series_novos_daily_30`, `series_total_cumulative_12w`, `series_empresas_cumulative_12w`, `series_fornecedores_weekly_12`. Usa o MESMO predicado de visibilidade de `contacts_stats`/`search_contacts`: `deleted_at IS NULL` + `COALESCE(p_include_legacy,false)` + `can_edit_contact(assigned_to, queue_id, <visíveis>, <profile>, <admin>)` com os 4 helpers resolvidos UMA vez (parâmetros hoisted, migration 20260929810000). `service_role` enxerga tudo. ACL: `REVOKE ALL ... FROM PUBLIC, anon` + `GRANT EXECUTE ... TO authenticated, service_role`.
- `scripts/db-audit/contacts-stats-series-rpc.test.sh` (novo): prova em Postgres 17 descartável (docker) os arrays conferidos na mão para admin/agente A/agente B/escopo vazio, o `include_legacy`, o ACL anon/PUBLIC, o `service_role`, os invariantes do contrato e o Rollback. Aplica a MIGRATION REAL achada pelo marcador `contacts_stats_series(boolean)`.
- `scripts/ci/check-test-inventory.mjs`: entrada na ALLOWLIST (o cartão autoriza; NÃO toquei em `.github/workflows`). "REGISTRO PENDENTE: scripts/db-audit/contacts-stats-series-rpc.test.sh — passo de uma linha em db-guard.yml a promover pelo dono do workflow" (o allowlist tira o órfão do check).
- `.tmp/relato.md`: este relato (o repositório versiona o relato e o `hermes-tarefa-fechar` exige árvore limpa) — total de 4 arquivos no diff, sendo 1 de teste.

Semântica das janelas (idêntica ao `aggregateKpi` do hook): "now" = `now()`; dia D atrás = idade em `[D, D+1)`; diária de 30 dias em 7 buckets de 4 dias, EXCETO o 7º que soma 6 (índices 24..29 do array diário), então a soma dos 7 = novos dos últimos 30 dias — conferido no bloco 6. Cumulativo 12s: `count(idade >= (11-i)*7 dias)`, i=0 a mais antiga. Estas funções não existem em nenhuma migration deste repo, então a migration é aditiva e independente (não toca `contacts_stats`, que segue em refazer no pai t_2e6929a6).

## Prova
- vermelho antes (dentro do teste): `SELECT to_regprocedure('public.contacts_stats_series(boolean)')` → `''`; `SELECT public.contacts_stats_series()` → `function ... does not exist`.
- verde depois: `bash scripts/db-audit/contacts-stats-series-rpc.test.sh` → todas as linhas `[PASS]`, nenhuma `[FALHA]`, fecha com
  `[OK] CT-E/PB-30: contacts_stats_series respeita o escopo de contacts_stats/search_contacts, calcula empresas_distinct e as 4 series do useContactsKpi com as janelas do aggregateKpi, inclui legados sob include_legacy, nega anon/PUBLIC e o Rollback remove a funcao.`
  Exemplos conferidos na mão: admin `series_novos_daily_30 = [2, 1, 1, 1, 2, 2, 3]`; agente A `series_empresas_cumulative_12w = [1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 4, 5]`; escopo vazio (C) tudo zerado; `include_legacy=NULL` cai no padrão (`empresas_distinct=6`); anon → `permission denied`; Rollback remove a função (volta ao RED).
- migration no banco LOCAL: `hermes-db-migrar supabase/migrations/20261013235904_contacts_stats_series.sql` → `CREATE FUNCTION / COMMENT / REVOKE / GRANT / COMMIT` e `APLICADA no banco LOCAL 'v2-26101312171ccb' (produção não foi tocada)`.
- `node scripts/ci/check-test-inventory.mjs` → o meu arquivo NÃO aparece na lista de órfãos (a ALLOWLIST valeu); os 6 órfãos listados são pré-existentes (outros arquivos).

## O que NÃO fiz e por quê
- Não editei `.github/workflows/db-guard.yml` (agente não edita workflow) — deixei o allowance e o "REGISTRO PENDENTE" acima.
- O juiz automático avisou que "o relato não bate com o diff (4 arquivos, 1 de teste)": o diff do run tem EXATAMENTE os 4 arquivos listados acima, dos quais 1 é de teste (`scripts/db-audit/contacts-stats-series-rpc.test.sh`) — o aviso não procede; a lista agora explicita os 4.
- Não toquei em `src/**` (fora da minha área): o contrato (chaves e tamanhos das séries) está no cabeçalho da migration para o hook t_858c0ff2 consumir; trocar a fonte dos números em `aggregateKpi` é da área de hooks.
- Não criei linha de backfill de dados (não há dado novo).

## Efeitos colaterais (passada antes do relato)
- Nenhuma escrita em tabela: só `CREATE FUNCTION` + `COMMENT`/`REVOKE`/`GRANT` — sem gatilho de `updated_at`, sem backfill, sem `DROP`/`DELETE`.
- Uma aplicação = uma transação (o `hermes-db-migrar` mostrou `BEGIN ... COMMIT`): falha não deixa nada pela metade.
- `include_legacy` é `COALESCE(p_include_legacy, false)`: um NULL explícito não esvazia o resultado.
- Escopo resolvido uma vez por chamada (hoisted), sem chamar os lookups caros por linha.
