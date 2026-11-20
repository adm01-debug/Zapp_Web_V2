# L-09 — Auto-fechamento de conversas inativas

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 08 · **Seção**: 3.2 Automação, chatbot e atendimento automático

## Descrição e origem

Auto-fechamento de conversas inativas.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.2 Automação, chatbot e atendimento automático).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: CSF 19.5–19.7 ✅
- **Existe hoje** (evidência da auditoria): Config (src/hooks/inbox/useAutoCloseConversations.ts, AutoCloseSettings.tsx) e Edge com modo cron (supabase/functions/auto-close-conversations/index.ts:134); nenhum cron.schedule nas migrations chama a Edge (lista de jobs versionados não inclui auto-close)
- **Falta**: agendamento versionado
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Fila acumula conversas mortas; SLA/indicadores distorcidos

## Dependências

pode haver cron fora do repo (PLANO_BANCO_UNICO cita "8 cron jobs" incl. auto-close) — não verificável

## Critério de aceite

- CSF 19.5–19.7 ✅
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).