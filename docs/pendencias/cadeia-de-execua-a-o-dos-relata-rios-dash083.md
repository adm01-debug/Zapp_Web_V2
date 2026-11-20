# DASH-083 — Cadeia de execução dos relatórios

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P0
- **Anexo**: 02 · **Seção**: 3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes

## Descrição e origem

Cadeia de execução dos relatórios.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Agendador → geração → envio → retorno
- **Existe hoje** (evidência da auditoria): Aba diz "relatórios automáticos enviados por email" (ScheduledReportsManager.tsx:94); nenhum código lê scheduled_report_configs para enviar (só useScheduledReportConfigs.ts:24-56); send-scheduled-report lê outra tabela scheduled_reports (supabase/functions/send-scheduled-report/index.ts:106,228), não tem cron em nenhuma migration e usa tipos diferentes (dashboard_summary… × performance/sla/conversations/satisfaction)
- **Falta**: Executor + cron + unificar tabela/tipos
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, integrações, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Pelo que existe no código, no pg_cron de produção e nos nomes dos workflows do N8N, o gestor cadastra o relatório e não recebe e-mail. O envio real não foi testado: a tabela estava vazia em 12/10 e o conteúdo dos workflows do N8N não foi aberto

## Dependências

Resend (RESEND_API_KEY) + CRON_SECRET

## Critério de aceite

- Agendador → geração → envio → retorno
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).