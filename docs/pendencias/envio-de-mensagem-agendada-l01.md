# L-01 — Envio de mensagem agendada

- **Estado**: PARCIAL
- **Prioridade**: P0
- **Anexo**: 08 · **Seção**: 3.1 Inbox / Chat

## Descrição e origem

Envio de mensagem agendada.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.1 Inbox / Chat).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: CSF 21.1/21.6 e IMPROVEMENT P1.10 ✅ "agendar para envio futuro"
- **Existe hoje** (evidência da auditoria): UI grava scheduled_messages status pending (src/components/inbox/ChatPanel.tsx:222, src/hooks/chat/useScheduledMessages.ts:48,72); calendário lista/cancela (ScheduleCalendarView.tsx:62). Nenhuma Edge, cron ou trigger lê a tabela para enviar (grep em supabase/functions e migrations: 0 consumidores; reconciliação 03/10 já anotou docs/reconciliation/reaudit/2026-10-03/reports/database/report.md:1153)
- **Falta**: processador (cron + Edge) que envie, marque sent/failed e trate anexos
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Pelo que existe no código, no banco e nos nomes dos workflows do N8N, o atendente agenda e o cliente não recebe. O envio real não foi testado: a tabela estava vazia

## Dependências

conferido em 12/10, só leitura: nenhum job do pg_cron de produção nem função do banco processa a tabela, e ela estava vazia (sem uso hoje; nenhum histórico consultado). Nos 245 workflows do N8N, nenhum nome ou descrição trata do tema; o conteúdo dos nós não foi aberto um a um

## Critério de aceite

- CSF 21.1/21.6 e IMPROVEMENT P1.10 ✅ "agendar para envio futuro"
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).