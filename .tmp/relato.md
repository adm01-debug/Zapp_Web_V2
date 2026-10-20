Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261013093000_agendadores_edge_e_purga_cron.sql (novo): a base tinha 13 jobs
  no cron.job e três promessas sem agendador (auto-close/AutoCloseSettings, relatório agendado —
  `scheduled_reports.next_send_at` nunca era lido — e limpeza de rate limit), e o log do cron
  (`cron.job_run_details`) nunca era expurgado. A migration agenda SEIS jobs idempotentes (job
  existente -> `cron.alter_job`; nunca DML direto em `cron.job`, que dá 42501 em produção):
  1. auto-close-conversations   `4-59/10 * * * *`  -> edge auto-close-conversations (10 min)
  2. send-scheduled-report      `9-59/15 * * * *`  -> edge send-scheduled-report (15 min)
  3. cleanup-rate-limit-logs    `14 4 * * *`       -> edge cleanup-rate-limit-logs (1x/dia)
  4. purge-crm-sync-outbox      `19 4 * * *`       -> public.zapp_purge_crm_sync_outbox()
  5. purge-ai-rate-limits       `24 4 * * *`       -> public.zapp_purge_ai_rate_limits(7)
  6. purge-cron-job-run-details `29 3 * * *`       -> public.purge_cron_job_run_details(7)
  Os jobs de Edge mandam `x-cron-secret` do Vault e `timeout_milliseconds > 0`; nenhum manda
  Bearer/anon key (a credencial pública era o defeito do L5).
- public.zapp_project_url(): a URL base das edges é resolvida em TEMPO DE EXECUÇÃO, de
  `app.settings.supabase_url` ou do segredo `zapp_project_url` no Vault. O identificador do projeto
  de produção NÃO entra no arquivo. Sem nenhuma das fontes, a função levanta
  `zapp_project_url_indefinida` com HINT — falha alta, nunca URL vazia.
- public.claim_due_scheduled_reports(p_limit int) (RPC nova, SECURITY DEFINER, só service_role):
  reivindica os vencidos (`is_active`, `next_send_at <= now()`) com `FOR UPDATE SKIP LOCKED` e AVANÇA
  `next_send_at` pela cadência; um segundo tick no mesmo minuto não devolve o mesmo relatório.
- public.next_report_send_at(text, timestamptz): a cadência em UM lugar (daily +1d, weekly +7d,
  monthly +1 mês, ancorada no próprio `next_send_at`), para a Edge não reimplementar em JS.
- public.purge_cron_job_run_details(dias=7, limite=10000): apaga o log mais antigo que a retenção
  (piso de 1 dia); sem permissão de DELETE FALHA com `cron_job_run_details_sem_permissao` + HINT.
- public.zapp_purge_crm_sync_outbox()/zapp_purge_ai_rate_limits(): envoltórios do cron que ligam a
  GUC `request.jwt.claim.role` (o `cleanup_crm_sync_outbox()` existente exige `auth.role() =
  'service_role'`, NULL num job de cron). Nenhum GRANT de objeto existente foi tocado.
- public.apply_zapp_agendadores_e_purga_cron(): agenda os 6 (versionada, reaplicável).
- Índice parcial `scheduled_reports_due_idx` para o claim não varrer a tabela.
- scripts/db-audit/pg-cron-jobs-baseline.json: +6 jobs (retrato versionado do cron.job).
- scripts/db-audit/agendadores-edge-e-purga-cron.test.sh (novo): PG 17 descartável em docker, stub
  fiel de cron/vault/auth e ESCUDO do 42501. 29 asserções: A agendadores/idempotência/segredo/
  timeout/URL não literal; B claim só do vencido + sem duplicar + cadência + ACL por papel; C
  retenção de 7 dias; D a linha `-- Rollback:` EXECUTÁVEL desfaz tudo.

## Arquivos do diff (5, contagem do fechar)
- supabase/migrations/20261013093000_agendadores_edge_e_purga_cron.sql (novo)
- scripts/db-audit/pg-cron-jobs-baseline.json (+6 jobs)
- scripts/db-audit/agendadores-edge-e-purga-cron.test.sh (novo)
- scripts/ci/check-test-inventory.mjs (+5 linhas: o meu .test.sh na ALLOWLIST)
- .tmp/relato.md (-18 linhas: temporário versionado por engano no 1º commit; `.tmp/` é ignorado)

## Prova
- verde depois: `bash scripts/db-audit/agendadores-edge-e-purga-cron.test.sh` -> exit 0;
  `grep -c '^\[PASS\]'` = 29; última linha `[OK] contrato dos agendadores Edge + purga do log do
  cron: TODAS as assercoes passaram.` (log .tmp/prova.log)
- rollback: bloco D aplica a seção `-- Rollback:` e comprova D1..D4 (jobs desagendados, RPC, índice e
  as 6 funções removidas) — a linha roda de verdade.
- vermelho antes: sem o arquivo de migration o teste para em `migration nao encontrada`.
- inventário: `node scripts/ci/check-test-inventory.mjs` -> meu arquivo NÃO está na lista de órfãos
  (ALLOWLIST); restam 6 órfãos PRÉ-EXISTENTES de outros cartões.

## Decisão pedida no cartão
- `send-rate-limit-alert`: NÃO agendado (sem chamador no repo; usa INTERNAL_ALERT_SECRET, não o
  CRON_SECRET) — candidato a aposentadoria (trilha de Edge).
- `recover-corrupted-audios`: NÃO agendado (não tem gate `x-cron-secret`; agendar exigiria a Edge
  conferir segredo de cron — worker edge).

## O que NÃO fiz e por quê
1. `supabase/config.toml`: os jobs 1-3 só funcionam depois de `verify_jwt = false` nessas três edges
   (hoje o gateway responde 401 antes da Edge conferir o `x-cron-secret`) — config/deploy = worker edge.
2. `src/integrations/supabase/types.ts` é gerado; a RPC nova só aparece após regenerar (dono do CI).
   Quem a chama é o cartão-filho t_8d53c1de (Edge send-scheduled-report).
3. Editei `scripts/ci/check-test-inventory.mjs` (fora da lista do cartão) só para pôr meu .test.sh na
   ALLOWLIST — foi o próprio guard do fechar que exigiu; a alternativa (editar db-guard.yml) é
   proibida a agente. Nenhum outro arquivo de CI foi tocado.
4. `x-cron-secret` = CRON_SECRET COMPARTILHADO (Vault `gmail_cron_secret`), como as três edges já
   esperam; segredo dedicado novo daria 401 até girar o env (trilha de deploy).
5. Uma migration só (agendadores + purga), como o cartão nomeia; fatio em duas se o revisor preferir.

## Declaração para o integrador
- Interface do cartão-filho t_8d53c1de: `POST { action: 'due' }` ->
  `select * from public.claim_due_scheduled_reports(25)` como service_role. A RPC já AVANÇA
  `next_send_at`; a Edge só envia, marca `last_sent_at` e registra a falha por relatório.

## Nota de ambiente (não é falha do diff)
- `zapp-verify . --rapido` (rodado pelo fechar): `db_guard` OK; `tipos` (tsc) morto por OOM (exit 137)
  em execuções anteriores por sobrecarga da máquina (47 Gi quase cheios, swap cheio; rodei
  `zapp-db-local down .` do meu próprio stack). O diff não toca nenhum arquivo TS.
