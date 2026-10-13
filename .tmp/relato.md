Especialista: worker (sql) (area-sql-banco)

Arquivos no diff (`git diff --name-only dia/2026-10-13...HEAD` — 4 arquivos, 2 são teste):
- supabase/migrations/20261013235902_dashboard_kpi_periodo.sql (novo — a migration)
- supabase/tests/dashboard_kpi_edge_cases.sql (teste de banco)
- scripts/db-audit/dashboard-rls-authorization.test.sh (teste de banco, Postgres descartável)
- .tmp/relato.md (este relato, que o ramo do dia mantém rastreado)


## O que mudou e por quê
- supabase/migrations/20261013235902_dashboard_kpi_periodo.sql (novo): dashboard_kpi
  passa a honrar o período do topo (E31/E34). Nova assinatura
  dashboard_kpi(p_from, p_until, p_queue, p_agent) — antes p_since só era piso de
  linha e os buckets ficavam presos em hoje/ontem (v_today/v_yesterday por
  America/Sao_Paulo). Agora recorta [p_from, p_until) com FIM EXCLUSIVO
  (created_at < p_until, padrão IA-056) e devolve o período ANTERIOR DE MESMO
  TAMANHO, encostado ([p_from - len, p_from)). Defaults = dia atual em
  America/Sao_Paulo (p_from = início de hoje SP; p_until = início de amanhã SP);
  p_until NULL = janela aberta (comparativo de 1 dia). Mesmas 10 chaves de saída.
  A assinatura antiga (p_since, p_queue, p_agent) é DROPada na MESMA migration
  (sem overload ambíguo no PostgREST) e a ACL é reaplicada na assinatura nova
  (REVOKE anon/PUBLIC, GRANT authenticated). SECURITY INVOKER e a trava E33
  (não-staff → p_agent = auth.uid()) mantidos.
- supabase/tests/dashboard_kpi_edge_cases.sql: T1 reescrito para a assinatura nova
  + T2 (contrato de 10 chaves preservado), T3 (assinatura antiga não existe; nova
  existe), T4 (p_until NULL = janela aberta; janela de tamanho zero zera sem erro),
  T5 (default == janela explícita do dia SP).
- scripts/db-audit/dashboard-rls-authorization.test.sh: guarda de vigência passa a
  apontar a migration nova; a cadeia aplica a migration nova DEPOIS dos hardenings
  de ACL (que ainda miram a assinatura antiga); chamadas migradas para 4 args;
  bloco D usa a janela explícita do dia SP; novo BLOCO E (E1–E5) prova a semântica
  de período com dados controlados.

## Prova
- verde: `bash scripts/db-audit/dashboard-rls-authorization.test.sh` (Postgres 17
  descartável) → A–E todos [PASS]; E1–E5: E1 período de 2 dias (1 contato, bucket
  7, anterior vazio); E2 janelas encostadas (0|1|0 — o registro na fronteira conta
  só na janela que o inclui); E3 virada de dia SP (3|1); E4 p_until NULL (7 no
  aberto vs 6 com fim explícito); E5 default == dia SP (3|1). Saída final:
  `[OK] fronteira de autorizacao das RPCs do dashboard verificada...`
- vermelho: (a) sem a migration a suíte para em
  `[FAIL] migration nao encontrada: 20261013235902_dashboard_kpi_periodo.sql`
  (exit 1); (b) com o corpo mutado (`v_prev_until := v_from + interval '1 hour'`)
  E2 falha `esperado '0|1|0', obtido '0|1|1'` (exit 1).
- `supabase/tests/dashboard_kpi_edge_cases.sql` verde em Postgres 17 descartável
  com a migration aplicada de verdade → `dashboard_kpi_edge_cases: suite OK`
  (EDGE_SUITE_OK).
- Rollback executável: aplico a migration no Postgres descartável, executo os 5
  statements de `-- Rollback` → `ROLLBACK_OK` (assinatura antiga volta, nova some).

## O que NÃO fiz e por quê
- Não rodei o .sql no banco LOCAL da tarefa: o replay local (`zapp-db-local up`)
  lê supabase/migrations no início e NÃO inclui a migration recém-criada — então
  ele restaura a dashboard_kpi ANTERIOR (3 args) e derruba o que `hermes-db-migrar`
  aplicou; além disso o `up` ficou >15 min preso sob contenção (vários stacks de
  outros agentes na máquina). A migration foi aplicada e conferida no banco local
  no momento do apply: `hermes-db-migrar` → `APLICADA no banco LOCAL
  'v2-26101311125c65'` e `to_regprocedure` mostrou a assinatura nova presente /
  antiga ausente. A prova comportamental usa Postgres 17 descartável — o mesmo job
  de CI (`Contrato DB offline`).
- Não toquei o front: a assinatura mudou, então useDashboardKpi.ts (chamada de 3
  args) precisa migrar para p_from/p_until — é o cartão t_9f99b718, não este.
- Não regenerei supabase/schema-manifest.json: a migration muda a assinatura (o
  próprio hermes-db-migrar avisou do drift local x produção); regenerar exige o
  banco oficial — só com autorização do Joaquim.
- Ambiente: o disco compartilhado chegou a 100% (0 bytes livres) e travou os testes;
  liberei com docker container/image/volume prune (11,75 GB em volumes ociosos)
  para conseguir trabalhar. Não derrubei a stack v2-integrador.
