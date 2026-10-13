Especialista: hugo

## O que mudou e por quê
- `src/hooks/crm/useContactsKpi.ts`: a agregação deixou de paginar a tabela `contacts` no navegador (`fetchKpiRows`, 1000 linhas por resposta) e passou a vir de 2 RPCs agregadas — `contacts_stats(boolean)` (total/novos 30d/duplicados/lgpd) e `contacts_stats_series(boolean)` (empresasDistinct + as 4 séries dos sparklines). O contrato `ContactsKpi` (campos e nomes) foi mantido igual, então `ContactStatsCards` não precisou mudar. `lgpd_pending` passou a `stats.lgpd_pending ?? null`.
- `src/hooks/crm/useContactsKpi.ts`: as 3 contagens do período ANTERIOR (`novosPrev30`, `fornecedores30`, `fornecedoresPrev30`) saem de `count: 'exact', head: true` com o MESMO recorte de antes (soft-delete + legado + visibilidade do RLS) — o delta "vs. período anterior" do card Novos/Fornecedores continua exato, sem receber linha de contato.
- `src/hooks/crm/useContactsKpi.ts`: `rpcStatsSeries()` é um adaptador local para `contacts_stats_series`, porque `types.ts` é gerado do banco e ainda não traz essa função (contrato entregue pelo cartão pai t_6fc22a23) — evita editar o arquivo gerado, fora da lista do cartão.
- Testes: `__tests__/useContactsKpi.test.ts` (contrato do mapeamento + `range` nunca chamado), `__tests__/useContactsKpi.pagination.test.ts` (0 chamadas de 1000 linhas), `__tests__/useContactsKpi.query.test.tsx` (recorte soft-delete/legado nas contagens de janela), `__tests__/contactsAggregatesRefetchOnMount.test.tsx` (refetch conta as RPCs) e `components/contacts/__tests__/ContactStatsCards.test.tsx`.
- Faixa dos cartões pais dentro do diff deste cartão (dependência declarada no cartão): `supabase/migrations/20261013010929_contacts_stats.sql` + `scripts/db-audit/contacts-stats-rpc.test.sh` (pai t_2e6929a6) e `supabase/migrations/20261013235904_contacts_stats_series.sql` + `scripts/db-audit/contacts-stats-series-rpc.test.sh` + `scripts/ci/check-test-inventory.mjs` (pai t_6fc22a23, trazido por cherry-pick da faixa).

## Prova
- vermelho antes (hook da base, sem a mudança): `npx vitest run src/hooks/crm/__tests__/useContactsKpi.test.ts src/hooks/crm/__tests__/useContactsKpi.pagination.test.ts` → `Test Files 2 failed (2)` / `Tests 13 failed (13)` — `TypeError: kpiFromServer is not a function` (a base paginava a tabela).
- verde depois: `npx vitest run src/hooks/crm src/components/contacts src/hooks/contacts` → `Test Files 53 passed (53); Tests 362 passed | 1 expected fail (363)`.

## O que NÃO fiz e por quê
- indicador clicável de duplicados que filtra a lista: exige `ContactStatsCards` + a lista (`ContactsView`/`useContactsSearch`), fora da lista de arquivos do cartão. O número já está exposto no hook (`kpi.duplicateCandidates`) para quem for ligar o indicador.
- contadores da janela 30–60 d como campo de RPC: as RPCs dos pais não as expõem (`growth_30d_pct` é outra grandeza). Mantive o delta exato com as contagens head, para o componente não perder o "vs. período anterior".
