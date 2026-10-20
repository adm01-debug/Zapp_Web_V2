Task t_c2f65e14: feat(db): agendadores que a interface promete — relatórios, fechamento automático, limpezas e purga do log do cron
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_c2f65e14
  max-retries: 2 (default)
  created:   2026-10-12 11:23 by claude
  started:   2026-10-13 06:08
  children:  t_8d53c1de

Body:
ESPECIALISTA DA ÁREA: workersql (banco, migrations e RLS). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
Conferido no banco: `cron.job` tem 13 jobs (ai-jobs-tick, avatars-refresh, cleanup-edge-rate-limits, cleanup-link-preview-cache, connection-health-check, expire-stale-agent-presence, gmail-incremental-sync, multiplix-send-trigger, searchbox-budget-alert, talkx-scheduler, tasks-notify-due, vacuum-contacts-daily, vacuum-messages-post-expurgo) e NENHUM chama: `auto-close-conversations` (a tela `AutoCloseSettings` promete fechar por inatividade; a Edge espera `x-cron-secret`), `send-scheduled-report` (só disparo manual em `useScheduledReports.ts:142`; nada seleciona `next_send_at <= now()`), `cleanup-rate-limit-logs` (`rate_limit_logs` > 7 dias, `blocked_ips` vencidos, `security_alerts` resolvidos > 30 dias), `recover-corrupted-audios`, nem as funções definidas e nunca agendadas `cleanup_crm_sync_outbox` e `ai_rate_limit_purge`. `send-rate-limit-alert` não tem chamador no repo. `cron.job_run_details` tem 133.216 linhas / 49 MB e cresce sem purga. SL-191 fechou sem código e disse que precisa de cartão na trilha de banco/Edge.

O QUE FAZER
1. Uma migration que agenda (molde `20260930250000_reschedule_cron_secrets_l5.sql`, segredo no Vault, `net.http_post`, comparação em tempo constante na Edge): auto-close (a cada 5-15 min), relatórios (RPC que reivindica vencidos com `FOR UPDATE SKIP LOCKED`, `is_active`, `next_send_at <= now()`, a cada 15 min), limpezas diárias (rate limit logs, `cleanup_crm_sync_outbox`, `ai_rate_limit_purge`) e purga de `cron.job_run_details` com retenção de 7 dias; decida o destino de `send-rate-limit-alert` e `recover-corrupted-audios` (agendar ou aposentar; registre).
2. Atualize `scripts/db-audit/pg-cron-jobs-baseline.json`; prova no banco local (job reivindica só o vencido, não duplica; purga mantém 7 dias); `-- Rollback:`. Coordene com PD-13 (retenção LGPD) e PB-44/PD-23 (relatório).

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<ts>_agendadores_edge_e_purga_cron.sql (novo)
- scripts/db-audit/pg-cron-jobs-baseline.json
- supabase/tests/

CRITÉRIO DE PRONTO
1. Nada que a interface promete fica sem agendador.
2. Log do cron limitado.
3. `zapp-verify . --rapido` verde.


Events (47):
  [2026-10-13 06:30] [run 12164] heartbeat
  [2026-10-13 06:31] [run 12164] heartbeat
  [2026-10-13 06:32] [run 12164] heartbeat
  [2026-10-13 06:33] [run 12164] heartbeat
  [2026-10-13 06:34] [run 12164] heartbeat
  [2026-10-13 06:35] [run 12164] heartbeat
  [2026-10-13 06:36] [run 12164] heartbeat
  [2026-10-13 06:37] [run 12164] heartbeat
  [2026-10-13 06:38] [run 12164] heartbeat
  [2026-10-13 06:39] [run 12164] heartbeat
  [2026-10-13 06:40] [run 12164] heartbeat
  [2026-10-13 06:41] [run 12164] heartbeat
  [2026-10-13 06:42] [run 12164] heartbeat
  [2026-10-13 06:43] [run 12164] heartbeat
  [2026-10-13 06:44] [run 12164] heartbeat
  [2026-10-13 06:45] [run 12164] heartbeat
  [2026-10-13 06:46] [run 12164] heartbeat
  [2026-10-13 06:47] [run 12164] heartbeat
  [2026-10-13 06:48] [run 12164] heartbeat
  [2026-10-13 06:49] [run 12164] heartbeat

Runs (1):
  #12164 running      @workersql  active  2026-10-13 06:08
