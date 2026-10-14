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
- .tmp/relato.md: este proprio relato (ja versionado na branch base; a atualizacao entra no
  diff para deixar a arvore limpa, como o hermes-tarefa-fechar exige) — 3o arquivo do diff.

## Prova (tudo rodado agora no conjunto v2-revref1)
- Subida: `zapp-db-local up . v2-revref1` → `migrations: 809 ok, 21 falha(s) de 832
  (1 reaplicada como supabase_admin) | seed: ok`, `TRAVAS: conferidas`, EXIT=0.
  (O nome do cartao, v2-26101220572d35, falhou 2x no up por infra — o diretorio do
  conjunto sumia no meio das migrations; o conteudo aplicado e o mesmo: este workspace.)
- Suite: `zapp-db-local psql . v2-revref1 -v ON_ERROR_STOP=1 < supabase/tests/revoke_truncate_trigger_references.sql`
  → `T1 ok: 0 concessoes ...` / `T2/T3 ok: ... 42501 ...` / `T4 ok: service_role intacto`
  / `T5 ok: anon sem INSERT/UPDATE/DELETE ...` / `T6 ok: ... 42501 ...`
  / `T7 ok: ... via RLS (n=1)` / `T8 ok: tabela nova ... nao herda ...` / ROLLBACK, EXIT=0.
- Vermelho (portao-local): com os grants restaurados em transacao, a consulta do T1 devolve
  `T1_simulado=1086` → ROLLBACK (a suite abortaria em `T1 FALHOU: 1086 ...`).
- Medida direta (mesmo filtro do T1): `relacoes_public=181`, `grants_ddl_vivos=0`.
- Rollback executavel (3 stmts do `-- Rollback:` em BEGIN..ROLLBACK): `grants_de_volta=1086`
  (181 relacoes x 2 papeis x 3 privilegios) e, apos o ROLLBACK, `grants_apos_rollback=0`.
- RLS existente, cada arquivo com `zapp-db-local psql . v2-revref1 -v ON_ERROR_STOP=1 < supabase/tests/<arq>.sql`, EXIT=0 nos 6:
  rls_dashboard → `rls_dashboard: suite completa OK (T1-T7)`;
  rls_conversation_tab_counts_files_total → `rls_tab_counts: estrutura ok (files_total filtra apagadas; ...)`;
  rls_whatsapp_media_select_via_messages → `rls_whatsapp_media: estrutura ok ...` + `logica de visibilidade ok`;
  dashboard_rpc_filters → `dashboard_rpc_filters: suite completa OK (T1, T1b, T2-T4, T3b, T4b) ...`;
  dashboard_kpi_edge_cases → `dashboard_kpi_edge_cases: suite OK (T1; ...)`;
  inbox_agregado_por_contato → `inbox_agregado_por_contato: suite OK (T1 ... T6 ...) — 5 grupo(s) verificado(s)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (5s)` (sem nome de conjunto, como o fechar chama).

## Pontos do revisor ([refazer 1])
- Ponto 1: T1 agora qualificado como portao-local (falha sem a migration — simulado acima:
  `T1_simulado=1086`) e a premissa vem de medida direta no banco (`relacoes_public=181`,
  `grants_ddl_vivos=0`), nao so da citacao da suite.
- Ponto 2: recontei as 181 relacoes no MESMO banco local (v2-revref1) com o MESMO filtro do
  T1; premissa explicita (relacoes existentes, nao so tabelas); saidas reais:
  `grants_de_volta=1086` e `grants_apos_rollback=0`.
- Ponto 3: acima o comando executado por arquivo e a linha NOTICE real de cada um (6/6, EXIT=0),
  nao so a lista de nomes.

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
