Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261013000031_revoke_truncate_trigger_references.sql: revoga
  TRUNCATE, TRIGGER e REFERENCES em TODAS as relacoes de public de uma vez (REVOKE e
  idempotente) para anon e authenticated; revoga INSERT/UPDATE/DELETE de anon em
  public.contact_custom_fields; e ajusta ALTER DEFAULT PRIVILEGES FOR ROLE postgres para
  tabela nova nao herdar os 3. Motivo: o padrao do Supabase deixa os 3 privilegios em toda
  tabela e eles NAO passam pela RLS (TRUNCATE esvazia sem consultar policy, TRIGGER e DDL,
  REFERENCES permite FK apontando para a tabela). service_role nao e tocado.
- supabase/tests/revoke_truncate_trigger_references.sql: suite T1-T8 no banco local, com
  PAPEL REAL (SET LOCAL ROLE anon/authenticated/service_role), numa transacao com ROLLBACK.

## Prova
- vermelho antes (migration ainda NAO aplicada no banco local):
  `zapp-db-local psql <workspace> v2-26101220572d35 -v ON_ERROR_STOP=1 < supabase/tests/revoke_truncate_trigger_references.sql`
  → `ERROR: T1 FALHOU: 747 concessoes de TRUNCATE/TRIGGER/REFERENCES ainda vivas para anon/authenticated` (exit 3)
- verde depois de `hermes-db-migrar supabase/migrations/20261013000031_...sql` (APLICADA no banco LOCAL):
  mesmo comando → `T1 ok: 0 concessoes ...` / `T2/T3 ok: anon e authenticated recebem 42501 ao tentar TRUNCATE`
  / `T4 ok: service_role intacto` / `T5 ok: anon sem INSERT/UPDATE/DELETE em contact_custom_fields`
  / `T6 ok: anon recebe 42501 ao tentar INSERT` / `T7 ok: leitura e escrita legitimas do authenticated seguem via RLS (n=1)`
  / `T8 ok: tabela nova em public nao herda TRUNCATE/TRIGGER/REFERENCES` / ROLLBACK → exit 0
- `-- Rollback:` executavel: as 3 linhas `--   <stmt>;` do arquivo rodadas no banco local dentro
  de BEGIN..ROLLBACK → `grants_de_volta = 1086` (181 relacoes x 2 papeis x 3 privilegios), sem erro.
- suite de RLS existente, verde com a migration aplicada (6/6 PASS): rls_dashboard,
  rls_conversation_tab_counts_files_total, rls_whatsapp_media_select_via_messages,
  dashboard_rpc_filters, dashboard_kpi_edge_cases, inbox_agregado_por_contato.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (chamado sem nome de conjunto, como o fechar faz).

## O que NÃO fiz e por quê
- NÃO revoguei INSERT/UPDATE/DELETE de anon nas outras 115 tabelas: o cartao pede so em
  contact_custom_fields e manda listar as demais. Medido no banco local: anon ainda tem
  INSERT/UPDATE/DELETE (grant inerte do padrao Supabase) em 115 tabelas — lista completa em
  .tmp/anon-write-grants.txt (anexada). Todas estao bloqueadas pela RLS: a UNICA policy em
  public que alcanca anon e a de webauthn_challenges, que NEGA ("Block anon access"); as 5 de
  talkx_campaign_segments sao TO public mas usam auth.uid(), que e NULL para anon. Nao revoguei
  porque a RLS ja barra e o cartao so pediu contact_custom_fields; recomendo cartao seguinte
  para fechar grants inertes.
- NÃO mexi no default ACL de supabase_admin (o cartao pede "para o dono atual" = postgres).
  Residual registrado: tabela criada por supabase_admin ainda pode herdar os 3 para anon.
- NÃO toquei GRANT de SELECT (anon mantem SELECT em contact_custom_fields; RLS devolve 0 linhas,
  provado em T1 do fluxo legitimo) — fora do pedido.
