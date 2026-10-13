Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261013043542_lgpd_retention_jobs.sql (novo): fecha a lacuna do
  docs/LGPD-RETENTION-POLICY.md secao 5.4, que descrevia prazos de retencao sem NENHUM job
  que os executasse (so existiam o expurgo do Talk X e o vacuum-messages-post-expurgo). Cria
  `public.lgpd_retention_policy` (a DECISAO: tabela, coluna de data, dias e acao — versionada
  na base), `public.lgpd_retention_runs` (trilha por execucao, so contagem/erro, sem dado
  pessoal), `public.lgpd_retention_tick()` (o job, 1x/dia via pg_cron `lgpd-retention-daily`,
  em lote, subtransacao por tabela) e `public.lgpd_purge_deleted_contacts()` (expurgo definitivo
  da lixeira de contatos). Classe ADITIVA; idempotente/replayavel (IF NOT EXISTS, CREATE OR
  REPLACE, ON CONFLICT DO UPDATE, cron.schedule com mesmo nome = UPSERT). Rollback executavel
  nas primeiras linhas.
- supabase/tests/lgpd_retention_jobs.sql (novo): a prova (T1..T11) — dentro do prazo fica, fora
  sai, tabela desligada nunca e tocada, reexecutar = 0, contato restaurado/sem trilha nunca sai,
  guarda de parametro (22023) e permissao (authenticated/anon = 42501).
- docs/LGPD-RETENTION-POLICY.md: secao 5.4 reescrita para apontar o job real e a tabela de
  politica; prazos do documento viraram linhas da politica.
- .tmp/relato.md: o relato deste cartao (arquivo versionado neste ramo, commitado junto).

## Decisoes de escopo (o cartao pede para registrar a decisao)
- Prazos do documento onde ele os define (rate_limit_logs/password_reset/mfa 30 d; sessao/
  dispositivo/login 90 d; seguranca 365 d); 90 d para atividade e 365 d para seguranca nas
  tabelas de log que o documento NAO cita (webhook_failures, query_telemetry, conversation_events,
  voice_command_logs, performance_snapshots, ai_usage_logs, catalog_send_events, meta_capi_events,
  entity_versions, webhook_rate_limits, blocked_ips).
- audit_logs e security_alerts: a acao do documento e ARQUIVAR, nao apagar — ficam REGISTRADOS e
  DESLIGADOS (note 'PENDENTE...'). Idem csat_surveys/conversation_analyses/messages/campaigns/
  campaign_contacts, cuja acao e anonimizar/reescrever dado, nao expurgo por data.
- Contato na lixeira: a idade usa o RELOGIO DO SERVIDOR (contact_deletion_audit.performed_at),
  nunca o deleted_at (gravado pelo cliente). So apaga quem tem a ultima mudanca de marcador como
  'delete'/'update_marker' vencida — restaurado ou sem trilha fica. A trilha sobrevive (linha
  'purge' gravada pelo gatilho).
- As funcoes fn_lgpd_* citadas na V3 NAO existem em migration alguma (so em revogacoes) — o
  desenho acima e proposto com nomes do V2, nao e copia.

## Prova
- verde depois: `zapp-db-local psql . v2-26101301294d35 < supabase/tests/lgpd_retention_jobs.sql`
  → `OK — lgpd_retention_jobs: todas as provas (T1..T11) passaram` e `ROLLBACK` (transacao unica,
  zero efeito colateral no banco da tarefa).
- vermelho antes: mesmo arquivo com `DROP FUNCTION public.lgpd_retention_tick(integer)` antes →
  `ERROR: function public.lgpd_retention_tick(integer) does not exist` (42883), e o banco volta
  intacto (a funcao existe de novo depois).
- migration aplicada no banco LOCAL: `hermes-db-migrar ...` → `APLICADA no banco LOCAL
  'v2-26101301294d35' (producao nao foi tocada)`; 27 linhas de politica gravadas.
- rodada real do job (antes da suite): `select public.lgpd_retention_tick(10)` → 20 tabelas
  processadas, 0 erros.

## O que NÃO fiz e por quê
- Nao implementei anonimizacao/arquivamento (audit_logs, security_alerts, csat_surveys,
  messages, campaigns...): a acao exige reescrita de dado, nao expurgo por data, e varias pedem
  politica do dono — o cartao manda implementar as LACUNAS de expurgo; deixei-as registradas e
  desligadas na politica, visiveis para decisao.
- Nao toquei Edge Function nem src/ (fora da minha area).
- Nao criei .test.sh (o cartao pede a suite SQL em supabase/tests); nenhum passo novo de workflow
  necessario.
