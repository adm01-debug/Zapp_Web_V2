# L-19 — Relatórios agendados por e-mail

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.5 Relatórios e exportação

## Descrição e origem

Relatórios agendados por e-mail.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.5 Relatórios e exportação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: CSF 11.7–11.8 ✅
- **Existe hoje** (evidência da auditoria): Tela + Edge com modo cron e avanço de next_send_at (supabase/functions/send-scheduled-report/index.ts:229); envio manual via useScheduledReports.ts:142; nenhum cron versionado chama a Edge
- **Falta**: agendamento
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Relatório "semanal" só sai se alguém clicar

## Dependências

possível n8n — não verificável

## Critério de aceite

- CSF 11.7–11.8 ✅
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).